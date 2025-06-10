/**
 * Core type definitions for the i18n MCP server
 */

/**
 * Represents a single translation entry with metadata
 */
export interface TranslationEntry {
  /** The actual translation value */
  value: any;
  /** Source file path */
  file: string;
  /** Line number in the source file */
  line: number;
  /** Column number in the source file */
  column: number;
  /** Last modification timestamp */
  lastModified: number;
}

/**
 * Map of language codes to translation entries for a single key
 */
export interface IndexedTranslation {
  [language: string]: TranslationEntry;
}

/**
 * Configuration for the translation index
 */
export interface TranslationIndexConfig {
  /** Base language used as the structure template */
  baseLanguage: string;
  /** Maximum cache size for LRU cache */
  maxCacheSize?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Search options for translation queries
 */
export interface SearchOptions {
  /** Search scope */
  scope: 'keys' | 'values' | 'both';
  /** Specific languages to search in */
  languages?: string[];
  /** Maximum number of results */
  maxResults?: number;
  /** Case sensitive search */
  caseSensitive?: boolean;
}

/**
 * Context retrieval options
 */
export interface ContextOptions {
  /** Depth of context to retrieve */
  depth: number;
  /** Languages to include */
  languages?: string[];
}

/**
 * Search result item
 */
export interface SearchResult {
  /** The translation key path */
  keyPath: string;
  /** Matching translations by language */
  translations: IndexedTranslation;
  /** Match score (0-1) */
  score: number;
  /** Type of match */
  matchType: 'key' | 'value' | 'both';
}

/**
 * Context result with hierarchical structure
 */
export interface ContextResult {
  /** The requested key path */
  keyPath: string;
  /** The translation values */
  translations: IndexedTranslation;
  /** Parent context */
  parent?: {
    keyPath: string;
    translations: IndexedTranslation;
  };
  /** Child keys */
  children: Array<{
    keyPath: string;
    translations: IndexedTranslation;
  }>;
  /** Sibling keys at the same level */
  siblings: Array<{
    keyPath: string;
    translations: IndexedTranslation;
  }>;
}

/**
 * Batch operation definition
 */
export interface BatchOperation {
  type: 'set' | 'delete';
  keyPath: string;
  language?: string;
  value?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Missing keys by language */
  missingKeys: Record<string, string[]>;
  /** Extra keys by language */
  extraKeys: Record<string, string[]>;
  /** Type mismatches */
  typeMismatches: Array<{
    keyPath: string;
    expected: string;
    actual: Record<string, string>;
  }>;
  /** Structural inconsistencies */
  structuralIssues: string[];
}

/**
 * Usage analysis result
 */
export interface UsageAnalysis {
  /** Total number of translation keys */
  totalKeys: number;
  /** Unused translation keys */
  unusedKeys: string[];
  /** Duplicate values */
  duplicateValues: Array<{
    value: any;
    keys: string[];
  }>;
  /** Missing translations by language */
  missingTranslations: Record<string, string[]>;
  /** Statistics by language */
  languageStats: Record<string, {
    totalKeys: number;
    translatedKeys: number;
    completeness: number;
  }>;
}

/**
 * File watcher event
 */
export interface FileWatchEvent {
  /** Event type */
  type: 'add' | 'change' | 'unlink';
  /** File path */
  path: string;
  /** Language extracted from filename */
  language: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Translation files directory */
  translationDir: string;
  /** Base language for structure template */
  baseLanguage?: string;
  /** Enable debug mode */
  debug?: boolean;
  /** File watching options */
  watchOptions?: {
    /** Debounce delay in milliseconds */
    debounceMs?: number;
    /** Ignored file patterns */
    ignored?: string[];
  };
  /** Source code directory for analysis */
  srcDir?: string;
  /** Exclude patterns for code analysis */
  exclude?: string[];
  /** Auto-sync changes back to files */
  autoSync?: boolean;
  /** Generate TypeScript types file path */
  generateTypes?: string;
  /** Watch source code files for changes */
  watchCode?: boolean;
  /** Project root for relative paths */
  projectRoot?: string;
  /** Framework-specific analysis */
  frameworks?: string[];
  /** Key naming style */
  keyStyle?: 'nested' | 'flat' | 'camelCase' | 'kebab-case';
}

/**
 * Error types for better error handling
 */
export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'TranslationError';
  }

  /**
   * Custom JSON serialization to include error properties
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
}

export class ValidationError extends TranslationError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class FileWatchError extends TranslationError {
  constructor(message: string, details?: any) {
    super(message, 'FILE_WATCH_ERROR', details);
    this.name = 'FileWatchError';
  }
}

export class IndexError extends TranslationError {
  constructor(message: string, details?: any) {
    super(message, 'INDEX_ERROR', details);
    this.name = 'IndexError';
  }
}

/**
 * Framework types for code analysis
 */
export type SupportedFramework = 'react' | 'vue' | 'svelte' | 'angular';

/**
 * Code analysis result
 */
export interface CodeAnalysisResult {
  /** Detected framework */
  detectedFramework?: SupportedFramework;
  /** Hardcoded strings found */
  hardcodedStrings: HardcodedString[];
  /** Translation key usage */
  translationUsage: TranslationUsage[];
  /** Suggestions for improvements */
  suggestions: CodeSuggestion[];
}

/**
 * Hardcoded string found in code
 */
export interface HardcodedString {
  /** The hardcoded text */
  text: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Context (function, component, etc.) */
  context?: string;
  /** Suggested translation key */
  suggestedKey?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Translation key usage in code
 */
export interface TranslationUsage {
  /** Translation key being used */
  keyPath: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Usage pattern (t(), $t(), etc.) */
  pattern: string;
  /** Whether the key exists in translations */
  exists: boolean;
}

/**
 * Code improvement suggestion
 */
export interface CodeSuggestion {
  /** Type of suggestion */
  type: 'extract' | 'missing-key' | 'unused-key' | 'duplicate' | 'optimization';
  /** Description */
  message: string;
  /** Line number (if applicable) */
  line?: number;
  /** Suggested action */
  action?: string;
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
}

/**
 * Translation file integrity check result
 */
export interface TranslationIntegrityResult {
  /** Overall integrity status */
  isValid: boolean;
  /** Base language used for comparison */
  baseLanguage: string;
  /** Total number of files checked */
  totalFiles: number;
  /** Summary statistics */
  summary: {
    totalKeys: number;
    filesWithIssues: number;
    totalMissingKeys: number;
    totalExtraKeys: number;
    totalTypeMismatches: number;
  };
  /** Per-file analysis results */
  fileResults: Record<string, FileIntegrityResult>;
  /** Global recommendations */
  recommendations: string[];
}

/**
 * Individual file integrity result
 */
export interface FileIntegrityResult {
  /** Language code */
  language: string;
  /** File path */
  filePath: string;
  /** Whether file exists */
  exists: boolean;
  /** Whether file is valid JSON */
  validJson: boolean;
  /** Parse error if JSON is invalid */
  parseError?: string;
  /** File statistics */
  stats: {
    totalKeys: number;
    missingKeys: number;
    extraKeys: number;
    typeMismatches: number;
    completeness: number; // 0-1
  };
  /** Missing keys from base language */
  missingKeys: KeyIssue[];
  /** Extra keys not in base language */
  extraKeys: KeyIssue[];
  /** Type mismatches with base language */
  typeMismatches: TypeMismatch[];
  /** File-specific recommendations */
  recommendations: string[];
}

/**
 * Key issue details
 */
export interface KeyIssue {
  /** Key path (dot notation) */
  keyPath: string;
  /** Expected value from base language */
  expectedValue?: any;
  /** Expected type from base language */
  expectedType?: string;
  /** Actual value in this file */
  actualValue?: any;
  /** Actual type in this file */
  actualType?: string;
  /** Nested path in JSON structure */
  jsonPath: string[];
}

/**
 * Type mismatch details
 */
export interface TypeMismatch {
  /** Key path (dot notation) */
  keyPath: string;
  /** Expected type from base language */
  expectedType: string;
  /** Actual type in this file */
  actualType: string;
  /** Expected value from base language */
  expectedValue: any;
  /** Actual value in this file */
  actualValue: any;
  /** Nested path in JSON structure */
  jsonPath: string[];
}

/**
 * Smart deletion operation result
 */
export interface DeleteTranslationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Key path that was deleted */
  keyPath: string;
  /** Languages from which the key was deleted */
  deletedLanguages: string[];
  /** Languages that still have this key */
  remainingLanguages: string[];
  /** Whether the key was completely removed */
  completelyRemoved: boolean;
  /** File write results */
  fileWriteResults?: Record<string, { success: boolean; error?: string }>;
  /** Warnings about potential issues */
  warnings: string[];
  /** Skip reason if operation was skipped */
  skipReason?: string;
  /** Whether this was a dry run */
  dryRun?: boolean;
}

/**
 * Bulk deletion summary
 */
export interface BulkDeleteSummary {
  /** Overall success status */
  success: boolean;
  /** Total number of operations requested */
  total: number;
  /** Number of operations processed */
  processed: number;
  /** Number of successful deletions */
  successful: number;
  /** Number of operations skipped */
  skipped: number;
  /** Number of failed operations */
  failed: number;
  /** Number of errors encountered */
  errors: number;
  /** Performance metrics */
  performance: {
    batchSize: number;
    totalBatches: number;
  };
}

/**
 * Delete operation input for single deletion
 */
export interface DeleteTranslationInput {
  /** Key path to delete */
  keyPath: string;
  /** Specific languages to delete from (if not provided, deletes from all) */
  languages?: string[];
}

/**
 * Dependency information for a translation key
 */
export interface TranslationDependency {
  /** Key path */
  keyPath: string;
  /** Languages that have this key */
  languages: string[];
  /** Child keys that would be affected */
  childKeys: string[];
  /** Parent key if this is a nested key */
  parentKey?: string;
  /** Sibling keys at the same level */
  siblingKeys: string[];
}
