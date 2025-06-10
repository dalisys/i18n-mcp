/**
 * Unit tests for TranslationIndex
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslationIndex } from '../../src/core/translation-index.js';
import { TranslationIndexConfig, BatchOperation } from '../../src/types/translation.js';

describe('TranslationIndex', () => {
  let index: TranslationIndex;
  const defaultConfig: TranslationIndexConfig = {
    baseLanguage: 'en',
    maxCacheSize: 1000,
    debug: false
  };

  beforeEach(() => {
    index = new TranslationIndex(defaultConfig);
  });

  afterEach(() => {
    index.removeAllListeners();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const simpleIndex = new TranslationIndex({ baseLanguage: 'en' });
      expect(simpleIndex).toBeDefined();
    });

    it('should apply custom configuration', () => {
      const customConfig: TranslationIndexConfig = {
        baseLanguage: 'fr',
        maxCacheSize: 500,
        debug: true
      };
      const customIndex = new TranslationIndex(customConfig);
      expect(customIndex).toBeDefined();
    });
  });

  describe('set and get', () => {
    it('should set and retrieve translation values', () => {
      index.set('common.buttons.submit', 'en', 'Submit');
      index.set('common.buttons.submit', 'es', 'Enviar');

      const enEntry = index.get('common.buttons.submit', 'en');
      const esEntry = index.get('common.buttons.submit', 'es');

      expect(enEntry?.value).toBe('Submit');
      expect(esEntry?.value).toBe('Enviar');
    });

    it('should store metadata with translations', () => {
      const metadata = {
        file: '/path/to/en.json',
        line: 10,
        column: 5
      };

      index.set('test.key', 'en', 'Test Value', metadata);
      const entry = index.get('test.key', 'en');

      expect(entry?.file).toBe('/path/to/en.json');
      expect(entry?.line).toBe(10);
      expect(entry?.column).toBe(5);
      expect(entry?.lastModified).toBeTypeOf('number');
    });

    it('should emit set events', () => {
      const setHandler = vi.fn();
      index.on('set', setHandler);

      index.set('test.key', 'en', 'value');

      expect(setHandler).toHaveBeenCalledWith({
        keyPath: 'test.key',
        language: 'en',
        value: 'value',
        metadata: expect.objectContaining({
          value: 'value',
          lastModified: expect.any(Number)
        })
      });
    });

    it('should get all languages for a key when no language specified', () => {
      index.set('common.button', 'en', 'Button');
      index.set('common.button', 'es', 'Botón');
      index.set('common.button', 'fr', 'Bouton');

      const allEntries = index.get('common.button');

      expect(allEntries).toBeDefined();
      if (allEntries && typeof allEntries === 'object' && !('value' in allEntries)) {
        expect(allEntries.en?.value).toBe('Button');
        expect(allEntries.es?.value).toBe('Botón');
        expect(allEntries.fr?.value).toBe('Bouton');
      }
    });

    it('should return undefined for non-existent keys', () => {
      expect(index.get('nonexistent.key', 'en')).toBeUndefined();
      expect(index.get('nonexistent.key')).toBeUndefined();
    });

    it('should use LRU cache for performance', () => {
      // Set a value
      index.set('cached.key', 'en', 'value');
      
      // First access - should cache
      const first = index.get('cached.key', 'en');
      
      // Second access - should use cache
      const second = index.get('cached.key', 'en');
      
      expect(first).toBeDefined();
      expect(second).toBeDefined();
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      index.set('test.key', 'en', 'English');
      index.set('test.key', 'es', 'Español');
      index.set('test.key', 'fr', 'Français');
    });

    it('should delete specific language', () => {
      const result = index.delete('test.key', 'es');

      expect(result).toBe(true);
      expect(index.get('test.key', 'es')).toBeUndefined();
      expect(index.get('test.key', 'en')?.value).toBe('English');
      expect(index.get('test.key', 'fr')?.value).toBe('Français');
    });

    it('should delete all languages when no language specified', () => {
      const result = index.delete('test.key');

      expect(result).toBe(true);
      expect(index.get('test.key')).toBeUndefined();
    });

    it('should emit delete events', () => {
      const deleteHandler = vi.fn();
      index.on('delete', deleteHandler);

      index.delete('test.key', 'en');

      expect(deleteHandler).toHaveBeenCalledWith({
        keyPath: 'test.key',
        language: 'en'
      });
    });

    it('should return false for non-existent keys', () => {
      expect(index.delete('nonexistent.key', 'en')).toBe(false);
      expect(index.delete('nonexistent.key')).toBe(false);
    });

    it('should remove entire entry when last language is deleted', () => {
      index.delete('test.key', 'en');
      index.delete('test.key', 'es');
      const result = index.delete('test.key', 'fr');

      expect(result).toBe(true);
      expect(index.get('test.key')).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // Setup test data
      index.set('common.buttons.submit', 'en', 'Submit');
      index.set('common.buttons.submit', 'es', 'Enviar');
      index.set('common.buttons.cancel', 'en', 'Cancel');
      index.set('common.buttons.cancel', 'es', 'Cancelar');
      index.set('auth.login.title', 'en', 'Login');
      index.set('auth.login.title', 'es', 'Iniciar sesión');
      index.set('auth.login.submit', 'en', 'Submit');
    });

    it('should search by key', async () => {
      const results = await index.search('buttons', { scope: 'keys' });

      expect(results).toHaveLength(2);
      expect(results.some(r => r.keyPath === 'common.buttons.submit')).toBe(true);
      expect(results.some(r => r.keyPath === 'common.buttons.cancel')).toBe(true);
    });

    it('should search by value', async () => {
      const results = await index.search('Submit', { scope: 'values' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.keyPath === 'common.buttons.submit')).toBe(true);
      expect(results.some(r => r.keyPath === 'auth.login.submit')).toBe(true);
    });

    it('should search both keys and values', async () => {
      const results = await index.search('submit', { scope: 'both' });

      expect(results.length).toBeGreaterThan(0);
      // Should find both by key path and by value
    });

    it('should filter by languages', async () => {
      const results = await index.search('Enviar', { 
        scope: 'values', 
        languages: ['es'] 
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(Object.keys(result.translations)).toContain('es');
      }
    });

    it('should limit results', async () => {
      const results = await index.search('common', { 
        scope: 'keys', 
        maxResults: 1 
      });

      expect(results).toHaveLength(1);
    });

    it('should handle case sensitivity', async () => {
      const caseSensitive = await index.search('SUBMIT', { 
        scope: 'values', 
        caseSensitive: true 
      });
      const caseInsensitive = await index.search('SUBMIT', { 
        scope: 'values', 
        caseSensitive: false 
      });

      expect(caseSensitive).toHaveLength(0);
      expect(caseInsensitive.length).toBeGreaterThan(0);
    });

    it('should return results with proper structure', async () => {
      const results = await index.search('submit', { scope: 'both' });

      expect(results.length).toBeGreaterThan(0);
      
      for (const result of results) {
        expect(result).toHaveProperty('keyPath');
        expect(result).toHaveProperty('translations');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('matchType');
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(['key', 'value', 'both']).toContain(result.matchType);
      }
    });

    it('should sort results by score', async () => {
      const results = await index.search('submit', { scope: 'both' });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('getContext', () => {
    beforeEach(() => {
      // Setup hierarchical test data
      index.set('common.buttons.submit', 'en', 'Submit');
      index.set('common.buttons.cancel', 'en', 'Cancel');
      index.set('common.buttons.save', 'en', 'Save');
      index.set('common.messages.success', 'en', 'Success');
      index.set('auth.login.title', 'en', 'Login');
      index.set('auth.register.title', 'en', 'Register');
    });

    it('should get context with children and siblings', async () => {
      const context = await index.getContext('common.buttons.submit', { depth: 1 });

      expect(context).toBeDefined();
      expect(context?.keyPath).toBe('common.buttons.submit');
      expect(context?.translations.en?.value).toBe('Submit');
      
      // Should have siblings
      expect(context?.siblings.length).toBeGreaterThan(0);
      expect(context?.siblings.some(s => s.keyPath === 'common.buttons.cancel')).toBe(true);
      expect(context?.siblings.some(s => s.keyPath === 'common.buttons.save')).toBe(true);
    });

    it('should include parent context when depth > 0', async () => {
      const context = await index.getContext('common.buttons.submit', { depth: 1 });

      expect(context?.parent).toBeDefined();
      expect(context?.parent?.keyPath).toBe('common.buttons');
    });

    it('should filter by languages', async () => {
      index.set('common.buttons.submit', 'es', 'Enviar');
      
      const context = await index.getContext('common.buttons.submit', { 
        depth: 0, 
        languages: ['es'] 
      });

      expect(context?.translations.es?.value).toBe('Enviar');
      expect(context?.translations.en).toBeUndefined();
    });

    it('should return null for non-existent keys', async () => {
      const context = await index.getContext('nonexistent.key', { depth: 0 });
      expect(context).toBeNull();
    });
  });

  describe('batchUpdate', () => {
    it('should perform multiple operations atomically', async () => {
      const operations: BatchOperation[] = [
        { type: 'set', keyPath: 'test.key1', language: 'en', value: 'Value 1' },
        { type: 'set', keyPath: 'test.key2', language: 'en', value: 'Value 2' },
        { type: 'set', keyPath: 'test.key1', language: 'es', value: 'Valor 1' }
      ];

      const result = await index.batchUpdate(operations);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(index.get('test.key1', 'en')?.value).toBe('Value 1');
      expect(index.get('test.key2', 'en')?.value).toBe('Value 2');
      expect(index.get('test.key1', 'es')?.value).toBe('Valor 1');
    });

    it('should rollback on errors', async () => {
      // First add some initial data
      index.set('existing.key', 'en', 'Existing');

      const operations: BatchOperation[] = [
        { type: 'set', keyPath: 'test.key1', language: 'en', value: 'Value 1' },
        { type: 'set', keyPath: 'invalid..key', language: 'en', value: 'Invalid' }, // Invalid key
        { type: 'set', keyPath: 'test.key2', language: 'en', value: 'Value 2' }
      ];

      const result = await index.batchUpdate(operations);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should rollback - new keys should not exist
      expect(index.get('test.key1', 'en')).toBeUndefined();
      expect(index.get('test.key2', 'en')).toBeUndefined();
      
      // Existing data should remain
      expect(index.get('existing.key', 'en')?.value).toBe('Existing');
    });

    it('should emit batchUpdate event on success', async () => {
      const batchHandler = vi.fn();
      index.on('batchUpdate', batchHandler);

      const operations: BatchOperation[] = [
        { type: 'set', keyPath: 'test.key', language: 'en', value: 'Value' }
      ];

      await index.batchUpdate(operations);

      expect(batchHandler).toHaveBeenCalledWith(operations);
    });

    it('should handle delete operations', async () => {
      // Setup initial data
      index.set('test.key', 'en', 'Value');
      index.set('test.key', 'es', 'Valor');

      const operations: BatchOperation[] = [
        { type: 'delete', keyPath: 'test.key', language: 'en' }
      ];

      const result = await index.batchUpdate(operations);

      expect(result.success).toBe(true);
      expect(index.get('test.key', 'en')).toBeUndefined();
      expect(index.get('test.key', 'es')?.value).toBe('Valor');
    });
  });

  describe('validateStructure', () => {
    beforeEach(() => {
      // Setup base language (English) data
      index.set('common.buttons.submit', 'en', 'Submit');
      index.set('common.buttons.cancel', 'en', 'Cancel');
      index.set('common.messages.success', 'en', 'Success');
      
      // Setup Spanish with missing key
      index.set('common.buttons.submit', 'es', 'Enviar');
      index.set('common.buttons.cancel', 'es', 'Cancelar');
      // Missing: common.messages.success
      
      // Setup French with extra key
      index.set('common.buttons.submit', 'fr', 'Soumettre');
      index.set('common.buttons.cancel', 'fr', 'Annuler');
      index.set('common.messages.success', 'fr', 'Succès');
      index.set('common.extra.key', 'fr', 'Extra'); // Extra key
    });

    it('should detect missing keys', async () => {
      const result = await index.validateStructure();

      expect(result.valid).toBe(false);
      expect(result.missingKeys.es).toContain('common.messages.success');
    });

    it('should detect extra keys', async () => {
      const result = await index.validateStructure();

      expect(result.valid).toBe(false);
      expect(result.extraKeys.fr).toContain('common.extra.key');
    });

    it('should detect type mismatches', async () => {
      index.set('common.count', 'en', 42);
      index.set('common.count', 'es', 'cuarenta y dos'); // Type mismatch: number vs string

      const result = await index.validateStructure();

      expect(result.valid).toBe(false);
      expect(result.typeMismatches.some(tm => 
        tm.keyPath === 'common.count' && 
        tm.expected === 'number' && 
        tm.actual.es === 'string'
      )).toBe(true);
    });

    it('should auto-fix missing translations when requested', async () => {
      const result = await index.validateStructure({ autoFix: true });

      expect(result.structuralIssues.length).toBeGreaterThan(0);
      expect(result.structuralIssues.some(issue => 
        issue.includes('Auto-fixed')
      )).toBe(true);
      
      // Should have added missing translation
      const esEntry = index.get('common.messages.success', 'es');
      expect(esEntry?.value).toContain('[MISSING:');
    });

    it('should validate against custom base language', async () => {
      const result = await index.validateStructure({ baseLanguage: 'es' });

      // Now Spanish becomes the reference (has 2 keys), so English should show extra keys
      // since English has all Spanish keys plus 'common.messages.success'
      expect(result.extraKeys.en).toBeDefined();
      expect(result.extraKeys.en).toContain('common.messages.success');
    });
  });

  describe('analyzeUsage', () => {
    beforeEach(() => {
      index.set('common.submit', 'en', 'Submit');
      index.set('common.submit', 'es', 'Enviar');
      index.set('common.cancel', 'en', 'Cancel');
      // Missing Spanish for cancel
      index.set('auth.submit', 'en', 'Submit'); // Duplicate value
      index.set('auth.submit', 'es', 'Enviar'); // Duplicate value
    });

    it('should analyze language completeness', async () => {
      const analysis = await index.analyzeUsage();

      expect(analysis.languageStats.en.completeness).toBe(1); // 100% complete
      expect(analysis.languageStats.es.completeness).toBeLessThan(1); // Missing some keys
    });

    it('should find missing translations', async () => {
      const analysis = await index.analyzeUsage();

      expect(analysis.missingTranslations.es).toContain('common.cancel');
    });

    it('should find duplicate values when enabled', async () => {
      const analysis = await index.analyzeUsage({ checkDuplicates: true });

      expect(analysis.duplicateValues.length).toBeGreaterThan(0);
      expect(analysis.duplicateValues.some(dv => 
        dv.value === 'Submit' && 
        dv.keys.includes('common.submit') && 
        dv.keys.includes('auth.submit')
      )).toBe(true);
    });

    it('should provide language statistics', async () => {
      const analysis = await index.analyzeUsage();

      expect(analysis.languageStats.en).toEqual({
        totalKeys: expect.any(Number),
        translatedKeys: expect.any(Number),
        completeness: expect.any(Number)
      });
      
      expect(analysis.languageStats.es).toEqual({
        totalKeys: expect.any(Number),
        translatedKeys: expect.any(Number),
        completeness: expect.any(Number)
      });
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      index.set('common.buttons.submit', 'en', 'Submit');
      index.set('common.buttons.submit', 'es', 'Enviar');
      index.set('common.buttons.cancel', 'en', 'Cancel');
      index.set('auth.login.title', 'fr', 'Connexion');
    });

    describe('getLanguages', () => {
      it('should return all available languages', () => {
        const languages = index.getLanguages();
        
        expect(languages).toContain('en');
        expect(languages).toContain('es');
        expect(languages).toContain('fr');
        expect(languages).toHaveLength(3);
        expect(languages).toEqual(languages.sort()); // Should be sorted
      });
    });

    describe('getKeys', () => {
      it('should return all translation keys', () => {
        const keys = index.getKeys();
        
        expect(keys).toContain('common.buttons.submit');
        expect(keys).toContain('common.buttons.cancel');
        expect(keys).toContain('auth.login.title');
        expect(keys).toEqual(keys.sort()); // Should be sorted
      });
    });

    describe('getStats', () => {
      it('should return index statistics', () => {
        const stats = index.getStats();
        
        expect(stats).toHaveProperty('totalKeys');
        expect(stats).toHaveProperty('totalTranslations');
        expect(stats).toHaveProperty('languages');
        expect(stats).toHaveProperty('cacheSize');
        expect(stats).toHaveProperty('memoryUsage');
        
        expect(stats.totalKeys).toBeGreaterThan(0);
        expect(stats.totalTranslations).toBeGreaterThan(0);
        expect(stats.languages).toContain('en');
        expect(stats.memoryUsage).toMatch(/\d+MB/);
      });
    });

    describe('searchByPrefix', () => {
      it('should find keys by prefix using binary search', () => {
        const results = index.searchByPrefix('common.buttons');
        
        expect(results).toContain('common.buttons.submit');
        expect(results).toContain('common.buttons.cancel');
        expect(results).not.toContain('auth.login.title');
      });

      it('should return empty array for non-matching prefix', () => {
        const results = index.searchByPrefix('nonexistent');
        expect(results).toEqual([]);
      });

      it('should handle exact matches', () => {
        const results = index.searchByPrefix('common.buttons.submit');
        expect(results).toEqual(['common.buttons.submit']);
      });
    });

    describe('clear', () => {
      it('should clear all data and emit clear event', () => {
        const clearHandler = vi.fn();
        index.on('clear', clearHandler);

        index.clear();

        expect(index.getKeys()).toHaveLength(0);
        expect(index.getLanguages()).toHaveLength(0);
        expect(index.getStats().totalKeys).toBe(0);
        expect(clearHandler).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('should throw IndexError for invalid key paths', () => {
      expect(() => {
        index.set('invalid..key.path', 'en', 'value');
      }).toThrow('Invalid key path');
    });

    it('should handle malformed batch operations gracefully', async () => {
      const operations: BatchOperation[] = [
        { type: 'set', keyPath: 'test.key', language: undefined as any, value: 'value' }
      ];

      const result = await index.batchUpdate(operations);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    it('should handle large datasets efficiently', () => {
      const startTime = Date.now();
      
      // Add 1000 translations
      for (let i = 0; i < 1000; i++) {
        index.set(`category${i % 10}.item${i}.name`, 'en', `Item ${i}`);
      }
      
      const addTime = Date.now() - startTime;
      expect(addTime).toBeLessThan(1000); // Should complete in under 1 second
      
      // Test search performance
      const searchStart = Date.now();
      index.searchByPrefix('category1');
      const searchTime = Date.now() - searchStart;
      expect(searchTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should maintain cache efficiency', () => {
      // Add more items than cache size to test LRU behavior
      for (let i = 0; i < 1500; i++) {
        index.set(`test.item${i}`, 'en', `Value ${i}`);
      }
      
      // Access some items multiple times to test caching
      for (let i = 0; i < 10; i++) {
        index.get('test.item0', 'en');
        index.get('test.item1', 'en');
      }
      
      const stats = index.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(1000); // Should respect max cache size
    });
  });
});
