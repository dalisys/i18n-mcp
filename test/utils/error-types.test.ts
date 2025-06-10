/**
 * Tests for error handling and custom error types
 */

import { describe, it, expect } from 'vitest';
import { 
  TranslationError, 
  ValidationError, 
  FileWatchError, 
  IndexError 
} from '../../src/types/translation.js';

describe('Error Types', () => {
  describe('TranslationError', () => {
    it('should create error with message and code', () => {
      const error = new TranslationError('Test error', 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('TranslationError');
      expect(error.details).toBeUndefined();
      expect(error instanceof Error).toBe(true);
      expect(error instanceof TranslationError).toBe(true);
    });

    it('should create error with details', () => {
      const details = { key: 'value', number: 42 };
      const error = new TranslationError('Test error', 'TEST_ERROR', details);
      
      expect(error.details).toEqual(details);
    });

    it('should have proper stack trace', () => {
      const error = new TranslationError('Test error', 'TEST_ERROR');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TranslationError');
    });

    it('should be serializable to JSON', () => {
      const error = new TranslationError('Test error', 'TEST_ERROR', { extra: 'data' });
      
      const serialized = JSON.stringify(error);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.message).toBe('Test error');
      expect(parsed.code).toBe('TEST_ERROR');
      expect(parsed.details).toEqual({ extra: 'data' });
    });
  });

  describe('ValidationError', () => {
    it('should inherit from TranslationError', () => {
      const error = new ValidationError('Validation failed');
      
      expect(error instanceof TranslationError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create validation error with details', () => {
      const details = { 
        missingKeys: ['key1', 'key2'],
        invalidValues: ['key3']
      };
      const error = new ValidationError('Structure validation failed', details);
      
      expect(error.message).toBe('Structure validation failed');
      expect(error.details).toEqual(details);
    });

    it('should be distinguishable from other error types', () => {
      const validationError = new ValidationError('Validation failed');
      const translationError = new TranslationError('Generic error', 'GENERIC');
      
      expect(validationError instanceof ValidationError).toBe(true);
      expect(translationError instanceof ValidationError).toBe(false);
    });
  });

  describe('FileWatchError', () => {
    it('should inherit from TranslationError', () => {
      const error = new FileWatchError('File watch failed');
      
      expect(error instanceof TranslationError).toBe(true);
      expect(error instanceof FileWatchError).toBe(true);
      expect(error.name).toBe('FileWatchError');
      expect(error.code).toBe('FILE_WATCH_ERROR');
    });

    it('should create file watch error with details', () => {
      const details = { 
        filePath: '/path/to/file.json',
        operation: 'read',
        originalError: new Error('ENOENT')
      };
      const error = new FileWatchError('Failed to read file', details);
      
      expect(error.details).toEqual(details);
    });

    it('should handle nested error objects', () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      
      const details = { originalError };
      const error = new FileWatchError('Wrapped error', details);
      
      expect(error.details.originalError).toBe(originalError);
      expect(error.details.originalError.message).toBe('Original error');
    });
  });

  describe('IndexError', () => {
    it('should inherit from TranslationError', () => {
      const error = new IndexError('Index operation failed');
      
      expect(error instanceof TranslationError).toBe(true);
      expect(error instanceof IndexError).toBe(true);
      expect(error.name).toBe('IndexError');
      expect(error.code).toBe('INDEX_ERROR');
    });

    it('should create index error with operation details', () => {
      const details = {
        operation: 'set',
        keyPath: 'invalid..key',
        language: 'en',
        reason: 'Invalid key path format'
      };
      const error = new IndexError('Invalid key path', details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('Error Inheritance Chain', () => {
    it('should maintain proper inheritance hierarchy', () => {
      const errors = [
        new ValidationError('Validation'),
        new FileWatchError('File watch'),
        new IndexError('Index')
      ];

      for (const error of errors) {
        expect(error instanceof Error).toBe(true);
        expect(error instanceof TranslationError).toBe(true);
        expect(error.code).toBeDefined();
        expect(error.name).toBeDefined();
      }
    });

    it('should allow instanceof checks for error handling', () => {
      function handleError(error: Error) {
        if (error instanceof ValidationError) {
          return 'validation';
        } else if (error instanceof FileWatchError) {
          return 'file_watch';
        } else if (error instanceof IndexError) {
          return 'index';
        } else if (error instanceof TranslationError) {
          return 'translation';
        } else {
          return 'unknown';
        }
      }

      expect(handleError(new ValidationError('test'))).toBe('validation');
      expect(handleError(new FileWatchError('test'))).toBe('file_watch');
      expect(handleError(new IndexError('test'))).toBe('index');
      expect(handleError(new TranslationError('test', 'TEST'))).toBe('translation');
      expect(handleError(new Error('test'))).toBe('unknown');
    });
  });

  describe('Error Message Formatting', () => {
    it('should create meaningful error messages', () => {
      const validationError = new ValidationError(
        'Structure validation failed', 
        { missingKeys: ['key1', 'key2'] }
      );
      
      expect(validationError.message).toContain('Structure validation failed');
      
      const fileError = new FileWatchError(
        'Failed to process file /path/to/file.json',
        { filePath: '/path/to/file.json' }
      );
      
      expect(fileError.message).toContain('/path/to/file.json');
    });

    it('should handle undefined details gracefully', () => {
      const error = new TranslationError('Simple error', 'SIMPLE');
      
      expect(error.details).toBeUndefined();
      expect(() => JSON.stringify(error)).not.toThrow();
    });

    it('should handle complex details objects', () => {
      const complexDetails = {
        nested: {
          array: [1, 2, 3],
          object: { a: 'b' }
        },
        date: new Date('2023-01-01'),
        regexp: /test/g,
        function: () => 'test'
      };
      
      const error = new TranslationError('Complex error', 'COMPLEX', complexDetails);
      
      expect(error.details).toEqual(complexDetails);
      
      // JSON serialization should handle non-serializable parts gracefully
      expect(() => JSON.stringify(error)).not.toThrow();
    });
  });

  describe('Error Propagation', () => {
    it('should preserve error information when rethrowing', () => {
      function innerFunction() {
        throw new IndexError('Inner error', { level: 'inner' });
      }

      function outerFunction() {
        try {
          innerFunction();
        } catch (error) {
          if (error instanceof IndexError) {
            throw new ValidationError('Outer error', { 
              innerError: error,
              level: 'outer'
            });
          }
          throw error;
        }
      }

      expect(() => outerFunction()).toThrow(ValidationError);

      try {
        outerFunction();
      } catch (error) {
        if (error instanceof ValidationError) {
          expect(error.details.innerError).toBeInstanceOf(IndexError);
          expect(error.details.innerError.message).toBe('Inner error');
          expect(error.details.innerError.details.level).toBe('inner');
          expect(error.details.level).toBe('outer');
        }
      }
    });

    it('should allow error chaining for debugging', () => {
      const originalError = new Error('Root cause');
      const indexError = new IndexError('Index operation failed', { originalError });
      const validationError = new ValidationError('Validation failed', { indexError });

      expect(validationError.details.indexError).toBe(indexError);
      expect(validationError.details.indexError.details.originalError).toBe(originalError);
    });
  });

  describe('Error Logging and Debugging', () => {
    it('should provide useful toString representation', () => {
      const error = new ValidationError('Test validation error', { 
        keyPath: 'test.key',
        expectedType: 'string',
        actualType: 'number'
      });

      const stringRepresentation = error.toString();
      expect(stringRepresentation).toContain('ValidationError');
      expect(stringRepresentation).toContain('Test validation error');
    });

    it('should include stack trace information', () => {
      function createError() {
        return new IndexError('Stack trace test');
      }

      const error = createError();
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('createError');
      expect(error.stack).toContain('IndexError');
    });
  });

  describe('Type Guards', () => {
    function isTranslationError(error: unknown): error is TranslationError {
      return error instanceof TranslationError;
    }

    function isValidationError(error: unknown): error is ValidationError {
      return error instanceof ValidationError;
    }

    it('should work with type guards', () => {
      const errors: unknown[] = [
        new Error('Regular error'),
        new TranslationError('Translation error', 'TRANSLATION'),
        new ValidationError('Validation error'),
        'Not an error',
        null,
        undefined
      ];

      const translationErrors = errors.filter(isTranslationError);
      const validationErrors = errors.filter(isValidationError);

      expect(translationErrors).toHaveLength(2); // TranslationError and ValidationError
      expect(validationErrors).toHaveLength(1); // Only ValidationError
    });
  });

  describe('Error Context', () => {
    it('should preserve contextual information for debugging', () => {
      const context = {
        operation: 'updateTranslation',
        keyPath: 'common.buttons.submit',
        language: 'es',
        oldValue: 'Enviar',
        newValue: 'Submitir',
        timestamp: new Date().toISOString(),
        userId: 'user123'
      };

      const error = new ValidationError('Translation update failed', context);

      expect(error.details).toEqual(context);
      expect(error.details.operation).toBe('updateTranslation');
      expect(error.details.keyPath).toBe('common.buttons.submit');
      expect(error.details.language).toBe('es');
    });

    it('should handle circular references in details', () => {
      const details: any = { name: 'test' };
      details.self = details; // Create circular reference

      const error = new TranslationError('Circular test', 'CIRCULAR', details);

      expect(error.details).toBe(details);
      expect(error.details.self).toBe(details);

      // JSON.stringify should handle circular references gracefully
      // (might throw or use a replacer function in real implementation)
      expect(() => {
        try {
          JSON.stringify(error);
        } catch (e) {
          // Expected for circular references
          expect(e.message).toContain('circular');
        }
      }).not.toThrow();
    });
  });
});
