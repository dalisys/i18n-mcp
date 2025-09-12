/**
 * Global error handlers for MCP server
 */

export class GlobalErrorHandler {
  private static globalHandlersInstalled = false;

  /**
   * Setup global error handlers to prevent unexpected exits
   */
  static setupGlobalErrorHandlers(debug: boolean = false): void {
    // Only install global handlers once to prevent listener leaks
    if (GlobalErrorHandler.globalHandlersInstalled) {
      if (debug) {
        console.error('🛡️  Global error handlers already installed, skipping');
      }
      return;
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      console.error('🚨 UNCAUGHT EXCEPTION - MCP Server will attempt to continue:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('This indicates a programming error that should be fixed.');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error('🚨 UNHANDLED PROMISE REJECTION - MCP Server will attempt to continue:');
      console.error('Reason:', reason);
      console.error('Promise:', promise);
      if (reason instanceof Error) {
        console.error('Stack:', reason.stack);
      }
      console.error('This indicates a missing .catch() or async/await error handling.');
    });

    // Handle process warnings
    process.on('warning', (warning: Error) => {
      console.error('⚠️  Process Warning:', warning.name, warning.message);
    });

    GlobalErrorHandler.globalHandlersInstalled = true;

    if (debug) {
      console.error('🛡️  Global error handlers installed');
    }
  }
}