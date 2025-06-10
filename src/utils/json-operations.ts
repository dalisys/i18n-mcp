/**
 * Safe JSON parsing and manipulation utilities
 */

import { JsonParser, ParseResult } from './json-parser.js';
import { ObjectManipulator } from './object-manipulator.js';

// Re-export types
export type { ParseResult };

/**
 * Position information for a value in JSON
 */
export interface ValuePosition {
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Character offset in file */
  offset: number;
}

/**
 * Safe JSON operations with error handling and metadata
 */
export class JsonOperations {
  /**
   * Safely parse a JSON file with metadata
   * @param filePath - Path to the JSON file
   * @returns Parse result with metadata
   */
  static async parseFile(filePath: string): Promise<ParseResult> {
    return JsonParser.parseFile(filePath);
  }

  /**
   * Safely write JSON to a file with formatting
   * @param filePath - Path to write to
   * @param data - Data to write
   * @param indent - Indentation (default: 2 spaces)
   */
  static async writeFile(filePath: string, data: any, indent: number = 2): Promise<void> {
    return JsonParser.writeFile(filePath, data, indent);
  }

  /**
   * Get a value from nested object using dot notation
   * @param obj - Object to search in
   * @param path - Dot notation path
   * @returns Value at path or undefined
   */
  static getValue(obj: any, path: string): any {
    return ObjectManipulator.getValue(obj, path);
  }

  /**
   * Set a value in nested object using dot notation
   * @param obj - Object to modify
   * @param path - Dot notation path
   * @param value - Value to set
   * @returns Modified object
   */
  static setValue(obj: any, path: string, value: any): any {
    return ObjectManipulator.setValue(obj, path, value);
  }

  /**
   * Delete a value from nested object using dot notation
   * @param obj - Object to modify
   * @param path - Dot notation path
   * @returns True if value was deleted, false if not found
   */
  static deleteValue(obj: any, path: string): boolean {
    return ObjectManipulator.deleteValue(obj, path);
  }

  /**
   * Check if a path exists in an object
   * @param obj - Object to check
   * @param path - Dot notation path
   * @returns True if path exists
   */
  static hasPath(obj: any, path: string): boolean {
    return ObjectManipulator.hasPath(obj, path);
  }

  /**
   * Get all paths in an object (flattened)
   * @param obj - Object to flatten
   * @param prefix - Prefix for paths
   * @returns Array of all paths
   */
  static getAllPaths(obj: any, prefix: string = ''): string[] {
    return ObjectManipulator.getAllPaths(obj, prefix);
  }

  /**
   * Deep clone an object
   * @param obj - Object to clone
   * @returns Deep cloned object
   */
  static deepClone<T>(obj: T): T {
    return JsonParser.deepClone(obj);
  }

  /**
   * Compare two objects for deep equality
   * @param obj1 - First object
   * @param obj2 - Second object
   * @returns True if objects are deeply equal
   */
  static deepEqual(obj1: any, obj2: any): boolean {
    return JsonParser.deepEqual(obj1, obj2);
  }

  /**
   * Merge two objects deeply
   * @param target - Target object
   * @param source - Source object
   * @returns Merged object
   */
  static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    return JsonParser.deepMerge(target, source);
  }

  /**
   * Validate JSON structure against a template
   * @param data - Data to validate
   * @param template - Template to validate against
   * @returns Validation result
   */
  static validateStructure(data: any, template: any): { valid: boolean; errors: string[] } {
    return JsonParser.validateStructure(data, template);
  }
}
