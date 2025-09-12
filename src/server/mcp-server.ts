/**
 * Main MCP server implementation for i18n translation management
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TranslationIndex } from '../core/translation-index.js';
import { TranslationFileWatcher } from '../core/file-watcher.js';
import { ServerConfig } from '../types/translation.js';
import { MCPTools } from './mcp-tools.js';
import { resolve } from 'path';
import { isAbsolutePath } from '../utils/path-resolver.js';
import { AutoSyncManager } from './auto-sync-manager.js';
import { EventHandler } from './event-handler.js';
import { ServerLifecycleManager } from './server-lifecycle.js';
import { GlobalErrorHandler } from './error-handler.js';

/**
 * High-level MCP server for translation management
 */
export class TranslationMCPServer {
  private readonly server: McpServer;
  private readonly index: TranslationIndex;
  private readonly fileWatcher: TranslationFileWatcher;
  private readonly config: Required<ServerConfig>;
  private readonly resolvedPaths: {
    translationDir: string;
    srcDir?: string;
    generateTypes?: string;
  };
  private readonly autoSyncManager: AutoSyncManager;
  private readonly eventHandler: EventHandler;
  private readonly serverLifecycle: ServerLifecycleManager;
  private isRefreshing = false;

  constructor(config: ServerConfig) {
    // Removed plain text debug logs to avoid JSON parsing errors
    
    // Ensure we have a valid project root
    const projectRoot = config.projectRoot 
      ? (isAbsolutePath(config.projectRoot) ? config.projectRoot : resolve(process.cwd(), config.projectRoot)) 
      : process.cwd();


    const defaults = {
      baseLanguage: 'en',
      debug: false,
      watchOptions: {
        debounceMs: 100,
        ignored: ['**/node_modules/**', '**/.git/**'],
      },
      srcDir: undefined,
      exclude: [],
      autoSync: true,
      generateTypes: undefined,
      watchCode: false,
      frameworks: [],
      keyStyle: 'nested',
    };

    // Ensure we have a default translationDir if not provided
    const translationDir = config.translationDir || './locales';
    
    // Store original config
    this.config = {
      ...defaults,
      ...config,
      projectRoot,
      translationDir  // Store the original value for reference
    } as Required<ServerConfig>;

    // Log final configuration
    console.error(JSON.stringify({
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "info",
        message: "MCP Server Configuration",
        data: {
          autoSync: this.config.autoSync,
          baseLanguage: this.config.baseLanguage,
          translationDir: this.config.translationDir,
          projectRoot: this.config.projectRoot,
          debug: this.config.debug
        }
      }
    }));

    // Resolve paths ensuring we handle absolute paths properly
    const resolvedTranslationDir = isAbsolutePath(translationDir) 
      ? translationDir // Already absolute, use as-is
      : resolve(projectRoot, translationDir); // Relative, make absolute

    this.resolvedPaths = {
      translationDir: resolvedTranslationDir,
      srcDir: config.srcDir 
        ? (isAbsolutePath(config.srcDir) ? config.srcDir : resolve(projectRoot, config.srcDir)) 
        : undefined,
      generateTypes: config.generateTypes 
        ? (isAbsolutePath(config.generateTypes) ? config.generateTypes : resolve(projectRoot, config.generateTypes)) 
        : undefined
    };


    // Initialize core components
    this.index = new TranslationIndex({
      baseLanguage: this.config.baseLanguage,
      debug: this.config.debug
    });

    this.fileWatcher = new TranslationFileWatcher(
      {
        translationDir: this.resolvedPaths.translationDir,
        debounceMs: this.config.watchOptions.debounceMs,
        ignored: this.config.watchOptions.ignored,
        debug: this.config.debug
      },
      this.index
    );

    // Initialize MCP server
    this.server = new McpServer({
      name: this.config.name,
      version: this.config.version,
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    // Initialize managers
    this.autoSyncManager = new AutoSyncManager(this.index, this.config, this.resolvedPaths);
    this.eventHandler = new EventHandler(this.index, this.fileWatcher, this.config, this.autoSyncManager);
    this.serverLifecycle = new ServerLifecycleManager(this.server, this.fileWatcher, this.index, this.config, this.autoSyncManager);

    GlobalErrorHandler.setupGlobalErrorHandlers(this.config.debug);
    this.setupTools();
    this.eventHandler.setupEventHandlers();

    if (this.config.debug) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `TranslationMCPServer initialized: ${this.config.name} v${this.config.version}` 
        }
      }));
    }
  }



  /**
   * Setup MCP tools
   */
  private setupTools(): void {
    // Create config with resolved paths for tools
    const configWithResolvedPaths = {
      ...this.config,
      translationDir: this.resolvedPaths.translationDir,
      srcDir: this.resolvedPaths.srcDir || this.config.srcDir,
      generateTypes: this.resolvedPaths.generateTypes || this.config.generateTypes
    } as Required<ServerConfig>;

    const mcpTools = new MCPTools(
      this.index, 
      configWithResolvedPaths,
      this.refreshFromFiles.bind(this)
      );

    // Register each tool with the correct MCP SDK format
    mcpTools.registerTools(this.server);

    if (this.config.debug) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: 'MCP tools registered successfully'
        }
      }));
    }
  }



  /**
   * Start the MCP server with STDIO transport
   */
  async start(): Promise<void> {
    return this.serverLifecycle.start();
  }

  /**
   * Stop the server and cleanup resources
   */
  async stop(): Promise<void> {
    return this.serverLifecycle.stop();
  }

  /**
   * Get the underlying index for advanced operations
   */
  getIndex(): TranslationIndex {
    return this.index;
  }

  /**
   * Get the file watcher for advanced operations
   */
  getFileWatcher(): TranslationFileWatcher {
    return this.fileWatcher;
  }

  /**
   * Refresh memory index from files before operations
   * This ensures memory is current with file state
   */
  async refreshFromFiles(): Promise<void> {
    if (this.isRefreshing) {
      if (this.config.debug) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Refresh already in progress, skipping concurrent call.'
          }
        }));
      }
      return;
    }

    this.isRefreshing = true;
    this.eventHandler.setRefreshing(true);
    try {
      if (this.config.debug) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Refreshing translation index from files...'
          }
        }));
      }
      
      await this.fileWatcher.refreshIndexFromFiles();
      
      if (this.config.debug) {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Translation index refreshed from files'
          }
        }));
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Current index state: ${this.index.getKeys().length} keys across ${this.index.getLanguages().length} languages`
          }
        }));
      }
    } catch (error) {
      console.error('❌ Failed to refresh translation index from files:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
      // Don't re-throw, allow tools to continue with current memory state
    } finally {
      this.isRefreshing = false;
      this.eventHandler.setRefreshing(false);
    }
  }
}
