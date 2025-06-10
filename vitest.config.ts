import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test files patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'build'],
    
    // Global test setup
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test/**',
        '**/tests/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Parallel execution
    maxConcurrency: 5,
    
    // Watch options
    watch: {
      exclude: ['node_modules', 'dist']
    },
    
    // Reporter
    reporter: ['verbose', 'json'],
    
    // Setup files
    setupFiles: ['./test/setup.ts']
  },
  
  // Resolve configuration for imports
  resolve: {
    alias: {
      '@': './src',
      '@test': './test'
    }
  }
});
