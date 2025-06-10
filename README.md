# i18n MCP Server

A MCP server for managing internationalization (i18n) translation files. This server enables LLMs to intelligently manage translations, analyze code for hardcoded strings, and maintain consistency across multiple language files with real-time file watching and advanced search capabilities.

## Available Tools

The server provides a comprehensive suite of tools for managing translations, categorized by function.

### Translation Search & Exploration

- **`search_translation`**: Search for translations by content or key patterns. Supports bulk search and advanced filtering.
- **`get_translation_suggestions`**: Get autocomplete suggestions for translation keys.
- **`get_translation_context`**: Get hierarchical context for a specific translation key.
- **`explore_translation_structure`**: Explore the hierarchical structure of translation files to understand key organization.

### Translation Management

- **`add_translations`**: Add new translations with key generation and conflict handling.
- **`add_contextual_translation`**: Add a translation with a context-aware key.
- **`update_translation`**: Update existing translations or perform batch updates.
- **`delete_translation`**: Safely delete single or multiple translation keys with dependency checking.

### Codebase Analysis

- **`analyze_codebase`**: Analyze the codebase for hardcoded strings.
- **`search_missing_translations`**: Find translation keys that are used in the code but not defined in translation files (and vice-versa).
- **`extract_to_translation`**: Extract a hardcoded string from a file and replace it with a translation key.
- **`cleanup_unused_translations`**: Remove unused translation keys that are not referenced in the codebase.

### File & Structure Management

- **`validate_structure`**: Validate that all translation files have a consistent structure with the base language.
- **`check_translation_integrity`**: Check for integrity issues like missing or extra keys and type mismatches across all files.
- **`reorganize_translation_files`**: Reorganize and format translation files to match the base language structure, with options for sorting and backups.

### Utilities

- **`generate_types`**: Generate TypeScript types for all translation keys.
- **`get_stats`**: Get server and translation index statistics.

## Quick Start

Clone and build the project:

```bash
git clone https://github.com/dalisys/i18n-mcp.git
cd i18n-mcp
npm install
npm run build
```

## Configuration

### Configure for Claude Desktop

Add to your Claude Desktop configuration:

#### Basic Configuration

```json
{
  "mcpServers": {
    "i18n": {
        "command": "node",
        "args": ["/path/to/i18n-mcp/dist/index.js", "--dir", "/User/project/locales"]
      }
  }
}
```

#### windows

```json
{
  "mcpServers": {
    "i18n": {
      "command": "C:\\path\\to\\node.exe", // or "C:\\path\\to\\nvm\\node.exe"
      "args": [
        "D:\\i18n-mcp\\dist\\index.js",
        "--dir",
        "D:\\path\\to_your_project\\locales"
      ]
    }
}
```

#### Advanced Configuration

```json
{
  "mcpServers": {
    "i18n": {
      "command": "node",
      "args": [
        "/path/to/i18n-mcp/dist/index.js",
        "--dir", "./locales",
        "--base-language", "en",
        "--src-dir", "./src",
        "--project-root", "/path/to/your/project",
        "--exclude", "node_modules,dist",
        "--generate-types", "./src/types/i18n.ts",
        "--frameworks", "react,vue",
        "--key-style", "nested",
        "--debug"
      ]
    }
  }
}
```

#### Using Environment Variables

```json
{
  "mcpServers": {
    "i18n": {
      "command": "node",
      "args": ["/path/to/i18n-mcp/dist/index.js"],
      "env": {
        "I18N_MCP_DIR": "./locales",
        "I18N_MCP_BASE_LANGUAGE": "en",
        "I18N_MCP_SRC_DIR": "./src",
        "I18N_MCP_PROJECT_ROOT": "/path/to/your/project",
        "I18N_MCP_DEBUG": "true",
        "I18N_MCP_AUTO_SYNC": "true",
        "I18N_MCP_FRAMEWORKS": "react,vue"
      }
    }
  }
}
```

### Configure for IDE

Add the following to your IDE (vscode, cursor):

#### Node.js Installation

```json
{

      "i18n": {
        "command": "node",
        "args": ["/path/to/i18n-mcp/dist/index.js", "--dir", "/User/project/locales"]
      }

}
```

### Configure for Zed

Add to your Zed settings.json:

```json
"context_servers": {
  "i18n": {
    "command": "node",
    "args": ["/path/to/i18n-mcp/dist/index.js", "--dir", "./locales"]
  }
}
```

## Configuration Options

### Command Line Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--dir` `-d` | `string` | `./locales` | Translation files directory |
| `--base-language` `-b` | `string` | `en` | Base language for structure template |
| `--src-dir` | `string` | - | Source code directory for analysis |
| `--project-root` | `string` | - | Project root directory for resolving relative paths |
| `--exclude` | `string` | - | Exclude patterns (comma-separated) |
| `--auto-sync` | `boolean` | `false` | Auto-sync changes back to files |
| `--generate-types` | `string` | - | Generate TypeScript types file path |
| `--frameworks` | `string` | - | Framework analysis (`react,vue,svelte,angular`) |
| `--key-style` | `string` | `nested` | Key naming style (`nested`, `flat`, `camelCase`, `kebab-case`) |
| `--debug` | `boolean` | `false` | Enable debug logging |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `I18N_MCP_DIR` | Translation files directory |
| `I18N_MCP_BASE_LANGUAGE` | Base language for structure template |
| `I18N_MCP_SRC_DIR` | Source code directory for analysis |
| `I18N_MCP_PROJECT_ROOT` | Project root directory for resolving relative paths |
| `I18N_MCP_AUTO_SYNC` | Auto-sync mode (`true`/`false`) |
| `I18N_MCP_FRAMEWORKS` | Supported frameworks (comma-separated) |
| `I18N_MCP_DEBUG` | Enable debug mode (`true`/`false`) |

## Path Resolution

The i18n MCP server handles both relative and absolute paths intelligently:

### How Path Resolution Works

1. **Absolute paths** (e.g., `/Users/user/project/src`) → Used as-is
2. **Relative paths** (e.g., `app`, `./src`, `components`) → Resolved relative to `--project-root`
3. **No path specified** → Uses configured `--src-dir` as default

### Examples

With configuration:
```bash
--project-root /Users/user/project
--src-dir /Users/user/project/src
```

| Input `srcDir` | Resolved Path | Description |
|----------------|---------------|-------------|
| `"app"` | `/Users/user/project/app` | Relative to project root |
| `"./src"` | `/Users/user/project/src` | Relative to project root |
| `"components"` | `/Users/user/project/components` | Relative to project root |
| `"/absolute/path"` | `/absolute/path` | Absolute path used as-is |
| `undefined` | `/Users/user/project/src` | Uses configured --src-dir |

### Error Handling

The server provides detailed error messages when paths cannot be resolved:

```json
{
  "error": "Source directory resolution failed",
  "details": "Directory not found: /Users/user/project/nonexistent",
  "providedPath": "nonexistent",
  "resolvedPath": "/Users/user/project/nonexistent",
  "pathDescription": "relative to project root (nonexistent → /Users/user/project/nonexistent)",
  "suggestion": "Check that the path exists and is accessible"
}
```

## Development Workflow Examples

1. **Find missing translations**: "What translations are missing in Spanish?"
2. **Extract hardcoded strings**: "Find all hardcoded strings in my React components"
3. **Add contextual translation**: "Add a translation for 'Save' in the user profile context"
4. **Validate consistency**: "Check if all language files have the same structure"
5. **Generate types**: "Generate TypeScript types for my translation keys"

## Testing

Run the test suite:

```bash
npm test
```

## Build

```bash
npm run build
```




