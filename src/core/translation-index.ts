/**
 * High-performance in-memory translation index
 */

import { EventEmitter } from 'events';
import {
  TranslationEntry,
  IndexedTranslation,
  TranslationIndexConfig,
  SearchOptions,
  SearchResult,
  ContextOptions,
  ContextResult,
  BatchOperation,
  ValidationResult,
  UsageAnalysis,
  IndexError
} from '../types/translation.js';
import { PathParser } from '../utils/path-parser.js';
import { LRUCache } from '../utils/lru-cache.js';
import { TranslationSearchEngine } from './translation-search.js';
import { TranslationContextEngine } from './translation-context.js';
import { TranslationBatchOperations } from './translation-batch.js';

/**
 * High-performance translation index with O(1) lookups and advanced search
 */
export class TranslationIndex extends EventEmitter {
  private readonly flatIndex = new Map<string, IndexedTranslation>();
  private readonly reverseIndex = new Map<string, Set<string>>(); // value -> paths
  private readonly structureTemplate = new Map<string, any>();
  private readonly cache: LRUCache<string, any>;
  
  // Binary search optimized sorted keys for prefix operations
  private sortedKeys: string[] = [];
  private keysDirty = false;
  
  private readonly config: Required<TranslationIndexConfig>;

  constructor(config: TranslationIndexConfig) {
    super();

    this.config = {
      maxCacheSize: 10000,
      debug: false,
      ...config,
      baseLanguage: config.baseLanguage || 'en'
    };
    
    this.cache = new LRUCache(this.config.maxCacheSize);
    
    if (this.config.debug) {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `TranslationIndex initialized with base language: ${this.config.baseLanguage}`
        }
      }));
    }
  }

  /**
   * Check if a translation key exists
   * O(1) lookup
   */
  has(keyPath: string, language?: string): boolean {
    const entry = this.flatIndex.get(keyPath);
    if (!entry) return false;

    if (language) {
      return language in entry;
    }

    return true;
  }

  /**
   * O(1) lookup with caching
   */
  get(keyPath: string, language?: string): TranslationEntry | IndexedTranslation | undefined {
    const cacheKey = `${keyPath}:${language || 'all'}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const entry = this.flatIndex.get(keyPath);
    if (!entry) {
      return undefined;
    }

    const result = language ? entry[language] : entry;
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Set a translation value
   */
  set(keyPath: string, language: string, value: any, metadata?: Partial<TranslationEntry>): void {
    if (!PathParser.isValid(keyPath)) {
      throw new IndexError(`Invalid key path: ${keyPath}`);
    }

    let entry = this.flatIndex.get(keyPath);
    if (!entry) {
      entry = {} as IndexedTranslation;
      this.flatIndex.set(keyPath, entry);
      this.keysDirty = true;
    }

    const translationEntry: TranslationEntry = {
      value,
      file: metadata?.file || '',
      line: metadata?.line || 0,
      column: metadata?.column || 0,
      lastModified: Date.now()
    };

    entry[language] = translationEntry;

    // Update reverse index for value searches
    this.updateReverseIndex(keyPath, value);

    // Update structure template if this is the base language
    if (language === this.config.baseLanguage) {
      this.updateStructureTemplate(keyPath, value);
    }

    // Clear cache for affected entries
    this.invalidateCache(keyPath);

    this.emit('set', { keyPath, language, value, metadata: translationEntry });
  }

  /**
   * Delete a translation
   */
  delete(keyPath: string, language?: string): boolean {
    const entry = this.flatIndex.get(keyPath);
    if (!entry) {
      return false;
    }

    if (language) {
      // Delete specific language
      if (entry[language]) {
        delete entry[language];
        
        // If no languages left, remove the entire entry
        if (Object.keys(entry).length === 0) {
          this.flatIndex.delete(keyPath);
          this.keysDirty = true;
        }
        
        this.invalidateCache(keyPath);
        this.emit('delete', { keyPath, language });
        return true;
      }
    } else {
      // Delete all languages for this key
      this.flatIndex.delete(keyPath);
      this.keysDirty = true;
      this.invalidateCache(keyPath);
      this.emit('delete', { keyPath });
      return true;
    }

    return false;
  }

  /**
   * Search translations with advanced options
   */
  async search(query: string, options: SearchOptions = { scope: 'both' }): Promise<SearchResult[]> {
    this.ensureSortedKeys();
    return TranslationSearchEngine.search(this.flatIndex, this.sortedKeys, query, options);
  }

  /**
   * Get translation context with hierarchical information
   */
  async getContext(keyPath: string, options: ContextOptions): Promise<ContextResult | null> {
    this.ensureSortedKeys();
    return TranslationContextEngine.getContext(this.flatIndex, this.sortedKeys, keyPath, options);
  }

  /**
   * Get all available languages
   */
  getLanguages(): string[] {
    const languages = new Set<string>();
    
    for (const entry of this.flatIndex.values()) {
      for (const lang of Object.keys(entry)) {
        languages.add(lang);
      }
    }
    
    return Array.from(languages).sort();
  }

  /**
   * Get all translation keys
   */
  getKeys(): string[] {
    this.ensureSortedKeys();
    return [...this.sortedKeys];
  }

  /**
   * Get statistics about the index
   */
  getStats(): {
    totalKeys: number;
    totalTranslations: number;
    languages: string[];
    cacheSize: number;
    memoryUsage: string;
  } {
    let totalTranslations = 0;
    
    for (const entry of this.flatIndex.values()) {
      totalTranslations += Object.keys(entry).length;
    }

    return {
      totalKeys: this.flatIndex.size,
      totalTranslations,
      languages: this.getLanguages(),
      cacheSize: this.cache.size,
      memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.flatIndex.clear();
    this.reverseIndex.clear();
    this.structureTemplate.clear();
    this.cache.clear();
    this.sortedKeys = [];
    this.keysDirty = false;
    
    this.emit('clear');
  }

  // Private helper methods

  private ensureSortedKeys(): void {
    if (this.keysDirty) {
      this.sortedKeys = Array.from(this.flatIndex.keys()).sort();
      this.keysDirty = false;
    }
  }

  private updateReverseIndex(keyPath: string, value: any): void {
    const valueStr = String(value).toLowerCase();
    
    if (!this.reverseIndex.has(valueStr)) {
      this.reverseIndex.set(valueStr, new Set());
    }
    
    this.reverseIndex.get(valueStr)!.add(keyPath);
  }

  private updateStructureTemplate(keyPath: string, value: any): void {
    // This is a simplified structure template - could be enhanced
    this.structureTemplate.set(keyPath, typeof value);
  }

  private invalidateCache(keyPath: string): void {
    // Clear cache entries related to this key path
    const keysToDelete: string[] = [];

    for (const [cacheKey] of this.cache.internalCache) {
      if (String(cacheKey).startsWith(keyPath + ':') || String(cacheKey) === keyPath + ':all') {
        keysToDelete.push(String(cacheKey));
      }
    }

    for (const key of keysToDelete) {
      this.cache.internalCache.delete(key);
    }
  }



  /**
   * Batch operations for atomic updates
   */
  async batchUpdate(operations: BatchOperation[]): Promise<{ success: boolean; errors: string[] }> {
    const result = await TranslationBatchOperations.batchUpdate(
      this.flatIndex,
      operations,
      (event, data) => this.emit(event, data),
      () => {
        this.keysDirty = true;
        this.cache.clear();
      },
      (keyPath, language, value) => this.set(keyPath, language, value),
      (keyPath, language) => this.delete(keyPath, language)
    );

    if (result.success) {
      this.keysDirty = true;
    }

    return result;
  }

  /**
   * Validate structure consistency across languages
   */
  async validateStructure(options: { baseLanguage?: string; autoFix?: boolean } = {}): Promise<ValidationResult> {
    const baseLanguage = options.baseLanguage || this.config.baseLanguage;
    const autoFix = options.autoFix || false;

    return TranslationBatchOperations.validateStructure(
      this.flatIndex,
      () => this.getKeys(),
      baseLanguage,
      autoFix,
      (operations) => this.batchUpdate(operations)
    );
  }

  /**
   * Analyze usage patterns and find optimization opportunities
   */
  async analyzeUsage(options: { codebasePath?: string; checkDuplicates?: boolean } = {}): Promise<UsageAnalysis> {
    const checkDuplicates = options.checkDuplicates !== false;
    return TranslationBatchOperations.analyzeUsage(this.flatIndex, () => this.getKeys(), checkDuplicates);
  }

  /**
   * Optimized prefix search using binary search
   */
  searchByPrefix(prefix: string): string[] {
    this.ensureSortedKeys();
    return TranslationSearchEngine.searchByPrefix(this.sortedKeys, prefix);
  }

  /**
   * Get all translations for a key across all languages
   */
  getTranslations(keyPath: string): IndexedTranslation | null {
    return this.flatIndex.get(keyPath) || null;
  }

  /**
   * Search for translation keys by their values
   */
  searchByValue(value: string, language?: string): SearchResult[] {
    const normalizedValue = value.toLowerCase();
    const results: SearchResult[] = [];
    const targetLanguage = language || this.config.baseLanguage;

    for (const [keyPath, entry] of this.flatIndex.entries()) {
      for (const [lang, translationEntry] of Object.entries(entry)) {
        if (language && lang !== language) continue;
        
        if (translationEntry && typeof translationEntry === 'object' && 'value' in translationEntry) {
          const entryValue = String(translationEntry.value).toLowerCase();
          if (entryValue === normalizedValue) {
            results.push({
              keyPath,
              matchType: 'value',
              score: 1.0,
              translations: entry
            });
            break; // Only add each key once
          }
        }
      }
    }

    return results;
  }
}
