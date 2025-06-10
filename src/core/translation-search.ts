/**
 * Translation search functionality
 */

import { 
  IndexedTranslation, 
  SearchOptions, 
  SearchResult 
} from '../types/translation.js';

export class TranslationSearchEngine {
  /**
   * Search translations with advanced options
   */
  static async search(
    flatIndex: Map<string, IndexedTranslation>,
    sortedKeys: string[],
    query: string, 
    options: SearchOptions = { scope: 'both' }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const caseSensitive = options.caseSensitive || false;
    const searchQuery = caseSensitive ? query : queryLower;

    for (const keyPath of sortedKeys) {
      const entry = flatIndex.get(keyPath);
      if (!entry) continue;

      let matchType: 'key' | 'value' | 'both' | null = null;
      let score = 0;

      // Check key match
      const keyToCheck = caseSensitive ? keyPath : keyPath.toLowerCase();
      const keyMatch = options.scope === 'keys' || options.scope === 'both';
      if (keyMatch && keyToCheck.includes(searchQuery)) {
        matchType = 'key';
        score = this.calculateKeyScore(keyToCheck, searchQuery);
      }

      // Check value match
      const valueMatch = options.scope === 'values' || options.scope === 'both';
      if (valueMatch) {
        for (const [lang, translationEntry] of Object.entries(entry)) {
          if (options.languages && !options.languages.includes(lang)) {
            continue;
          }

          const valueStr = String(translationEntry.value);
          const valueToCheck = caseSensitive ? valueStr : valueStr.toLowerCase();
          
          if (valueToCheck.includes(searchQuery)) {
            const valueScore = this.calculateValueScore(valueToCheck, searchQuery);
            if (valueScore > score) {
              score = valueScore;
              matchType = matchType === 'key' ? 'both' : 'value';
            }
          }
        }
      }

      if (matchType && score > 0) {
        // Filter by languages if specified
        const filteredEntry: IndexedTranslation = {};
        for (const [lang, translationEntry] of Object.entries(entry)) {
          if (!options.languages || options.languages.includes(lang)) {
            filteredEntry[lang] = translationEntry;
          }
        }

        if (Object.keys(filteredEntry).length > 0) {
          results.push({
            keyPath,
            translations: filteredEntry,
            score,
            matchType
          });
        }
      }

      // Limit results
      if (options.maxResults && results.length >= options.maxResults) {
        break;
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Optimized prefix search using binary search
   */
  static searchByPrefix(sortedKeys: string[], prefix: string): string[] {
    const startIdx = this.binarySearchStart(sortedKeys, prefix);
    const endIdx = this.binarySearchEnd(sortedKeys, prefix);
    
    return sortedKeys.slice(startIdx, endIdx + 1);
  }

  private static calculateKeyScore(key: string, query: string): number {
    if (key === query) return 1.0;
    if (key.startsWith(query)) return 0.9;
    if (key.includes(query)) return 0.7;
    return 0.5;
  }

  private static calculateValueScore(value: string, query: string): number {
    if (value === query) return 1.0;
    if (value.startsWith(query)) return 0.8;
    if (value.includes(query)) return 0.6;
    return 0.4;
  }

  private static binarySearchStart(sortedKeys: string[], prefix: string): number {
    let left = 0;
    let right = sortedKeys.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const key = sortedKeys[mid];
      if (key && key < prefix) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left;
  }

  private static binarySearchEnd(sortedKeys: string[], prefix: string): number {
    let left = 0;
    let right = sortedKeys.length;
    const prefixEnd = prefix + '\uffff'; // Unicode max character
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const key = sortedKeys[mid];
      if (key && key < prefixEnd) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left - 1;
  }
}
