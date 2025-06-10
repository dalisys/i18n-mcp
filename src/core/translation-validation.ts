/**
 * Translation validation and analysis functionality
 */

import { 
  IndexedTranslation, 
  BatchOperation, 
  ValidationResult, 
  UsageAnalysis 
} from '../types/translation.js';

export class TranslationValidationEngine {
  /**
   * Validate structure consistency across languages
   */
  static async validateStructure(
    flatIndex: Map<string, IndexedTranslation>,
    allKeys: string[],
    baseLanguage: string,
    autoFix: boolean = false
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      missingKeys: {},
      extraKeys: {},
      typeMismatches: [],
      structuralIssues: []
    };

    const languages = this.getLanguages(flatIndex);
    
    // Get base language keys as the template
    const baseKeys = new Set<string>();
    for (const keyPath of allKeys) {
      const entry = flatIndex.get(keyPath);
      if (entry && entry[baseLanguage]) {
        baseKeys.add(keyPath);
      }
    }

    // Check each language against the base
    for (const language of languages) {
      if (language === baseLanguage) continue;
      
      const languageKeys = new Set<string>();
      const missingKeys: string[] = [];
      const extraKeys: string[] = [];
      
      // Collect keys for this language
      for (const keyPath of allKeys) {
        const entry = flatIndex.get(keyPath);
        if (entry && entry[language]) {
          languageKeys.add(keyPath);
        }
      }
      
      // Find missing keys (in base but not in language)
      for (const baseKey of baseKeys) {
        if (!languageKeys.has(baseKey)) {
          missingKeys.push(baseKey);
          result.valid = false;
        }
      }
      
      // Find extra keys (in language but not in base)
      for (const langKey of languageKeys) {
        if (!baseKeys.has(langKey)) {
          extraKeys.push(langKey);
          result.valid = false;
        }
      }
      
      if (missingKeys.length > 0) {
        result.missingKeys[language] = missingKeys;
      }
      
      if (extraKeys.length > 0) {
        result.extraKeys[language] = extraKeys;
      }
      
      // Check type consistency
      for (const keyPath of baseKeys) {
        const baseEntry = flatIndex.get(keyPath);
        const langEntry = flatIndex.get(keyPath);
        
        if (baseEntry && langEntry && baseEntry[baseLanguage] && langEntry[language]) {
          const baseType = typeof baseEntry[baseLanguage].value;
          const langType = typeof langEntry[language].value;
          
          if (baseType !== langType) {
            result.typeMismatches.push({
              keyPath,
              expected: baseType,
              actual: { [language]: langType }
            });
            result.valid = false;
          }
        }
      }
    }

    return result;
  }

  /**
   * Analyze usage patterns and find optimization opportunities
   */
  static async analyzeUsage(
    flatIndex: Map<string, IndexedTranslation>,
    allKeys: string[],
    checkDuplicates: boolean = true
  ): Promise<UsageAnalysis> {
    const result: UsageAnalysis = {
      totalKeys: flatIndex.size,
      unusedKeys: [], // Would need codebase scanning to implement
      duplicateValues: [],
      missingTranslations: {},
      languageStats: {}
    };

    const languages = this.getLanguages(flatIndex);
    
    // Calculate language statistics
    for (const language of languages) {
      let translatedKeys = 0;
      
      for (const keyPath of allKeys) {
        const entry = flatIndex.get(keyPath);
        if (entry && entry[language]) {
          translatedKeys++;
        }
      }
      
      result.languageStats[language] = {
        totalKeys: allKeys.length,
        translatedKeys,
        completeness: allKeys.length > 0 ? translatedKeys / allKeys.length : 0
      };
    }
    
    // Find missing translations
    for (const language of languages) {
      const missingKeys: string[] = [];
      
      for (const keyPath of allKeys) {
        const entry = flatIndex.get(keyPath);
        if (!entry || !entry[language]) {
          missingKeys.push(keyPath);
        }
      }
      
      if (missingKeys.length > 0) {
        result.missingTranslations[language] = missingKeys;
      }
    }
    
    // Find duplicate values
    if (checkDuplicates) {
      const valueMap = new Map<string, string[]>();
      
      for (const keyPath of allKeys) {
        const entry = flatIndex.get(keyPath);
        if (entry) {
          for (const [language, translationEntry] of Object.entries(entry)) {
            const valueStr = String(translationEntry.value);
            const key = `${language}:${valueStr}`;
            
            if (!valueMap.has(key)) {
              valueMap.set(key, []);
            }
            valueMap.get(key)!.push(keyPath);
          }
        }
      }
      
      for (const [key, keyPaths] of valueMap) {
        if (keyPaths.length > 1) {
          const [, value] = key.split(':', 2);
          result.duplicateValues.push({
            value,
            keys: keyPaths
          });
        }
      }
    }

    return result;
  }

  private static getLanguages(flatIndex: Map<string, IndexedTranslation>): string[] {
    const languages = new Set<string>();
    
    for (const entry of flatIndex.values()) {
      for (const lang of Object.keys(entry)) {
        languages.add(lang);
      }
    }
    
    return Array.from(languages).sort();
  }
}
