/**
 * Tests for the smart delete translation tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { SmartTranslationDeleter } from '../../src/tools/delete-translations.js';
import { TranslationIndex } from '../../src/core/translation-index.js';
import { ServerConfig } from '../../src/types/translation.js';

describe('SmartTranslationDeleter', () => {
  const tempDir = join(process.cwd(), 'test', 'temp-delete');
  let index: TranslationIndex;
  let deleter: SmartTranslationDeleter;
  
  const config: Required<ServerConfig> = {
    name: 'test-server',
    version: '1.0.0',
    translationDir: tempDir,
    baseLanguage: 'en',
    debug: false,
    watchOptions: {
      debounceMs: 100,
      ignored: []
    },
    srcDir: '',
    exclude: [],
    autoSync: false,
    generateTypes: '',
    watchCode: false,
    projectRoot: '',
    frameworks: [],
    keyStyle: 'nested'
  };

  beforeEach(async () => {
    // Create temp directory for test files
    await fs.mkdir(tempDir, { recursive: true });
    
    // Initialize index
    index = new TranslationIndex({ baseLanguage: 'en' });
    deleter = new SmartTranslationDeleter(index, config);

    // Add some test translations
    index.set('common.buttons.save', 'en', 'Save');
    index.set('common.buttons.save', 'es', 'Guardar');
    index.set('common.buttons.save', 'fr', 'Sauvegarder');
    
    index.set('common.buttons.cancel', 'en', 'Cancel');
    index.set('common.buttons.cancel', 'es', 'Cancelar');
    
    index.set('common.messages.success', 'en', 'Success');
    index.set('common.messages.success', 'es', 'Éxito');
    
    index.set('auth.login.title', 'en', 'Sign In');
    index.set('auth.login.title', 'es', 'Iniciar Sesión');

    // Create corresponding files
    const enData = {
      common: {
        buttons: {
          save: 'Save',
          cancel: 'Cancel'
        },
        messages: {
          success: 'Success'
        }
      },
      auth: {
        login: {
          title: 'Sign In'
        }
      }
    };

    const esData = {
      common: {
        buttons: {
          save: 'Guardar',
          cancel: 'Cancelar'
        },
        messages: {
          success: 'Éxito'
        }
      },
      auth: {
        login: {
          title: 'Iniciar Sesión'
        }
      }
    };

    const frData = {
      common: {
        buttons: {
          save: 'Sauvegarder'
        }
      }
    };

    await fs.writeFile(join(tempDir, 'en.json'), JSON.stringify(enData, null, 2));
    await fs.writeFile(join(tempDir, 'es.json'), JSON.stringify(esData, null, 2));
    await fs.writeFile(join(tempDir, 'fr.json'), JSON.stringify(frData, null, 2));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('processSingleDeletion', () => {
    it('should delete a key from all languages', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save' },
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(true);
      expect(result.keyPath).toBe('common.buttons.save');
      expect(result.deletedLanguages).toEqual(['en', 'es', 'fr']);
      expect(result.remainingLanguages).toEqual([]);
      expect(result.completelyRemoved).toBe(true);
      
      // Verify key is removed from index
      expect(index.has('common.buttons.save')).toBe(false);
    });

    it('should delete a key from specific languages only', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save', languages: ['fr'] },
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(true);
      expect(result.keyPath).toBe('common.buttons.save');
      expect(result.deletedLanguages).toEqual(['fr']);
      expect(result.remainingLanguages).toEqual(['en', 'es']);
      expect(result.completelyRemoved).toBe(false);
      
      // Verify key still exists in other languages
      expect(index.has('common.buttons.save')).toBe(true);
      expect(index.get('common.buttons.save', 'en')).toBeDefined();
      expect(index.get('common.buttons.save', 'es')).toBeDefined();
      expect(index.get('common.buttons.save', 'fr')).toBeUndefined();
    });

    it('should handle non-existent keys gracefully', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'nonexistent.key' },
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(false);
      expect(result.skipReason).toBe('Translation key does not exist');
    });

    it('should detect child key dependencies', async () => {
      // First add a parent key that has children
      index.set('common', 'en', 'Common translations');
      index.set('common', 'es', 'Traducciones comunes');

      const result = await deleter.processSingleDeletion(
        { keyPath: 'common' },
        { dryRun: false, checkDependencies: true, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('child key');
      expect(result.skipReason).toContain('warnings');
    });

    it('should allow forced deletion despite warnings', async () => {
      // First add a parent key that has children
      index.set('common', 'en', 'Common translations');
      index.set('common', 'es', 'Traducciones comunes');

      const result = await deleter.processSingleDeletion(
        { keyPath: 'common' },
        { dryRun: false, checkDependencies: true, writeToFiles: false, force: true }
      );

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.deletedLanguages.length).toBeGreaterThan(0);
    });

    it('should perform dry run without actual deletion', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save' },
        { dryRun: true, checkDependencies: false, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.deletedLanguages).toEqual(['en', 'es', 'fr']);
      
      // Verify key still exists in index (not actually deleted)
      expect(index.has('common.buttons.save')).toBe(true);
    });

    it('should warn about base language deletion', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save', languages: ['en'] },
        { dryRun: false, checkDependencies: true, writeToFiles: false, force: false }
      );

      expect(result.success).toBe(false);
      expect(result.warnings.some(w => w.includes('base language'))).toBe(true);
      expect(result.skipReason).toContain('warnings');
    });

    it('should write changes to files when requested', async () => {
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save' },
        { dryRun: false, checkDependencies: false, writeToFiles: true, force: false }
      );

      expect(result.success).toBe(true);
      expect(result.fileWriteResults).toBeDefined();
      expect(result.fileWriteResults!['en'].success).toBe(true);
      expect(result.fileWriteResults!['es'].success).toBe(true);
      expect(result.fileWriteResults!['fr'].success).toBe(true);

      // Verify files are updated
      const enContent = await fs.readFile(join(tempDir, 'en.json'), 'utf-8');
      const enData = JSON.parse(enContent);
      expect(enData.common.buttons.save).toBeUndefined();
      expect(enData.common.buttons.cancel).toBe('Cancel'); // Should still exist
    });

    it('should clean up empty parent objects', async () => {
      // Delete all buttons to make the buttons object empty
      await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.save' },
        { dryRun: false, checkDependencies: false, writeToFiles: true, force: false }
      );
      
      await deleter.processSingleDeletion(
        { keyPath: 'common.buttons.cancel' },
        { dryRun: false, checkDependencies: false, writeToFiles: true, force: false }
      );

      // Verify empty buttons object is removed from files
      const enContent = await fs.readFile(join(tempDir, 'en.json'), 'utf-8');
      const enData = JSON.parse(enContent);
      expect(enData.common.buttons).toBeUndefined();
      expect(enData.common.messages).toBeDefined(); // Should still exist
    });
  });

  describe('handleBulkDeletions', () => {
    it('should handle bulk deletions successfully', async () => {
      const deletions = [
        { keyPath: 'common.buttons.save' },
        { keyPath: 'common.buttons.cancel' }
      ];

      const response = await deleter.handleBulkDeletions(
        deletions,
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false, skipOnError: true, batchSize: 10 }
      );

      const result = JSON.parse(response.content[0].text);
      
      expect(result.summary.success).toBe(true);
      expect(result.summary.total).toBe(2);
      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(0);
      expect(result.results.length).toBe(2);
    });

    it('should handle errors gracefully with skipOnError', async () => {
      const deletions = [
        { keyPath: 'common.buttons.save' },
        { keyPath: 'nonexistent.key' },
        { keyPath: 'common.messages.success' }
      ];

      const response = await deleter.handleBulkDeletions(
        deletions,
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false, skipOnError: true, batchSize: 10 }
      );

      const result = JSON.parse(response.content[0].text);
      
      expect(result.summary.success).toBe(true); // Should succeed with skipOnError
      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBe(2);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.failed).toBe(0);
    });

    it('should process deletions in batches', async () => {
      const deletions = [
        { keyPath: 'common.buttons.save' },
        { keyPath: 'common.buttons.cancel' },
        { keyPath: 'common.messages.success' }
      ];

      const response = await deleter.handleBulkDeletions(
        deletions,
        { dryRun: false, checkDependencies: false, writeToFiles: false, force: false, skipOnError: true, batchSize: 2 }
      );

      const result = JSON.parse(response.content[0].text);
      
      expect(result.summary.performance.batchSize).toBe(2);
      expect(result.summary.performance.totalBatches).toBe(2); // 3 items / 2 batch size = 2 batches
    });
  });

  describe('dependency analysis', () => {
    it('should correctly identify child keys', async () => {
      // First add a parent key that has children
      index.set('common', 'en', 'Common translations');
      index.set('common', 'es', 'Traducciones comunes');

      // Test with a parent key that has children
      const result = await deleter.processSingleDeletion(
        { keyPath: 'common' },
        { dryRun: true, checkDependencies: true, writeToFiles: false, force: false }
      );

      expect(result.warnings.some(w => w.includes('child key'))).toBe(true);
    });

    it('should correctly identify parent keys', async () => {
      // First add the parent key
      index.set('auth.login', 'en', 'Login section');
      index.set('auth.login', 'es', 'Sección de inicio');

      // Test with a nested key
      const result = await deleter.processSingleDeletion(
        { keyPath: 'auth.login.title' },
        { dryRun: true, checkDependencies: true, writeToFiles: false, force: true }
      );

      expect(result.warnings.some(w => w.includes('nested structure'))).toBe(true);
    });
  });
});
