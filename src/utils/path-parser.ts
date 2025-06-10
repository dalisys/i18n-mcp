/**
 * Utilities for parsing and manipulating dot-notation paths
 */

/**
 * Memory-efficient path parsing with caching
 */
export class PathParser {
  private static readonly CACHE = new Map<string, string[]>();
  private static readonly MAX_CACHE_SIZE = 10000;

  /**
   * Parse a dot-notation path into segments
   * @param path - The path to parse (e.g., "common.buttons.submit")
   * @returns Array of path segments
   */
  static parse(path: string): string[] {
    if (this.CACHE.has(path)) {
      return this.CACHE.get(path)!;
    }

    const segments = path.split('.');
    this.CACHE.set(path, segments);

    // Prevent memory leaks by limiting cache size
    if (this.CACHE.size > this.MAX_CACHE_SIZE) {
      const firstKey = this.CACHE.keys().next().value;
      if (firstKey) {
        this.CACHE.delete(firstKey);
      }
    }

    return segments;
  }

  /**
   * Join path segments into a dot-notation path
   * @param segments - Array of path segments
   * @returns Joined path string
   */
  static join(segments: string[]): string {
    return segments.join('.');
  }

  /**
   * Get the parent path of a given path
   * @param path - The path to get parent for
   * @returns Parent path or null if no parent
   */
  static getParent(path: string): string | null {
    const segments = this.parse(path);
    if (segments.length <= 1) {
      return null;
    }
    return this.join(segments.slice(0, -1));
  }

  /**
   * Get the last segment of a path
   * @param path - The path to get last segment for
   * @returns Last segment
   */
  static getLastSegment(path: string): string {
    const segments = this.parse(path);
    return segments[segments.length - 1] || '';
  }

  /**
   * Check if one path is a child of another
   * @param childPath - The potential child path
   * @param parentPath - The potential parent path
   * @returns True if childPath is a child of parentPath
   */
  static isChildOf(childPath: string, parentPath: string): boolean {
    if (childPath === parentPath) {
      return false;
    }
    return childPath.startsWith(parentPath + '.');
  }

  /**
   * Check if one path is a descendant of another
   * @param descendantPath - The potential descendant path
   * @param ancestorPath - The potential ancestor path
   * @returns True if descendantPath is a descendant of ancestorPath
   */
  static isDescendantOf(descendantPath: string, ancestorPath: string): boolean {
    if (descendantPath === ancestorPath) {
      return false;
    }
    return descendantPath.startsWith(ancestorPath + '.');
  }

  /**
   * Get all possible parent paths for a given path
   * @param path - The path to get parents for
   * @returns Array of parent paths from immediate to root
   */
  static getAllParents(path: string): string[] {
    const segments = this.parse(path);
    const parents: string[] = [];
    
    for (let i = segments.length - 1; i > 0; i--) {
      parents.push(this.join(segments.slice(0, i)));
    }
    
    return parents;
  }

  /**
   * Get the depth of a path (number of segments)
   * @param path - The path to measure
   * @returns Depth of the path
   */
  static getDepth(path: string): number {
    return this.parse(path).length;
  }

  /**
   * Get the common prefix of multiple paths
   * @param paths - Array of paths to find common prefix for
   * @returns Common prefix path or empty string if no common prefix
   */
  static getCommonPrefix(paths: string[]): string {
    if (paths.length === 0) {
      return '';
    }
    
    if (paths.length === 1) {
      return paths[0] || '';
    }

    const segmentArrays = paths.map(path => this.parse(path));
    const minLength = Math.min(...segmentArrays.map(segments => segments.length));
    
    const commonSegments: string[] = [];
    
    for (let i = 0; i < minLength; i++) {
      const segment = segmentArrays[0]?.[i];
      if (segment && segmentArrays.every(segments => segments[i] === segment)) {
        commonSegments.push(segment);
      } else {
        break;
      }
    }
    
    return this.join(commonSegments);
  }

  /**
   * Normalize a path by removing empty segments and trimming
   * @param path - The path to normalize
   * @returns Normalized path
   */
  static normalize(path: string): string {
    return path
      .split('.')
      .filter(segment => segment.trim().length > 0)
      .map(segment => segment.trim())
      .join('.');
  }

  /**
   * Validate that a path is well-formed
   * @param path - The path to validate
   * @returns True if path is valid
   */
  static isValid(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }
    
    // Check for invalid characters
    if (/[^a-zA-Z0-9._-]/.test(path)) {
      return false;
    }
    
    // Check for consecutive dots
    if (path.includes('..')) {
      return false;
    }
    
    // Check for leading or trailing dots
    if (path.startsWith('.') || path.endsWith('.')) {
      return false;
    }
    
    return true;
  }

  /**
   * Clear the internal cache (useful for testing or memory management)
   */
  static clearCache(): void {
    this.CACHE.clear();
  }

  /**
   * Get cache statistics
   * @returns Object with cache size and hit rate info
   */
  static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.CACHE.size,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}

// Re-export utilities from other modules
export { debounce, SortedArray } from './sorted-array.js';
