/**
 * Check translation integrity tool
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the check translation integrity tool
 */
export function setupCheckTranslationIntegrityTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'check_translation_integrity',
    'Check integrity and consistency across all translation files',
    {
      baseLanguage: z.string().optional().describe('Base language for comparison'),
      includeDetails: z.boolean().default(true).describe('Include detailed analysis'),
      checkMissingKeys: z.boolean().default(true).describe('Check for missing keys'),
      checkExtraKeys: z.boolean().default(true).describe('Check for extra keys'),
      checkTypeMismatches: z.boolean().default(true).describe('Check for type mismatches'),
      fix: z.boolean().default(false).describe('Auto-fix issues when possible')
    },
    async ({ 
      baseLanguage,
      includeDetails,
      checkMissingKeys,
      checkExtraKeys,
      checkTypeMismatches,
      fix
    }: any) => {
      try {
        const targetBaseLanguage = baseLanguage || config.baseLanguage || 'en';

        return await handleIntegrityOperation({
          baseLanguage: targetBaseLanguage,
          includeDetails,
          checkMissingKeys,
          checkExtraKeys,
          checkTypeMismatches,
          fix,
          config
        });

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Translation integrity check failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle integrity operation
 */
async function handleIntegrityOperation({ 
  baseLanguage, 
  includeDetails, 
  checkMissingKeys, 
  checkExtraKeys, 
  checkTypeMismatches, 
  fix, 
  config 
}: any) {
  const translationDir = config.translationDir;
  if (!translationDir) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Translation directory not configured',
          suggestion: 'Configure translationDir in server config'
        }, null, 2)
      }]
    };
  }

  try {
    // Get all translation files
    const files = await fs.readdir(translationDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No JSON translation files found',
            directory: translationDir
          }, null, 2)
        }]
      };
    }

    // Load base language file
    const baseFile = `${baseLanguage}.json`;
    if (!jsonFiles.includes(baseFile)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Base language file not found: ${baseFile}`,
            availableFiles: jsonFiles
          }, null, 2)
        }]
      };
    }

    const baseFilePath = join(translationDir, baseFile);
    const baseContent = await fs.readFile(baseFilePath, 'utf-8');
    const baseData = JSON.parse(baseContent);
    const baseKeys = extractAllKeys(baseData);

    // Analyze each file
    const fileResults: Record<string, any> = {};
    let totalMissingKeys = 0;
    let totalExtraKeys = 0;
    let totalTypeMismatches = 0;
    let filesWithIssues = 0;

    for (const file of jsonFiles) {
      if (file === baseFile) continue; // Skip base language
      
      const language = file.replace('.json', '');
      const filePath = join(translationDir, file);
      
      const result = await analyzeFileIntegrity(filePath, language, baseData, baseKeys, {
        checkMissingKeys,
        checkExtraKeys,
        checkTypeMismatches
      });
      
      fileResults[language] = result;
      
      if (!result.validJson) continue;
      
      totalMissingKeys += result.stats.missingKeys;
      totalExtraKeys += result.stats.extraKeys;
      totalTypeMismatches += result.stats.typeMismatches;
      
      if (result.stats.missingKeys > 0 || result.stats.extraKeys > 0 || result.stats.typeMismatches > 0) {
        filesWithIssues++;
      }
    }

    const isValid = totalMissingKeys === 0 && totalExtraKeys === 0 && totalTypeMismatches === 0;
    const totalFiles = jsonFiles.length;

    const summary = {
      totalKeys: baseKeys.length,
      filesWithIssues,
      totalMissingKeys,
      totalExtraKeys,
      totalTypeMismatches
    };

    const recommendations = generateIntegrityRecommendations(summary, filesWithIssues, totalFiles);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: 'check_translation_integrity',
          isValid,
          baseLanguage,
          totalFiles,
          summary,
          ...(includeDetails ? { fileResults } : {}),
          recommendations
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to check translation integrity',
          details: error instanceof Error ? error.message : String(error)
        }, null, 2)
      }]
    };
  }
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
 * Analyze file integrity
 */
async function analyzeFileIntegrity(filePath: string, language: string, baseData: any, baseKeys: string[], options: any) {
  const result: any = {
    language,
    filePath,
    exists: true,
    validJson: false,
    stats: {
      totalKeys: 0,
      missingKeys: 0,
      extraKeys: 0,
      typeMismatches: 0,
      completeness: 0
    },
    missingKeys: [],
    extraKeys: [],
    typeMismatches: [],
    recommendations: []
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    result.validJson = true;

    const fileKeys = extractAllKeys(data);
    result.stats.totalKeys = fileKeys.length;

    // Check missing keys
    if (options.checkMissingKeys) {
      const missing = baseKeys.filter(key => !fileKeys.includes(key));
      result.missingKeys = missing.map(key => ({ keyPath: key, expectedValue: getValueAtPath(baseData, key) }));
      result.stats.missingKeys = missing.length;
    }

    // Check extra keys
    if (options.checkExtraKeys) {
      const extra = fileKeys.filter(key => !baseKeys.includes(key));
      result.extraKeys = extra.map(key => ({ keyPath: key, actualValue: getValueAtPath(data, key) }));
      result.stats.extraKeys = extra.length;
    }

    // Calculate completeness
    result.stats.completeness = baseKeys.length > 0 ? (baseKeys.length - result.stats.missingKeys) / baseKeys.length : 1;

    // Generate recommendations
    if (result.stats.missingKeys > 0) {
      result.recommendations.push(`Add ${result.stats.missingKeys} missing translation keys`);
    }
    if (result.stats.extraKeys > 0) {
      result.recommendations.push(`Review ${result.stats.extraKeys} extra keys for removal`);
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      result.exists = false;
    } else {
      result.parseError = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

/**
 * Get value at nested path
 */
function getValueAtPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Generate integrity recommendations
 */
function generateIntegrityRecommendations(summary: any, filesWithIssues: number, totalFiles: number): string[] {
  const recommendations: string[] = [];
  
  if (filesWithIssues === 0) {
    recommendations.push('✅ All translation files are in perfect sync');
  } else {
    recommendations.push(`📊 ${filesWithIssues}/${totalFiles} files have integrity issues`);
    
    if (summary.totalMissingKeys > 0) {
      recommendations.push(`🔍 ${summary.totalMissingKeys} missing keys need translation`);
    }
    if (summary.totalExtraKeys > 0) {
      recommendations.push(`🗑️ ${summary.totalExtraKeys} extra keys may need removal`);
    }
    
    recommendations.push('💡 Use reorganize_translation_files tool with fix: true to resolve issues');
  }
  
  return recommendations;
}