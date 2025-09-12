/**
 * Event handlers for MCP server components
 */

import { TranslationIndex } from '../core/translation-index.js';
import { TranslationFileWatcher } from '../core/file-watcher.js';
import { ServerConfig } from '../types/translation.js';
import { AutoSyncManager } from './auto-sync-manager.js';

export class EventHandler {
  constructor(
    private readonly index: TranslationIndex,
    private readonly fileWatcher: TranslationFileWatcher,
    private readonly config: Required<ServerConfig>,
    private readonly autoSyncManager: AutoSyncManager
  ) {}

  /**
   * Setup event handlers for index and file watcher
   */
  setupEventHandlers(): void {
    this.setupIndexEvents();
    this.setupFileWatcherEvents();
  }

  /**
   * Setup index event handlers
   */
  private setupIndexEvents(): void {
    // Index events - only log during tool operations, not file loading
    this.index.on('set', (event) => {
      // Only log individual sets if it's a small operation (likely from a tool)
      if (this.config.debug && !this.isRefreshing) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Translation set: ${event.keyPath} [${event.language}]`
          }
        }));
      }
      
      this.autoSyncManager.scheduleAutoSync();
    });

    this.index.on('delete', (event) => {
      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Translation deleted: ${event.keyPath} [${event.language || 'all'}]`
          }
        }));
      }
      this.autoSyncManager.scheduleAutoSync();
    });
  }

  /**
   * Setup file watcher event handlers
   */
  private setupFileWatcherEvents(): void {
    this.fileWatcher.on('fileProcessed', (event) => {
      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `File processed: ${event.type} ${event.path} [${event.language}]`
          }
        }));
      }
      
      // Cancel any pending auto-sync when files are changed externally
      // to prevent overwriting user's file edits
      this.autoSyncManager.cancelPendingAutoSync();
    });

    this.fileWatcher.on('error', (error) => {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "error",
          message: 'File watcher error',
          error: error
        }
      }));
    });

    this.fileWatcher.on('ready', () => {
      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'File watcher ready'
          }
        }));
      }
    });
  }

  /**
   * Flag to track if refresh is in progress
   * This is used by index events to avoid excessive logging during file loading
   */
  private isRefreshing = false;

  /**
   * Set the refreshing state
   */
  setRefreshing(refreshing: boolean): void {
    this.isRefreshing = refreshing;
  }
}