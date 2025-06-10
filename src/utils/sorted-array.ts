/**
 * Binary search utilities for sorted operations
 */

export class SortedArray<T> {
  private items: T[] = [];
  
  constructor(private compareFunc: (a: T, b: T) => number) {}
  
  /**
   * Insert an item in the correct sorted position
   * @param item - Item to insert
   */
  insert(item: T): void {
    const index = this.binarySearch(item);
    this.items.splice(index, 0, item);
  }
  
  /**
   * Remove an item from the array
   * @param item - Item to remove
   * @returns True if item was found and removed
   */
  remove(item: T): boolean {
    const index = this.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Find the index of an item
   * @param item - Item to find
   * @returns Index of item or -1 if not found
   */
  indexOf(item: T): number {
    const index = this.binarySearch(item);
    const foundItem = this.items[index];
    if (index < this.items.length && foundItem && this.compareFunc(foundItem, item) === 0) {
      return index;
    }
    return -1;
  }
  
  /**
   * Get all items as an array
   * @returns Copy of the internal array
   */
  toArray(): T[] {
    return [...this.items];
  }
  
  /**
   * Get the number of items
   * @returns Length of the array
   */
  get length(): number {
    return this.items.length;
  }
  
  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
  }
  
  private binarySearch(target: T): number {
    let left = 0;
    let right = this.items.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midItem = this.items[mid];
      if (midItem && this.compareFunc(midItem, target) < 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left;
  }
}

/**
 * Debounce utility for file watching
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
