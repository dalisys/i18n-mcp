/**
 * Unit tests for JsonOperations utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonOperations } from '../../src/utils/json-operations.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('JsonOperations', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await globalThis.testUtils.createTempDir();
  });

  afterEach(async () => {
    await globalThis.testUtils.cleanupTempDir(tempDir);
  });

  describe('parseFile', () => {
    it('should parse valid JSON files', async () => {
      const testData = { test: 'value', nested: { key: 42 } };
      const filePath = join(tempDir, 'test.json');
      await fs.writeFile(filePath, JSON.stringify(testData), 'utf8');

      const result = await JsonOperations.parseFile(filePath);

      expect(result.data).toEqual(testData);
      expect(result.filePath).toBe(filePath);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(result.timestamp).toBeTypeOf('number');
    });

    it('should throw error for invalid JSON', async () => {
      const filePath = join(tempDir, 'invalid.json');
      await fs.writeFile(filePath, '{ invalid json }', 'utf8');

      await expect(JsonOperations.parseFile(filePath)).rejects.toThrow(/Failed to parse JSON file/);
    });

    it('should throw error for non-existent files', async () => {
      const filePath = join(tempDir, 'nonexistent.json');

      await expect(JsonOperations.parseFile(filePath)).rejects.toThrow(/Failed to parse JSON file/);
    });
  });

  describe('writeFile', () => {
    it('should write JSON data to file with proper formatting', async () => {
      const testData = { test: 'value', nested: { key: 42 } };
      const filePath = join(tempDir, 'output.json');

      await JsonOperations.writeFile(filePath, testData);

      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual(testData);
      expect(content).toContain('  '); // Should be formatted with indentation
    });

    it('should write with custom indentation', async () => {
      const testData = { test: 'value' };
      const filePath = join(tempDir, 'output.json');

      await JsonOperations.writeFile(filePath, testData, 4);

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('    '); // 4-space indentation
    });
  });

  describe('getValue', () => {
    const testObj = {
      common: {
        buttons: {
          submit: 'Submit',
          cancel: 'Cancel'
        },
        messages: {
          success: 'Success!'
        }
      },
      auth: {
        login: {
          title: 'Login'
        }
      }
    };

    it('should get nested values using dot notation', () => {
      expect(JsonOperations.getValue(testObj, 'common.buttons.submit')).toBe('Submit');
      expect(JsonOperations.getValue(testObj, 'common.buttons.cancel')).toBe('Cancel');
      expect(JsonOperations.getValue(testObj, 'auth.login.title')).toBe('Login');
      expect(JsonOperations.getValue(testObj, 'common.messages.success')).toBe('Success!');
    });

    it('should get intermediate objects', () => {
      const result = JsonOperations.getValue(testObj, 'common.buttons');
      expect(result).toEqual({ submit: 'Submit', cancel: 'Cancel' });
    });

    it('should return undefined for non-existent paths', () => {
      expect(JsonOperations.getValue(testObj, 'nonexistent.path')).toBeUndefined();
      expect(JsonOperations.getValue(testObj, 'common.buttons.nonexistent')).toBeUndefined();
      expect(JsonOperations.getValue(testObj, 'common.nonexistent.path')).toBeUndefined();
    });

    it('should handle edge cases', () => {
      expect(JsonOperations.getValue(null, 'path')).toBeUndefined();
      expect(JsonOperations.getValue(undefined, 'path')).toBeUndefined();
      expect(JsonOperations.getValue({}, 'path')).toBeUndefined();
      expect(JsonOperations.getValue(testObj, '')).toEqual(testObj);
    });
  });

  describe('setValue', () => {
    it('should set nested values using dot notation', () => {
      const obj = {};
      
      JsonOperations.setValue(obj, 'common.buttons.submit', 'Submit');
      JsonOperations.setValue(obj, 'common.buttons.cancel', 'Cancel');
      JsonOperations.setValue(obj, 'auth.login.title', 'Login');

      expect(obj).toEqual({
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel'
          }
        },
        auth: {
          login: {
            title: 'Login'
          }
        }
      });
    });

    it('should overwrite existing values', () => {
      const obj = { common: { buttons: { submit: 'Old Value' } } };
      
      JsonOperations.setValue(obj, 'common.buttons.submit', 'New Value');
      
      expect(JsonOperations.getValue(obj, 'common.buttons.submit')).toBe('New Value');
    });

    it('should create intermediate objects as needed', () => {
      const obj = {};
      
      JsonOperations.setValue(obj, 'deep.nested.path.value', 'test');
      
      expect(JsonOperations.getValue(obj, 'deep.nested.path.value')).toBe('test');
    });

    it('should handle edge cases', () => {
      let obj = null;
      obj = JsonOperations.setValue(obj, 'test.path', 'value');
      expect(JsonOperations.getValue(obj, 'test.path')).toBe('value');
    });
  });

  describe('deleteValue', () => {
    let testObj: any;

    beforeEach(() => {
      testObj = {
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel'
          },
          messages: {
            success: 'Success!'
          }
        }
      };
    });

    it('should delete existing values', () => {
      expect(JsonOperations.deleteValue(testObj, 'common.buttons.submit')).toBe(true);
      expect(JsonOperations.getValue(testObj, 'common.buttons.submit')).toBeUndefined();
      expect(JsonOperations.getValue(testObj, 'common.buttons.cancel')).toBe('Cancel'); // Should not affect other values
    });

    it('should return false for non-existent paths', () => {
      expect(JsonOperations.deleteValue(testObj, 'nonexistent.path')).toBe(false);
      expect(JsonOperations.deleteValue(testObj, 'common.nonexistent')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(JsonOperations.deleteValue(null, 'path')).toBe(false);
      expect(JsonOperations.deleteValue({}, 'path')).toBe(false);
    });
  });

  describe('hasPath', () => {
    const testObj = {
      common: {
        buttons: {
          submit: 'Submit',
          cancel: null
        }
      }
    };

    it('should correctly identify existing paths', () => {
      expect(JsonOperations.hasPath(testObj, 'common')).toBe(true);
      expect(JsonOperations.hasPath(testObj, 'common.buttons')).toBe(true);
      expect(JsonOperations.hasPath(testObj, 'common.buttons.submit')).toBe(true);
      expect(JsonOperations.hasPath(testObj, 'common.buttons.cancel')).toBe(true); // null values still count as existing
    });

    it('should return false for non-existent paths', () => {
      expect(JsonOperations.hasPath(testObj, 'nonexistent')).toBe(false);
      expect(JsonOperations.hasPath(testObj, 'common.nonexistent')).toBe(false);
      expect(JsonOperations.hasPath(testObj, 'common.buttons.nonexistent')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(JsonOperations.hasPath(null, 'path')).toBe(false);
      expect(JsonOperations.hasPath({}, 'path')).toBe(false);
    });
  });

  describe('getAllPaths', () => {
    const testObj = {
      common: {
        buttons: {
          submit: 'Submit',
          cancel: 'Cancel'
        },
        message: 'Hello'
      },
      auth: {
        title: 'Login'
      },
      simple: 'value'
    };

    it('should return all leaf paths', () => {
      const paths = JsonOperations.getAllPaths(testObj);
      
      expect(paths).toContain('common.buttons.submit');
      expect(paths).toContain('common.buttons.cancel');
      expect(paths).toContain('common.message');
      expect(paths).toContain('auth.title');
      expect(paths).toContain('simple');
      expect(paths).toHaveLength(5);
    });

    it('should handle empty objects', () => {
      expect(JsonOperations.getAllPaths({})).toEqual([]);
    });

    it('should handle arrays as leaf values', () => {
      const obj = { list: [1, 2, 3], nested: { array: ['a', 'b'] } };
      const paths = JsonOperations.getAllPaths(obj);
      
      expect(paths).toContain('list');
      expect(paths).toContain('nested.array');
      expect(paths).toHaveLength(2);
    });

    it('should work with prefix', () => {
      const paths = JsonOperations.getAllPaths(testObj.common, 'prefix');
      
      expect(paths).toContain('prefix.buttons.submit');
      expect(paths).toContain('prefix.buttons.cancel');
      expect(paths).toContain('prefix.message');
    });
  });

  describe('deepClone', () => {
    it('should create deep copies of objects', () => {
      const original = {
        simple: 'value',
        nested: {
          array: [1, 2, { inner: 'test' }],
          date: new Date('2023-01-01'),
          obj: { key: 'value' }
        }
      };

      const cloned = JsonOperations.deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.nested).not.toBe(original.nested);
      expect(cloned.nested.array).not.toBe(original.nested.array);
      expect(cloned.nested.obj).not.toBe(original.nested.obj);
    });

    it('should handle primitive values', () => {
      expect(JsonOperations.deepClone(42)).toBe(42);
      expect(JsonOperations.deepClone('string')).toBe('string');
      expect(JsonOperations.deepClone(true)).toBe(true);
      expect(JsonOperations.deepClone(null)).toBe(null);
      expect(JsonOperations.deepClone(undefined)).toBe(undefined);
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01');
      const cloned = JsonOperations.deepClone(date);
      
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
      expect(cloned instanceof Date).toBe(true);
    });
  });

  describe('deepEqual', () => {
    it('should correctly compare identical objects', () => {
      const obj1 = {
        simple: 'value',
        nested: {
          array: [1, 2, 3],
          obj: { key: 'value' }
        }
      };
      const obj2 = {
        simple: 'value',
        nested: {
          array: [1, 2, 3],
          obj: { key: 'value' }
        }
      };

      expect(JsonOperations.deepEqual(obj1, obj2)).toBe(true);
    });

    it('should correctly identify differences', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1, b: { c: 3 } };

      expect(JsonOperations.deepEqual(obj1, obj2)).toBe(false);
    });

    it('should handle primitive values', () => {
      expect(JsonOperations.deepEqual(42, 42)).toBe(true);
      expect(JsonOperations.deepEqual(42, 43)).toBe(false);
      expect(JsonOperations.deepEqual('test', 'test')).toBe(true);
      expect(JsonOperations.deepEqual(null, null)).toBe(true);
      expect(JsonOperations.deepEqual(undefined, undefined)).toBe(true);
      expect(JsonOperations.deepEqual(null, undefined)).toBe(false);
    });

    it('should handle arrays', () => {
      expect(JsonOperations.deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(JsonOperations.deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(JsonOperations.deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = {
        a: 1,
        b: {
          c: 2,
          d: 3
        },
        e: 'preserve'
      };

      const source = {
        b: {
          c: 999,
          f: 'new'
        },
        g: 'added'
      };

      const result = JsonOperations.deepMerge(target, source);

      expect(result).toEqual({
        a: 1,
        b: {
          c: 999,
          d: 3,
          f: 'new'
        },
        e: 'preserve',
        g: 'added'
      });

      // Should not modify original objects
      expect(target.b.c).toBe(2);
    });

    it('should handle array replacement', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };

      const result = JsonOperations.deepMerge(target, source);

      expect(result.arr).toEqual([4, 5]);
    });
  });

  describe('validateStructure', () => {
    const template = {
      common: {
        buttons: {
          submit: 'string',
          cancel: 'string'
        },
        count: 42
      }
    };

    it('should validate matching structures', () => {
      const validData = {
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel'
          },
          count: 100
        }
      };

      const result = JsonOperations.validateStructure(validData, template);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing keys', () => {
      const invalidData = {
        common: {
          buttons: {
            submit: 'Submit'
            // missing cancel
          },
          count: 100
        }
      };

      const result = JsonOperations.validateStructure(invalidData, template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing key: common.buttons.cancel');
    });

    it('should detect type mismatches', () => {
      const invalidData = {
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 123 // should be string
          },
          count: 'not a number' // should be number
        }
      };

      const result = JsonOperations.validateStructure(invalidData, template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('Type mismatch'))).toBe(true);
    });
  });
});
