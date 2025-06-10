/**
 * Main MCP server implementation for i18n translation management
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TranslationIndex } from '../core/translation-index.js';
import { TranslationFileWatcher } from '../core/file-watcher.js';
import { TypeGenerator } from '../core/type-generator.js';
import { ServerConfig } from '../types/translation.js';
import { MCPTools } from './mcp-tools.js';
import { applyEdits, parseTree, findNodeAtLocation, getNodeValue, modify, type JSONPath } from 'jsonc-parser';
import { promises as fs } from 'fs';
import { join, dirname, resolve } from 'path';
import { isAbsolutePath } from '../utils/path-resolver.js';

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
  private autoSyncTimeout: NodeJS.Timeout | null = null;
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
    console.info(JSON.stringify({
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

    this.setupTools();
    this.setupEventHandlers();

    if (this.config.debug) {
      console.info(JSON.stringify({
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
      console.info(JSON.stringify({
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
   * Setup event handlers for index and file watcher
   */
  private setupEventHandlers(): void {
    // Index events
    this.index.on('set', (event) => {
      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Translation set: ${event.keyPath} [${event.language}]`
          }
        }));
      }
      
      
      this.scheduleAutoSync();
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
      this.scheduleAutoSync();
    });

    // File watcher events
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
      if (this.autoSyncTimeout) {
        clearTimeout(this.autoSyncTimeout);
        this.autoSyncTimeout = null;
        if (this.config.debug) {
          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: 'Auto-sync cancelled due to external file change'
            }
          }));
        }
      }
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
   * Schedule auto-sync with debouncing
   */
  private scheduleAutoSync(): void {
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
      
      if (languages.length === 0) {
        return;
      }
      
      for (const language of languages) {
        try {
          await this.syncLanguageToFile(language, allKeys);
        } catch (syncError) {
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "error",
              message: `Failed to sync language ${language}`,
              error: {
                name: syncError instanceof Error ? syncError.name : 'Unknown',
                message: syncError instanceof Error ? syncError.message : String(syncError),
                language: language
              }
            }
          }));
          throw syncError; // Re-throw to trigger outer catch
        }
      }

      if (this.config.debug) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Auto-sync completed for ${languages.length} language(s)`
          }
        }));
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
        console.info(JSON.stringify({
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
   * Start the MCP server with STDIO transport
   */
  async start(): Promise<void> {
    try {
      // Initialize file watcher first
      await this.fileWatcher.start();
      
      // Connect to STDIO transport
      const stdioTransport = new StdioServerTransport();
      await this.server.connect(stdioTransport);
      
      console.info(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Translation MCP Server started: ${this.config.name} v${this.config.version}`
        }
      }));

      console.info(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Watching translations in: ${this.resolvedPaths.translationDir}`
        }
      }));

      console.info(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Base language: ${this.config.baseLanguage}`
        }
      }));

      // Initialize TypeScript type generation if configured
      if (this.config.generateTypes) {
        try {
          const typeGenerator = new TypeGenerator(this.index);
          await typeGenerator.generateTypes({
            outputPath: this.config.generateTypes,
            namespace: 'I18n',
            includeValues: false,
            strict: true,
            baseLanguage: this.config.baseLanguage
          });

          // Set up watching for type regeneration
          await typeGenerator.watchAndRegenerate({
            outputPath: this.config.generateTypes,
            namespace: 'I18n',
            includeValues: false,
            strict: true,
            baseLanguage: this.config.baseLanguage
          });

          console.info(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: `TypeScript types generated: ${this.config.generateTypes}`
            }
          }));
        } catch (error) {
          console.warn(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "warning",
              message: 'Failed to generate TypeScript types',
              error: error
            }
          }));
        }
      }

      // Log additional IDE integration features
      if (this.config.srcDir) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Source code analysis enabled: ${this.config.srcDir}`
          }
        }));
      }
      if (this.config.frameworks.length > 0) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Framework support: ${this.config.frameworks.join(', ')}`
          }
        }));
      }
      if (this.config.autoSync) {
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Auto-sync enabled'
          }
        }));
      }
      
    } catch (error) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "error",
          message: 'Failed to start MCP server',
          error: error
        }
      }));
      throw error;
    }
  }

  /**
   * Stop the server and cleanup resources
   */
  async stop(): Promise<void> {
    // Clear auto-sync timeout
    if (this.autoSyncTimeout) {
      clearTimeout(this.autoSyncTimeout);
      this.autoSyncTimeout = null;
    }

    // Stop file watcher
    await this.fileWatcher.stop();
    
    if (this.config.debug) {
      console.info(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: 'Translation MCP Server stopped'
        }
      }));
    }
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
        console.info(JSON.stringify({
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
    try {
      if (this.config.debug) {
        console.info(JSON.stringify({
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
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: 'Translation index refreshed from files'
          }
        }));
        console.info(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "info",
            message: `Current index state: ${this.index.getKeys().length} keys across ${this.index.getLanguages().length} languages`
          }
        }));
      }
    } finally {
      this.isRefreshing = false;
    }
  }
}
