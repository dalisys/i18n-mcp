/**
 * Search translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parseTree, type JSONPath } from 'jsonc-parser';

/**
 * Check if key paths have potential file conflicts
 */
async function checkForConflicts(keyPaths: string[], config: any, index: TranslationIndex): Promise<string[]> {
  const conflicts: string[] = [];
  const languages = index.getLanguages();
  
  // Only check a sample to avoid performance issues
  const checkLanguages = languages.slice(0, 2);
  
  for (const language of checkLanguages) {
    const filePath = join(config.translationDir, `${language}.json`);
    let fileContent = '{}';
    
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      continue;
    }
    
    try {
      const currentData = parseTree(fileContent);
      
      for (const keyPath of keyPaths.slice(0, 10)) { // Only check first 10 keys
        const keyParts = keyPath.split('.') as JSONPath;
        const conflictPath = findConflictingPath(currentData, keyParts);
        if (conflictPath) {
          conflicts.push(`${keyPath}`);
        }
      }
    } catch (parseError) {
      continue;
    }
  }
  
  return [...new Set(conflicts)];
}

function findConflictingPath(parseTree: any, keyParts: JSONPath): string[] | null {
  let current = parseTree;
  const conflictPath: string[] = [];
  
  for (const part of keyParts) {
    const partStr = String(part);
    
    if (!current || current.type !== 'object') {
      return conflictPath;
    }
    
    const property = current.children?.find((child: any) => 
      child.type === 'property' && 
      child.children?.[0]?.value === partStr
    );
    
    if (!property) {
      return null;
    }
    
    conflictPath.push(partStr);
    const valueNode = property.children?.[1];
    
    if (valueNode?.type === 'string' || valueNode?.type === 'number' || valueNode?.type === 'boolean') {
      return conflictPath;
    }
    
    current = valueNode;
  }
  
  return null;
}

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
export function setupSearchTranslationTool(server: any, index: TranslationIndex, _config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'search_translation',
    'Search for translations by content or key patterns. Use string for single search or array of strings for multiple searches.',
    {
      query: z.union([z.string(), z.array(z.string())]).describe('Search query - string for single search OR array of strings for multiple searches'),
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
        
        // Detect and handle different query formats
        let queries: string[];
        let isMultiWordDetected = false;
        let parsedFromString = false;
        
        if (Array.isArray(query)) {
          queries = query;
        } else if (typeof query === 'string') {
          // Try to parse stringified array (e.g., '["item1", "item2"]')
          if (query.trim().startsWith('[') && query.trim().endsWith(']')) {
            try {
              const parsed = JSON.parse(query);
              if (Array.isArray(parsed)) {
                queries = parsed;
                parsedFromString = true;
              } else {
                queries = [query];
              }
            } catch {
              queries = [query];
            }
          } else if (query.includes(' ') && query.split(' ').length > 2) {
            // Auto-split multi-word queries
            queries = query.split(' ').filter(term => term.trim().length > 0);
            isMultiWordDetected = true;
          } else {
            queries = [query];
          }
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

        // Check for potential file structure conflicts
        let conflictWarning = '';
        if (_config.autoSync && allResults.length > 0) {
          try {
            const keyPaths = allResults.map(r => r.keyPath);
            const conflicts = await checkForConflicts(keyPaths, _config, index);
            if (conflicts.length > 0) {
              conflictWarning = `⚠️ Warning: ${conflicts.length} of these keys may have file structure conflicts that could prevent auto-sync. Keys: ${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? '...' : ''}`;
            }
          } catch (error) {
            // Silently continue if conflict checking fails
          }
        }

        // Single query response
        if (!Array.isArray(query) && !isMultiWordDetected && !parsedFromString) {
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

          if (conflictWarning) {
            singleResponse.conflictWarning = conflictWarning;
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

        if (parsedFromString) {
          response.info = `Successfully parsed stringified array with ${queries.length} search terms.`;
        } else if (isMultiWordDetected) {
          response.warning = `Multi-word query "${query}" was automatically split into individual terms. For better results, use array format: ["${queries.join('", "')}"] or search for single terms.`;
          response.suggestion = allResults.length === 0 
            ? 'Try using explore_translation_structure to understand the key hierarchy first.'
            : 'Consider searching for more specific single terms based on the structure you need.';
        }

        if (conflictWarning) {
          response.conflictWarning = conflictWarning;
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