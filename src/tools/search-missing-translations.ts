/**
 * Search missing translations tool
 */

import { z } from 'zod';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { TranslationIndex } from '../core/translation-index.js';
import { CodeAnalyzer } from '../core/code-analyzer.js';
import { resolveSrcDir, validatePath, createPathDescription } from '../utils/path-resolver.js';

/**
 * Setup the search missing translations tool
 */
export function setupSearchMissingTranslationsTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'search_missing_translations',
    'Find missing translations by comparing codebase usage with translation files',
    {
      srcDir: z.string().optional().describe('Source directory to scan for translation usage'),
      frameworks: z.array(z.enum(['react', 'vue', 'svelte', 'angular'])).optional().describe('Target frameworks'),
      includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
      excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude'),
      maxFiles: z.number().min(1).max(1000).default(500).describe('Maximum files to analyze'),
      reportFormat: z.enum(['detailed', 'summary', 'keys-only']).default('detailed').describe('Report format')
    },
    async ({ 
      srcDir,
      frameworks,
      includePatterns,
      excludePatterns,
      maxFiles,
      reportFormat
    }: any) => {
      try {
        // Resolve source directory
        let resolvedSourceDir: string | undefined;
        try {
          resolvedSourceDir = resolveSrcDir(srcDir, config);
          await validatePath(resolvedSourceDir, 'directory');
        } catch (error) {
          const pathDesc = createPathDescription(srcDir, resolvedSourceDir || 'unknown', config);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Source directory resolution failed',
                details: error instanceof Error ? error.message : String(error),
                providedPath: srcDir,
                resolvedPath: resolvedSourceDir,
                pathDescription: pathDesc
              }, null, 2)
            }]
          };
        }

        const targetFrameworks = frameworks || config.frameworks || ['react', 'vue', 'svelte', 'angular'];
        const includes = includePatterns || [];
        const excludes = [
          'node_modules',
          'dist',
          'build',
          '.git',
          '.next',
          'coverage',
          ...(excludePatterns || config.exclude || [])
        ];

        if (!resolvedSourceDir) {
          throw new Error('Source directory could not be resolved');
        }

        return await handleMissingOperation({
          sourceDir: resolvedSourceDir,
          targetFrameworks,
          includes,
          excludes,
          maxFiles,
          reportFormat,
          index
        });

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Missing translations search failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle missing operation
 */
async function handleMissingOperation({ sourceDir, targetFrameworks, includes, excludes, maxFiles, reportFormat, index }: any) {
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html'];
  const sourceFiles = await getSourceFiles(sourceDir, extensions, excludes, includes);
  
  if (sourceFiles.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `No source files found in ${sourceDir}`,
          checkedExtensions: extensions
        }, null, 2)
      }]
    };
  }

  const filesToAnalyze = sourceFiles.slice(0, maxFiles);
  const analyzer = new CodeAnalyzer(targetFrameworks);
  const usedKeys = new Set<string>();
  const keyUsageDetails: Record<string, any[]> = {};

  // Analyze each file for translation usage
  for (const filePath of filesToAnalyze) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const result = await analyzer.analyzeFile(filePath, {
        extractHardcoded: false,
        findUsage: true,
        translationIndex: index,
        minStringLength: 1
      });

      result.translationUsage?.forEach((usage: any) => {
        const keyPath = usage.keyPath as string;
        usedKeys.add(keyPath);
        if (!keyUsageDetails[keyPath]) {
          keyUsageDetails[keyPath] = [];
        }
        keyUsageDetails[keyPath]?.push({
          file: relative(sourceDir, filePath),
          line: usage.line,
          column: usage.column,
          context: usage.context
        });
      });
    } catch (error) {
      // Skip files we can't analyze
    }
  }

  // Get all available translation keys
  const availableKeys = new Set(index.getKeys());
  
  // Find missing keys (used but not defined)
  const missingKeys = Array.from(usedKeys).filter(key => !availableKeys.has(key));
  
  // Find unused keys (defined but not used)
  const unusedKeys = Array.from(availableKeys).filter(key => !usedKeys.has(key as string));

  // Generate detailed analysis
  const missingKeyDetails = missingKeys.map(key => ({
    keyPath: key,
    usageCount: keyUsageDetails[key as string]?.length || 0,
    usageLocations: keyUsageDetails[key as string] || []
  }));

  const unusedKeyDetails = unusedKeys.map(key => ({
    keyPath: key,
    translations: index.getTranslations(key)
  }));

  // Generate summary
  const summary = {
    totalFilesAnalyzed: filesToAnalyze.length,
    totalKeysUsed: usedKeys.size,
    totalKeysAvailable: availableKeys.size,
    missingKeysCount: missingKeys.length,
    unusedKeysCount: unusedKeys.length,
    coveragePercentage: availableKeys.size > 0 ? ((usedKeys.size - missingKeys.length) / availableKeys.size * 100).toFixed(1) : '0'
  };

  const recommendations: string[] = [];
  
  if (missingKeys.length > 0) {
    recommendations.push(`${missingKeys.length} translation keys are used in code but not defined`);
    recommendations.push('Use add_translations tool to add missing translations');
  }
  
  if (unusedKeys.length > 0) {
    recommendations.push(`${unusedKeys.length} translation keys are defined but not used`);
    recommendations.push('Use cleanup_unused_translations tool to remove unused keys');
  }
  
  if (missingKeys.length === 0 && unusedKeys.length === 0) {
    recommendations.push('✅ All translation keys are properly defined and used');
  }

  // Format response based on requested format
  switch (reportFormat) {
    case 'keys-only':
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            operation: 'search_missing_translations',
            format: 'keys-only',
            summary,
            missingKeys,
            unusedKeys,
            recommendations
          }, null, 2)
        }]
      };

    case 'summary':
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            operation: 'search_missing_translations',
            format: 'summary',
            summary,
            topMissingKeys: missingKeyDetails.slice(0, 10),
            topUnusedKeys: unusedKeyDetails.slice(0, 10),
            recommendations
          }, null, 2)
        }]
      };

    case 'detailed':
    default:
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            operation: 'search_missing_translations',
            format: 'detailed',
            summary,
            missingKeys: missingKeyDetails,
            unusedKeys: unusedKeyDetails.slice(0, 50), // Limit to prevent huge responses
            recommendations
          }, null, 2)
        }]
      };
  }
}

/**
 * Get all source files in directory recursively
 */
async function getSourceFiles(dir: string, extensions: string[], excludePatterns: string[] = [], includePatterns: string[] = []): Promise<string[]> {
  const files: string[] = [];
  
  const excludeRegexes = excludePatterns.map(pattern => {
    if (pattern.includes('*') || pattern.includes('?')) {
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`${regexPattern}$`);
    }
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  });

  const includeRegexes = (includePatterns || []).map(pattern => {
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`${regexPattern}$`);
  });

  async function scan(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir);
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const relativePath = relative(dir, fullPath);
        
        if (excludeRegexes.some(regex => regex.test(relativePath) || regex.test(entry))) {
          continue;
        }
        
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          await scan(fullPath);
        } else if (stats.isFile()) {
          const ext = extname(entry);
          if (extensions.includes(ext)) {
            if ((includePatterns || []).length > 0) {
              if (includeRegexes.some(regex => regex.test(relativePath) || regex.test(entry))) {
                files.push(fullPath);
              }
            } else {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await scan(dir);
  return files;
}