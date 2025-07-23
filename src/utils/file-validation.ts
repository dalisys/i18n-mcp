/**
 * Centralized file validation utilities for translation tools
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { parseTree, findNodeAtLocation, type JSONPath } from 'jsonc-parser';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Find the conflicting path when trying to add nested keys to a string parent
 */
export function findConflictingPath(parseTree: any, keyParts: JSONPath): string[] | null {
  let current = parseTree;
  const conflictPath: string[] = [];
  
  for (const part of keyParts) {
    const partStr = String(part);
    
    if (!current || current.type !== 'object') {
      // Found a non-object where we expected to traverse deeper
      return conflictPath;
    }
    
    // Look for the property in the current object
    const property = current.children?.find((child: any) => 
      child.type === 'property' && 
      child.children?.[0]?.value === partStr
    );
    
    if (!property) {
      // Property doesn't exist, so no conflict
      return null;
    }
    
    conflictPath.push(partStr);
    const valueNode = property.children?.[1];
    
    if (valueNode?.type === 'string' || valueNode?.type === 'number' || valueNode?.type === 'boolean') {
      // Found a primitive value where we need to add more nested keys
      return conflictPath;
    }
    
    current = valueNode;
  }
  
  return null;
}

/**
 * Validate that new keys won't conflict with existing file structure
 */
export async function validateFileConflicts(
  keyPaths: string[], 
  config: any, 
  index: TranslationIndex, 
  conflictResolution: string = 'error'
): Promise<string[]> {
  const allConflicts: string[] = [];
  const languages = index.getLanguages();
  
  for (const language of languages) {
    const filePath = join(config.translationDir, `${language}.json`);
    let fileContent = '{}';
    
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      // File doesn't exist, no conflicts possible
      continue;
    }
    
    try {
      const currentData = parseTree(fileContent);
      if (!currentData) {
        // Skip validation for empty or invalid files
        continue;
      }
      
      for (const keyPath of keyPaths) {
        const keyParts = keyPath.split('.') as JSONPath;
        
        // Check for nested path conflicts (trying to add nested key where string exists)
        const conflictPath = findConflictingPath(currentData, keyParts);
        if (conflictPath) {
          allConflicts.push(`${keyPath} conflicts with existing string value in ${language}.json at: ${conflictPath.join('.')}`);
          continue;
        }
        
        // Check for direct key conflicts (trying to overwrite existing key)
        // Skip this check if conflictResolution is 'replace' (explicit overwrite allowed)
        if (conflictResolution !== 'replace') {
          const existingNode = findNodeAtLocation(currentData, keyParts);
          if (existingNode) {
            if (existingNode.type === 'string' || existingNode.type === 'number' || existingNode.type === 'boolean') {
              allConflicts.push(`${keyPath} already exists as a ${existingNode.type} value in ${language}.json`);
            } else if (existingNode.type === 'object') {
              allConflicts.push(`${keyPath} already exists as an object in ${language}.json (cannot overwrite object with string)`);
            }
          }
        }
      }
    } catch (parseError) {
      // Skip validation for unparseable files
      continue;
    }
  }
  
  return allConflicts;
}

/**
 * Collect all key paths from nested translation structure
 */
export function collectNestedKeyPaths(prefix: string, nested: any, keyPaths: string[]): void {
  for (const [key, value] of Object.entries(nested)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (!keyPaths.includes(fullKey)) {
        keyPaths.push(fullKey);
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      collectNestedKeyPaths(fullKey, value, keyPaths);
    }
  }
}