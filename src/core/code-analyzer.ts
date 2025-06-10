/**
 * Code analysis engine for detecting hardcoded strings and translation usage
 */

import { promises as fs } from 'fs';
import { extname, basename } from 'path';
import {
  SupportedFramework,
  CodeAnalysisResult,
  HardcodedString,
  TranslationUsage,
  CodeSuggestion
} from '../types/translation.js';
import { TranslationIndex } from './translation-index.js';

/**
 * Options for code analysis
 */
export interface CodeAnalysisOptions {
  /** Extract hardcoded strings */
  extractHardcoded?: boolean;
  /** Find translation key usage */
  findUsage?: boolean;
  /** Translation index for validation */
  translationIndex?: TranslationIndex;
  /** Minimum string length to consider */
  minStringLength?: number;
  /** Exclude patterns */
  excludePatterns?: RegExp[];
}

/**
 * Framework-specific patterns and configurations
 */
interface FrameworkConfig {
  /** File extensions this framework uses */
  extensions: string[];
  /** Translation function patterns */
  translationPatterns: RegExp[];
  /** String literal patterns to extract */
  stringPatterns: RegExp[];
  /** Import patterns for translation libraries */
  importPatterns: RegExp[];
  /** Component/template patterns */
  componentPatterns?: RegExp[];
}

/**
 * Framework configurations
 */
const FRAMEWORK_CONFIGS: Record<SupportedFramework, FrameworkConfig> = {
  react: {
    extensions: ['.tsx', '.jsx', '.ts', '.js'],
    translationPatterns: [
      // Static string patterns
      /(?:^|[^a-zA-Z0-9_$.])t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /useTranslation\(\).*?\.t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /i18n\.t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /\$t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      // Template literal patterns (for dynamic key detection)
      /(?:^|[^a-zA-Z0-9_$.])t\s*\(\s*`([^`]+)`/gms,
      /useTranslation\(\).*?\.t\s*\(\s*`([^`]+)`/gms,
      /i18n\.t\s*\(\s*`([^`]+)`/gms,
      /\$t\s*\(\s*`([^`]+)`/gms,
      // Component prop patterns (translation keys as props)
      /(?:title|label|placeholder|alt|aria-label|description|text|message|content)\s*=\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9])['"`]/gms
    ],
    stringPatterns: [
      /(?:title|label|placeholder|alt|aria-label)\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      />\s*([^<>{}\s][^<>{}]{2,}[^<>{}\s])\s*</g
    ],
    importPatterns: [
      /import.*?from\s+['"`]react-i18next['"`]/,
      /import.*?from\s+['"`]i18next['"`]/,
      /import.*?from\s+['"`]@\/i18n['"`]/
    ]
  },
  vue: {
    extensions: ['.vue', '.ts', '.js'],
    translationPatterns: [
      // Static string patterns
      /\$t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /this\.\$t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /(?:^|[^a-zA-Z0-9_$.])t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      // Template literal patterns (for dynamic key detection)
      /\$t\s*\(\s*`([^`]+)`/gms,
      /this\.\$t\s*\(\s*`([^`]+)`/gms,
      /(?:^|[^a-zA-Z0-9_$.])t\s*\(\s*`([^`]+)`/gms,
      // Component prop patterns (translation keys as props)
      /(?:title|label|placeholder|alt|aria-label|description|text|message|content)\s*=\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9])['"`]/gms,
      // Vue-specific prop patterns
      /:(?:title|label|placeholder|alt|aria-label|description|text|message|content)\s*=\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9])['"`]/gms
    ],
    stringPatterns: [
      /(?:title|label|placeholder|alt)\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      />\s*([^<>{}\s][^<>{}]{2,}[^<>{}\s])\s*</g,
      /v-text\s*=\s*['"`]([^'"`]{3,})['"`]/g
    ],
    importPatterns: [
      /import.*?from\s+['"`]vue-i18n['"`]/,
      /import.*?from\s+['"`]@\/i18n['"`]/
    ]
  },
  svelte: {
    extensions: ['.svelte', '.ts', '.js'],
    translationPatterns: [
      // Static string patterns
      /\$_\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /\$t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      // Template literal patterns (for dynamic key detection)
      /\$_\s*\(\s*`([^`]+)`/gms,
      /\$t\s*\(\s*`([^`]+)`/gms,
      // Component prop patterns (translation keys as props)
      /(?:title|label|placeholder|alt|aria-label|description|text|message|content)\s*=\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9])['"`]/gms
    ],
    stringPatterns: [
      /(?:title|label|placeholder|alt)\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      />\s*([^<>{}\s][^<>{}]{2,}[^<>{}\s])\s*</g
    ],
    importPatterns: [
      /import.*?from\s+['"`]svelte-i18n['"`]/,
      /import.*?from\s+['"`]@\/i18n['"`]/
    ]
  },
  angular: {
    extensions: ['.ts', '.html', '.js'],
    translationPatterns: [
      // Static string patterns
      /translate\.get\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /translate\.instant\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /\|\s*translate\s*:\s*['"`]([^'"`]+)['"`]/gms,
      // Template literal patterns (for dynamic key detection)
      /translate\.get\s*\(\s*`([^`]+)`/gms,
      /translate\.instant\s*\(\s*`([^`]+)`/gms,
      // Component prop patterns (translation keys as props)
      /(?:title|label|placeholder|alt|aria-label|description|text|message|content)\s*=\s*['"`]([a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9])['"`]/gms
    ],
    stringPatterns: [
      /(?:title|label|placeholder|alt)\s*=\s*['"`]([^'"`]{3,})['"`]/g,
      />\s*([^<>{}\s][^<>{}]{2,}[^<>{}\s])\s*</g
    ],
    importPatterns: [
      /import.*?from\s+['"`]@ngx-translate\/core['"`]/,
      /import.*?from\s+['"`]@\/i18n['"`]/
    ]
  }
};

/**
 * Code analyzer for detecting translation patterns and hardcoded strings
 */
export class CodeAnalyzer {
  private frameworks: SupportedFramework[];

  constructor(frameworks?: SupportedFramework[]) {
    this.frameworks = frameworks || [];
  }

  /**
   * Analyze a single file for translation patterns
   */
  async analyzeFile(
    filePath: string,
    options: CodeAnalysisOptions = {}
  ): Promise<CodeAnalysisResult> {
    const {
      extractHardcoded = true,
      findUsage = true,
      translationIndex,
      minStringLength = 3,
      excludePatterns = []
    } = options;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const detectedFramework = this.detectFramework(filePath, content);
      
      const result: CodeAnalysisResult = {
        detectedFramework,
        hardcodedStrings: [],
        translationUsage: [],
        suggestions: []
      };

      if (extractHardcoded) {
        result.hardcodedStrings = this.extractHardcodedStrings(
          content,
          detectedFramework,
          minStringLength,
          excludePatterns
        );
      }

      if (findUsage) {
        result.translationUsage = this.findTranslationUsage(
          content,
          detectedFramework,
          translationIndex
        );
      }

      result.suggestions = this.generateSuggestions(result, translationIndex);

      return result;
    } catch (error) {
      throw new Error(`Failed to analyze file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect framework based on file extension and content
   */
  private detectFramework(filePath: string, content: string): SupportedFramework | undefined {
    const ext = extname(filePath);
    const fileName = basename(filePath);

    // Check specified frameworks first
    for (const framework of this.frameworks) {
      const config = FRAMEWORK_CONFIGS[framework];
      if (config.extensions.includes(ext)) {
        // Check for framework-specific imports
        if (config.importPatterns.some(pattern => pattern.test(content))) {
          return framework;
        }
      }
    }

    // Auto-detect based on content patterns
    if (ext === '.vue' || fileName.endsWith('.vue')) {
      return 'vue';
    }
    
    if (ext === '.svelte' || fileName.endsWith('.svelte')) {
      return 'svelte';
    }

    // Check for React patterns
    if (['.tsx', '.jsx'].includes(ext) || /import.*?React/.test(content)) {
      return 'react';
    }

    // Check for Angular patterns
    if (/import.*?@angular/.test(content) || /@Component/.test(content)) {
      return 'angular';
    }

    return undefined;
  }

  /**
   * Extract hardcoded strings from content
   */
  private extractHardcodedStrings(
    content: string,
    framework: SupportedFramework | undefined,
    minLength: number,
    excludePatterns: RegExp[]
  ): HardcodedString[] {
    const hardcodedStrings: HardcodedString[] = [];
    const lines = content.split('\n');

    // Get framework-specific patterns
    const patterns = framework ? FRAMEWORK_CONFIGS[framework].stringPatterns : [
      // Generic patterns
      /['"`]([^'"`]{3,})['"`]/g
    ];

    lines.forEach((line, lineIndex) => {
      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const text = match[1];

          // Skip if text is undefined or empty
          if (!text) continue;

          // Skip if too short
          if (text.length < minLength) continue;

          // Skip if matches exclude patterns
          if (excludePatterns.some(exclude => exclude.test(text))) continue;

          // Skip if looks like code (contains special characters)
          if (/[{}[\]()=<>]/.test(text)) continue;

          // Skip if all uppercase (likely constants)
          if (text === text.toUpperCase() && text.length < 10) continue;

          hardcodedStrings.push({
            text,
            line: lineIndex + 1,
            column: match.index || 0,
            confidence: this.calculateConfidence(text),
            suggestedKey: this.generateKey(text, framework)
          });
        }
      });
    });

    return hardcodedStrings;
  }

  /**
   * Find translation key usage in content
   */
  private findTranslationUsage(
    content: string,
    framework: SupportedFramework | undefined,
    translationIndex?: TranslationIndex
  ): TranslationUsage[] {
    const usage: TranslationUsage[] = [];

    // Get framework-specific translation patterns
    const patterns = framework ? FRAMEWORK_CONFIGS[framework].translationPatterns : [
      // Generic patterns - more specific to avoid false positives, with multiline support
      /(?:^|[^a-zA-Z0-9_$.])t\s*\(\s*['"`]([^'"`]+)['"`]/gms,
      /\$t\s*\(\s*['"`]([^'"`]+)['"`]/gms
    ];

    // Process patterns against the entire content to handle multiline matches
    patterns.forEach(pattern => {
      let match;
      // Reset the regex lastIndex to ensure we start from the beginning
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const keyPath = match[1];

        // Skip if keyPath is undefined or empty
        if (!keyPath) continue;

        // For template literals, extract static parts for analysis
        const staticParts = this.extractStaticPartsFromTemplate(keyPath);

        if (staticParts.length > 0) {
          // Process each static part as a potential translation key
          for (const staticPart of staticParts) {
            if (staticPart && !this.isDynamicKey(staticPart)) {
              const exists = translationIndex ? translationIndex.has(staticPart) : false;

              // Calculate line and column from match index
              const beforeMatch = content.substring(0, match.index);
              const lineNumber = beforeMatch.split('\n').length;
              const lastNewlineIndex = beforeMatch.lastIndexOf('\n');
              const column = lastNewlineIndex === -1 ? match.index : match.index - lastNewlineIndex - 1;

              usage.push({
                keyPath: staticPart,
                line: lineNumber,
                column,
                pattern: match[0],
                exists
              });
            }
          }
        } else {
          // Handle regular static keys
          if (!this.isDynamicKey(keyPath)) {
            const exists = translationIndex ? translationIndex.has(keyPath) : false;

            // Calculate line and column from match index
            const beforeMatch = content.substring(0, match.index);
            const lineNumber = beforeMatch.split('\n').length;
            const lastNewlineIndex = beforeMatch.lastIndexOf('\n');
            const column = lastNewlineIndex === -1 ? match.index : match.index - lastNewlineIndex - 1;

            usage.push({
              keyPath,
              line: lineNumber,
              column,
              pattern: match[0],
              exists
            });
          }
        }
      }
    });

    return usage;
  }

  /**
   * Extract static parts from template literals for analysis
   * For example: "categories.${a.id}" -> ["categories"]
   */
  private extractStaticPartsFromTemplate(keyPath: string): string[] {
    const staticParts: string[] = [];

    // Check if this looks like a template literal with variables
    if (/\$\{[^}]+\}/.test(keyPath)) {
      // Split by template literal variables and extract static parts
      const parts = keyPath.split(/\$\{[^}]+\}/);
      for (const part of parts) {
        if (part.trim()) {
          // Clean up the part (remove leading/trailing dots)
          const cleanPart = part.replace(/^\.+|\.+$/g, '');
          if (cleanPart && cleanPart.includes('.')) {
            // If it's a dotted path, it might be a translation key
            staticParts.push(cleanPart);
          }
        }
      }
    }

    return staticParts;
  }

  /**
   * Check if a translation key is dynamic (contains variables or expressions)
   */
  private isDynamicKey(keyPath: string): boolean {
    // Template literal variables: ${variable}, ${obj.prop}, ${func()}
    if (/\$\{[^}]+\}/.test(keyPath)) return true;

    // Double curly braces (Handlebars, Vue, Angular): {{variable}}, {{obj.prop}}
    if (/\{\{[^}]+\}\}/.test(keyPath)) return true;

    // Single curly braces with variables: {variable}, {obj.prop}
    if (/\{[a-zA-Z_$][^}]*\}/.test(keyPath)) return true;

    // Square brackets with variables: [variable], [obj.prop], [0]
    if (/\[[^\]]*[a-zA-Z_$][a-zA-Z0-9_$]*[^\]]*\]/.test(keyPath)) return true;
    if (/\[\d+\]/.test(keyPath)) return true; // Array indices

    // Concatenation patterns: key + variable, 'prefix' + suffix
    if (/\+/.test(keyPath)) return true;

    // Function calls: someFunction(), getKey(), obj.method()
    if (/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(keyPath)) return true;

    // Ternary operators: condition ? 'key1' : 'key2'
    if (/\?.*:/.test(keyPath)) return true;

    // Logical operators: key1 || key2, key1 && key2
    if (/(\|\||&&)/.test(keyPath)) return true;

    // Comparison operators: key === 'value', key !== 'value'
    if (/(===|!==|==|!=|<=|>=|<|>)/.test(keyPath)) return true;

    // Assignment operators: key = value, key += value
    if (/(=|\+=|-=|\*=|\/=|%=)/.test(keyPath)) return true;

    // Parentheses with expressions: (expression)
    if (/\([^)]*[a-zA-Z_$][^)]*\)/.test(keyPath)) return true;

    // Backticks (template literals): `template`
    if (/`/.test(keyPath)) return true;

    // String interpolation patterns common in different frameworks:
    // Angular: {{ expression }}
    // Vue: {{ expression }}
    // React: {expression}
    // Svelte: {expression}

    // Check for common variable naming patterns that are likely dynamic
    // But be careful not to flag valid translation keys

    // Variables with common prefixes/suffixes
    if (/^(get|set|is|has|can|should|will|did)[A-Z]/.test(keyPath)) return true;
    if (/(Key|Name|Id|Type|Status|State|Value|Data|Info|Config|Option|Setting)$/.test(keyPath)) return true;

    // CamelCase variables (likely not translation keys)
    if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(keyPath) && !/\./.test(keyPath)) return true;

    // Variables with underscores at start/end
    if (/^_|_$/.test(keyPath)) return true;

    // All caps variables (constants)
    if (/^[A-Z_][A-Z0-9_]*$/.test(keyPath) && keyPath.length > 1) return true;

    // Numbers at the start (likely array indices or IDs)
    if (/^\d/.test(keyPath)) return true;

    // Special characters that indicate expressions
    if (/[!@#%^&*()=+\[\]{}|\\:";'<>?,\/]/.test(keyPath)) return true;

    // Whitespace (indicates expression)
    if (/\s/.test(keyPath)) return true;

    return false;
  }

  /**
   * Generate suggestions based on analysis results
   */
  private generateSuggestions(
    result: CodeAnalysisResult,
    translationIndex?: TranslationIndex
  ): CodeSuggestion[] {
    const suggestions: CodeSuggestion[] = [];

    // Suggest extracting hardcoded strings
    result.hardcodedStrings.forEach(hardcoded => {
      if (hardcoded.confidence > 0.7) {
        suggestions.push({
          type: 'extract',
          message: `Consider extracting hardcoded string: "${hardcoded.text}"`,
          line: hardcoded.line,
          action: `Replace with translation key: ${hardcoded.suggestedKey}`,
          severity: 'warning'
        });
      }
    });

    // Suggest fixing missing translation keys
    result.translationUsage.forEach(usage => {
      if (!usage.exists) {
        suggestions.push({
          type: 'missing-key',
          message: `Translation key not found: "${usage.keyPath}"`,
          line: usage.line,
          action: `Add translation for key: ${usage.keyPath}`,
          severity: 'error'
        });
      }
    });

    return suggestions;
  }

  /**
   * Calculate confidence score for hardcoded string extraction
   */
  private calculateConfidence(text: string): number {
    let score = 0.5; // Base score

    // Increase confidence for user-facing text patterns
    if (/^[A-Z]/.test(text)) score += 0.2; // Starts with capital
    if (/[.!?]$/.test(text)) score += 0.2; // Ends with punctuation
    if (text.split(' ').length > 1) score += 0.2; // Multiple words
    if (text.length > 10) score += 0.1; // Longer text

    // Decrease confidence for code-like patterns
    if (/[_-]/.test(text)) score -= 0.1; // Contains underscores/dashes
    if (/\d/.test(text)) score -= 0.1; // Contains numbers
    if (text === text.toLowerCase()) score -= 0.1; // All lowercase

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate a suggested translation key
   */
  private generateKey(text: string, framework?: SupportedFramework): string {
    const baseKey = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 30);

    const prefix = framework ? framework : 'common';
    return `${prefix}.${baseKey}`;
  }
}
