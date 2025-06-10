/**
 * Extract to translation tool - requires client to provide keys
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';
import { TranslationExtractor, ExtractionUtils } from '../core/translation-extractor.js';
import { resolveFilePath, validatePath, createPathDescription } from '../utils/path-resolver.js';

/**
 * Setup the extract to translation tool
 */
export function setupExtractToTranslationTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'extract_to_translation',
    'Extract hardcoded text from files and replace with translation calls - requires client to provide translation keys',
    {
      filePath: z.string().describe('File containing the text to extract'),
      extractions: z.array(z.object({
        text: z.string().describe('Exact text to extract'),
        key: z.string().describe('Translation key to use (must be provided by client)')
      })).describe('List of text and key pairs to extract'),
      replaceInFile: z.boolean().default(false).describe('Replace text in source file with translation call'),
      additionalLanguages: z.record(z.string(), z.string()).optional().describe('Additional translations for other languages'),
      frameworks: z.array(z.enum(['react', 'vue', 'svelte', 'angular'])).optional().describe('Target frameworks for replacement syntax'),
      validateExisting: z.boolean().default(true).describe('Check for existing similar translations')
    },
    async ({ 
      filePath,
      extractions,
      replaceInFile,
      additionalLanguages,
      frameworks,
      validateExisting
    }: any) => {
      try {
        // Ensure memory is current with files before making changes
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        // Resolve file path
        let resolvedFilePath: string;
        try {
          resolvedFilePath = resolveFilePath(filePath, config);
          await validatePath(resolvedFilePath, 'file');
        } catch (error) {
          const tempResolvedPath = resolveFilePath(filePath, config);
          const pathDesc = createPathDescription(filePath, tempResolvedPath, config);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'File path resolution failed',
                details: error instanceof Error ? error.message : String(error),
                providedPath: filePath,
                resolvedPath: tempResolvedPath,
                pathDescription: pathDesc
              }, null, 2)
            }]
          };
        }

        const targetFrameworks = frameworks || config.frameworks || ['react'];
        const framework = targetFrameworks[0] || 'react';
        const extractor = new TranslationExtractor(framework);
        const baseLanguage = config.baseLanguage || 'en';
        
        const results: any[] = [];
        const errors: any[] = [];
        const warnings: any[] = [];
        let totalReplacements = 0;
        
        for (const extraction of extractions) {
          const { text, key } = extraction;
          
          try {
            // Check if key already exists
            if (index.has(key)) {
              const existing = index.getTranslations(key);
              const existingValue = existing?.[baseLanguage];
              
              if (existingValue === text) {
                warnings.push({
                  text,
                  key,
                  message: 'Key already exists with same value - skipped'
                });
                continue;
              } else {
                warnings.push({
                  text,
                  key,
                  message: `Key exists with different value: "${existingValue}"`,
                  suggestion: 'Consider using existing key or choose different key'
                });
              }
            }
            
            // Check for similar translations if requested
            if (validateExisting) {
              try {
                const similar = await ExtractionUtils.findSimilarTranslations(text, index, 0.8);
                if (similar.length > 0) {
                  warnings.push({
                    text,
                    key,
                    message: 'Similar translations found',
                    suggestions: similar.slice(0, 3).map(s => ({ key: s.keyPath, value: s.value }))
                  });
                }
              } catch (error) {
                // Continue without similarity check
              }
            }
            
            // Add base language translation
            await index.set(key, baseLanguage, text);
            
            // Add additional languages if provided
            const allTranslations: Record<string, string> = { [baseLanguage]: text };
            if (additionalLanguages) {
              for (const [lang, value] of Object.entries(additionalLanguages)) {
                await index.set(key, lang, value as string);
                allTranslations[lang] = value as string;
              }
            }
            
            // Replace in file if requested
            let replacementResult: any = null;
            if (replaceInFile) {
              try {
                await extractor.replaceTextWithTranslation(resolvedFilePath, text, key);
                totalReplacements++;
                replacementResult = { success: true };
              } catch (error) {
                replacementResult = {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown replacement error'
                };
              }
            }
            
            results.push({
              text,
              key,
              translations: allTranslations,
              replacementResult
            });
            
          } catch (error) {
            errors.push({
              text,
              key,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operation: 'extract_to_translation',
              success: errors.length === 0,
              filePath: resolvedFilePath,
              summary: {
                total: extractions.length,
                extracted: results.length,
                errors: errors.length,
                warnings: warnings.length,
                totalReplacements
              },
              results,
              warnings,
              errors,
              nextSteps: replaceInFile && totalReplacements > 0
                ? ['Review the modified file for correctness', 'Test the application']
                : ['Use replaceInFile: true to modify the source file', 'Review generated translations']
            }, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Extract to translation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}