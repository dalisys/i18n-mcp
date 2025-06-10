/**
 * File watcher event handlers and processing logic
 */

import { TranslationIndex } from './translation-index.js';
import { FileWatchEvent, FileWatchError } from '../types/translation.js';
import { FileProcessor } from './file-processor.js';

export class FileWatcherHandlers {
  /**
   * Process file changes and update the index
   */
  static async processFileChange(
    filePath: string,
    eventType: 'add' | 'change',
    index: TranslationIndex,
    processedFiles: Set<string>,
    debounceMs: number,
    debug: boolean,
    emit: (event: string, data: any) => void
  ): Promise<void> {
    try {
      // Skip if we've already processed this file recently
      if (processedFiles.has(filePath)) {
        return;
      }

      processedFiles.add(filePath);

      // Remove from processed set after a delay to allow for reprocessing
      setTimeout(() => {
        processedFiles.delete(filePath);
      }, debounceMs * 2);

      const language = FileProcessor.extractLanguageFromPath(filePath);

      await FileProcessor.processTranslationFile(filePath, language, index, debug);

      const event: FileWatchEvent = {
        type: eventType,
        path: filePath,
        language,
        timestamp: Date.now()
      };

      emit('fileProcessed', event);

    } catch (error) {
      const watchError = new FileWatchError(
        `Failed to process file ${filePath}`,
        { path: filePath, error }
      );

      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "error",
          message: watchError.message,
          error: error
        }
      }));
      throw error;
    }
  }

  /**
   * Handle file deletion
   */
  static handleFileDelete(
    filePath: string,
    index: TranslationIndex,
    debug: boolean,
    emit: (event: string, data: any) => void
  ): void {
    try {
      const language = FileProcessor.extractLanguageFromPath(filePath);

      // Clear all translations from this file
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

      const event: FileWatchEvent = {
        type: 'unlink',
        path: filePath,
        language,
        timestamp: Date.now()
      };

      emit('fileProcessed', event);

      if (debug) {
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Removed ${language} translations from index: ${filePath}`
          }
        }));
      }

    } catch (error) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "error",
          message: `Failed to handle file deletion ${filePath}`,
          error: error
        }
      }));
      throw error;
    }
  }

  /**
   * Get list of currently watched files from watcher
   */
  static getWatchedFiles(watcher: any): string[] {
    if (!watcher) {
      return [];
    }
    
    const watched = watcher.getWatched();
    const files: string[] = [];
    
    for (const [dir, filenames] of Object.entries(watched)) {
      if (Array.isArray(filenames)) {
        for (const filename of filenames) {
          if (filename.endsWith('.json')) {
            files.push(`${dir}/${filename}`);
          }
        }
      }
    }
    
    return files;
  }
}
