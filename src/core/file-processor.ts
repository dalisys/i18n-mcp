/**
 * File processing utilities for translation files
 */

import { TranslationIndex } from './translation-index.js';
import { JsonOperations } from '../utils/json-operations.js';
import { basename, win32, posix } from 'path';

export class FileProcessor {
  /**
   * Process a translation file and update the index
   */
  static async processTranslationFile(
    filePath: string,
    language: string,
    index: TranslationIndex,
    debug: boolean = false
  ): Promise<void> {
    try {
      const parseResult = await JsonOperations.parseFile(filePath);
      
      if (debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Processing ${language}: ${filePath}`
          }
        }));
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Current index state before processing - Keys: ${index.getKeys().length}, Languages: ${index.getLanguages().length}`
          }
        }));
      }

      // Clear existing translations for this language/file combination
      const clearedKeys = this.clearFileFromIndex(filePath, language, index);
      
      if (debug && clearedKeys > 0) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Cleared ${clearedKeys} existing keys for ${language} from ${filePath}`
          }
        }));
      }

      // Update index with parsed translations
      const updatedKeys = await this.updateIndexFromTranslations(
        parseResult.data, 
        language, 
        filePath,
        index
      );

      if (debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Memory updated for ${language}: ${updatedKeys} keys from ${filePath}`
          }
        }));
      }

    } catch (error) {
      throw new Error(`Failed to process file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract language code from file path (cross-platform)
   */
  static extractLanguageFromPath(filePath: string): string {
    // Try to extract filename using both Windows and Unix path separators
    // This handles cases where Windows paths are processed on Unix systems
    let filename = basename(filePath);
    
    // If basename didn't work (still contains path separators), try win32.basename
    if (filename.includes('\\') || filename.includes('/')) {
      filename = win32.basename(filePath);
      
      // If that still didn't work, try posix.basename
      if (filename.includes('\\') || filename.includes('/')) {
        filename = posix.basename(filePath);
      }
    }
    
    return filename.replace('.json', '');
  }

  /**
   * Clear all translations from a specific file
   */
  private static clearFileFromIndex(filePath: string, language: string, index: TranslationIndex): number {
    const keysToDelete: string[] = [];
    
    // Find all keys that belong to this file
    for (const keyPath of index.getKeys()) {
      const entry = index.get(keyPath, language);
      if (entry && typeof entry === 'object' && 'file' in entry && entry.file === filePath) {
        keysToDelete.push(keyPath);
      }
    }
    
    // Delete the keys
    for (const keyPath of keysToDelete) {
      index.delete(keyPath, language);
    }

    return keysToDelete.length;
  }

  /**
   * Update index from parsed translation data
   */
  private static async updateIndexFromTranslations(
    translations: any,
    language: string,
    filePath: string,
    index: TranslationIndex,
    prefix = '',
    keyCount = { value: 0 }
  ): Promise<number> {
    if (!translations || typeof translations !== 'object') {
      return keyCount.value;
    }

    for (const [key, value] of Object.entries(translations)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively process nested objects
        await this.updateIndexFromTranslations(value, language, filePath, index, fullPath, keyCount);
      } else {
        // Leaf node - add to index
        index.set(fullPath, language, value, { 
          file: filePath,
          line: 0, // TODO: Could be enhanced to track actual line numbers
          column: 0
        });
        keyCount.value++;
      }
    }

    return keyCount.value;
  }
}
