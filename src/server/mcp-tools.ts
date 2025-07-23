/**
 * MCP tool definitions for the translation server
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';
import { ServerConfig } from '../types/translation.js';

// Import individual search tools
import { setupSearchTranslationTool } from '../tools/search-translation.js';
import { setupGetTranslationSuggestionsTool } from '../tools/get-translation-suggestions.js';
import { setupGetTranslationContextTool } from '../tools/get-translation-context.js';
import { setupExploreTranslationStructureTool } from '../tools/explore-translation-structure.js';

// Import individual translation management tools
import { setupAddTranslationsTool } from '../tools/add-translations.js';
import { setupAddContextualTranslationTool } from '../tools/add-contextual-translation.js';
import { setupUpdateTranslationTool } from '../tools/update-translation.js';

// Import individual code analysis tools
import { setupAnalyzeCodebaseTool } from '../tools/analyze-codebase.js';
import { setupSearchMissingTranslationsTool } from '../tools/search-missing-translations.js';
import { setupExtractToTranslationTool } from '../tools/extract-to-translation.js';
import { setupCleanupUnusedTranslationsTool } from '../tools/cleanup-unused-translations.js';

// Import individual file management tools
import { setupValidateStructureTool } from '../tools/validate-structure.js';
import { setupCheckTranslationIntegrityTool } from '../tools/check-translation-integrity.js';
import { setupReorganizeTranslationFilesTool } from '../tools/reorganize-translation-files.js';

// Import remaining individual tools
import { setupGenerateTypesTool } from '../tools/generate-types.js';
import { setupDeleteTranslationsTool } from '../tools/delete-translations.js';

export class MCPTools {
  constructor(
    private readonly index: TranslationIndex,
    private readonly config: Required<ServerConfig>,
    private readonly refresh?: () => Promise<void>
  ) {}

  /**
   * Register all tools with the MCP server using correct SDK format
   */
  registerTools(server: any): void {
    const refreshedTool = (name: string, description: string, schema: any, handler: any) => {
        const wrappedHandler = async (args: any) => {
            try {
                if (this.config.debug) {
                    console.error(`🔧 Tool "${name}" called with args:`, JSON.stringify(args, null, 2));
                }
                
                if (this.refresh) {
                    if (this.config.debug) {
                        console.error(`🔄 Refreshing memory for tool "${name}"`);
                    }
                    await this.refresh();
                }
                
                if (this.config.debug) {
                    console.error(`▶️  Executing tool "${name}"`);
                }
                
                const result = await handler(args);
                
                if (this.config.debug) {
                    console.error(`✅ Tool "${name}" completed successfully`);
                }
                
                return result;
            } catch (error) {
                console.error(`❌ Tool "${name}" failed with error:`, error instanceof Error ? error.message : String(error));
                if (error instanceof Error && error.stack) {
                    console.error('Stack trace:', error.stack);
                }
                
                // Return error response instead of throwing
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: `Tool "${name}" execution failed`,
                            details: error instanceof Error ? error.message : String(error),
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }]
                };
            }
        };
        server.tool(name, description, schema, wrappedHandler);
    };
    
    const refreshedServer = { ...server, tool: refreshedTool };

    // Search tools (read-only)
    setupSearchTranslationTool(server, this.index, this.config, this.refresh);
    setupGetTranslationSuggestionsTool(server, this.index, this.config, this.refresh);
    setupGetTranslationContextTool(server, this.index, this.config, this.refresh);
    setupExploreTranslationStructureTool(server, this.index, this.config, this.refresh);
    
    // Translation management tools (read-write)
    setupAddTranslationsTool(refreshedServer, this.index, this.config, this.refresh);
    setupAddContextualTranslationTool(refreshedServer, this.index, this.config, this.refresh);
    setupUpdateTranslationTool(refreshedServer, this.index, this.config, this.refresh);
    
    // Code analysis tools (mixed)
    setupAnalyzeCodebaseTool(server, this.index, this.config); // read-only
    setupSearchMissingTranslationsTool(server, this.index, this.config); // read-only
    setupExtractToTranslationTool(refreshedServer, this.index, this.config, this.refresh); // read-write
    setupCleanupUnusedTranslationsTool(refreshedServer, this.index, this.config, this.refresh); // read-write
    
    // File management tools (mixed)
    setupValidateStructureTool(refreshedServer, this.index, this.config); // read-write
    setupCheckTranslationIntegrityTool(refreshedServer, this.index, this.config); // read-only
    setupReorganizeTranslationFilesTool(refreshedServer, this.index, this.config); // read-write

    // Additional tools (mixed)
    setupDeleteTranslationsTool(refreshedServer, this.index, this.config, this.refresh); // read-write
    setupGenerateTypesTool(server, this.index, this.config); // read-only
    
    // Get server statistics tool
    refreshedServer.tool(
      'get_stats',
      'Get server and translation index statistics',
      {
        includeDetails: z.boolean().default(false).describe('Include detailed statistics'),
        searchKey: z.string().optional().describe('Search for a specific key in the index')
      },
      async ({ includeDetails, searchKey }: any) => {
        try {
          const indexStats = this.index.getStats();

          const stats = {
            server: {
              name: this.config.name,
              version: this.config.version,
              baseLanguage: this.config.baseLanguage,
              autoSync: this.config.autoSync
            },
            index: indexStats
          };

          if (searchKey) {
            const keyExists = this.index.has(searchKey);
            const keyValue = this.index.get(searchKey);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ...stats,
                  keySearch: {
                    searchKey,
                    exists: keyExists,
                    value: keyValue,
                    allKeys: this.index.getKeys().filter(k => k.includes(searchKey.split('.')[0])).slice(0, 20)
                  }
                }, null, 2)
              }]
            };
          }

          if (includeDetails) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ...stats,
                  details: {
                    allLanguages: this.index.getLanguages(),
                    sampleKeys: this.index.getKeys().slice(0, 20),
                    totalKeys: this.index.getKeys().length,
                    translationDir: this.config.translationDir
                  }
                }, null, 2)
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(stats, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error getting statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    );
  }
}
