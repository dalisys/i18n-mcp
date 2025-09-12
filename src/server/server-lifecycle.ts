/**
 * Server lifecycle management for MCP server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TranslationFileWatcher } from '../core/file-watcher.js';
import { TranslationIndex } from '../core/translation-index.js';
import { TypeGenerator } from '../core/type-generator.js';
import { ServerConfig } from '../types/translation.js';
import { AutoSyncManager } from './auto-sync-manager.js';

export class ServerLifecycleManager {
  constructor(
    private readonly server: McpServer,
    private readonly fileWatcher: TranslationFileWatcher,
    private readonly index: TranslationIndex,
    private readonly config: Required<ServerConfig>,
    private readonly autoSyncManager: AutoSyncManager
  ) {}

  /**
   * Start the MCP server with STDIO transport
   */
  async start(): Promise<void> {
    try {

      const stdioTransport = new StdioServerTransport();
      await this.server.connect(stdioTransport);
      
      console.error("i18n MCP Server running on stdio");
      
      // Initialize file watcher AFTER MCP connection
      await this.fileWatcher.start();
      
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Translation MCP Server started: ${this.config.name} v${this.config.version}`
        }
      }));

      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Watching translations in: ${this.config.translationDir}`
        }
      }));

      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Base language: ${this.config.baseLanguage}`
        }
      }));

      // Initialize TypeScript type generation if configured
      await this.initializeTypeGeneration();

      // Log additional IDE integration features
      this.logAdditionalFeatures();

      // Keep the process alive by preventing the event loop from exiting
      // This is essential for MCP servers to stay running
      const keepAlive = setInterval(() => {
      }, 30000);

      // Handle process termination signals to cleanup
      const cleanup = () => {
        clearInterval(keepAlive);
        if (this.config.debug) {
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: "Server shutting down"
            }
          }));
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      process.on('exit', cleanup);

      // Also handle stdin close which happens when MCP client disconnects
      process.stdin.on('end', () => {
        if (this.config.debug) {
          console.error(JSON.stringify({
            jsonrpc: "2.0",
            method: "notification",
            params: {
              type: "info",
              message: "STDIN closed, shutting down server"
            }
          }));
        }
        cleanup();
        process.exit(0);
      });

      process.stdin.on('error', (error) => {
        console.error(JSON.stringify({
          jsonrpc: "2.0",
          method: "notification",
          params: {
            type: "error",
            message: "STDIN error",
            error: error.message
          }
        }));
        cleanup();
        process.exit(1);
      });
      
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
    this.autoSyncManager.clearAutoSyncTimeout();

    // Stop file watcher
    await this.fileWatcher.stop();
    
    if (this.config.debug) {
      console.error(JSON.stringify({
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
   * Initialize TypeScript type generation if configured
   */
  private async initializeTypeGeneration(): Promise<void> {
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

        console.error(JSON.stringify({
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
  }

  /**
   * Log additional IDE integration features
   */
  private logAdditionalFeatures(): void {
    if (this.config.srcDir) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Source code analysis enabled: ${this.config.srcDir}`
        }
      }));
    }
    
    if (this.config.frameworks.length > 0) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: `Framework support: ${this.config.frameworks.join(', ')}`
        }
      }));
    }
    
    if (this.config.autoSync) {
      console.error(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "info",
          message: 'Auto-sync enabled'
        }
      }));
    }
  }
}