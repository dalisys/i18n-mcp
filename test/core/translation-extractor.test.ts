/**
 * Tests for TranslationExtractor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranslationExtractor, ExtractionUtils } from '../../src/core/translation-extractor.js';

describe('TranslationExtractor', () => {
  let extractor: TranslationExtractor;

  beforeEach(() => {
    extractor = new TranslationExtractor('react');
  });

  describe('constructor', () => {
    it('should initialize with framework', () => {
      const reactExtractor = new TranslationExtractor('react');
      expect(reactExtractor).toBeDefined();
    });

    it('should work without framework', () => {
      const genericExtractor = new TranslationExtractor();
      expect(genericExtractor).toBeDefined();
    });
  });

  describe('replaceInContent', () => {
    it('should replace React JSX hardcoded strings', () => {
      const content = `
        export function Button() {
          return (
            <button title="Click to submit">Submit Form</button>
          );
        }
      `;

      const result = extractor.replaceInContent(content, 'Click to submit', 'common.submit_tooltip');

      expect(result).toContain("{t('common.submit_tooltip')}");
      expect(result).not.toContain('"Click to submit"');
    });

    it('should replace React JSX text content', () => {
      const content = `
        export function Welcome() {
          return <h1>Welcome to our app</h1>;
        }
      `;

      const result = extractor.replaceInContent(content, 'Welcome to our app', 'common.welcome');

      expect(result).toContain("{t('common.welcome')}");
      expect(result).not.toContain('Welcome to our app');
    });

    it('should add React import if not present', () => {
      const content = `
        export function Button() {
          return <button>Submit</button>;
        }
      `;

      const result = extractor.replaceInContent(content, 'Submit', 'common.submit');

      expect(result).toContain("import { useTranslation } from 'react-i18next';");
      expect(result).toContain("{t('common.submit')}");
    });

    it('should not add import if already present', () => {
      const content = `
        import { useTranslation } from 'react-i18next';
        
        export function Button() {
          return <button>Submit</button>;
        }
      `;

      const result = extractor.replaceInContent(content, 'Submit', 'common.submit');

      // Should only have one import statement
      const importMatches = result.match(/import.*useTranslation/g);
      expect(importMatches).toHaveLength(1);
    });
  });

  describe('Vue framework', () => {
    beforeEach(() => {
      extractor = new TranslationExtractor('vue');
    });

    it('should replace Vue template strings', () => {
      const content = `
        <template>
          <button title="Click here">Submit</button>
        </template>
      `;

      const result = extractor.replaceInContent(content, 'Click here', 'common.click_tooltip');

      expect(result).toContain('{{ $t(\'common.click_tooltip\') }}');
      expect(result).not.toContain('"Click here"');
    });

    it('should add Vue import', () => {
      const content = `
        <template>
          <div>Hello</div>
        </template>
      `;

      const result = extractor.replaceInContent(content, 'Hello', 'common.hello');

      expect(result).toContain("import { useI18n } from 'vue-i18n';");
    });
  });

  describe('Svelte framework', () => {
    beforeEach(() => {
      extractor = new TranslationExtractor('svelte');
    });

    it('should replace Svelte strings', () => {
      const content = `
        <button>Submit Form</button>
      `;

      const result = extractor.replaceInContent(content, 'Submit Form', 'common.submit');

      expect(result).toContain("{$_('common.submit')}");
      expect(result).not.toContain('Submit Form');
    });
  });

  describe('Angular framework', () => {
    beforeEach(() => {
      extractor = new TranslationExtractor('angular');
    });

    it('should replace Angular template strings', () => {
      const content = `
        <button>Submit</button>
      `;

      const result = extractor.replaceInContent(content, 'Submit', 'common.submit');

      expect(result).toContain("{{ 'common.submit' | translate }}");
      expect(result).not.toContain('>Submit<');
    });
  });

  describe('getReplacementPattern', () => {
    it('should return correct pattern for React', () => {
      const pattern = extractor.getReplacementPattern('common.submit', 'react');
      expect(pattern).toBe("{t('common.submit')}");
    });

    it('should return correct pattern for Vue', () => {
      const pattern = extractor.getReplacementPattern('common.submit', 'vue');
      expect(pattern).toBe("{{ $t('common.submit') }}");
    });

    it('should return correct pattern for Svelte', () => {
      const pattern = extractor.getReplacementPattern('common.submit', 'svelte');
      expect(pattern).toBe("{$_('common.submit')}");
    });

    it('should return correct pattern for Angular', () => {
      const pattern = extractor.getReplacementPattern('common.submit', 'angular');
      expect(pattern).toBe("{{ 'common.submit' | translate }}");
    });

    it('should return generic pattern for unknown framework', () => {
      // Create a new extractor without framework for this test
      const genericExtractor = new TranslationExtractor();
      const pattern = genericExtractor.getReplacementPattern('common.submit');
      expect(pattern).toBe("t('common.submit')");
    });
  });

  describe('generateSmartKey', () => {
    it('should generate nested keys by default', () => {
      const key = extractor.generateSmartKey('Submit Form', 'components/Button.tsx', 'nested');
      expect(key).toBe('button.submit_form');
    });

    it('should generate camelCase keys', () => {
      const key = extractor.generateSmartKey('Submit Form', 'Button.tsx', 'camelCase');
      expect(key).toBe('button_submitForm');
    });

    it('should generate kebab-case keys', () => {
      const key = extractor.generateSmartKey('Submit Form', 'Button.tsx', 'kebab-case');
      expect(key).toBe('button_submit-form');
    });

    it('should generate flat keys', () => {
      const key = extractor.generateSmartKey('Submit Form', 'Button.tsx', 'flat');
      expect(key).toBe('button_submit_form');
    });

    it('should handle long text by truncating', () => {
      const longText = 'This is a very long text that should be truncated to avoid extremely long keys';
      const key = extractor.generateSmartKey(longText, 'Component.tsx', 'nested');
      expect(key.length).toBeLessThan(50);
    });

    it('should clean special characters', () => {
      const text = 'Hello, world! How are you?';
      const key = extractor.generateSmartKey(text, 'Component.tsx', 'nested');
      expect(key).toBe('component.hello_world_how_are_you');
    });

    it('should extract context from file path', () => {
      const key1 = extractor.generateSmartKey('Submit', 'src/components/auth/LoginForm.tsx', 'nested');
      const key2 = extractor.generateSmartKey('Submit', 'UserProfile.vue', 'nested');
      
      expect(key1).toBe('loginform.submit');
      expect(key2).toBe('userprofile.submit');
    });
  });

  describe('replaceTextWithTranslation', () => {
    it('should read file, replace content, and write back', async () => {
      const originalContent = `
        export function Button() {
          return <button>Submit</button>;
        }
      `;

      // Create a temporary test file
      const tempDir = await globalThis.testUtils.createTempDir();
      const testFilePath = `${tempDir}/Button.tsx`;

      // Write the test file
      await import('fs').then(fs =>
        fs.promises.writeFile(testFilePath, originalContent, 'utf-8')
      );

      const result = await extractor.replaceTextWithTranslation(
        testFilePath,
        'Submit',
        'common.submit'
      );

      expect(result).toContain("{t('common.submit')}");
      expect(result).not.toContain('>Submit<');

      // Clean up
      await globalThis.testUtils.cleanupTempDir(tempDir);
    });

    it('should handle file read errors', async () => {
      await expect(
        extractor.replaceTextWithTranslation('nonexistent.tsx', 'text', 'key')
      ).rejects.toThrow('Failed to replace text in nonexistent.tsx');
    });
  });
});

describe('ExtractionUtils', () => {
  describe('validateKeyFormat', () => {
    it('should validate nested keys', () => {
      expect(ExtractionUtils.validateKeyFormat('common.buttons.submit', 'nested')).toBe(true);
      expect(ExtractionUtils.validateKeyFormat('invalid..key', 'nested')).toBe(false);
      expect(ExtractionUtils.validateKeyFormat('Invalid.Key', 'nested')).toBe(false);
    });

    it('should validate camelCase keys', () => {
      expect(ExtractionUtils.validateKeyFormat('commonButtonsSubmit', 'camelCase')).toBe(true);
      expect(ExtractionUtils.validateKeyFormat('common.buttonsSubmit', 'camelCase')).toBe(true);
      expect(ExtractionUtils.validateKeyFormat('Common.ButtonsSubmit', 'camelCase')).toBe(false);
    });

    it('should validate kebab-case keys', () => {
      expect(ExtractionUtils.validateKeyFormat('common.buttons-submit', 'kebab-case')).toBe(true);
      expect(ExtractionUtils.validateKeyFormat('common.buttons_submit', 'kebab-case')).toBe(false);
    });

    it('should validate flat keys', () => {
      expect(ExtractionUtils.validateKeyFormat('common_buttons_submit', 'flat')).toBe(true);
      expect(ExtractionUtils.validateKeyFormat('common.buttons.submit', 'flat')).toBe(false);
    });
  });

  describe('findSimilarTranslations', () => {
    it('should find similar translations', async () => {
      const mockIndex = {
        search: vi.fn().mockResolvedValue([
          {
            keyPath: 'common.submit',
            score: 0.8,
            translations: { en: { value: 'Submit' } }
          },
          {
            keyPath: 'auth.submit',
            score: 0.75,
            translations: { en: { value: 'Submit Form' } }
          }
        ])
      };

      const results = await ExtractionUtils.findSimilarTranslations(
        'Submit',
        mockIndex,
        0.7
      );

      expect(results).toHaveLength(2);
      expect(results[0].keyPath).toBe('common.submit');
      expect(results[0].score).toBe(0.8);
    });

    it('should filter by threshold', async () => {
      const mockIndex = {
        search: vi.fn().mockResolvedValue([
          {
            keyPath: 'common.submit',
            score: 0.6,
            translations: { en: { value: 'Submit' } }
          }
        ])
      };

      const results = await ExtractionUtils.findSimilarTranslations(
        'Submit',
        mockIndex,
        0.7
      );

      expect(results).toHaveLength(0);
    });

    it('should handle search errors gracefully', async () => {
      const mockIndex = {
        search: vi.fn().mockRejectedValue(new Error('Search failed'))
      };

      const results = await ExtractionUtils.findSimilarTranslations(
        'Submit',
        mockIndex
      );

      expect(results).toEqual([]);
    });
  });
});
