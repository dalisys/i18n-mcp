/**
 * Translation extraction and replacement utilities
 */

import { promises as fs } from 'fs';
import { SupportedFramework } from '../types/translation.js';

/**
 * Framework-specific replacement patterns
 */
interface ReplacementConfig {
  /** Pattern to replace hardcoded strings */
  replacementPattern: (key: string) => string;
  /** Import statement to add if not present */
  importStatement?: string;
  /** Where to insert the import (top of file, after other imports, etc.) */
  importPosition?: 'top' | 'after-imports';
}

/**
 * Framework-specific replacement configurations
 */
const REPLACEMENT_CONFIGS: Record<SupportedFramework, ReplacementConfig> = {
  react: {
    replacementPattern: (key: string) => `{t('${key}')}`,
    importStatement: "import { useTranslation } from 'react-i18next';",
    importPosition: 'after-imports'
  },
  vue: {
    replacementPattern: (key: string) => `{{ $t('${key}') }}`,
    importStatement: "import { useI18n } from 'vue-i18n';",
    importPosition: 'after-imports'
  },
  svelte: {
    replacementPattern: (key: string) => `{$_('${key}')}`,
    importStatement: "import { _ } from 'svelte-i18n';",
    importPosition: 'after-imports'
  },
  angular: {
    replacementPattern: (key: string) => `{{ '${key}' | translate }}`,
    importStatement: "import { TranslateModule } from '@ngx-translate/core';",
    importPosition: 'after-imports'
  }
};

/**
 * Translation extractor for replacing hardcoded strings with translation calls
 */
export class TranslationExtractor {
  private framework?: SupportedFramework;

  constructor(framework?: SupportedFramework) {
    this.framework = framework;
  }

  /**
   * Replace hardcoded text with translation call in a file
   */
  async replaceTextWithTranslation(
    filePath: string,
    originalText: string,
    translationKey: string
  ): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const updatedContent = this.replaceInContent(content, originalText, translationKey);
      
      // Write back to file
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      
      return updatedContent;
    } catch (error) {
      throw new Error(`Failed to replace text in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Replace hardcoded text with translation call in content string
   */
  replaceInContent(
    content: string,
    originalText: string,
    translationKey: string
  ): string {
    if (!this.framework) {
      // Generic replacement
      return content.replace(
        new RegExp(`['"\`]${this.escapeRegex(originalText)}['"\`]`, 'g'),
        `t('${translationKey}')`
      );
    }

    const config = REPLACEMENT_CONFIGS[this.framework];
    const replacement = config.replacementPattern(translationKey);
    
    let updatedContent = content;

    // Replace based on framework-specific patterns
    switch (this.framework) {
      case 'react':
        updatedContent = this.replaceReactStrings(updatedContent, originalText, replacement);
        break;
      case 'vue':
        updatedContent = this.replaceVueStrings(updatedContent, originalText, replacement);
        break;
      case 'svelte':
        updatedContent = this.replaceSvelteStrings(updatedContent, originalText, replacement);
        break;
      case 'angular':
        updatedContent = this.replaceAngularStrings(updatedContent, originalText, replacement);
        break;
    }

    // Add import if needed
    updatedContent = this.ensureImport(updatedContent, config);

    return updatedContent;
  }

  /**
   * Get the replacement pattern for a given framework and key
   */
  getReplacementPattern(translationKey: string, framework?: SupportedFramework): string {
    const targetFramework = framework || this.framework;
    
    if (!targetFramework) {
      return `t('${translationKey}')`;
    }

    const config = REPLACEMENT_CONFIGS[targetFramework];
    return config.replacementPattern(translationKey);
  }

  /**
   * Replace strings in React/JSX content
   */
  private replaceReactStrings(content: string, originalText: string, replacement: string): string {
    const escapedText = this.escapeRegex(originalText);
    
    // Replace in JSX attributes
    content = content.replace(
      new RegExp(`((?:title|label|placeholder|alt|aria-label)\\s*=\\s*)['"\`]${escapedText}['"\`]`, 'g'),
      `$1${replacement}`
    );
    
    // Replace in JSX text content
    content = content.replace(
      new RegExp(`(>\\s*)${escapedText}(\\s*<)`, 'g'),
      `$1${replacement}$2`
    );
    
    // Replace standalone string literals
    content = content.replace(
      new RegExp(`['"\`]${escapedText}['"\`]`, 'g'),
      replacement
    );

    return content;
  }

  /**
   * Replace strings in Vue template content
   */
  private replaceVueStrings(content: string, originalText: string, replacement: string): string {
    const escapedText = this.escapeRegex(originalText);
    
    // Replace in template attributes
    content = content.replace(
      new RegExp(`((?:title|label|placeholder|alt)\\s*=\\s*)['"\`]${escapedText}['"\`]`, 'g'),
      `$1"${replacement}"`
    );
    
    // Replace in template text content
    content = content.replace(
      new RegExp(`(>\\s*)${escapedText}(\\s*<)`, 'g'),
      `$1${replacement}$2`
    );

    return content;
  }

  /**
   * Replace strings in Svelte content
   */
  private replaceSvelteStrings(content: string, originalText: string, replacement: string): string {
    const escapedText = this.escapeRegex(originalText);
    
    // Replace in attributes
    content = content.replace(
      new RegExp(`((?:title|label|placeholder|alt)\\s*=\\s*)['"\`]${escapedText}['"\`]`, 'g'),
      `$1${replacement}`
    );
    
    // Replace in text content
    content = content.replace(
      new RegExp(`(>\\s*)${escapedText}(\\s*<)`, 'g'),
      `$1${replacement}$2`
    );

    return content;
  }

  /**
   * Replace strings in Angular template content
   */
  private replaceAngularStrings(content: string, originalText: string, replacement: string): string {
    const escapedText = this.escapeRegex(originalText);
    
    // Replace in template attributes
    content = content.replace(
      new RegExp(`((?:title|label|placeholder|alt)\\s*=\\s*)['"\`]${escapedText}['"\`]`, 'g'),
      `$1"${replacement}"`
    );
    
    // Replace in template text content
    content = content.replace(
      new RegExp(`(>\\s*)${escapedText}(\\s*<)`, 'g'),
      `$1${replacement}$2`
    );

    return content;
  }

  /**
   * Ensure the necessary import statement is present
   */
  private ensureImport(content: string, config: ReplacementConfig): string {
    if (!config.importStatement) {
      return content;
    }

    // Check if import already exists
    if (config.importStatement) {
      const importParts = config.importStatement.split(' from ');
      if (importParts[0] && content.includes(importParts[0])) {
        return content;
      }
    }

    const lines = content.split('\n');
    let insertIndex = 0;

    if (config.importPosition === 'after-imports') {
      // Find the last import statement
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.trim().startsWith('import ')) {
          insertIndex = i + 1;
        } else if (line && line.trim() && !line.trim().startsWith('//')) {
          break;
        }
      }
    }

    lines.splice(insertIndex, 0, config.importStatement);
    return lines.join('\n');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate smart translation key based on context
   */
  generateSmartKey(
    text: string,
    context?: string,
    keyStyle: 'nested' | 'flat' | 'camelCase' | 'kebab-case' = 'nested'
  ): string {
    // Clean the text
    const cleanText = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);

    // Generate base key
    let baseKey: string;
    switch (keyStyle) {
      case 'camelCase':
        baseKey = cleanText
          .split(' ')
          .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
        break;
      case 'kebab-case':
        baseKey = cleanText.replace(/\s+/g, '-');
        break;
      case 'flat':
        baseKey = cleanText.replace(/\s+/g, '_');
        break;
      case 'nested':
      default:
        baseKey = cleanText.replace(/\s+/g, '_');
        break;
    }

    // Add context prefix
    const contextPrefix = this.extractContextPrefix(context);
    
    if (keyStyle === 'nested') {
      return `${contextPrefix}.${baseKey}`;
    } else {
      return `${contextPrefix}_${baseKey}`;
    }
  }

  /**
   * Extract meaningful prefix from context (file path or component name)
   */
  private extractContextPrefix(context?: string): string {
    if (!context) return 'common';
    
    // Extract from file path
    const basename = context.split('/').pop()?.replace(/\.(ts|tsx|vue|svelte|js|jsx|html)$/, '');
    return basename?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'component';
  }
}

/**
 * Utility functions for translation extraction
 */
export class ExtractionUtils {
  /**
   * Find similar existing translations to avoid duplicates
   */
  static async findSimilarTranslations(
    text: string,
    translationIndex: any,
    threshold: number = 0.7
  ): Promise<Array<{ keyPath: string; value: string; score: number }>> {
    try {
      const results = await translationIndex.search(text, {
        scope: 'values',
        maxResults: 5,
        caseSensitive: false
      });

      return results
        .filter((r: any) => r.score > threshold)
        .map((r: any) => ({
          keyPath: r.keyPath,
          value: (() => {
            const firstLang = Object.keys(r.translations)[0];
            return firstLang && r.translations[firstLang]?.value || '';
          })(),
          score: r.score
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Validate translation key format
   */
  static validateKeyFormat(key: string, keyStyle: string): boolean {
    switch (keyStyle) {
      case 'camelCase':
        return /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/.test(key);
      case 'kebab-case':
        return /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/.test(key);
      case 'flat':
        return /^[a-z][a-z0-9_]*$/.test(key);
      case 'nested':
      default:
        // Allow lowercase letters, numbers, underscores, and camelCase within segments
        return /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/.test(key);
    }
  }
}
