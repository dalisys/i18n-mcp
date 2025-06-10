/**
 * Unit tests for PathParser utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathParser, SortedArray } from '../../src/utils/path-parser.js';

describe('PathParser', () => {
  beforeEach(() => {
    PathParser.clearCache();
  });

  afterEach(() => {
    PathParser.clearCache();
  });

  describe('parse', () => {
    it('should parse simple dot notation paths', () => {
      expect(PathParser.parse('common.buttons.submit')).toEqual(['common', 'buttons', 'submit']);
      expect(PathParser.parse('auth.login.title')).toEqual(['auth', 'login', 'title']);
      expect(PathParser.parse('single')).toEqual(['single']);
    });

    it('should handle empty paths', () => {
      expect(PathParser.parse('')).toEqual(['']);
    });

    it('should cache parsed results', () => {
      const path = 'common.buttons.submit';
      const first = PathParser.parse(path);
      const second = PathParser.parse(path);
      
      expect(first).toBe(second); // Same reference due to caching
      expect(PathParser.getCacheStats().size).toBe(1);
    });

    it('should limit cache size to prevent memory leaks', () => {
      // Fill cache beyond max size
      for (let i = 0; i < 10005; i++) {
        PathParser.parse(`path.${i}.test`);
      }
      
      const stats = PathParser.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
    });
  });

  describe('join', () => {
    it('should join path segments with dots', () => {
      expect(PathParser.join(['common', 'buttons', 'submit'])).toBe('common.buttons.submit');
      expect(PathParser.join(['auth', 'login'])).toBe('auth.login');
      expect(PathParser.join(['single'])).toBe('single');
      expect(PathParser.join([])).toBe('');
    });
  });

  describe('getParent', () => {
    it('should return parent path', () => {
      expect(PathParser.getParent('common.buttons.submit')).toBe('common.buttons');
      expect(PathParser.getParent('auth.login')).toBe('auth');
      expect(PathParser.getParent('single')).toBeNull();
      expect(PathParser.getParent('')).toBeNull();
    });
  });

  describe('getLastSegment', () => {
    it('should return the last segment of a path', () => {
      expect(PathParser.getLastSegment('common.buttons.submit')).toBe('submit');
      expect(PathParser.getLastSegment('auth.login')).toBe('login');
      expect(PathParser.getLastSegment('single')).toBe('single');
      expect(PathParser.getLastSegment('')).toBe('');
    });
  });

  describe('isChildOf', () => {
    it('should correctly identify child relationships', () => {
      expect(PathParser.isChildOf('common.buttons.submit', 'common.buttons')).toBe(true);
      expect(PathParser.isChildOf('common.buttons', 'common')).toBe(true);
      expect(PathParser.isChildOf('auth.login.title', 'auth')).toBe(true);
      
      // Should return false for same path
      expect(PathParser.isChildOf('common.buttons', 'common.buttons')).toBe(false);
      
      // Should return false for non-child relationships
      expect(PathParser.isChildOf('common.buttons', 'auth')).toBe(false);
      expect(PathParser.isChildOf('common', 'common.buttons')).toBe(false);
    });
  });

  describe('isDescendantOf', () => {
    it('should correctly identify descendant relationships', () => {
      expect(PathParser.isDescendantOf('common.buttons.submit', 'common')).toBe(true);
      expect(PathParser.isDescendantOf('common.buttons.submit', 'common.buttons')).toBe(true);
      expect(PathParser.isDescendantOf('auth.login.form.title', 'auth')).toBe(true);
      
      // Should return false for same path
      expect(PathParser.isDescendantOf('common.buttons', 'common.buttons')).toBe(false);
      
      // Should return false for non-descendant relationships
      expect(PathParser.isDescendantOf('common.buttons', 'auth')).toBe(false);
      expect(PathParser.isDescendantOf('common', 'common.buttons')).toBe(false);
    });
  });

  describe('getAllParents', () => {
    it('should return all parent paths from immediate to root', () => {
      expect(PathParser.getAllParents('common.buttons.submit')).toEqual([
        'common.buttons',
        'common'
      ]);
      expect(PathParser.getAllParents('auth.login')).toEqual(['auth']);
      expect(PathParser.getAllParents('single')).toEqual([]);
    });
  });

  describe('getDepth', () => {
    it('should return correct path depth', () => {
      expect(PathParser.getDepth('common.buttons.submit')).toBe(3);
      expect(PathParser.getDepth('auth.login')).toBe(2);
      expect(PathParser.getDepth('single')).toBe(1);
      expect(PathParser.getDepth('')).toBe(1);
    });
  });

  describe('getCommonPrefix', () => {
    it('should find common prefix of multiple paths', () => {
      expect(PathParser.getCommonPrefix([
        'common.buttons.submit',
        'common.buttons.cancel',
        'common.buttons.save'
      ])).toBe('common.buttons');

      expect(PathParser.getCommonPrefix([
        'auth.login.title',
        'auth.register.title'
      ])).toBe('auth');

      expect(PathParser.getCommonPrefix([
        'common.buttons',
        'auth.login'
      ])).toBe('');

      expect(PathParser.getCommonPrefix(['single'])).toBe('single');
      expect(PathParser.getCommonPrefix([])).toBe('');
    });
  });

  describe('normalize', () => {
    it('should normalize paths by removing empty segments and trimming', () => {
      expect(PathParser.normalize('common..buttons.submit')).toBe('common.buttons.submit');
      expect(PathParser.normalize(' common . buttons . submit ')).toBe('common.buttons.submit');
      expect(PathParser.normalize('common.buttons.')).toBe('common.buttons');
      expect(PathParser.normalize('.common.buttons')).toBe('common.buttons');
      expect(PathParser.normalize('..common..buttons..')).toBe('common.buttons');
    });
  });

  describe('isValid', () => {
    it('should validate well-formed paths', () => {
      expect(PathParser.isValid('common.buttons.submit')).toBe(true);
      expect(PathParser.isValid('auth-form.login_page.title-text')).toBe(true);
      expect(PathParser.isValid('component123.item_2.text')).toBe(true);
    });

    it('should reject invalid paths', () => {
      expect(PathParser.isValid('')).toBe(false);
      expect(PathParser.isValid(null as any)).toBe(false);
      expect(PathParser.isValid(undefined as any)).toBe(false);
      expect(PathParser.isValid('common..buttons')).toBe(false);
      expect(PathParser.isValid('.common.buttons')).toBe(false);
      expect(PathParser.isValid('common.buttons.')).toBe(false);
      expect(PathParser.isValid('common.buttons@submit')).toBe(false);
      expect(PathParser.isValid('common.buttons submit')).toBe(false);
      expect(PathParser.isValid('common/buttons.submit')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the internal cache', () => {
      PathParser.parse('test.path');
      expect(PathParser.getCacheStats().size).toBe(1);
      
      PathParser.clearCache();
      expect(PathParser.getCacheStats().size).toBe(0);
    });
  });
});

describe('SortedArray', () => {
  let sortedArray: SortedArray<number>;

  beforeEach(() => {
    sortedArray = new SortedArray<number>((a, b) => a - b);
  });

  describe('insert', () => {
    it('should insert items in sorted order', () => {
      sortedArray.insert(5);
      sortedArray.insert(2);
      sortedArray.insert(8);
      sortedArray.insert(1);
      
      expect(sortedArray.toArray()).toEqual([1, 2, 5, 8]);
    });

    it('should handle duplicate values', () => {
      sortedArray.insert(5);
      sortedArray.insert(5);
      sortedArray.insert(3);
      
      expect(sortedArray.toArray()).toEqual([3, 5, 5]);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      sortedArray.insert(1);
      sortedArray.insert(3);
      sortedArray.insert(5);
      sortedArray.insert(7);
    });

    it('should remove existing items', () => {
      expect(sortedArray.remove(3)).toBe(true);
      expect(sortedArray.toArray()).toEqual([1, 5, 7]);
      expect(sortedArray.length).toBe(3);
    });

    it('should return false for non-existing items', () => {
      expect(sortedArray.remove(99)).toBe(false);
      expect(sortedArray.toArray()).toEqual([1, 3, 5, 7]);
      expect(sortedArray.length).toBe(4);
    });
  });

  describe('indexOf', () => {
    beforeEach(() => {
      sortedArray.insert(1);
      sortedArray.insert(3);
      sortedArray.insert(5);
      sortedArray.insert(7);
    });

    it('should find index of existing items', () => {
      expect(sortedArray.indexOf(1)).toBe(0);
      expect(sortedArray.indexOf(3)).toBe(1);
      expect(sortedArray.indexOf(5)).toBe(2);
      expect(sortedArray.indexOf(7)).toBe(3);
    });

    it('should return -1 for non-existing items', () => {
      expect(sortedArray.indexOf(0)).toBe(-1);
      expect(sortedArray.indexOf(4)).toBe(-1);
      expect(sortedArray.indexOf(99)).toBe(-1);
    });
  });

  describe('clear', () => {
    it('should clear all items', () => {
      sortedArray.insert(1);
      sortedArray.insert(2);
      sortedArray.insert(3);
      
      expect(sortedArray.length).toBe(3);
      
      sortedArray.clear();
      
      expect(sortedArray.length).toBe(0);
      expect(sortedArray.toArray()).toEqual([]);
    });
  });

  describe('length', () => {
    it('should return correct length', () => {
      expect(sortedArray.length).toBe(0);
      
      sortedArray.insert(1);
      expect(sortedArray.length).toBe(1);
      
      sortedArray.insert(2);
      sortedArray.insert(3);
      expect(sortedArray.length).toBe(3);
      
      sortedArray.remove(2);
      expect(sortedArray.length).toBe(2);
    });
  });
});
