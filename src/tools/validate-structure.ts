/**
 * Validate structure tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the validate structure tool
 */
export function setupValidateStructureTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'validate_structure',
    'Validate translation file structure consistency',
    {
      baseLanguage: z.string().optional().describe('Base language for validation'),
      autoFix: z.boolean().default(false).describe('Automatically fix validation issues')
    },
    async ({ 
      baseLanguage,
      autoFix
    }: any) => {
      try {
        const targetBaseLanguage = baseLanguage || config.baseLanguage || 'en';

        const validation = await index.validateStructure({
          baseLanguage: targetBaseLanguage,
          autoFix
        });

        const summary = {
          missingKeysCount: Object.values(validation.missingKeys).reduce((sum: number, keys: any) => sum + keys.length, 0),
          extraKeysCount: Object.values(validation.extraKeys).reduce((sum: number, keys: any) => sum + keys.length, 0),
          typeMismatchesCount: validation.typeMismatches.length
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operation: 'validate_structure',
              valid: validation.valid,
              baseLanguage: targetBaseLanguage,
              autoFix,
              summary,
              details: {
                missingKeys: validation.missingKeys,
                extraKeys: validation.extraKeys,
                typeMismatches: validation.typeMismatches,
                structuralIssues: validation.structuralIssues
              },
              recommendations: generateValidationRecommendations(validation, summary)
            }, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Structure validation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Generate validation recommendations
 */
function generateValidationRecommendations(validation: any, summary: any): string[] {
  const recommendations: string[] = [];
  
  if (validation.valid) {
    recommendations.push('✅ All translation files have consistent structure');
  } else {
    if (summary.missingKeysCount > 0) {
      recommendations.push(`🔍 Found ${summary.missingKeysCount} missing keys across files`);
    }
    if (summary.extraKeysCount > 0) {
      recommendations.push(`🗑️ Found ${summary.extraKeysCount} extra keys that may need removal`);
    }
    if (summary.typeMismatchesCount > 0) {
      recommendations.push(`⚠️ Found ${summary.typeMismatchesCount} type mismatches`);
    }
    recommendations.push('💡 Use reorganize_translation_files tool to fix structure issues');
  }
  
  return recommendations;
}