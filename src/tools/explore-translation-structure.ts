/**
 * Explore translation structure tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the explore translation structure tool
 */
export function setupExploreTranslationStructureTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'explore_translation_structure',
    'Explore the hierarchical structure of translations to understand key organization',
    {
      prefix: z.string().optional().describe('Key prefix to explore (e.g., "dashboard" or "dashboard.clients")'),
      maxDepth: z.number().min(1).max(5).default(2).describe('Maximum depth to show (reduced to save context)'),
      showValues: z.boolean().default(false).describe('Show translation values'),
      language: z.string().default('en').describe('Language to show values for')
    },
    async ({ 
      prefix,
      maxDepth,
      showValues,
      language
    }: any) => {
      try {
        // Ensure memory is current with files before searching
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        // Get all keys that start with the prefix
        const allKeys = index.getKeys();
        const filteredKeys = prefix 
          ? allKeys.filter(key => key.startsWith(prefix))
          : allKeys;

        // Limit the number of keys to process to save context
        const limitedKeys = filteredKeys.slice(0, 200);
        const truncated = filteredKeys.length > 200;

        if (limitedKeys.length === 0) {
          const suggestions = await index.search(prefix || '', {
            scope: 'keys',
            maxResults: 10,
            caseSensitive: false
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                prefix: prefix || 'root',
                found: false,
                message: `No keys found${prefix ? ` with prefix "${prefix}"` : ''}`,
                suggestions: suggestions.length > 0 
                  ? suggestions.map(s => s.keyPath).slice(0, 5)
                  : ['Try exploring without a prefix to see the full structure'],
                totalKeys: allKeys.length
              }, null, 2)
            }]
          };
        }

        // Build hierarchical structure
        const structure = buildStructure(limitedKeys, prefix, maxDepth, showValues ? { index, language } : undefined);

        const response: any = {
          prefix: prefix || 'root',
          found: true,
          keysFound: limitedKeys.length,
          maxDepth,
          structure,
          hint: 'Use the key paths shown above with get_translation_context or add_translations tools'
        };

        if (truncated) {
          response.note = `Showing first 200 of ${filteredKeys.length} keys to save context. Use a more specific prefix to narrow results.`;
          response.totalKeys = filteredKeys.length;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Structure exploration failed',
              details: error instanceof Error ? error.message : String(error),
              prefix
            }, null, 2)
          }]
        };
      }
    }
  );
}

function buildStructure(
  keys: string[], 
  prefix: string | undefined, 
  maxDepth: number,
  valueOptions?: { index: TranslationIndex, language: string }
): any {
  const structure: any = {};
  
  for (const key of keys) {
    const parts = key.split('.');
    const relativeParts = prefix ? parts.slice(prefix.split('.').length) : parts;
    
    if (relativeParts.length === 0 || relativeParts.length > maxDepth) {
      continue;
    }

    let current = structure;
    for (let i = 0; i < relativeParts.length; i++) {
      const part = relativeParts[i];
      if (!part) continue; // Skip empty parts
      
      if (i === relativeParts.length - 1) {
        // Leaf node
        if (valueOptions) {
          const entry = valueOptions.index.get(key, valueOptions.language);
          current[part] = {
            __key: key,
            __value: entry && typeof entry === 'object' && 'value' in entry ? String(entry.value) : null
          };
        } else {
          current[part] = { __key: key };
        }
      } else {
        // Intermediate node
        if (!current[part] || typeof current[part] === 'string') {
          current[part] = {};
        }
        current = current[part] as any;
      }
    }
  }

  return structure;
}