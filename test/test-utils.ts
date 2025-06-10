/**
 * Test utilities and mocks for the i18n MCP server tests
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Mock MCP Server for testing
 */
export class MockMcpServer extends EventEmitter {
  public tools = new Map<string, any>();
  public resources = new Map<string, any>();
  public prompts = new Map<string, any>();
  
  constructor(public config: any, public capabilities: any) {
    super();
  }

  tool(name: string, schema: any, handler: any) {
    this.tools.set(name, { name, schema, handler });
    return this;
  }

  resource(uri: string, handler: any) {
    this.resources.set(uri, handler);
    return this;
  }

  prompt(name: string, schema: any, handler: any) {
    this.prompts.set(name, { name, schema, handler });
    return this;
  }

  async connect(transport: any) {
    this.emit('connect', transport);
    return Promise.resolve();
  }

  async callTool(name: string, args: any) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }
}

/**
 * Mock STDIO Transport for testing
 */
export class MockStdioTransport {
  public connected = false;
  
  async connect() {
    this.connected = true;
  }
  
  async disconnect() {
    this.connected = false;
  }
}

/**
 * Mock File System Watcher
 */
export class MockFileWatcher extends EventEmitter {
  public watching = false;
  public watchedPaths = new Set<string>();

  watch(path: string, options?: any) {
    this.watching = true;
    this.watchedPaths.add(path);
    return this;
  }

  close() {
    this.watching = false;
    this.watchedPaths.clear();
    return Promise.resolve();
  }

  // Simulate file events
  simulateFileAdd(path: string) {
    this.emit('add', path);
  }

  simulateFileChange(path: string) {
    this.emit('change', path);
  }

  simulateFileDelete(path: string) {
    this.emit('unlink', path);
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }
}

/**
 * Test data generators
 */
export class TestDataGenerator {
  /**
   * Generate a realistic translation structure
   */
  static generateTranslationData(options: {
    languages?: string[];
    categories?: number;
    itemsPerCategory?: number;
    includeNested?: boolean;
  } = {}) {
    const {
      languages = ['en', 'es', 'fr'],
      categories = 5,
      itemsPerCategory = 10,
      includeNested = true
    } = options;

    const translations: Record<string, any> = {};

    for (const lang of languages) {
      translations[lang] = {};

      // Common translations
      translations[lang].common = {
        buttons: {
          submit: this.getTranslation('Submit', lang),
          cancel: this.getTranslation('Cancel', lang),
          save: this.getTranslation('Save', lang),
          delete: this.getTranslation('Delete', lang)
        },
        messages: {
          success: this.getTranslation('Success!', lang),
          error: this.getTranslation('An error occurred', lang),
          loading: this.getTranslation('Loading...', lang)
        }
      };

      // Navigation
      translations[lang].navigation = {
        home: this.getTranslation('Home', lang),
        about: this.getTranslation('About', lang),
        contact: this.getTranslation('Contact', lang)
      };

      // Generated categories
      for (let category = 0; category < categories; category++) {
        const categoryName = `category${category}`;
        translations[lang][categoryName] = {};

        for (let item = 0; item < itemsPerCategory; item++) {
          const itemKey = `item${item}`;
          translations[lang][categoryName][itemKey] = this.getTranslation(`Item ${category}-${item}`, lang);

          if (includeNested) {
            translations[lang][categoryName][`${itemKey}_nested`] = {
              title: this.getTranslation(`Title for ${category}-${item}`, lang),
              description: this.getTranslation(`Description for ${category}-${item}`, lang)
            };
          }
        }
      }
    }

    return translations;
  }

  /**
   * Simple translation lookup (mock translations)
   */
  private static getTranslation(englishText: string, language: string): string {
    const translations: Record<string, Record<string, string>> = {
      en: {},
      es: {
        'Submit': 'Enviar',
        'Cancel': 'Cancelar',
        'Save': 'Guardar',
        'Delete': 'Eliminar',
        'Success!': '¡Éxito!',
        'An error occurred': 'Ocurrió un error',
        'Loading...': 'Cargando...',
        'Home': 'Inicio',
        'About': 'Acerca de',
        'Contact': 'Contacto'
      },
      fr: {
        'Submit': 'Soumettre',
        'Cancel': 'Annuler',
        'Save': 'Sauvegarder',
        'Delete': 'Supprimer',
        'Success!': 'Succès!',
        'An error occurred': 'Une erreur est survenue',
        'Loading...': 'Chargement...',
        'Home': 'Accueil',
        'About': 'À propos',
        'Contact': 'Contact'
      }
    };

    // Default patterns for generated content
    if (englishText.startsWith('Item ')) {
      const number = englishText.replace('Item ', '');
      return language === 'es' ? `Artículo ${number}` : 
             language === 'fr' ? `Article ${number}` : 
             englishText;
    }

    if (englishText.startsWith('Title for ')) {
      const number = englishText.replace('Title for ', '');
      return language === 'es' ? `Título para ${number}` : 
             language === 'fr' ? `Titre pour ${number}` : 
             englishText;
    }

    if (englishText.startsWith('Description for ')) {
      const number = englishText.replace('Description for ', '');
      return language === 'es' ? `Descripción para ${number}` : 
             language === 'fr' ? `Description pour ${number}` : 
             englishText;
    }

    return translations[language]?.[englishText] || englishText;
  }

  /**
   * Generate translation files for testing
   */
  static async generateTranslationFiles(
    directory: string, 
    options?: Parameters<typeof this.generateTranslationData>[0]
  ) {
    const data = this.generateTranslationData(options);
    
    for (const [language, translations] of Object.entries(data)) {
      const filePath = join(directory, `${language}.json`);
      await fs.writeFile(filePath, JSON.stringify(translations, null, 2));
    }

    return data;
  }

  /**
   * Generate a large dataset for performance testing
   */
  static generateLargeDataset(keyCount: number = 10000) {
    const data: Record<string, any> = {};
    
    for (let i = 0; i < keyCount; i++) {
      const category = Math.floor(i / 100);
      const item = i % 100;
      const keyPath = `category${category}.item${item}`;
      
      // Create nested structure
      if (!data[`category${category}`]) {
        data[`category${category}`] = {};
      }
      
      data[`category${category}`][`item${item}`] = {
        name: `Generated Item ${i}`,
        description: `Generated description for item ${i}`,
        metadata: {
          id: i,
          created: new Date().toISOString(),
          tags: [`tag${i % 10}`, `category${category}`]
        }
      };
    }

    return data;
  }
}

/**
 * Test environment helpers
 */
export class TestEnvironment {
  /**
   * Create a temporary translation project structure
   */
  static async createTranslationProject(baseDir: string) {
    const projectDir = join(baseDir, 'test-project');
    const localesDir = join(projectDir, 'locales');
    const srcDir = join(projectDir, 'src');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(localesDir, { recursive: true });
    await fs.mkdir(srcDir, { recursive: true });

    // Generate translation files
    await TestDataGenerator.generateTranslationFiles(localesDir, {
      languages: ['en', 'es', 'fr'],
      categories: 3,
      itemsPerCategory: 5
    });

    // Create some mock source files
    const sourceFiles = [
      {
        path: join(srcDir, 'App.tsx'),
        content: `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('common.buttons.submit')}</h1>
      <p>{t('navigation.home')}</p>
      <button>{t('common.buttons.save')}</button>
    </div>
  );
}
        `
      },
      {
        path: join(srcDir, 'Login.vue'),
        content: `
<template>
  <div>
    <h2>{{ $t('auth.login.title') }}</h2>
    <form>
      <button type="submit">{{ $t('common.buttons.submit') }}</button>
      <button type="button">{{ $t('common.buttons.cancel') }}</button>
    </form>
  </div>
</template>
        `
      }
    ];

    for (const file of sourceFiles) {
      await fs.writeFile(file.path, file.content);
    }

    return {
      projectDir,
      localesDir,
      srcDir,
      files: {
        translations: ['en.json', 'es.json', 'fr.json'].map(f => join(localesDir, f)),
        source: sourceFiles.map(f => f.path)
      }
    };
  }

  /**
   * Clean up test environment
   */
  static async cleanup(projectDir: string) {
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Mock implementations for dependencies
 */
export const mockImplementations = {
  /**
   * Mock the MCP SDK
   */
  mockMcpSdk() {
    vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: MockMcpServer
    }));

    vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
      StdioServerTransport: MockStdioTransport
    }));
  },

  /**
   * Mock chokidar file watcher
   */
  mockChokidar() {
    vi.mock('chokidar', () => ({
      default: {
        watch: vi.fn().mockImplementation(() => new MockFileWatcher())
      }
    }));
  },

  /**
   * Mock file system operations
   */
  mockFileSystem() {
    const mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      rm: vi.fn(),
      unlink: vi.fn()
    };

    vi.mock('fs', () => ({
      promises: mockFs
    }));

    return mockFs;
  },

  /**
   * Mock process methods
   */
  mockProcess() {
    const mockExit = vi.fn().mockImplementation((code) => {
      throw new Error(`Process exit called with code: ${code}`);
    });

    const originalProcess = process;
    
    Object.defineProperty(process, 'exit', {
      value: mockExit,
      writable: true
    });

    return {
      mockExit,
      restore: () => {
        Object.defineProperty(process, 'exit', {
          value: originalProcess.exit,
          writable: true
        });
      }
    };
  }
};

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of a function
   */
  static async measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; time: number }> {
    const start = performance.now();
    const result = await fn();
    const time = performance.now() - start;
    return { result, time };
  }

  /**
   * Run a function multiple times and get statistics
   */
  static async benchmark<T>(
    fn: () => Promise<T> | T,
    iterations: number = 100
  ): Promise<{
    results: T[];
    times: number[];
    averageTime: number;
    minTime: number;
    maxTime: number;
    medianTime: number;
  }> {
    const results: T[] = [];
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, time } = await this.measureTime(fn);
      results.push(result);
      times.push(time);
    }

    times.sort((a, b) => a - b);

    return {
      results,
      times,
      averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      minTime: times[0],
      maxTime: times[times.length - 1],
      medianTime: times[Math.floor(times.length / 2)]
    };
  }

  /**
   * Check if performance meets expectations
   */
  static expectPerformance(
    actualTime: number,
    maxExpectedTime: number,
    operation: string
  ) {
    if (actualTime > maxExpectedTime) {
      throw new Error(
        `Performance expectation failed for ${operation}: ` +
        `expected <= ${maxExpectedTime}ms, got ${actualTime.toFixed(2)}ms`
      );
    }
  }
}

/**
 * Async test utilities
 */
export class AsyncTestUtils {
  /**
   * Wait for an event to be emitted
   */
  static waitForEvent<T = any>(
    emitter: EventEmitter,
    event: string,
    timeout: number = 5000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      emitter.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /**
   * Wait for multiple events
   */
  static async waitForEvents(
    emitter: EventEmitter,
    events: string[],
    timeout: number = 5000
  ): Promise<any[]> {
    const promises = events.map(event => this.waitForEvent(emitter, event, timeout));
    return Promise.all(promises);
  }

  /**
   * Wait for a condition to be true
   */
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Retry an operation until it succeeds or timeout
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}

/**
 * Assertion utilities for testing
 */
export class AssertionUtils {
  /**
   * Assert that an object has the expected structure
   */
  static assertStructure(obj: any, expectedStructure: any, path: string = 'root') {
    if (typeof expectedStructure === 'object' && expectedStructure !== null && !Array.isArray(expectedStructure)) {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        throw new Error(`Expected object at ${path}, got ${typeof obj}`);
      }

      for (const [key, expectedValue] of Object.entries(expectedStructure)) {
        const currentPath = `${path}.${key}`;
        if (!(key in obj)) {
          throw new Error(`Missing property ${currentPath}`);
        }
        this.assertStructure(obj[key], expectedValue, currentPath);
      }
    } else if (Array.isArray(expectedStructure)) {
      if (!Array.isArray(obj)) {
        throw new Error(`Expected array at ${path}, got ${typeof obj}`);
      }
      // For arrays, just check that obj is an array; specific content checking can be done separately
    } else {
      // For primitive types, check the type
      if (typeof obj !== typeof expectedStructure) {
        throw new Error(`Type mismatch at ${path}: expected ${typeof expectedStructure}, got ${typeof obj}`);
      }
    }
  }

  /**
   * Assert that all items in an array have the same structure
   */
  static assertArrayItemsStructure<T>(items: T[], expectedItemStructure: any) {
    if (!Array.isArray(items)) {
      throw new Error('Expected array');
    }

    items.forEach((item, index) => {
      this.assertStructure(item, expectedItemStructure, `item[${index}]`);
    });
  }

  /**
   * Assert that a value is within an expected range
   */
  static assertInRange(value: number, min: number, max: number, message?: string) {
    if (value < min || value > max) {
      throw new Error(
        message || `Value ${value} is not within range [${min}, ${max}]`
      );
    }
  }

  /**
   * Assert that an async operation completes within expected time
   */
  static async assertExecutionTime<T>(
    operation: () => Promise<T>,
    maxTime: number,
    operationName: string = 'operation'
  ): Promise<T> {
    const { result, time } = await PerformanceTestUtils.measureTime(operation);
    
    if (time > maxTime) {
      throw new Error(
        `${operationName} took too long: ${time.toFixed(2)}ms (max: ${maxTime}ms)`
      );
    }
    
    return result;
  }
}

// Export everything
export default {
  MockMcpServer,
  MockStdioTransport,
  MockFileWatcher,
  TestDataGenerator,
  TestEnvironment,
  mockImplementations,
  PerformanceTestUtils,
  AsyncTestUtils,
  AssertionUtils
};
