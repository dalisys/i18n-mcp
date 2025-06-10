/**
 * Batch operations for translation index
 */

import { BatchOperation, IndexedTranslation, ValidationResult, UsageAnalysis } from '../types/translation.js';
import { TranslationValidationEngine } from './translation-validation.js';

export class TranslationBatchOperations {
  /**
   * Batch operations for atomic updates
   */
  static async batchUpdate(
    flatIndex: Map<string, IndexedTranslation>,
    operations: BatchOperation[],
    emit: (event: string, data: any) => void,
    invalidateCache: () => void,
    setMethod: (keyPath: string, language: string, value: any) => void,
    deleteMethod: (keyPath: string, language?: string) => boolean
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const backup = new Map(flatIndex);

    try {
      for (const operation of operations) {
        try {
          if (operation.type === 'set') {
            if (!operation.language || operation.value === undefined) {
              throw new Error('Set operation requires language and value');
            }
            setMethod(operation.keyPath, operation.language, operation.value);
          } else if (operation.type === 'delete') {
            deleteMethod(operation.keyPath, operation.language);
          }
        } catch (error) {
          errors.push(`Operation failed for ${operation.keyPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (errors.length > 0) {
        // Rollback on any errors
        flatIndex.clear();
        backup.forEach((value, key) => flatIndex.set(key, value));
        invalidateCache();

        return { success: false, errors };
      }

      invalidateCache();
      emit('batchUpdate', operations);

      return { success: true, errors: [] };

    } catch (error) {
      // Rollback on error
      flatIndex.clear();
      backup.forEach((value, key) => flatIndex.set(key, value));
      invalidateCache();

      return {
        success: false,
        errors: [`Batch operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Validate structure consistency across languages
   */
  static async validateStructure(
    flatIndex: Map<string, IndexedTranslation>,
    getKeys: () => string[],
    baseLanguage: string,
    autoFix: boolean = false,
    batchUpdateMethod: (operations: BatchOperation[]) => Promise<{ success: boolean; errors: string[] }>
  ): Promise<ValidationResult> {
    const result = await TranslationValidationEngine.validateStructure(
      flatIndex,
      getKeys(),
      baseLanguage,
      autoFix
    );

    // Auto-fix if requested and there are issues
    if (autoFix && !result.valid) {
      const fixOperations: BatchOperation[] = [];

      // Add missing keys with placeholder values
      for (const [language, missingKeys] of Object.entries(result.missingKeys)) {
        for (const keyPath of missingKeys) {
          const baseEntry = flatIndex.get(keyPath);
          if (baseEntry && baseEntry[baseLanguage]) {
            fixOperations.push({
              type: 'set',
              keyPath,
              language,
              value: `[MISSING: ${baseEntry[baseLanguage].value}]`
            });
          }
        }
      }

      if (fixOperations.length > 0) {
        await batchUpdateMethod(fixOperations);
        result.structuralIssues.push(`Auto-fixed ${fixOperations.length} missing translations`);
      }
    }

    return result;
  }

  /**
   * Analyze usage patterns and find optimization opportunities
   */
  static async analyzeUsage(
    flatIndex: Map<string, IndexedTranslation>,
    getKeys: () => string[],
    checkDuplicates: boolean = true
  ): Promise<UsageAnalysis> {
    return TranslationValidationEngine.analyzeUsage(flatIndex, getKeys(), checkDuplicates);
  }
}
