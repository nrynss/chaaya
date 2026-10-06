import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import svelte from "eslint-plugin-svelte"
import globals from "globals"
import ts from "typescript-eslint"
import svelteConfig from "./svelte.config.js"

export default defineConfig(
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: ts.parser
    }
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig
      }
    }
  },
  {
    // Core ships behaviour, not looks. A stylesheet import or a visual
    // component import inside src/lib/core fails here, before review. The
    // patterns read the import source, so relative and bare imports fail
    // alike. The svelte suffix ends the match, so reactive modules such as
    // loop.svelte.js keep passing. An extensionless .svelte source fails too,
    // so reactive modules use the explicit .svelte.js form. Re-exports fail
    // the same way, and a dynamic import fails too.
    files: ["src/lib/core/**/*.ts", "src/lib/core/**/*.js", "src/lib/core/**/*.svelte"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/\\.css$/]",
          message: "Core imports no stylesheet. Keep the values in the consumer theme."
        },
        {
          selector: "ImportDeclaration[source.value=/\\.svelte$/]",
          message: "Core imports no visual component. Keep components in the consumer app."
        },
        {
          selector: "ExportNamedDeclaration[source.value=/\\.css$/], ExportAllDeclaration[source.value=/\\.css$/]",
          message: "Core re-exports no stylesheet. Keep the values in the consumer theme."
        },
        {
          selector: "ExportNamedDeclaration[source.value=/\\.svelte$/], ExportAllDeclaration[source.value=/\\.svelte$/]",
          message: "Core re-exports no visual component. Keep components in the consumer app."
        },
        {
          selector: "ImportExpression[source.value=/\\.css$/]",
          message: "Core imports no stylesheet, even lazily. Keep the values in the consumer theme."
        },
        {
          selector: "ImportExpression[source.value=/\\.svelte$/]",
          message: "Core imports no visual component, even lazily. Keep components in the consumer app."
        }
      ]
    }
  },
  globalIgnores([
    ".svelte-kit/",
    "api/*/",
    "dist/",
    "build/",
    "node_modules/",
    "playwright-report/",
    "test-results/"
  ])
)
