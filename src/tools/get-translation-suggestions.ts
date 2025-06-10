/**
 * Get translation suggestions tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the get translation suggestions tool
 */
export function setupGetTranslationSuggestionsTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'get_translation_suggestions',
    'Get autocomplete suggestions for translation keys',
    {
      partial: z.string().describe('Partial key for autocomplete suggestions'),
      maxResults: z.number().min(1).max(500).default(20).describe('Maximum results'),
      includeValues: z.boolean().default(true).describe('Include translation values'),
      preferredLanguage: z.string().optional().describe('Language for values'),
      sortBy: z.enum(['alphabetical', 'usage', 'relevance']).default('relevance').describe('Sort suggestions'),
      filterBy: z.object({
        hasValue: z.boolean().optional(),
        language: z.string().optional(),
        pattern: z.string().optional()
      }).optional().describe('Filter suggestions')
    },
    async ({ 
      partial,
      maxResults,
      includeValues,
      preferredLanguage,
      sortBy,
      filterBy
    }: any) => {
      try {
        // Ensure memory is current with files before searching
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        const baseLanguage = preferredLanguage || config.baseLanguage || 'en';
        
        // Get prefix-based suggestions
        let suggestions = index.searchByPrefix(partial);
        
        // Apply filters
        if (filterBy) {
          if (filterBy.hasValue !== undefined) {
            suggestions = suggestions.filter(keyPath => {
              const entry = index.get(keyPath, baseLanguage);
              const hasValue = entry && typeof entry === 'object' && 'value' in entry && entry.value;
              return filterBy.hasValue ? hasValue : !hasValue;
            });
          }
          
          if (filterBy.language) {
            suggestions = suggestions.filter(keyPath => {
              return index.get(keyPath, filterBy.language!) !== null;
            });
          }
          
          if (filterBy.pattern) {
            try {
              const regex = new RegExp(filterBy.pattern);
              suggestions = suggestions.filter(keyPath => regex.test(keyPath));
            } catch (error) {
              // Invalid regex, skip pattern filter
            }
          }
        }
        
        // Sort suggestions
        switch (sortBy) {
          case 'alphabetical':
            suggestions.sort();
            break;
          case 'usage':
            suggestions.sort((a, b) => {
              const depthA = a.split('.').length;
              const depthB = b.split('.').length;
              return depthB - depthA;
            });
            break;
          case 'relevance':
          default:
            suggestions.sort((a, b) => {
              const aStartsWithPartial = a.toLowerCase().startsWith(partial.toLowerCase());
              const bStartsWithPartial = b.toLowerCase().startsWith(partial.toLowerCase());
              
              if (aStartsWithPartial && !bStartsWithPartial) return -1;
              if (!aStartsWithPartial && bStartsWithPartial) return 1;
              
              return a.length - b.length;
            });
            break;
        }
        
        // Limit results
        const limitedSuggestions = suggestions.slice(0, maxResults);
        
        // Build result objects
        const results = limitedSuggestions.map(keyPath => {
          const suggestion: any = { 
            keyPath,
            score: calculateRelevanceScore(keyPath, partial)
          };
          
          if (includeValues) {
            const entry = index.get(keyPath, baseLanguage);
            if (entry && typeof entry === 'object' && 'value' in entry) {
              suggestion.value = entry.value;
              suggestion.language = baseLanguage;
            }
          }
          
          return suggestion;
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              partial,
              totalMatches: suggestions.length,
              showing: limitedSuggestions.length,
              hasMore: suggestions.length > maxResults,
              suggestions: results,
              sortedBy: sortBy
            }, null, 2)
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Suggestions operation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Calculate relevance score for a suggestion
 */
function calculateRelevanceScore(keyPath: string, partial: string): number {
  const lowerKey = keyPath.toLowerCase();
  const lowerPartial = partial.toLowerCase();
  
  let score = 0;
  
  // Exact prefix match gets highest score
  if (lowerKey.startsWith(lowerPartial)) {
    score += 1.0;
  }
  // Contains the partial gets medium score
  else if (lowerKey.includes(lowerPartial)) {
    score += 0.5;
  }
  
  // Adjust score based on length difference
  const lengthDiff = Math.abs(keyPath.length - partial.length);
  score -= lengthDiff * 0.01;
  
  // Prefer shorter, more specific keys
  const depth = keyPath.split('.').length;
  score += depth * 0.1;
  
  return Math.max(0, Math.min(1, score));
}