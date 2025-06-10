/**
 * Safe JSON parsing utilities
 */

import { promises as fs } from 'fs';

/**
 * Result of JSON parsing with metadata
 */
export interface ParseResult {
  /** Parsed JSON data */
  data: any;
  /** Source file path */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** Parse timestamp */
  timestamp: number;
}

/**
 * Safe JSON operations with error handling and metadata
 */
export class JsonParser {
  /**
   * Safely parse a JSON file with metadata
   * @param filePath - Path to the JSON file
   * @returns Parse result with metadata
   */
  static async parseFile(filePath: string): Promise<ParseResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);
      
      const data = JSON.parse(content);
      
      return {
        data,
        filePath,
        fileSize: stats.size,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safely write JSON to a file with formatting
   * @param filePath - Path to write to
   * @param data - Data to write
   * @param indent - Indentation (default: 2 spaces)
   */
  static async writeFile(filePath: string, data: any, indent: number = 2): Promise<void> {
    try {
      const content = JSON.stringify(data, null, indent);
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write JSON file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deep clone an object
   * @param obj - Object to clone
   * @returns Deep cloned object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * Compare two objects for deep equality
   * @param obj1 - First object
   * @param obj2 - Second object
   * @returns True if objects are deeply equal
   */
  static deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) {
      return true;
    }

    if (obj1 === null || obj2 === null || obj1 === undefined || obj2 === undefined) {
      return obj1 === obj2;
    }

    if (typeof obj1 !== typeof obj2) {
      return false;
    }

    if (typeof obj1 !== 'object') {
      return obj1 === obj2;
    }

    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (!keys2.includes(key)) {
        return false;
      }

      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Merge two objects deeply
   * @param target - Target object
   * @param source - Source object
   * @returns Merged object
   */
  static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = this.deepClone(target);

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else if (sourceValue !== undefined) {
          (result as any)[key] = this.deepClone(sourceValue);
        }
      }
    }

    return result;
  }

  /**
   * Validate JSON structure against a template
   * @param data - Data to validate
   * @param template - Template to validate against
   * @returns Validation result
   */
  static validateStructure(data: any, template: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validate = (current: any, templateCurrent: any, path: string = '') => {
      if (typeof templateCurrent !== typeof current) {
        errors.push(`Type mismatch at ${path}: expected ${typeof templateCurrent}, got ${typeof current}`);
        return;
      }

      if (templateCurrent && typeof templateCurrent === 'object' && !Array.isArray(templateCurrent)) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
          errors.push(`Expected object at ${path}, got ${typeof current}`);
          return;
        }

        // Check for missing keys
        for (const key of Object.keys(templateCurrent)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (!(key in current)) {
            errors.push(`Missing key: ${currentPath}`);
          } else {
            validate(current[key], templateCurrent[key], currentPath);
          }
        }
      }
    };

    validate(data, template);

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
