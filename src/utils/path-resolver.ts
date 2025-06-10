/**
 * Path resolution utilities for the i18n MCP server
 * Handles proper resolution of relative paths based on project configuration
 */

import { resolve, isAbsolute } from 'path';
import { ServerConfig } from '../types/translation.js';

/**
 * Cross-platform check for absolute paths
 * Handles both Unix (/path) and Windows (C:\path or \\server\path) absolute paths
 */
export function isAbsolutePath(path: string): boolean {
  // Handle Unix-style absolute paths
  if (isAbsolute(path)) {
    return true;
  }
  
  // Handle Windows-style absolute paths that Node.js might not recognize on Unix
  // Drive letter paths: C:\ or C:/
  if (/^[a-zA-Z]:[\\\/]/.test(path)) {
    return true;
  }
  
  // UNC paths: \\server\share
  if (/^\\\\/.test(path)) {
    return true;
  }
  
  return false;
}

/**
 * Resolves a source directory path based on the server configuration
 * 
 * @param srcDir - The source directory path (can be relative, absolute, or undefined)
 * @param config - The server configuration containing projectRoot and srcDir
 * @returns Resolved absolute path
 */
export function resolveSrcDir(srcDir: string | undefined, config: ServerConfig): string {
  // If no srcDir provided, use the configured default
  if (!srcDir) {
    if (config.srcDir) {
      return config.srcDir;
    }
    throw new Error('No source directory specified. Provide srcDir parameter or configure --src-dir');
  }

  // If absolute path, use as-is
  if (isAbsolutePath(srcDir)) {
    return srcDir;
  }

  // If relative path, resolve based on project root
  if (config.projectRoot) {
    return resolve(config.projectRoot, srcDir);
  }

  // Fallback: resolve relative to current working directory
  return resolve(srcDir);
}

/**
 * Resolves a file path based on the server configuration
 * Similar to resolveSrcDir but for individual files
 * 
 * @param filePath - The file path (can be relative or absolute)
 * @param config - The server configuration containing projectRoot
 * @returns Resolved absolute path
 */
export function resolveFilePath(filePath: string, config: ServerConfig): string {
  // If absolute path, use as-is
  if (isAbsolutePath(filePath)) {
    return filePath;
  }

  // If relative path, resolve based on project root
  if (config.projectRoot) {
    return resolve(config.projectRoot, filePath);
  }

  // Fallback: resolve relative to current working directory
  return resolve(filePath);
}

/**
 * Validates that a resolved path exists and is accessible
 * 
 * @param resolvedPath - The absolute path to validate
 * @param pathType - Type of path for error messages ('directory' or 'file')
 * @returns The validated path
 * @throws Error if path doesn't exist or isn't accessible
 */
export async function validatePath(resolvedPath: string, pathType: 'directory' | 'file' = 'directory'): Promise<string> {
  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(resolvedPath);
    
    if (pathType === 'directory' && !stats.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${resolvedPath}`);
    }
    
    if (pathType === 'file' && !stats.isFile()) {
      throw new Error(`Path exists but is not a file: ${resolvedPath}`);
    }
    
    return resolvedPath;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${pathType === 'directory' ? 'Directory' : 'File'} not found: ${resolvedPath}`);
    }
    throw error;
  }
}

/**
 * Creates a user-friendly path description for error messages
 * 
 * @param originalPath - The original path provided by user
 * @param resolvedPath - The resolved absolute path
 * @param config - The server configuration
 * @returns Descriptive string for error messages
 */
export function createPathDescription(originalPath: string | undefined, resolvedPath: string, config: ServerConfig): string {
  if (!originalPath) {
    return `configured default (${resolvedPath})`;
  }
  
  if (isAbsolutePath(originalPath)) {
    return `absolute path (${resolvedPath})`;
  }
  
  if (config.projectRoot) {
    return `relative to project root (${originalPath} → ${resolvedPath})`;
  }
  
  return `relative to current directory (${originalPath} → ${resolvedPath})`;
} 