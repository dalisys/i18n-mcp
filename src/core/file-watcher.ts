/**
 * File watcher with Chokidar v4 for translation files
 */

import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { TranslationIndex } from './translation-index.js';
import { FileWatchError } from '../types/translation.js';
import { debounce } from '../utils/path-parser.js';
import { FileWatcherHandlers } from './file-watcher-handlers.js';
import { EventEmitter } from 'events';

/**
 * Configuration for the file watcher
 */
export interface FileWatcherConfig {
  /** Directory to watch for translation files */
  translationDir: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** File patterns to ignore */
  ignored?: string[];
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Translation file watcher with optimized change detection
 */
export class TranslationFileWatcher extends EventEmitter {
  private watcher?: FSWatcher;
  private readonly debouncedProcessChange: (path: string, eventType: 'add' | 'change') => void;
  private readonly config: Required<FileWatcherConfig>;
  private readonly processedFiles = new Set<string>();

  constructor(
    config: FileWatcherConfig,
    private readonly index: TranslationIndex
  ) {
    super();
    
    this.config = {
      debounceMs: 100,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      debug: false,
      ...config
    };

    // Debounce file changes to handle rapid successive writes
    this.debouncedProcessChange = debounce(
      this.processFileChange.bind(this), 
      this.config.debounceMs
    );

    if (this.config.debug) {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `FileWatcher configured for: ${this.config.translationDir}`
        }
      }));
    }
  }

  /**
   * Refresh the index by reloading all translation files from disk
   * This ensures memory is in sync with current file state
   */
  async refreshIndexFromFiles(): Promise<void> {
    if (this.config.debug) {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: 'Refreshing memory index from files...'
        }
      }));
    }
    
    // Clear the current index to start fresh
    this.index.clear();
    
    // Reload all files
    await this.initializeIndex();
    
    if (this.config.debug) {
      console.log(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: 'Memory index refreshed from files'
        }
      }));
    }
  }

  /**
   * Initialize the index by loading all existing translation files
   */
  async initializeIndex(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.translationDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      if (this.config.debug) {
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Initializing index with ${jsonFiles.length} translation files...`
          }
        }));
      }

      let processedCount = 0;
      for (const file of jsonFiles) {
        const filePath = resolve(this.config.translationDir, file);
        try {
          await this.processFile(filePath);
          processedCount++;
          if (this.config.debug) {
            console.log(JSON.stringify({
              jsonrpc: "2.0",
              method: "notification",
              params: {
                type: "info",
                message: `Loaded translations from: ${file}`
              }
            }));
          }
        } catch (error) {
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "error",
              message: `Failed to load ${file}`,
              error: error
            }
          }));
        }
      }

      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Index initialized with ${this.index.getKeys().length} translation keys across ${this.index.getLanguages().length} languages`
          }
        }));
      }
    } catch (error) {
      throw new FileWatchError(
        `Failed to initialize translation index: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error }
      );
    }
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    try {
      // Verify the translation directory exists
      await fs.access(this.config.translationDir);
    } catch (error) {
      throw new FileWatchError(
        `Translation directory does not exist: ${this.config.translationDir}`,
        { path: this.config.translationDir, error }
      );
    }

    // Initialize the index with existing files first
    await this.initializeIndex();

    // Track initial files to ensure they're processed
    let initialFilesProcessed = 0;
    let isInitialScanComplete = false;

    this.watcher = chokidar.watch(this.config.translationDir, {
      // Optimized settings for performance
      persistent: true,
      ignoreInitial: false,
      followSymlinks: false,

      // Use native fsevents on macOS, fs.watch elsewhere
      usePolling: false,

      // Only watch JSON files
      ignored: [
        ...this.config.ignored,
        (path: string) => !path.endsWith('.json')
      ],

      // Performance optimizations
      alwaysStat: false,
      depth: 3, // Limit recursion depth

      // Reduce OS resource usage
      awaitWriteFinish: {
        stabilityThreshold: this.config.debounceMs,
        pollInterval: Math.max(50, this.config.debounceMs / 2)
      }
    });

    this.watcher
      .on('add', (path: string) => {
        if (this.config.debug) {
          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: `File added: ${path}`
            }
          }));
        }

        // Process initial files immediately without debouncing
        if (!isInitialScanComplete) {
          initialFilesProcessed++;
          this.processFileChange(path, 'add').catch(error => {
            console.error(JSON.stringify({
              jsonrpc: "2.0",
              method: "notification",
              params: {
                type: "error",
                message: `Failed to process initial file ${path}`,
                error: error
              }
            }));
          });
        } else {
          this.debouncedProcessChange(path, 'add');
        }
      })
      .on('change', (path: string) => {
        if (this.config.debug) {
          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: `File changed: ${path}`
            }
          }));
        }
        this.debouncedProcessChange(path, 'change');
      })
      .on('unlink', (path: string) => {
        if (this.config.debug) {
          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: `File deleted: ${path}`
            }
          }));
        }
        this.handleFileDelete(path);
      })
      .on('error', (error: unknown) => {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "error",
            message: "File watcher error",
            error: error
          }
        }));
        this.emit('error', new FileWatchError('File watcher error', { error }));
      })
      .on('ready', () => {
        isInitialScanComplete = true;
        if (this.config.debug) {
          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: `Initial scan complete. Processed ${initialFilesProcessed} files. Watching: ${this.config.translationDir}`
            }
          }));
        }
        this.emit('ready');
      });

    if (this.config.debug) {
      console.info(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Started watching translation files in: ${this.config.translationDir}`
        }
      }));
    }
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
      this.processedFiles.clear();
      
      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: "File watcher stopped"
          }
        }));
      }
    }
  }

  /**
   * Get list of currently watched files
   */
  getWatchedFiles(): string[] {
    return FileWatcherHandlers.getWatchedFiles(this.watcher);
  }

  /**
   * Manually trigger processing of a file
   */
  async processFile(filePath: string): Promise<void> {
    await FileWatcherHandlers.processFileChange(
      filePath,
      'change',
      this.index,
      this.processedFiles,
      this.config.debounceMs,
      this.config.debug,
      (event, data) => this.emit(event, data)
    );
  }

  /**
   * Process file changes and update the index
   */
  private async processFileChange(filePath: string, eventType: 'add' | 'change'): Promise<void> {
    await FileWatcherHandlers.processFileChange(
      filePath,
      eventType,
      this.index,
      this.processedFiles,
      this.config.debounceMs,
      this.config.debug,
      (event, data) => this.emit(event, data)
    );
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(filePath: string): void {
    FileWatcherHandlers.handleFileDelete(
      filePath,
      this.index,
      this.config.debug || false,
      (event, data) => this.emit(event, data)
    );
  }

  /**
   * Get watcher statistics
   */
  getStats(): {
    isWatching: boolean;
    watchedFiles: number;
    processedFiles: number;
  } {
    return {
      isWatching: !!this.watcher,
      watchedFiles: this.getWatchedFiles().length,
      processedFiles: this.processedFiles.size
    };
  }
}
