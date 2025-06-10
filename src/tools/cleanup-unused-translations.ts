/**
 * Cleanup unused translations tool
 */

import { z } from 'zod';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { TranslationIndex } from '../core/translation-index.js';
import { CodeAnalyzer } from '../core/code-analyzer.js';
import { resolveSrcDir, validatePath, createPathDescription } from '../utils/path-resolver.js';

/**
 * Setup the cleanup unused translations tool
 */
export function setupCleanupUnusedTranslationsTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'cleanup_unused_translations',
    'Remove unused translation keys that are not referenced in the codebase',
    {
      srcDir: z.string().optional().describe('Source directory to scan for translation usage'),
      frameworks: z.array(z.enum(['react', 'vue', 'svelte', 'angular'])).optional().describe('Target frameworks'),
      includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
      excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude'),
      maxFiles: z.number().min(1).max(1000).default(500).describe('Maximum files to analyze'),
      dryRun: z.boolean().default(true).describe('Perform dry run without deleting'),
      confirmDelete: z.boolean().default(false).describe('Confirm actual deletion')
    },
    async ({ 
      srcDir,
      frameworks,
      includePatterns,
      excludePatterns,
      maxFiles,
      dryRun,
      confirmDelete
    }: any) => {
      try {
        // Ensure memory is current with files before making changes
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
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

        return await handleCleanupOperation({
          sourceDir: resolvedSourceDir,
          targetFrameworks,
          includes,
          excludes,
          maxFiles,
          dryRun,
          confirmDelete,
          index
        });

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Cleanup unused translations failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle cleanup operation
 */
async function handleCleanupOperation({ sourceDir, targetFrameworks, includes, excludes, maxFiles, dryRun, confirmDelete, index }: any) {
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
        usedKeys.add(usage.keyPath as string);
      });
    } catch (error) {
      // Skip files we can't analyze
    }
  }

  // Get all available translation keys
  const availableKeys = new Set(index.getKeys());
  
  // Find unused keys (defined but not used)
  const unusedKeys = Array.from(availableKeys).filter(key => !usedKeys.has(key as string));

  // Get details for unused keys
  const unusedKeyDetails = unusedKeys.map(key => ({
    keyPath: key,
    translations: index.getTranslations(key),
    lastModified: index.get(key)?.lastModified || 0
  }));

  // Sort by last modified (oldest first for safer deletion)
  unusedKeyDetails.sort((a, b) => a.lastModified - b.lastModified);

  let deletedKeys: string[] = [];
  let deletionErrors: any[] = [];

  // Perform cleanup if not dry run and confirmed
  if (!dryRun && confirmDelete && unusedKeys.length > 0) {
    for (const keyDetail of unusedKeyDetails) {
      try {
        await index.delete(keyDetail.keyPath as string);
        deletedKeys.push(keyDetail.keyPath as string);
      } catch (error) {
        deletionErrors.push({
          keyPath: keyDetail.keyPath as string,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  // Generate summary
  const summary = {
    totalFilesAnalyzed: filesToAnalyze.length,
    totalKeysUsed: usedKeys.size,
    totalKeysAvailable: availableKeys.size,
    unusedKeysFound: unusedKeys.length,
    keysDeleted: deletedKeys.length,
    deletionErrors: deletionErrors.length,
    spaceReclaimed: unusedKeys.length > 0 ? `${unusedKeys.length} keys` : '0 keys'
  };

  const recommendations: string[] = [];
  
  if (dryRun) {
    recommendations.push('🔍 This was a dry run - no keys were deleted');
    if (unusedKeys.length > 0) {
      recommendations.push(`💡 Found ${unusedKeys.length} unused keys ready for cleanup`);
      recommendations.push('Run with dryRun: false and confirmDelete: true to delete them');
    }
  } else if (!confirmDelete) {
    recommendations.push('⚠️ confirmDelete: true is required for actual deletion');
  } else {
    if (deletedKeys.length > 0) {
      recommendations.push(`✅ Successfully deleted ${deletedKeys.length} unused translation keys`);
      recommendations.push('🔄 Consider running search_missing_translations to verify no keys are now missing');
    }
    if (deletionErrors.length > 0) {
      recommendations.push(`❌ ${deletionErrors.length} keys could not be deleted - check errors`);
    }
  }
  
  if (unusedKeys.length === 0) {
    recommendations.push('✅ No unused translation keys found - your translations are clean!');
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'cleanup_unused_translations',
        dryRun,
        confirmDelete,
        summary,
        unusedKeys: dryRun ? unusedKeyDetails.slice(0, 50) : [],
        deletedKeys: deletedKeys.slice(0, 50),
        deletionErrors,
        recommendations,
        nextSteps: dryRun && unusedKeys.length > 0 
          ? ['Review the unused keys list', 'Run with dryRun: false and confirmDelete: true to delete']
          : []
      }, null, 2)
    }]
  };
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