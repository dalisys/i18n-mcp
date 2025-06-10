/**
 * Delete translation tool with single and bulk operations
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TranslationIndex } from '../core/translation-index.js';
import { 
  DeleteTranslationResult, 
  DeleteTranslationInput, 
  BulkDeleteSummary,
  TranslationDependency,
  ServerConfig 
} from '../types/translation.js';

/**
 * Setup the delete translation tool
 */
export function setupDeleteTranslationsTool(
  server: any, 
  index: TranslationIndex, 
  config: Required<ServerConfig>,
  refreshFromFiles?: () => Promise<void>
): void {
  server.tool(
    'delete_translations',
    'Intelligently delete single or multiple translation keys with dependency checking',
    {
      // Single deletion format (backward compatible)
      keyPath: z.string().optional().describe('Translation key path to delete - for single deletion'),
      languages: z.array(z.string()).optional().describe('Specific languages to delete from (if not provided, deletes from all) - for single deletion'),

      // Bulk deletion format
      deletions: z.array(z.object({
        keyPath: z.string().describe('Translation key path to delete'),
        languages: z.array(z.string()).optional().describe('Specific languages to delete from (if not provided, deletes from all)')
      })).optional().describe('Array of deletions to perform - for bulk operations'),

      // Common options
      dryRun: z.boolean().default(false).describe('Preview what would be deleted without actually deleting'),
      checkDependencies: z.boolean().default(true).describe('Check for child keys and dependencies before deletion'),
      writeToFiles: z.boolean().default(true).describe('Write changes to actual files'),
      force: z.boolean().default(false).describe('Force deletion even if warnings are present'),

      // Bulk-specific options
      skipOnError: z.boolean().default(true).describe('Skip individual entries on error instead of failing entire batch (bulk only)'),
      batchSize: z.number().min(1).max(100).default(50).describe('Process deletions in batches of this size (bulk only)')
    },
    async ({
      keyPath,
      languages,
      deletions,
      dryRun,
      checkDependencies,
      writeToFiles,
      force,
      skipOnError,
      batchSize
    }: {
      keyPath?: string;
      languages?: string[];
      deletions?: Array<{
        keyPath: string;
        languages?: string[];
      }>;
      dryRun: boolean;
      checkDependencies: boolean;
      writeToFiles: boolean;
      force: boolean;
      skipOnError: boolean;
      batchSize: number;
    }) => {
      try {
        // Ensure memory is current with files before making changes
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        const deleter = new SmartTranslationDeleter(index, config);

        // Determine if this is a bulk or single operation
        const isBulkOperation = deletions && deletions.length > 0;

        if (isBulkOperation) {
          // Handle bulk operation
          return await deleter.handleBulkDeletions(
            deletions!,
            { dryRun, checkDependencies, writeToFiles, force, skipOnError, batchSize }
          );
        } else {
          // Handle single deletion (backward compatible)
          if (!keyPath) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'For single deletion, keyPath is required',
                  suggestion: 'Provide keyPath, or use deletions array for bulk operations'
                }, null, 2)
              }]
            };
          }

          return await deleter.handleSingleDeletion(
            { keyPath, languages },
            { dryRun, checkDependencies, writeToFiles, force }
          );
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error deleting translation: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }
  );
}

/**
 * Smart translation deleter implementation
 */
export class SmartTranslationDeleter {
  constructor(
    private readonly index: TranslationIndex,
    private readonly config: Required<ServerConfig>
  ) {}

  /**
   * Handle single translation deletion
   */
  async handleSingleDeletion(
    deletion: DeleteTranslationInput,
    options: { dryRun: boolean; checkDependencies: boolean; writeToFiles: boolean; force: boolean }
  ) {
    const result = await this.processSingleDeletion(deletion, options);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  /**
   * Handle bulk translation deletions
   */
  async handleBulkDeletions(
    deletions: Array<{ keyPath: string; languages?: string[] }>,
    options: { dryRun: boolean; checkDependencies: boolean; writeToFiles: boolean; force: boolean; skipOnError: boolean; batchSize: number }
  ) {
    const results: DeleteTranslationResult[] = [];
    const errors: string[] = [];
    let processed = 0;
    let successful = 0;
    let skipped = 0;

    // Process deletions in batches
    for (let i = 0; i < deletions.length; i += options.batchSize) {
      const batch = deletions.slice(i, i + options.batchSize);

      for (const deletion of batch) {
        try {
          const result = await this.processSingleDeletion(deletion, options);

          results.push(result);
          processed++;

          if (result.success) {
            successful++;
          } else if (result.skipReason) {
            skipped++;
          }

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Deletion ${processed + 1}: ${errorMsg}`);

          if (!options.skipOnError) {
            throw new Error(`Batch failed at deletion ${processed + 1}: ${errorMsg}`);
          }

          results.push({
            success: false,
            keyPath: deletion.keyPath,
            deletedLanguages: [],
            remainingLanguages: [],
            completelyRemoved: false,
            warnings: [],
            skipReason: errorMsg,
            dryRun: options.dryRun
          });

          processed++;
        }
      }
    }

    // Calculate summary statistics
    const summary: BulkDeleteSummary = {
      success: errors.length === 0 || options.skipOnError,
      total: deletions.length,
      processed,
      successful,
      skipped,
      failed: processed - successful - skipped,
      errors: errors.length,
      performance: {
        batchSize: options.batchSize,
        totalBatches: Math.ceil(deletions.length / options.batchSize)
      }
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          summary,
          results: results.slice(0, 20), // Limit results for readability
          errors: errors.slice(0, 10), // Limit errors for readability
          dryRun: options.dryRun
        }, null, 2)
      }]
    };
  }

  /**
   * Process a single deletion operation
   */
  async processSingleDeletion(
    deletion: DeleteTranslationInput,
    options: { dryRun: boolean; checkDependencies: boolean; writeToFiles: boolean; force: boolean }
  ): Promise<DeleteTranslationResult> {
    const { keyPath, languages } = deletion;
    const warnings: string[] = [];

    // Check if key exists
    if (!this.index.has(keyPath)) {
      return {
        success: false,
        keyPath,
        deletedLanguages: [],
        remainingLanguages: [],
        completelyRemoved: false,
        warnings,
        skipReason: 'Translation key does not exist',
        dryRun: options.dryRun
      };
    }

    // Get current translation entry
    const entry = this.index.get(keyPath);
    if (!entry || typeof entry !== 'object') {
      return {
        success: false,
        keyPath,
        deletedLanguages: [],
        remainingLanguages: [],
        completelyRemoved: false,
        warnings,
        skipReason: 'Invalid translation entry',
        dryRun: options.dryRun
      };
    }

    // Determine which languages to delete
    const currentLanguages = Object.keys(entry);
    const languagesToDelete = languages && languages.length > 0 ? 
      languages.filter(lang => currentLanguages.includes(lang)) : 
      currentLanguages;

    if (languagesToDelete.length === 0) {
      return {
        success: false,
        keyPath,
        deletedLanguages: [],
        remainingLanguages: currentLanguages,
        completelyRemoved: false,
        warnings,
        skipReason: 'No matching languages found to delete',
        dryRun: options.dryRun
      };
    }

    const remainingLanguages = currentLanguages.filter(lang => !languagesToDelete.includes(lang));
    const completelyRemoved = remainingLanguages.length === 0;

    // Check dependencies if requested
    if (options.checkDependencies) {
      const dependency = this.analyzeDependencies(keyPath);
      
      if (dependency.childKeys.length > 0) {
        warnings.push(`Deleting this key will affect ${dependency.childKeys.length} child key(s): ${dependency.childKeys.slice(0, 3).join(', ')}${dependency.childKeys.length > 3 ? '...' : ''}`);
      }

      if (completelyRemoved && dependency.parentKey) {
        warnings.push(`This key is part of a nested structure under: ${dependency.parentKey}`);
      }

      // Check if this is a base language key being deleted
      if (languagesToDelete.includes(this.config.baseLanguage) && !completelyRemoved) {
        warnings.push(`Deleting from base language (${this.config.baseLanguage}) while keeping other languages may cause inconsistencies`);
      }
    }

    // Stop if there are warnings and force is not enabled
    if (warnings.length > 0 && !options.force && !options.dryRun) {
      return {
        success: false,
        keyPath,
        deletedLanguages: [],
        remainingLanguages: currentLanguages,
        completelyRemoved: false,
        warnings,
        skipReason: 'Operation blocked due to warnings (use force=true to override)',
        dryRun: options.dryRun
      };
    }

    // If this is a dry run, return what would happen
    if (options.dryRun) {
      return {
        success: true,
        keyPath,
        deletedLanguages: languagesToDelete,
        remainingLanguages,
        completelyRemoved,
        warnings,
        dryRun: true
      };
    }

    // Perform the actual deletion
    const fileWriteResults: Record<string, { success: boolean; error?: string }> = {};

    try {
      // Delete from index
      if (completelyRemoved) {
        // Delete entire key
        this.index.delete(keyPath);
      } else {
        // Delete specific languages
        for (const language of languagesToDelete) {
          this.index.delete(keyPath, language);
        }
      }

      // Write to files if requested
      if (options.writeToFiles) {
        for (const language of languagesToDelete) {
          try {
            await this.removeTranslationFromFile(language, keyPath);
            fileWriteResults[language] = { success: true };
          } catch (error) {
            fileWriteResults[language] = {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        }
      }

      return {
        success: true,
        keyPath,
        deletedLanguages: languagesToDelete,
        remainingLanguages,
        completelyRemoved,
        fileWriteResults: options.writeToFiles ? fileWriteResults : undefined,
        warnings,
        dryRun: false
      };

    } catch (error) {
      return {
        success: false,
        keyPath,
        deletedLanguages: [],
        remainingLanguages: currentLanguages,
        completelyRemoved: false,
        warnings,
        skipReason: `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`,
        dryRun: false
      };
    }
  }

  /**
   * Analyze dependencies for a translation key
   */
  private analyzeDependencies(keyPath: string): TranslationDependency {
    const allKeys = this.index.getKeys();
    const entry = this.index.get(keyPath);
    const languages = entry && typeof entry === 'object' ? Object.keys(entry) : [];

    // Find child keys (keys that start with this key path)
    const childKeys = allKeys.filter(key =>
      key !== keyPath && key.startsWith(keyPath + '.')
    );

    // Find parent key
    const keyParts = keyPath.split('.');
    let parentKey: string | undefined;
    if (keyParts.length > 1) {
      parentKey = keyParts.slice(0, -1).join('.');
      // Verify parent exists
      if (!this.index.has(parentKey)) {
        parentKey = undefined;
      }
    }

    // Find sibling keys (keys at the same level)
    const siblingKeys: string[] = [];
    if (parentKey) {
      const parentPrefix = parentKey + '.';
      siblingKeys.push(...allKeys.filter(key =>
        key !== keyPath &&
        key.startsWith(parentPrefix) &&
        key.split('.').length === keyParts.length
      ));
    } else {
      // Top-level siblings
      siblingKeys.push(...allKeys.filter(key =>
        key !== keyPath &&
        !key.includes('.') &&
        keyParts.length === 1
      ));
    }

    return {
      keyPath,
      languages,
      childKeys,
      parentKey,
      siblingKeys
    };
  }

  /**
   * Remove a translation from its corresponding file
   */
  private async removeTranslationFromFile(language: string, keyPath: string): Promise<void> {
    const filePath = join(this.config.translationDir, `${language}.json`);

    // Read existing file content
    let existingData: any = {};
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      existingData = JSON.parse(content);
    } catch (error) {
      // File doesn't exist, nothing to remove
      return;
    }

    // Remove the nested value
    const removed = this.removeNestedValue(existingData, keyPath);

    if (removed) {
      // Write back to file with proper formatting
      const newContent = JSON.stringify(existingData, null, 2);
      await fs.writeFile(filePath, newContent, 'utf-8');
    }
  }

  /**
   * Remove a nested value from an object using dot notation
   */
  private removeNestedValue(obj: any, keyPath: string): boolean {
    const keys = keyPath.split('.');
    let current = obj;

    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key || !(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        return false; // Path doesn't exist
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey && lastKey in current) {
      delete current[lastKey];

      // Clean up empty parent objects
      this.cleanupEmptyParents(obj, keys.slice(0, -1));
      return true;
    }

    return false;
  }

  /**
   * Clean up empty parent objects after deletion
   */
  private cleanupEmptyParents(obj: any, parentPath: string[]): void {
    if (parentPath.length === 0) return;

    let current = obj;
    for (let i = 0; i < parentPath.length - 1; i++) {
      const key = parentPath[i];
      if (!key || !(key in current) || typeof current[key] !== 'object') {
        return;
      }
      current = current[key];
    }

    const lastKey = parentPath[parentPath.length - 1];
    if (lastKey && lastKey in current &&
        typeof current[lastKey] === 'object' &&
        Object.keys(current[lastKey]).length === 0) {
      delete current[lastKey];

      // Recursively clean up parent
      this.cleanupEmptyParents(obj, parentPath.slice(0, -1));
    }
  }
}
