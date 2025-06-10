/**
 * MCP tool for generating TypeScript types from translation keys
 */

import { z } from 'zod';
import { TypeGenerator } from '../core/type-generator.js';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the generate types tool
 */
export function setupGenerateTypesTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'generate_types',
    'Generate TypeScript types for translation keys. REQUIREMENT: outputPath must be provided as parameter or configured via --generate-types',
    {
      outputPath: z.string().optional().describe('Output file path (REQUIRED unless configured via --generate-types)'),
      namespace: z.string().default('I18n').describe('TypeScript namespace for the types'),
      includeValues: z.boolean().default(false).describe('Include value types based on actual translations'),
      strict: z.boolean().default(true).describe('Generate strict literal union types'),
      baseLanguage: z.string().optional().describe('Base language for type inference'),
      watch: z.boolean().default(false).describe('Watch for changes and regenerate automatically'),
      validate: z.boolean().default(true).describe('Validate generated types')
    },
    async ({ 
      outputPath, 
      namespace, 
      includeValues, 
      strict, 
      baseLanguage,
      watch,
      validate
    }: {
      outputPath?: string;
      namespace: string;
      includeValues: boolean;
      strict: boolean;
      baseLanguage?: string;
      watch: boolean;
      validate: boolean;
    }) => {
      try {
        const typeGenerator = new TypeGenerator(index);
        const finalOutputPath = outputPath || config.generateTypes;
        
        if (!finalOutputPath) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No output path specified',
                suggestion: 'Provide outputPath parameter or set generateTypes in config'
              }, null, 2)
            }]
          };
        }
        
        const finalBaseLanguage = baseLanguage || config.baseLanguage || 'en';
        
        // Generate types
        await typeGenerator.generateTypes({
          outputPath: finalOutputPath,
          namespace,
          includeValues,
          strict,
          baseLanguage: finalBaseLanguage
        });
        
        // Validate if requested
        let validationResult = null;
        if (validate) {
          const { TypeGenerationUtils } = await import('../core/type-generator.js');
          validationResult = await TypeGenerationUtils.validateTypes(finalOutputPath);
        }
        
        // Set up watching if requested
        if (watch) {
          await typeGenerator.watchAndRegenerate({
            outputPath: finalOutputPath,
            namespace,
            includeValues,
            strict,
            baseLanguage: finalBaseLanguage
          });
        }
        
        // Get statistics
        const stats = {
          totalKeys: index.getKeys().length,
          languages: index.getLanguages(),
          outputPath: finalOutputPath,
          fileSize: await getFileSize(finalOutputPath)
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              outputPath: finalOutputPath,
              namespace,
              options: {
                includeValues,
                strict,
                baseLanguage: finalBaseLanguage,
                watch
              },
              stats,
              validation: validationResult,
              message: watch ? 'Types generated and watching for changes' : 'Types generated successfully'
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error generating types: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }
  );
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const { promises: fs } = await import('fs');
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}
