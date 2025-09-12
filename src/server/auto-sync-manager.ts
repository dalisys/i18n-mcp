/**
 * Auto-sync manager for handling translation file synchronization
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { applyEdits, parseTree, modify, type JSONPath } from 'jsonc-parser';
import { TranslationIndex } from '../core/translation-index.js';
import { ServerConfig } from '../types/translation.js';

export class AutoSyncManager {
  private autoSyncTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly index: TranslationIndex,
    private readonly config: Required<ServerConfig>,
    private readonly resolvedPaths: {
      translationDir: string;
      srcDir?: string;
      generateTypes?: string;
    }
  ) {}

  /**
   * Schedule auto-sync with debouncing
   */
  scheduleAutoSync(): void {
    if (!this.config.autoSync) {
      return;
    }

    // Clear existing timeout to debounce multiple rapid changes
    if (this.autoSyncTimeout) {
      clearTimeout(this.autoSyncTimeout);
    }

    // Schedule sync after a short delay
    this.autoSyncTimeout = setTimeout(() => {
      this.performAutoSync().catch(error => {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "error",
            message: 'Auto-sync failed',
            error: {
              name: error instanceof Error ? error.name : 'Unknown',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            }
          }
        }));
      });
    }, 500); // 500ms debounce
  }

  /**
   * Perform actual auto-sync to files
   */
  private async performAutoSync(): Promise<void> {
    try {
      // Get all languages to sync
      const languages = this.index.getLanguages();
      const allKeys = this.index.getKeys();
      let successCount = 0;
      let errorCount = 0;
      
      for (const language of languages) {
        try {
          await this.syncLanguageToFile(language, allKeys);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "error",
              message: `⚠️  Auto-sync failed for ${language}.json:`,
              error: {
                name: error instanceof Error ? error.name : 'Unknown',
                message: error instanceof Error ? error.message : String(error),
                language: language
              }
            }
          }));
        }
      }

      if (this.config.debug) {
        if (errorCount === 0) {
          console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Auto-sync completed for ${successCount} language(s)`
          }
        }));
        } else {
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "error",
              message: `⚠️  Auto-sync completed with issues: ${successCount} succeeded, ${errorCount} failed`
            }
          }));
        }
      }
    } catch (error) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "error",
          message: 'Auto-sync failed',
          error: {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      }));
    }
  }

  /**
   * Sync a single language to its file while preserving structure and comments
   */
  private async syncLanguageToFile(language: string, allKeys: string[]): Promise<void> {
    // Generate the file path - resolvedPaths.translationDir is always absolute
    const filePath = join(this.resolvedPaths.translationDir, `${language}.json`);

    let fileContent = '{}';
    let fileExisted = true;

    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      fileExisted = false;
      
      // Get the directory path
      const dirPath = dirname(filePath);

      // File doesn't exist, will be created.
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "error",
            message: "Failed to create directory",
            path: dirPath
          }
        }));
        throw mkdirError;
      }
    }

    // Filter for keys that belong to the current language to avoid unnecessary processing
    const languageKeys = allKeys.filter(keyPath => this.index.get(keyPath, language));
    if (languageKeys.length === 0 && !fileExisted) return;

    let changesMade = 0;
    let newFileContent = fileContent;

    // Pre-validate all keys for conflicts before making any changes
    const conflicts: string[] = [];
    const currentData = parseTree(newFileContent);
    
    for (const keyPath of languageKeys) {
      const entry = this.index.get(keyPath, language);
      if (entry && typeof entry === 'object' && 'value' in entry) {
        const keyParts = keyPath.split('.') as JSONPath;
        const conflictPath = this.findConflictingPath(currentData, keyParts);
        if (conflictPath) {
          conflicts.push(`${keyPath} conflicts with existing string value at: ${conflictPath.join('.')}`);
        }
      }
    }
    
    // If there are conflicts, log error and skip this language file
    if (conflicts.length > 0) {
      const errorMessage = `Cannot sync ${language}.json due to path conflicts:\n${conflicts.join('\n')}`;
      console.error(`⚠️  Auto-sync skipped for ${language}.json:`, errorMessage);
      return; // Skip this language file but continue with others
    }
    
    // If no conflicts, proceed with the sync
    for (const keyPath of languageKeys) {
      const entry = this.index.get(keyPath, language);
      if (entry && typeof entry === 'object' && 'value' in entry) {
        const keyParts = keyPath.split('.') as JSONPath;
        
        
        try {
          const edits = modify(newFileContent, keyParts, entry.value, {
            formattingOptions: {
              tabSize: 2,
              insertSpaces: true,
            }
          });

          if (edits.length > 0) {
              newFileContent = applyEdits(newFileContent, edits);
              changesMade++;
          }
        } catch (editError) {
          if (this.config.debug) {
            console.error(JSON.stringify({
              jsonrpc: "2.0",
              method: "notification",
              params: {
                type: "error",
                message: `Failed to modify key ${keyPath}: ${editError instanceof Error ? editError.message : String(editError)}`
              }
            }));
          }
          
          // Continue with other keys instead of failing completely
          continue;
        }
      }
    }

    // Only write if there were actual changes
    if (changesMade > 0) {
      await fs.writeFile(filePath, newFileContent, 'utf-8');

      if (this.config.debug) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Updated ${language}.json with ${changesMade} key change(s) while preserving structure.`
          }
        }));
      }
    }
  }

  /**
   * Find the conflicting path when trying to add nested keys to a string parent
   */
  private findConflictingPath(parseTree: any, keyParts: JSONPath): string[] | null {
    let current = parseTree;
    const conflictPath: string[] = [];
    
    for (const part of keyParts) {
      const partStr = String(part);
      
      if (!current || current.type !== 'object') {
        // Found a non-object where we expected to traverse deeper
        return conflictPath;
      }
      
      // Look for the property in the current object
      const property = current.children?.find((child: any) => 
        child.type === 'property' && 
        child.children?.[0]?.value === partStr
      );
      
      if (!property) {
        // Property doesn't exist, so no conflict
        return null;
      }
      
      conflictPath.push(partStr);
      const valueNode = property.children?.[1];
      
      if (valueNode?.type === 'string' || valueNode?.type === 'number' || valueNode?.type === 'boolean') {
        // Found a primitive value where we need to add more nested keys
        return conflictPath;
      }
      
      current = valueNode;
    }
    
    return null;
  }

  /**
   * Clear any pending auto-sync timeout
   */
  clearAutoSyncTimeout(): void {
    if (this.autoSyncTimeout) {
      clearTimeout(this.autoSyncTimeout);
      this.autoSyncTimeout = null;
    }
  }

  /**
   * Cancel pending auto-sync due to external file change
   */
  cancelPendingAutoSync(): void {
    if (this.autoSyncTimeout) {
      clearTimeout(this.autoSyncTimeout);
      this.autoSyncTimeout = null;
      if (this.config.debug) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Auto-sync cancelled due to external file change'
          }
        }));
      }
    }
  }
}