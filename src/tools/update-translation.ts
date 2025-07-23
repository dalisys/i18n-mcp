/**
 * Update translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';
import { validateFileConflicts } from '../utils/file-validation.js';

/**
 * Setup the update translation tool
 */
export function setupUpdateTranslationTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'update_translation',
    'Update existing translations or batch update multiple keys',
    {
      keyPath: z.string().optional().describe('Translation key path (required if not using batchOperations)'),
      translations: z.record(z.string(), z.string()).optional().describe('Translations by language code'),
      validateStructure: z.boolean().default(true).describe('Validate structure consistency'),
      createIfMissing: z.boolean().default(false).describe('Create key if it does not exist'),
      conflictResolution: z.enum(['error', 'merge', 'replace']).default('replace').describe('How to handle existing keys (default: replace for updates)'),
      batchOperations: z.array(z.object({
        keyPath: z.string(),
        translations: z.record(z.string(), z.string()),
        operation: z.enum(['add', 'update']).optional()
      })).optional().describe('Batch operations (alternative to single operation)')
    },
    async ({ 
      keyPath,
      translations,
      validateStructure,
      createIfMissing,
      conflictResolution,
      batchOperations
    }: any) => {
      try {
        // Ensure memory is current with files before making changes
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        if (!keyPath && !batchOperations) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                error: 'keyPath is required for update operation (or provide batchOperations)' 
              }, null, 2)
            }]
          };
        }

        if (batchOperations) {
          return await handleBatchOperations({
            operations: batchOperations,
            validateStructure,
            createIfMissing,
            conflictResolution,
            index,
            config
          });
        }

        return await handleUpdateOperation({
          keyPath,
          translations,
          validateStructure,
          createIfMissing,
          conflictResolution,
          index,
          config
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Update translation operation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle update operation
 */
async function handleUpdateOperation({ keyPath, translations, validateStructure, createIfMissing, conflictResolution, index, config }: any) {
  // Check if key exists
  if (!index.has(keyPath)) {
    if (!createIfMissing) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Translation key not found',
            keyPath,
            suggestion: 'Use createIfMissing: true to create the key, or use operation: "add"'
          }, null, 2)
        }]
      };
    }
  }

  // Validate structure if requested
  if (validateStructure) {
    const validation = await index.validateStructure();
    if (!validation.valid) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Structure validation failed before update',
            issues: validation.structuralIssues
          }, null, 2)
        }]
      };
    }
  }

  // Validate file conflicts before updating (if auto-sync is enabled)
  if (config.autoSync) {
    try {
      const conflicts = await validateFileConflicts([keyPath], config, index, conflictResolution);
      if (conflicts.length > 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operation: 'update',
              success: false,
              error: 'File structure conflicts detected',
              conflicts: conflicts,
              keyPath: keyPath,
              message: 'The translation key would conflict with existing file structure. Please resolve these conflicts first.'
            }, null, 2)
          }]
        };
      }
    } catch (validationError) {
      console.error('File conflict validation failed:', validationError);
    }
  }

  // Update translations
  const operations = Object.entries(translations).map(([language, value]) => ({
    type: 'set' as const,
    keyPath,
    language,
    value
  }));

  const result = await index.batchUpdate(operations);

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to update translations',
          details: result.errors
        }, null, 2)
      }]
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'update',
        success: true,
        keyPath,
        updated: translations,
        validation: validateStructure ? 'passed' : 'skipped'
      }, null, 2)
    }]
  };
}

/**
 * Handle batch operations
 */
async function handleBatchOperations({ operations, validateStructure, createIfMissing, conflictResolution, index, config }: any) {
  // Collect all key paths for validation
  const allKeyPaths = operations.map((op: any) => op.keyPath);
  
  // Validate file conflicts before updating (if auto-sync is enabled)
  if (config.autoSync && allKeyPaths.length > 0) {
    try {
      const conflicts = await validateFileConflicts(allKeyPaths, config, index, conflictResolution);
      if (conflicts.length > 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operation: 'batch-update',
              success: false,
              error: 'File structure conflicts detected',
              conflicts: conflicts,
              message: 'Some translation keys would conflict with existing file structure. Please resolve these conflicts first.',
              processed: 0,
              failed: operations.length
            }, null, 2)
          }]
        };
      }
    } catch (validationError) {
      console.error('File conflict validation failed:', validationError);
    }
  }
  const batchOps = operations.flatMap((op: any) => 
    Object.entries(op.translations).map(([language, value]) => ({
      type: (op.operation || 'set') === 'add' ? 'set' : 'set',
      keyPath: op.keyPath,
      language,
      value
    }))
  );

  const result = await index.batchUpdate(batchOps);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'batch-update',
        success: result.success,
        processed: operations.length,
        errors: result.errors
      }, null, 2)
    }]
  };
}