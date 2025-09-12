#!/usr/bin/env node

/**
 * Standalone bundled version of i18n MCP Server for better npx compatibility
 * This file bundles all dependencies to avoid module resolution issues
 */

console.error(JSON.stringify({
  jsonrpc: "2.0",
  method: "notification", 
  params: {
    type: "info",
    message: "Starting i18n-mcp standalone server..."
  }
}));

// Import and run the main server
import('./dist/index.js').then(async (module) => {
  // The module will auto-execute if it detects it's the main module
}).catch((error) => {
  console.error(JSON.stringify({
    jsonrpc: "2.0",
    method: "notification",
    params: {
      type: "error", 
      message: "Failed to load i18n-mcp server",
      error: error.message
    }
  }));
  process.exit(1);
});