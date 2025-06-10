/**
 * Get translation context tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the get translation context tool
 */
export function setupGetTranslationContextTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'get_translation_context',
    'Get hierarchical context for a translation key',
    {
      keyPath: z.string().describe('Key path for context retrieval'),
      contextDepth: z.number().min(0).max(5).default(1).describe('Context depth'),
      languages: z.array(z.string()).optional().describe('Languages to include')
    },
    async ({ 
      keyPath,
      contextDepth,
      languages
    }: any) => {
      try {
        // Ensure memory is current with files before searching
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        const contextResult = await index.getContext(keyPath, {
          depth: contextDepth,
          languages
        });

        if (!contextResult) {
          // Search for similar keys to provide suggestions
          const searchResults = await index.search(keyPath, {
            scope: 'keys',
            maxResults: 5,
            caseSensitive: false
          });

          const suggestions = searchResults.map(result => result.keyPath);
          
          // Also find keys that contain the search term
          const partialMatches = await index.search(keyPath.split('.').pop() || keyPath, {
            scope: 'keys',
            maxResults: 10,
            caseSensitive: false
          });

          const partialSuggestions = partialMatches
            .map(result => result.keyPath)
            .filter(path => path !== keyPath && !suggestions.includes(path))
            .slice(0, 5);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                keyPath,
                found: false,
                error: 'Translation key not found',
                suggestions: suggestions.length > 0 ? suggestions : undefined,
                partialMatches: partialSuggestions.length > 0 ? partialSuggestions : undefined,
                hint: suggestions.length === 0 && partialSuggestions.length === 0 
                  ? 'Try searching for related terms or explore the translation structure'
                  : 'Consider using one of the suggested keys above'
              }, null, 2)
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              keyPath,
              found: true,
              context: contextResult
            }, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Context retrieval failed',
              details: error instanceof Error ? error.message : String(error),
              keyPath
            }, null, 2)
          }]
        };
      }
    }
  );
}