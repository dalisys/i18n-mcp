/**
 * Add translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the add translation tool
 */
export function setupAddTranslationsTool(server: any, index: TranslationIndex, config: any) {
  // Removed plain text debug log to avoid JSON parsing errors
  
  server.tool(
    'add_translations',
    'Add new translations with smart key generation and conflict handling',
    {
      keyPath: z.string().optional().describe('Translation key path (optional if text provided)'),
      translations: z.record(z.string(), z.any()).describe('Translations by language code'),
      text: z.string().optional().describe('Source text for key generation'),
      suggestedKey: z.string().optional().describe('Suggested key path'),
      conflictResolution: z.enum(['error', 'merge', 'replace']).default('error').describe('How to handle existing keys'),
      validateStructure: z.boolean().default(true).describe('Validate structure consistency'),
      namespace: z.string().optional().describe('Namespace for organization (e.g., "dashboard.clients" for client-related translations)')
    },
    async (args: any) => {
      // Removed plain text debug logs to avoid JSON parsing errors
      
      try {
        return await handleAddOperation({
          ...args,
          index,
          config
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Add translation operation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle add operation
 */
async function handleAddOperation({ 
  keyPath, 
  suggestedKey,
  translations, 
  text, 
  conflictResolution, 
  validateStructure, 
  namespace, 
  index, 
  config 
}: any) {
  const isNested = Object.values(translations).some(v => typeof v === 'object' && v !== null && !Array.isArray(v));

  if (isNested) {
    const results: any[] = [];
    // For nested adds, the base key path comes from the namespace or the top-level key.
    const baseKeyPath = namespace || keyPath || '';
    for (const [language, value] of Object.entries(translations)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        await addNestedTranslations(baseKeyPath, value, language, index, results, conflictResolution);
      } else if (typeof value === 'string') {
        results.push({ language, value, success: false, error: 'Mixing flat and nested translations in a single `add` call is not currently supported. Please provide only nested objects for this operation.' });
      } else {
        results.push({ language, success: false, error: `Invalid value type for language '${language}'. Expected object or string.` });
      }
    }

    const successfulOps = results.filter(r => r.success);
    const failedOps = results.filter(r => !r.success);

    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                operation: 'add-nested',
                success: failedOps.length === 0,
                summary: {
                    keys_processed: results.length,
                    successful: successfulOps.length,
                    failed: failedOps.length,
                },
                results
            }, null, 2)
        }]
    };
  }
  
  let finalKeyPath: string | undefined = keyPath;

  if (!finalKeyPath) {
    // If no explicit keyPath is given, construct one.
    let keySegment = suggestedKey;

    if (!keySegment) {
      // If no suggestedKey, generate a key segment from the text.
      if (!text) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              error: 'Either `keyPath` must be provided, or `suggestedKey` or `text` must be provided to generate a key.' 
            }, null, 2)
          }]
        };
      }
      keySegment = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '_').replace(/^_|_$/g, '');
    }

    if (keySegment) {
      finalKeyPath = namespace ? `${namespace}.${keySegment}` : keySegment;
    }
  }

  if (!finalKeyPath) {
    // Safeguard, should not be reached if logic is correct.
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'Could not determine a final key path for the translation.' }, null, 2)
      }]
    };
  }

  // Check if key exists
  const exists = index.has(finalKeyPath);
  if (exists) {
    switch (conflictResolution) {
      case 'error':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Translation key already exists',
              keyPath: finalKeyPath,
              existing: index.getTranslations(finalKeyPath),
              suggestion: 'Use conflictResolution: "merge" or "replace" to handle existing key'
            }, null, 2)
          }]
        };
      case 'merge':
        // Merge with existing translations
        const existing = index.getTranslations(finalKeyPath) || {};
        const merged = { ...existing };
        for (const [lang, value] of Object.entries(translations)) {
          if (!merged[lang] || merged[lang] === null) {
            merged[lang] = { value, file: '', line: 0, column: 0, lastModified: Date.now() };
          }
        }
        break;
      case 'replace':
        // Will replace existing translations
        break;
    }
  }

  // Add translations

  const results: any[] = [];
  for (const [language, value] of Object.entries(translations)) {
    try {
      await index.set(finalKeyPath, language, value);
      results.push({ language, value, success: true });
    } catch (error) {
      results.push({ 
        language, 
        value, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'add',
        success: true,
        keyPath: finalKeyPath,
        translations: Object.fromEntries(results.map(r => [r.language, r])),
        conflictResolution: exists ? conflictResolution : 'none',
        autoSync: config.autoSync ? 'Files will be auto-synced within 500ms' : 'Use sync_translations_to_files to update files'
      }, null, 2)
    }]
  };
}

/**
 * Recursively add nested translations
 */
async function addNestedTranslations(prefix: string, nested: any, lang: string, index: TranslationIndex, results: any[], conflictResolution: string) {
  for (const [key, value] of Object.entries(nested)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Check if a translation for this specific key AND language already exists.
      const existingEntry = index.get(fullKey, lang);

      if (existingEntry) {
        switch (conflictResolution) {
          case 'error':
            results.push({ keyPath: fullKey, language: lang, success: false, error: 'Translation key already exists' });
            continue; // Skip to the next key
          case 'merge':
            // This case is implicitly handled by the `existingEntry` check.
            // If we are merging, we don't overwrite existing values.
            results.push({ keyPath: fullKey, language: lang, success: true, status: 'skipped', reason: `Key already has a value for language '${lang}'.` });
            continue;
          case 'replace':
            // Allow the operation to proceed and overwrite the value.
            break;
        }
      }

      try {
        await index.set(fullKey, lang, value);
        results.push({ keyPath: fullKey, language: lang, success: true, status: 'added' });
      } catch (error) {
        results.push({ keyPath: fullKey, language: lang, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      await addNestedTranslations(fullKey, value, lang, index, results, conflictResolution);
    } else {
      results.push({ keyPath: fullKey, language: lang, success: false, error: `Invalid translation value type for key '${fullKey}': ${typeof value}` });
    }
  }
}