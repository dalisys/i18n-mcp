/**
 * Search translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Format translations in a compact way to save context
 */
function formatTranslationsCompact(translations: any): any {
  const compact: any = {};
  
  for (const [lang, entry] of Object.entries(translations)) {
    if (entry && typeof entry === 'object' && 'value' in entry) {
      let value = String(entry.value);
      // Truncate long values
      if (value.length > 100) {
        value = value.substring(0, 97) + '...';
      }
      compact[lang] = value;
    }
  }
  
  return compact;
}

/**
 * Setup the search translation tool
 */
export function setupSearchTranslationTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'search_translation',
    'Search for translations by content or key patterns. IMPORTANT: Use single terms (e.g., "clients") not multiple words (e.g., "clients profile payment"). For multiple terms, use array format or separate searches.',
    {
      query: z.union([z.string(), z.array(z.string())]).describe('Search query - single term as string (e.g., "clients") OR array for multiple searches (e.g., ["clients", "profile", "payment"])'),
      scope: z.enum(['keys', 'values', 'both']).default('both').describe('Search scope'),
      maxResults: z.number().min(1).max(50).default(10).describe('Maximum results per query (reduced default to save context)'),
      caseSensitive: z.boolean().default(false).describe('Case sensitive search'),
      groupResults: z.boolean().default(true).describe('Group results by query for bulk search'),
      languages: z.array(z.string()).optional().describe('Languages to include')
    },
    async ({ 
      query, 
      scope, 
      maxResults, 
      caseSensitive, 
      groupResults,
      languages
    }: any) => {
      try {
        // Ensure memory is current with files before searching
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        // Detect and handle multi-word queries
        let queries: string[];
        let isMultiWordDetected = false;
        
        if (Array.isArray(query)) {
          queries = query;
        } else if (typeof query === 'string' && query.includes(' ') && query.split(' ').length > 2) {
          // Auto-split multi-word queries
          queries = query.split(' ').filter(term => term.trim().length > 0);
          isMultiWordDetected = true;
        } else {
          queries = [query];
        }

        const allResults: any[] = [];
        const resultsByQuery: Record<string, any[]> = {};

        for (const searchQuery of queries) {
          const results = await index.search(searchQuery, {
            scope,
            languages,
            maxResults,
            caseSensitive
          });

          const formattedResults = results.map(result => ({
            keyPath: result.keyPath,
            matchType: result.matchType,
            score: result.score,
            translations: formatTranslationsCompact(result.translations),
            matchedQuery: searchQuery
          }));

          allResults.push(...formattedResults);
          resultsByQuery[searchQuery] = formattedResults;
        }

        // Single query response
        if (!Array.isArray(query) && !isMultiWordDetected) {
          const singleResponse: any = {
            query,
            scope,
            resultsCount: allResults.length
          };

          if (allResults.length <= 15) {
            singleResponse.results = allResults;
          } else {
            singleResponse.note = `Found ${allResults.length} results. Showing first 10 to save context.`;
            singleResponse.results = allResults.slice(0, 10);
            singleResponse.remainingCount = allResults.length - 10;
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(singleResponse, null, 2)
            }]
          };
        }

        // Bulk search response
        const summary = {
          totalQueries: queries.length,
          totalResults: allResults.length,
          resultsByQuery: Object.keys(resultsByQuery).map(q => ({
            query: q,
            count: resultsByQuery[q]?.length || 0,
            hasResults: (resultsByQuery[q]?.length || 0) > 0
          }))
        };

        const response: any = {
          bulkSearch: true,
          queries,
          scope,
          summary
        };

        // Only include detailed results if total is manageable
        if (allResults.length <= 30) {
          if (groupResults) {
            response.resultsByQuery = resultsByQuery;
          } else {
            response.results = allResults;
          }
        } else {
          response.note = `Found ${allResults.length} results. Showing summary only to save context. Use more specific queries or explore_translation_structure for better results.`;
          // Show only key paths for large result sets
          response.keyPathsFound = allResults.slice(0, 20).map(r => r.keyPath);
          response.moreResults = allResults.length - 20;
        }

        if (isMultiWordDetected) {
          response.warning = `Multi-word query "${query}" was automatically split into individual terms. For better results, use array format: ["${queries.join('", "')}"] or search for single terms.`;
          response.suggestion = allResults.length === 0 
            ? 'Try using explore_translation_structure to understand the key hierarchy first.'
            : 'Consider searching for more specific single terms based on the structure you need.';
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
              error: 'Search operation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}