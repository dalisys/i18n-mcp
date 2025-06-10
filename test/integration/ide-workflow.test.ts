/**
 * Integration test for complete IDE workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TranslationMCPServer } from '../../src/server/mcp-server.js';
import { CodeAnalyzer } from '../../src/core/code-analyzer.js';
import { TranslationExtractor } from '../../src/core/translation-extractor.js';
import { TypeGenerator } from '../../src/core/type-generator.js';

describe('IDE Workflow Integration', () => {
  let tempDir: string;
  let server: TranslationMCPServer;
  let analyzer: CodeAnalyzer;
  let extractor: TranslationExtractor;
  let typeGenerator: TypeGenerator;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = join(process.cwd(), 'test', 'temp', `ide-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create locales directory
    const localesDir = join(tempDir, 'locales');
    await fs.mkdir(localesDir, { recursive: true });

    // Create source directory
    const srcDir = join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Initialize server with IDE features
    server = new TranslationMCPServer({
      name: 'test-server',
      version: '1.0.0',
      translationDir: localesDir,
      baseLanguage: 'en',
      srcDir,
      autoSync: true,
      generateTypes: join(tempDir, 'types', 'i18n.ts'),
      watchCode: false, // Disable for testing
      frameworks: ['react', 'vue'],
      keyStyle: 'nested'
    });

    // Initialize components
    analyzer = new CodeAnalyzer(['react', 'vue']);
    extractor = new TranslationExtractor('react');
    typeGenerator = new TypeGenerator(server.getIndex());

    // Create initial translation files
    await fs.writeFile(
      join(localesDir, 'en.json'),
      JSON.stringify({
        common: {
          buttons: {
            submit: 'Submit',
            cancel: 'Cancel'
          }
        },
        auth: {
          login: 'Login'
        }
      }, null, 2)
    );

    await fs.writeFile(
      join(localesDir, 'es.json'),
      JSON.stringify({
        common: {
          buttons: {
            submit: 'Enviar',
            cancel: 'Cancelar'
          }
        },
        auth: {
          login: 'Iniciar sesión'
        }
      }, null, 2)
    );

    // Start server
    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should complete full IDE workflow: analyze → extract → generate types', async () => {
    // Step 1: Create a React component with hardcoded strings
    const componentPath = join(tempDir, 'src', 'LoginForm.tsx');
    const originalComponent = `
import React from 'react';
import { useTranslation } from 'react-i18next';

export function LoginForm() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>Welcome to our app</h1>
      <form>
        <label>Email address</label>
        <input type="email" placeholder="Enter your email" />
        
        <label>Password</label>
        <input type="password" placeholder="Enter your password" />
        
        <button type="submit">{t('common.buttons.submit')}</button>
        <button type="button">{t('common.buttons.cancel')}</button>
        <button type="button">{t('missing.key')}</button>
      </form>
      <p>Don't have an account? Sign up here</p>
    </div>
  );
}
`;

    await fs.writeFile(componentPath, originalComponent);

    // Step 2: Analyze the component for hardcoded strings and translation usage
    const analysisResult = await analyzer.analyzeFile(componentPath, {
      extractHardcoded: true,
      findUsage: true,
      translationIndex: server.getIndex(),
      minStringLength: 3
    });

    // Verify analysis results
    expect(analysisResult.detectedFramework).toBe('react');
    expect(analysisResult.hardcodedStrings.length).toBeGreaterThan(0);
    expect(analysisResult.translationUsage.length).toBeGreaterThan(0);

    // Check for hardcoded strings
    const hardcodedTexts = analysisResult.hardcodedStrings.map(s => s.text);
    expect(hardcodedTexts).toContain('Welcome to our app');
    expect(hardcodedTexts).toContain('Email address');
    expect(hardcodedTexts).toContain('Enter your email');

    // Check for translation usage
    const usedKeys = analysisResult.translationUsage.map(u => u.keyPath);
    expect(usedKeys).toContain('common.buttons.submit');
    expect(usedKeys).toContain('common.buttons.cancel');
    expect(usedKeys).toContain('missing.key');

    // Check for missing translations
    const missingUsage = analysisResult.translationUsage.find(u => u.keyPath === 'missing.key');
    expect(missingUsage?.exists).toBe(false);

    // Step 3: Extract hardcoded strings to translations
    const index = server.getIndex();

    // Extract "Welcome to our app"
    await index.set('auth.welcome_title', 'en', 'Welcome to our app');
    await index.set('auth.welcome_title', 'es', 'Bienvenido a nuestra aplicación');

    let updatedContent = await extractor.replaceTextWithTranslation(
      componentPath,
      'Welcome to our app',
      'auth.welcome_title'
    );

    // Extract "Email address"
    await index.set('auth.email_label', 'en', 'Email address');
    await index.set('auth.email_label', 'es', 'Dirección de correo');

    updatedContent = await extractor.replaceTextWithTranslation(
      componentPath,
      'Email address',
      'auth.email_label'
    );

    // Extract "Enter your email"
    await index.set('auth.email_placeholder', 'en', 'Enter your email');
    await index.set('auth.email_placeholder', 'es', 'Ingresa tu correo');

    updatedContent = await extractor.replaceTextWithTranslation(
      componentPath,
      'Enter your email',
      'auth.email_placeholder'
    );

    // Add the missing translation key
    await index.set('missing.key', 'en', 'Missing Translation');
    await index.set('missing.key', 'es', 'Traducción Faltante');

    // Step 4: Verify the updated component
    const finalContent = await fs.readFile(componentPath, 'utf-8');
    expect(finalContent).toContain("{t('auth.welcome_title')}");
    expect(finalContent).toContain("{t('auth.email_label')}");
    expect(finalContent).toContain("{t('auth.email_placeholder')}");
    expect(finalContent).not.toContain('Welcome to our app');
    expect(finalContent).not.toContain('Email address');

    // Step 5: Re-analyze to verify improvements
    const secondAnalysis = await analyzer.analyzeFile(componentPath, {
      extractHardcoded: true,
      findUsage: true,
      translationIndex: index,
      minStringLength: 3
    });

    // Should have fewer hardcoded strings
    expect(secondAnalysis.hardcodedStrings.length).toBeLessThan(analysisResult.hardcodedStrings.length);

    // Should have more translation usage
    expect(secondAnalysis.translationUsage.length).toBeGreaterThan(analysisResult.translationUsage.length);

    // Missing key should now exist
    const missingKeyUsage = secondAnalysis.translationUsage.find(u => u.keyPath === 'missing.key');
    expect(missingKeyUsage?.exists).toBe(true);

    // Step 6: Generate TypeScript types
    const typesPath = join(tempDir, 'types', 'i18n.ts');
    await typeGenerator.generateTypes({
      outputPath: typesPath,
      namespace: 'I18n',
      includeValues: false,
      strict: true,
      baseLanguage: 'en'
    });

    // Verify types file was created
    const typesContent = await fs.readFile(typesPath, 'utf-8');
    expect(typesContent).toContain('export type TranslationKey =');
    expect(typesContent).toContain("'common.buttons.submit'");
    expect(typesContent).toContain("'auth.welcome_title'");
    expect(typesContent).toContain("'auth.email_label'");
    expect(typesContent).toContain("'missing.key'");
    expect(typesContent).toContain('export namespace I18n');

    // Step 7: Validate structure
    const structureValidation = await index.validateStructure({
      baseLanguage: 'en',
      autoFix: false
    });

    expect(structureValidation.valid).toBe(true);
    expect(Object.keys(structureValidation.missingKeys || {})).toHaveLength(0);

    // Step 8: Get usage statistics
    const stats = index.getStats();
    expect(stats.totalKeys).toBeGreaterThan(5);
    expect(stats.languages).toContain('en');
    expect(stats.languages).toContain('es');

    // Step 9: Test autocomplete suggestions
    const suggestions = index.searchByPrefix('auth.');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('auth.welcome_title');
    expect(suggestions).toContain('auth.email_label');
    expect(suggestions).toContain('auth.login');
  });

  it('should handle Vue.js workflow', async () => {
    // Create a Vue component
    const componentPath = join(tempDir, 'src', 'UserProfile.vue');
    const vueComponent = `
<template>
  <div>
    <h1>User Profile</h1>
    <p>{{ $t('auth.login') }}</p>
    <button>Save Changes</button>
    <span>{{ $t('nonexistent.key') }}</span>
  </div>
</template>

<script>
import { useI18n } from 'vue-i18n';

export default {
  setup() {
    const { t } = useI18n();
    return { t };
  }
};
</script>
`;

    await fs.writeFile(componentPath, vueComponent);

    // Analyze Vue component
    const vueAnalyzer = new CodeAnalyzer(['vue']);
    const analysisResult = await vueAnalyzer.analyzeFile(componentPath, {
      extractHardcoded: true,
      findUsage: true,
      translationIndex: server.getIndex()
    });

    expect(analysisResult.detectedFramework).toBe('vue');
    expect(analysisResult.hardcodedStrings.map(s => s.text)).toContain('User Profile');
    expect(analysisResult.hardcodedStrings.map(s => s.text)).toContain('Save Changes');

    const usedKeys = analysisResult.translationUsage.map(u => u.keyPath);
    expect(usedKeys).toContain('auth.login');
    expect(usedKeys).toContain('nonexistent.key');

    // Extract Vue strings
    const vueExtractor = new TranslationExtractor('vue');
    const index = server.getIndex();

    await index.set('profile.title', 'en', 'User Profile');
    await index.set('profile.title', 'es', 'Perfil de Usuario');

    const updatedContent = await vueExtractor.replaceTextWithTranslation(
      componentPath,
      'User Profile',
      'profile.title'
    );

    expect(updatedContent).toContain("{{ $t('profile.title') }}");
    expect(updatedContent).not.toContain('>User Profile<');
  });

  it('should handle error scenarios gracefully', async () => {
    // Test with non-existent file
    await expect(
      analyzer.analyzeFile(join(tempDir, 'nonexistent.tsx'))
    ).rejects.toThrow('Failed to analyze file');

    // Test with malformed JSON translation file
    const malformedPath = join(tempDir, 'locales', 'malformed.json');
    await fs.writeFile(malformedPath, '{ invalid json }');

    // Server should handle this gracefully and continue working
    const index = server.getIndex();
    expect(index.getLanguages()).toContain('en');
    expect(index.getLanguages()).toContain('es');

    // Test type generation with invalid path
    await expect(
      typeGenerator.generateTypes({
        outputPath: '/invalid/path/types.ts',
        baseLanguage: 'en'
      })
    ).rejects.toThrow('Failed to generate types');
  });
});
