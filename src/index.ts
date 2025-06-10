#!/usr/bin/env node

/**
 * i18n MCP Server - Entry point for MCP clients
 */

import { TranslationMCPServer } from './server/mcp-server.js';
import { ServerConfig } from './types/translation.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Parse command line arguments for MCP client usage
 */
function parseArgs(): Partial<ServerConfig> {
  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--dir':
      case '-d':
        if (nextArg && !nextArg.startsWith('-')) {
          config.translationDir = nextArg;
          i++;
        }
        break;
      
      case '--base-language':
      case '-b':
        if (nextArg && !nextArg.startsWith('-')) {
          config.baseLanguage = nextArg;
          i++;
        }
        break;
      
      case '--debug':
        config.debug = true;
        break;
      
      case '--name':
      case '-n':
        if (nextArg && !nextArg.startsWith('-')) {
          config.name = nextArg;
          i++;
        }
        break;
      
      case '--version':
      case '-v':
        if (nextArg && !nextArg.startsWith('-')) {
          config.version = nextArg;
          i++;
        }
        break;

      case '--src-dir':
        if (nextArg && !nextArg.startsWith('-')) {
          config.srcDir = nextArg;
          i++;
        }
        break;

      case '--exclude':
        if (nextArg && !nextArg.startsWith('-')) {
          config.exclude = nextArg.split(',').map(p => p.trim());
          i++;
        }
        break;

      case '--auto-sync':
        config.autoSync = true;
        break;

      case '--generate-types':
        if (nextArg && !nextArg.startsWith('-')) {
          config.generateTypes = nextArg;
          i++;
        }
        break;

      case '--watch-code':
        config.watchCode = true;
        break;

      case '--project-root':
        if (nextArg && !nextArg.startsWith('-')) {
          config.projectRoot = nextArg;
          i++;
        }
        break;

      case '--frameworks':
        if (nextArg && !nextArg.startsWith('-')) {
          config.frameworks = nextArg.split(',').map(f => f.trim());
          i++;
        }
        break;

      case '--key-style':
        if (nextArg && !nextArg.startsWith('-')) {
          const validStyles = ['nested', 'flat', 'camelCase', 'kebab-case'];
          if (validStyles.includes(nextArg)) {
            config.keyStyle = nextArg as any;
          }
          i++;
        }
        break;
      
      default:
        // Assume it's a directory path if no flag is provided
        if (arg && !arg.startsWith('-') && !config.translationDir) {
          config.translationDir = arg;
        }
        break;
    }
  }

  return config;
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {};

  if (process.env.I18N_MCP_DIR) {
    config.translationDir = process.env.I18N_MCP_DIR;
  }
  if (process.env.I18N_MCP_BASE_LANGUAGE) {
    config.baseLanguage = process.env.I18N_MCP_BASE_LANGUAGE;
  }
  if (process.env.I18N_MCP_DEBUG) {
    config.debug = process.env.I18N_MCP_DEBUG.toLowerCase() === 'true';
  }
  if (process.env.I18N_MCP_SRC_DIR) {
    config.srcDir = process.env.I18N_MCP_SRC_DIR;
  }
  if (process.env.I18N_MCP_AUTO_SYNC) {
    config.autoSync = process.env.I18N_MCP_AUTO_SYNC.toLowerCase() === 'true';
  }
  if (process.env.I18N_MCP_EXCLUDE) {
    config.exclude = process.env.I18N_MCP_EXCLUDE.split(',').map(p => p.trim());
  }
  if (process.env.I18N_MCP_GENERATE_TYPES) {
    config.generateTypes = process.env.I18N_MCP_GENERATE_TYPES;
  }
  if (process.env.I18N_MCP_WATCH_CODE) {
    config.watchCode = process.env.I18N_MCP_WATCH_CODE.toLowerCase() === 'true';
  }
  if (process.env.I18N_MCP_PROJECT_ROOT) {
    config.projectRoot = process.env.I18N_MCP_PROJECT_ROOT;
  }
  if (process.env.I18N_MCP_FRAMEWORKS) {
    config.frameworks = process.env.I18N_MCP_FRAMEWORKS.split(',').map(f => f.trim());
  }
  if (process.env.I18N_MCP_KEY_STYLE) {
    const validStyles = ['nested', 'flat', 'camelCase', 'kebab-case'];
    if (validStyles.includes(process.env.I18N_MCP_KEY_STYLE)) {
      config.keyStyle = process.env.I18N_MCP_KEY_STYLE as any;
    }
  }

  return config;
}

/**
 * Main function - starts MCP server with configuration from args/env
 */
async function main(): Promise<void> {
  try {
    // Removed plain text debug log to avoid JSON parsing errors
    
    // Merge environment and argument configuration
    const envConfig = loadEnvConfig();
    const argsConfig = parseArgs();
    
    const config: ServerConfig = {
      name: 'i18n-mcp',
      version: '1.0.0',
      translationDir: './locales',
      baseLanguage: 'en',
      debug: false,
      ...envConfig,
      ...argsConfig
    } as ServerConfig;

    // Validate required translationDir
    if (!config.translationDir) {
      console.warn(JSON.stringify({
        jsonrpc: "2.0",
        method: "notification",
        params: {
          type: "warning",
          message: 'Error: Translation directory is required. Use --dir or I18N_MCP_DIR'
        }
      }));
      process.exit(1);
    }

    // Create and start server
    const server = new TranslationMCPServer(config);
    await server.start();
    
  } catch (error) {
    console.error(JSON.stringify({
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "error",
        message: 'Failed to start server',
        error: error
      }
    }));
    process.exit(1);
  }

  process.on('uncaughtException', (error) => {
    console.error(JSON.stringify({
      jsonrpc: "2.0",
      method: "notification",
      params: {
        type: "error",
        message: "Fatal error",
        error: error
      }
    }));
    process.exit(1);
  });
}

// Run when executed directly
let isMainModule = false;
if (process.argv[1]) {
  const resolvedPath = resolve(process.argv[1]);
  const currentModulePath = fileURLToPath(import.meta.url);
  isMainModule = currentModulePath === resolvedPath;
}

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for library usage
export { TranslationMCPServer };
export * from './types/translation.js';
export * from './core/translation-index.js';
export * from './core/file-watcher.js';
