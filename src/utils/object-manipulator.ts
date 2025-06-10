/**
 * Object manipulation utilities using dot notation
 */

import { PathParser } from './path-parser.js';

export class ObjectManipulator {
  /**
   * Get a value from nested object using dot notation
   * @param obj - Object to search in
   * @param path - Dot notation path
   * @returns Value at path or undefined
   */
  static getValue(obj: any, path: string): any {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    // Handle empty path - return the entire object
    if (path === '') {
      return obj;
    }

    const segments = PathParser.parse(path);
    let current = obj;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[segment];
    }

    return current;
  }

  /**
   * Set a value in nested object using dot notation
   * @param obj - Object to modify
   * @param path - Dot notation path
   * @param value - Value to set
   * @returns Modified object
   */
  static setValue(obj: any, path: string, value: any): any {
    if (!obj || typeof obj !== 'object') {
      obj = {};
    }

    const segments = PathParser.parse(path);
    let current = obj;

    // Navigate to the parent of the target
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!segment) continue;
      
      if (!(segment in current) || typeof current[segment] !== 'object' || current[segment] === null) {
        current[segment] = {};
      }
      
      current = current[segment];
    }

    // Set the final value
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      current[lastSegment] = value;
    }

    return obj;
  }

  /**
   * Delete a value from nested object using dot notation
   * @param obj - Object to modify
   * @param path - Dot notation path
   * @returns True if value was deleted, false if not found
   */
  static deleteValue(obj: any, path: string): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const segments = PathParser.parse(path);
    let current = obj;

    // Navigate to the parent of the target
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!segment) continue;
      
      if (!(segment in current) || typeof current[segment] !== 'object' || current[segment] === null) {
        return false;
      }
      
      current = current[segment];
    }

    // Delete the final value
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment in current) {
      delete current[lastSegment];
      return true;
    }

    return false;
  }

  /**
   * Check if a path exists in an object
   * @param obj - Object to check
   * @param path - Dot notation path
   * @returns True if path exists
   */
  static hasPath(obj: any, path: string): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const segments = PathParser.parse(path);
    let current = obj;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return false;
      }
      
      if (!(segment in current)) {
        return false;
      }
      
      current = current[segment];
    }

    return true;
  }

  /**
   * Get all paths in an object (flattened)
   * @param obj - Object to flatten
   * @param prefix - Prefix for paths
   * @returns Array of all paths
   */
  static getAllPaths(obj: any, prefix: string = ''): string[] {
    const paths: string[] = [];

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return prefix ? [prefix] : [];
    }

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively get paths for nested objects
        paths.push(...this.getAllPaths(value, currentPath));
      } else {
        // Leaf node
        paths.push(currentPath);
      }
    }

    return paths;
  }
}
