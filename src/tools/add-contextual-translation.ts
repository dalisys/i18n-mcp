/**
 * Add contextual translation tool
 */

import { z } from 'zod';
import { TranslationIndex } from '../core/translation-index.js';

/**
 * Setup the add contextual translation tool
 */
export function setupAddContextualTranslationTool(server: any, index: TranslationIndex, config: any, refreshFromFiles?: () => Promise<void>) {
  server.tool(
    'add_contextual_translation',
    'Add translation with context-aware key generation',
    {
      text: z.string().describe('Source text'),
      context: z.string().describe('Context for contextual translations'),
      translations: z.record(z.string(), z.any()).describe('Translations by language code'),
      keyPath: z.string().optional().describe('Optional key path override'),
      keyStyle: z.enum(['nested', 'flat', 'camelCase', 'kebab-case']).optional().describe('Key naming style'),
      checkConflicts: z.boolean().default(true).describe('Check for existing translations'),
      conflictResolution: z.enum(['error', 'merge', 'replace']).default('error').describe('How to handle existing keys')
    },
    async ({ 
      text,
      context,
      translations,
      keyPath,
      keyStyle,
      checkConflicts,
      conflictResolution
    }: any) => {
      try {
        // Ensure memory is current with files before making changes
        if (refreshFromFiles) {
          await refreshFromFiles();
        }
        
        return await handleContextualAddOperation({
          text,
          context,
          translations,
          keyPath,
          keyStyle: keyStyle || config.keyStyle || 'nested',
          checkConflicts,
          conflictResolution,
          index,
          config
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Contextual add operation failed',
              details: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
}

/**
 * Handle contextual add operation
 */
async function handleContextualAddOperation({ text, context, translations, keyPath, keyStyle, checkConflicts, conflictResolution, index, config }: any) {
  let finalKey = keyPath;
  let suggestions: any[] = [];
  let existingConflicts: any[] = [];

  // Check for existing translations with same text if requested
  if (checkConflicts) {
    const baseLanguage = config.baseLanguage || 'en';
    const searchText = translations[baseLanguage] || text;
    
    const existingResults = await index.search(searchText, {
      scope: 'values',
      caseSensitive: false,
      maxResults: 50
    });
    
    existingConflicts = existingResults
      .filter((result: any) => {
        const existingValue = result.translations[baseLanguage]?.value;
        return existingValue && existingValue.toLowerCase() === searchText.toLowerCase();
      })
      .map((result: any) => ({
        keyPath: result.keyPath,
        translations: result.translations
      }));
  }

  // Generate contextual key if not provided
  if (!finalKey) {
    suggestions = generateContextualKeySuggestions(text, context, keyStyle, index);
    if (suggestions.length === 0) {
      // Fallback to simple contextual key
      const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const normalizedContext = context.toLowerCase().replace(/[^a-z0-9]/g, '_');
      finalKey = `${normalizedContext}.${normalizedText}`;
    } else {
      finalKey = suggestions[0].suggestedKey;
    }
  }

  // Check if key already exists
  if (index.has(finalKey)) {
    if (conflictResolution === 'error') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Translation key already exists',
            existingKey: finalKey,
            existingTranslations: index.getTranslations(finalKey),
            suggestions: suggestions.slice(1, 4),
            recommendation: 'Use conflictResolution: "merge" or "replace", or choose a different key'
          }, null, 2)
        }]
      };
    }
  }

  // Add translations
  const addResults: any[] = [];
  for (const [language, value] of Object.entries(translations)) {
    try {
      await index.set(finalKey, language, value);
      addResults.push({ language, value, success: true });
    } catch (error) {
      addResults.push({ 
        language, 
        value, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        operation: 'contextual-add',
        success: true,
        keyAdded: finalKey,
        context,
        text,
        translations: Object.fromEntries(addResults.map(r => [r.language, r])),
        contextualAnalysis: {
          existingConflicts: existingConflicts.length,
          conflictDetails: existingConflicts.slice(0, 3),
          suggestions: suggestions.slice(0, 5)
        }
      }, null, 2)
    }]
  };
}

/**
 * Generate contextual key suggestions
 */
function generateContextualKeySuggestions(text: string, context: string, keyStyle: string, index: TranslationIndex): any[] {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const normalizedContext = context.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  const patterns = [
    `ui.${normalizedContext}.${normalizedText}`,
    `components.${normalizedContext}.${normalizedText}`,
    `${normalizedContext}.${normalizedText}`,
    `${normalizedContext}.labels.${normalizedText}`,
    `features.${normalizedContext}.${normalizedText}`
  ];

  return patterns.map(pattern => ({
    suggestedKey: pattern,
    context: pattern.split('.').slice(0, -1).join('.'),
    reasoning: `Contextual grouping for ${context}`
  }));
}