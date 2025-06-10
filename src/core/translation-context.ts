/**
 * Translation context retrieval functionality
 */

import { 
  IndexedTranslation, 
  ContextOptions, 
  ContextResult 
} from '../types/translation.js';
import { PathParser } from '../utils/path-parser.js';

export class TranslationContextEngine {
  /**
   * Get translation context with hierarchical information
   */
  static async getContext(
    flatIndex: Map<string, IndexedTranslation>,
    sortedKeys: string[],
    keyPath: string, 
    options: ContextOptions
  ): Promise<ContextResult | null> {
    const entry = flatIndex.get(keyPath);
    if (!entry) {
      return null;
    }

    // Filter by languages
    const filteredEntry: IndexedTranslation = {};
    for (const [lang, translationEntry] of Object.entries(entry)) {
      if (!options.languages || options.languages.includes(lang)) {
        filteredEntry[lang] = translationEntry;
      }
    }

    const result: ContextResult = {
      keyPath,
      translations: filteredEntry,
      children: [],
      siblings: []
    };

    // Get parent context
    const parentPath = PathParser.getParent(keyPath);
    if (parentPath && options.depth > 0) {
      const parentEntry = flatIndex.get(parentPath);
      if (parentEntry) {
        // Real parent exists
        const filteredParentEntry: IndexedTranslation = {};
        for (const [lang, translationEntry] of Object.entries(parentEntry)) {
          if (!options.languages || options.languages.includes(lang)) {
            filteredParentEntry[lang] = translationEntry;
          }
        }
        result.parent = {
          keyPath: parentPath,
          translations: filteredParentEntry
        };
      } else {
        // Virtual parent - check if any children exist under this parent path
        const hasChildren = sortedKeys.some(key =>
          key !== keyPath && PathParser.isChildOf(key, parentPath)
        );
        if (hasChildren) {
          result.parent = {
            keyPath: parentPath,
            translations: {} // Virtual parent has no translations
          };
        }
      }
    }

    // Get children and siblings
    for (const otherKeyPath of sortedKeys) {
      // Check for children
      if (PathParser.isChildOf(otherKeyPath, keyPath)) {
        const childEntry = flatIndex.get(otherKeyPath);
        if (childEntry) {
          const filteredChildEntry: IndexedTranslation = {};
          for (const [lang, translationEntry] of Object.entries(childEntry)) {
            if (!options.languages || options.languages.includes(lang)) {
              filteredChildEntry[lang] = translationEntry;
            }
          }
          if (Object.keys(filteredChildEntry).length > 0) {
            result.children.push({
              keyPath: otherKeyPath,
              translations: filteredChildEntry
            });
          }
        }
      }

      // Check for siblings
      if (parentPath && PathParser.isChildOf(otherKeyPath, parentPath) && otherKeyPath !== keyPath) {
        const siblingEntry = flatIndex.get(otherKeyPath);
        if (siblingEntry) {
          const filteredSiblingEntry: IndexedTranslation = {};
          for (const [lang, translationEntry] of Object.entries(siblingEntry)) {
            if (!options.languages || options.languages.includes(lang)) {
              filteredSiblingEntry[lang] = translationEntry;
            }
          }
          if (Object.keys(filteredSiblingEntry).length > 0) {
            result.siblings.push({
              keyPath: otherKeyPath,
              translations: filteredSiblingEntry
            });
          }
        }
      }
    }

    return result;
  }
}
