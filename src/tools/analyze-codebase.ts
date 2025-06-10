/**
 * Analyze codebase tool
 */

import { z } from 'zod';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { TranslationIndex } from '../core/translation-index.js';
import { CodeAnalyzer } from '../core/code-analyzer.js';
import { resolveSrcDir, validatePath, createPathDescription } from '../utils/path-resolver.js';

/**
 * Setup the analyze codebase tool
 */
export function setupAnalyzeCodebaseTool(server: any, index: TranslationIndex, config: any) {
  server.tool(
    'analyze_codebase',
    'Analyze codebase for hardcoded strings and translation usage',
    {
      srcDir: z.string().optional().describe('Source directory. Can be relative to project-root or absolute path'),
      frameworks: z.array(z.enum(['react', 'vue', 'svelte', 'angular'])).optional().describe('Target frameworks'),
      includePatterns: z.array(z.string()).optional().describe('File patterns to include'),
      excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude'),
      maxFiles: z.number().min(1).max(1000).default(500).describe('Maximum files to analyze'),
      minConfidence: z.number().min(0).max(1).default(0.6).describe('Minimum confidence for hardcoded strings'),
      groupBySimilarity: z.boolean().default(true).describe('Group similar strings')
    },
    async ({ 
      srcDir,
      frameworks,
      includePatterns,
      excludePatterns,
      maxFiles,
      minConfidence,
      groupBySimilarity
    }: any) => {
      try {
        // Resolve source directory
        let resolvedSourceDir: string | undefined;
        try {
          resolvedSourceDir = resolveSrcDir(srcDir, config);
          await validatePath(resolvedSourceDir, 'directory');
        } catch (error) {
          const pathDesc = createPathDescription(srcDir, resolvedSourceDir || 'unknown', config);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Source directory resolution failed',
                details: error instanceof Error ? error.message : String(error),
                providedPath: srcDir,
                resolvedPath: resolvedSourceDir,
                pathDescription: pathDesc,
                suggestion: srcDir 
                  ? 'Check that the path exists and is accessible'
                  : 'Configure with --src-dir or provide srcDir parameter'
              }, null, 2)
            }]
          };
        }

        const targetFrameworks = frameworks || config.frameworks || ['react', 'vue', 'svelte', 'angular'];
        const includes = includePatterns || [];
        const excludes = [
          'node_modules',
          'dist',
          'build',
          '.git',
          '.next',
          'coverage',
          ...(excludePatterns || config.exclude || [])
        ];

        if (!resolvedSourceDir) {
          throw new Error('Source directory could not be resolved');
        }

        return await handleScanOperation({
          sourceDir: resolvedSourceDir,
          targetFrameworks,
          includes,
          excludes,
          maxFiles,
          minConfidence,
          groupBySimilarity,
          index
        });

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Codebase analysis failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle scan operation (analyze codebase)
 */
async function handleScanOperation({ sourceDir, targetFrameworks, includes, excludes, maxFiles, minConfidence, groupBySimilarity, index }: any) {
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html'];
  const sourceFiles = await getSourceFiles(sourceDir, extensions, excludes, includes);
  
  if (sourceFiles.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `No source files found in ${sourceDir}`,
          checkedExtensions: extensions,
          excludePatterns: excludes
        }, null, 2)
      }]
    };
  }

  const filesToAnalyze = sourceFiles.slice(0, maxFiles);
  const analyzer = new CodeAnalyzer(targetFrameworks);
  const fileResults: any[] = [];

  // Analyze each file
  for (const filePath of filesToAnalyze) {
    const result = await analyzeFile(filePath, sourceDir, analyzer, index);
    if (result && result.hardcodedStrings.length > 0) {
      fileResults.push(result);
    }
  }

  // Filter by confidence
  const filteredResults = fileResults.map(result => ({
    ...result,
    hardcodedStrings: result.hardcodedStrings.filter((s: any) => s.confidence >= minConfidence)
  })).filter(result => result.hardcodedStrings.length > 0);

  // Group similar strings if requested
  let groupedStrings: any[] = [];
  if (groupBySimilarity) {
    const stringMap = new Map<string, any>();

    filteredResults.forEach(result => {
      result.hardcodedStrings.forEach((str: any) => {
        const existing = stringMap.get(str.text);
        if (existing) {
          existing.count++;
          existing.confidence = Math.max(existing.confidence, str.confidence);
          existing.files.add(result.relativePath);
        } else {
          stringMap.set(str.text, {
            count: 1,
            confidence: str.confidence,
            files: new Set([result.relativePath]),
            suggestedKey: str.suggestedKey || str.text.toLowerCase().replace(/[^a-z0-9]/g, '_')
          });
        }
      });
    });

    groupedStrings = Array.from(stringMap.entries())
      .map(([text, data]) => ({
        text,
        count: data.count,
        confidence: data.confidence,
        files: Array.from(data.files),
        suggestedKey: data.suggestedKey
      }))
      .sort((a, b) => b.count - a.count);
  }

  // Generate summary
  const totalHardcodedStrings = filteredResults.reduce((sum, r) => sum + r.hardcodedStrings.length, 0);
  const highConfidenceStrings = filteredResults.reduce((sum, r) => 
    sum + r.hardcodedStrings.filter((s: any) => s.confidence > 0.8).length, 0);
  
  const frameworkBreakdown: Record<string, number> = {};
  filteredResults.forEach(result => {
    if (result.detectedFramework) {
      frameworkBreakdown[result.detectedFramework] = (frameworkBreakdown[result.detectedFramework] || 0) + 1;
    }
  });

  const topFiles = filteredResults
    .map(r => ({
      filePath: r.relativePath,
      hardcodedCount: r.hardcodedStrings.length,
      highConfidenceCount: r.hardcodedStrings.filter((s: any) => s.confidence > 0.8).length
    }))
    .sort((a, b) => b.hardcodedCount - a.hardcodedCount)
    .slice(0, 10);

  const recommendations: string[] = [];
  
  if (totalHardcodedStrings > 0) {
    recommendations.push(`Found ${totalHardcodedStrings} hardcoded strings across ${filteredResults.length} files`);
    recommendations.push(`${highConfidenceStrings} strings have high confidence (>80%) and should be prioritized`);
    
    if (groupedStrings.length > 0) {
      const duplicates = groupedStrings.filter(g => g.count > 1).length;
      if (duplicates > 0) {
        recommendations.push(`${duplicates} strings appear in multiple files - consider extracting these first`);
      }
    }
    
    recommendations.push('Use extract_to_translation tool to extract specific strings');
    recommendations.push('Start with highest confidence strings and most frequently used strings');
  } else {
    recommendations.push('No hardcoded strings found with current confidence threshold');
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'analyze_codebase',
        summary: {
          totalFilesScanned: filesToAnalyze.length,
          totalHardcodedStrings,
          highConfidenceStrings,
          filesWithHardcodedStrings: filteredResults.length,
          frameworkBreakdown,
          topFiles
        },
        ...(groupBySimilarity ? { groupedStrings: groupedStrings.slice(0, 50) } : {}),
        filesAnalyzed: filteredResults.slice(0, 20).map(r => ({
          file: r.relativePath,
          framework: r.detectedFramework,
          hardcodedCount: r.hardcodedStrings.length,
          samples: r.hardcodedStrings.slice(0, 5).map((s: any) => ({
            text: s.text,
            line: s.line,
            confidence: s.confidence,
            suggestedKey: s.suggestedKey
          }))
        })),
        recommendations
      }, null, 2)
    }]
  };
}

/**
 * Get all source files in directory recursively
 */
async function getSourceFiles(dir: string, extensions: string[], excludePatterns: string[] = [], includePatterns: string[] = []): Promise<string[]> {
  const files: string[] = [];
  
  const excludeRegexes = excludePatterns.map(pattern => {
    if (pattern.includes('*') || pattern.includes('?')) {
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`${regexPattern}$`);
    }
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  });

  const includeRegexes = (includePatterns || []).map(pattern => {
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`${regexPattern}$`);
  });

  async function scan(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir);
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const relativePath = relative(dir, fullPath);
        
        if (excludeRegexes.some(regex => regex.test(relativePath) || regex.test(entry))) {
          continue;
        }
        
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          await scan(fullPath);
        } else if (stats.isFile()) {
          const ext = extname(entry);
          if (extensions.includes(ext)) {
            if ((includePatterns || []).length > 0) {
              if (includeRegexes.some(regex => regex.test(relativePath) || regex.test(entry))) {
                files.push(fullPath);
              }
            } else {
              files.push(fullPath);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await scan(dir);
  return files;
}

/**
 * Analyze a single file for hardcoded strings
 */
async function analyzeFile(filePath: string, baseDir: string, analyzer: CodeAnalyzer, translationIndex: TranslationIndex): Promise<any | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const result = await analyzer.analyzeFile(filePath, {
      extractHardcoded: true,
      findUsage: true,
      translationIndex,
      minStringLength: 3,
      excludePatterns: [
        /^https?:\/\//,
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        /^\d+$/,
        /^[a-zA-Z0-9_-]+\.(js|ts|css|scss|json)$/,
      ]
    });

    return {
      filePath,
      relativePath: relative(baseDir, filePath),
      detectedFramework: result.detectedFramework,
      hardcodedStrings: result.hardcodedStrings.filter((s: any) => s.confidence > 0.4),
      existingTranslationUsage: result.translationUsage.length,
      fileSize: content.length,
      linesOfCode: content.split('\n').length
    };
  } catch (error) {
    return null;
  }
}