/**
 * Reorganize translation files tool
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the reorganize translation files tool
 */
export function setupReorganizeTranslationFilesTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'reorganize_translation_files',
    'Reorganize translation files to match base language structure',
    {
      baseLanguage: z.string().optional().describe('Base language for structure reference'),
      sortKeys: z.boolean().default(true).describe('Sort keys alphabetically'),
      preserveComments: z.boolean().default(false).describe('Preserve JSON comments (if supported)'),
      indentSize: z.number().min(2).max(8).default(2).describe('JSON indentation size'),
      backupFiles: z.boolean().default(true).describe('Create backup files before reorganizing'),
      dryRun: z.boolean().default(false).describe('Preview changes without applying')
    },
    async ({ 
      baseLanguage,
      sortKeys,
      preserveComments,
      indentSize,
      backupFiles,
      dryRun
    }: any) => {
      try {
        const targetBaseLanguage = baseLanguage || config.baseLanguage || 'en';

        return await handleReorganizeOperation({
          baseLanguage: targetBaseLanguage,
          sortKeys,
          preserveComments,
          indentSize,
          backupFiles,
          dryRun,
          config
        });

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Reorganize translation files failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle reorganize operation
 */
async function handleReorganizeOperation({ 
  baseLanguage, 
  sortKeys, 
  preserveComments, 
  indentSize, 
  backupFiles, 
  dryRun, 
  config 
}: any) {
  const translationDir = config.translationDir;
  if (!translationDir) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Translation directory not configured'
        }, null, 2)
      }]
    };
  }

  try {
    // Get all translation files
    const files = await fs.readdir(translationDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Load base language structure
    const baseFile = `${baseLanguage}.json`;
    if (!jsonFiles.includes(baseFile)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Base language file not found: ${baseFile}`
          }, null, 2)
        }]
      };
    }

    const baseFilePath = join(translationDir, baseFile);
    const baseContent = await fs.readFile(baseFilePath, 'utf-8');
    const baseData = JSON.parse(baseContent);

    const fileResults: Record<string, any> = {};
    let filesReorganized = 0;
    let totalKeysAdded = 0;
    let totalKeysRemoved = 0;

    // Process each file
    for (const file of jsonFiles) {
      const language = file.replace('.json', '');
      const filePath = join(translationDir, file);
      
      try {
        const originalContent = await fs.readFile(filePath, 'utf-8');
        const originalData = JSON.parse(originalContent);
        
        // Reorganize according to base structure
        const reorganizedData = reorganizeToMatchBase(originalData, baseData, sortKeys);
        const newContent = JSON.stringify(reorganizedData, null, indentSize);
        
        // Check if changes are needed
        const hasChanges = originalContent.trim() !== newContent.trim();
        
        if (hasChanges) {
          const changes = analyzeChanges(originalData, reorganizedData);
          
          if (!dryRun) {
            // Create backup if requested
            if (backupFiles) {
              const backupPath = `${filePath}.backup.${Date.now()}`;
              await fs.writeFile(backupPath, originalContent);
            }
            
            // Write reorganized file
            await fs.writeFile(filePath, newContent);
          }
          
          fileResults[language] = {
            language,
            filePath,
            reorganized: true,
            changes,
            dryRun
          };
          
          filesReorganized++;
          totalKeysAdded += changes.keysAdded;
          totalKeysRemoved += changes.keysRemoved;
        } else {
          fileResults[language] = {
            language,
            filePath,
            reorganized: false,
            reason: 'No changes needed'
          };
        }
        
      } catch (error) {
        fileResults[language] = {
          language,
          filePath,
          reorganized: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    const summary = {
      filesReorganized,
      keysAdded: totalKeysAdded,
      keysRemoved: totalKeysRemoved,
      filesSkipped: jsonFiles.length - filesReorganized,
      errors: Object.values(fileResults).filter((r: any) => r.error).length
    };

    const recommendations = generateReorganizeRecommendations(summary, dryRun);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: 'reorganize_translation_files',
          success: true,
          baseLanguage,
          totalFiles: jsonFiles.length,
          dryRun,
          summary,
          fileResults,
          recommendations
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to reorganize translation files',
          details: error instanceof Error ? error.message : String(error)
        }, null, 2)
      }]
    };
  }
}

/**
 * Reorganize data to match base structure
 */
function reorganizeToMatchBase(data: any, baseData: any, sortKeys: boolean): any {
  const result: any = {};
  
  // Copy structure from base, preserving existing values
  function copyStructure(source: any, target: any, current: any) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = {};
        copyStructure(source[key], target[key], current?.[key] || {});
      } else {
        target[key] = current?.[key] ?? source[key];
      }
    }
  }
  
  copyStructure(baseData, result, data);
  
  if (sortKeys) {
    return sortObjectKeys(result);
  }
  
  return result;
}

/**
 * Sort object keys recursively
 */
function sortObjectKeys(obj: any): any {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const sorted: any = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Analyze changes between original and reorganized data
 */
function analyzeChanges(original: any, reorganized: any) {
  const originalKeys = extractAllKeys(original);
  const reorganizedKeys = extractAllKeys(reorganized);
  
  const keysAdded = reorganizedKeys.filter(key => !originalKeys.includes(key)).length;
  const keysRemoved = originalKeys.filter(key => !reorganizedKeys.includes(key)).length;
  const keysReordered = JSON.stringify(original) !== JSON.stringify(reorganized);
  
  return {
    keysAdded,
    keysRemoved,
    keysReordered
  };
}

/**
 * Extract all keys from nested object
 */
function extractAllKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Generate reorganize recommendations
 */
function generateReorganizeRecommendations(summary: any, dryRun: boolean): string[] {
  const recommendations: string[] = [];
  
  if (dryRun) {
    recommendations.push('🔍 This was a dry run - no files were modified');
    if (summary.filesReorganized > 0) {
      recommendations.push(`💡 Run with dryRun: false to apply ${summary.filesReorganized} file changes`);
    }
  } else {
    if (summary.filesReorganized > 0) {
      recommendations.push(`✅ Successfully reorganized ${summary.filesReorganized} files`);
      if (summary.keysAdded > 0) {
        recommendations.push(`📝 ${summary.keysAdded} missing keys were added with base language values as placeholders`);
      }
      if (summary.keysRemoved > 0) {
        recommendations.push(`🗑️ ${summary.keysRemoved} extra keys were removed`);
      }
      recommendations.push('🔄 Consider running check_translation_integrity to verify the reorganization');
    } else {
      recommendations.push('✅ All files already match the base language structure');
    }
  }
  
  return recommendations;
}