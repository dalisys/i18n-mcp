/**
 * Global test setup for Vitest
 */

import { beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

// Global test configuration
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.I18N_MCP_DEBUG = 'false';
  
  // Create temporary test directories
  const tempDir = join(process.cwd(), 'test', 'temp');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  
  // Mock console methods to reduce test output noise (unless debugging)
  if (!process.env.TEST_DEBUG) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  }
});

afterAll(async () => {
  // Clean up temporary test directories
  const tempDir = join(process.cwd(), 'test', 'temp');
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
  
  // Restore all mocks
  vi.restoreAllMocks();
});

// Global test utilities
declare global {
  var testUtils: {
    createTempDir: () => Promise<string>;
    cleanupTempDir: (dir: string) => Promise<void>;
    createTestTranslationFiles: (dir: string) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
  };
}

globalThis.testUtils = {
  async createTempDir(): Promise<string> {
    const tempDir = join(process.cwd(), 'test', 'temp', `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  },

  async cleanupTempDir(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  },

  async createTestTranslationFiles(dir: string): Promise<void> {
    const translations = {
      en: {
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel',
            save: 'Save'
          },
          messages: {
            success: 'Success!',
            error: 'Error occurred'
          }
        },
        auth: {
          login: {
            title: 'Login',
            subtitle: 'Please sign in'
          }
        }
      },
      es: {
        common: {
          buttons: {
            submit: 'Enviar',
            cancel: 'Cancelar',
            save: 'Guardar'
          },
          messages: {
            success: '¡Éxito!',
            error: 'Ocurrió un error'
          }
        },
        auth: {
          login: {
            title: 'Iniciar sesión',
            subtitle: 'Por favor inicia sesión'
          }
        }
      },
      fr: {
        common: {
          buttons: {
            submit: 'Soumettre',
            cancel: 'Annuler'
          },
          messages: {
            success: 'Succès!',
            error: 'Une erreur est survenue'
          }
        }
      }
    };

    for (const [lang, content] of Object.entries(translations)) {
      await fs.writeFile(
        join(dir, `${lang}.json`),
        JSON.stringify(content, null, 2),
        'utf8'
      );
    }
  },

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

export {};
