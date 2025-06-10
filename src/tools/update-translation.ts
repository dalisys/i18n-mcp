/**
 * Update translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

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
            index
          });
        }

        return await handleUpdateOperation({
          keyPath,
          translations,
          validateStructure,
          createIfMissing,
          index
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
async function handleUpdateOperation({ keyPath, translations, validateStructure, createIfMissing, index }: any) {
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
async function handleBatchOperations({ operations, validateStructure, createIfMissing, index }: any) {
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