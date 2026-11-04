import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import svelte from "eslint-plugin-svelte"
import globals from "globals"
import ts from "typescript-eslint"
import svelteConfig from "./svelte.config.js"

/** The library source outside the binding directories. */
const neutralFiles = ["src/lib/**/*.ts", "src/lib/**/*.js", "src/lib/**/*.svelte"]

/** The binding directories, the only library code that may reach Svelte. */
const bindingFiles = ["src/lib/svelte/**", "src/lib/sveltekit/**"]

/** A source that reaches Svelte: `svelte`, a `svelte/` subpath, any
 * `@sveltejs/` package, or a `.svelte` component file. */
const svelteSource = "/^(svelte(\\u002F.*)?|@sveltejs\\u002F.*|.*\\.svelte)$/"

/** The neutral import rules: a static import, a re-export, and a dynamic
 * import of a Svelte source each fail. */
const neutralImports = [
  {
    selector: `ImportDeclaration[source.value=${svelteSource}]`,
    message: "Only src/lib/svelte and src/lib/sveltekit import Svelte. Keep this module framework-neutral."
  },
  {
    selector: `ExportNamedDeclaration[source.value=${svelteSource}], ExportAllDeclaration[source.value=${svelteSource}]`,
    message: "Only src/lib/svelte and src/lib/sveltekit re-export Svelte. Keep this module framework-neutral."
  },
  {
    selector: `ImportExpression[source.value=${svelteSource}]`,
    message: "Only src/lib/svelte and src/lib/sveltekit import Svelte, even lazily. Keep this module framework-neutral."
  }
]

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
    // The library is framework-neutral outside the binding directories. A
    // Svelte import there, a SvelteKit import, or a component import fails
    // here, before review. The patterns read the import source, so a bare
    // specifier, a subpath and a relative path fail alike, and re-exports and
    // dynamic imports fail the same way. Runes are not imports, so
    // tools/guards/framework-neutral.mjs hunts them instead.
    files: neutralFiles,
    ignores: bindingFiles,
    rules: {
      "no-restricted-syntax": ["error", ...neutralImports]
    }
  },
  {
    // A .svelte.ts or .svelte.js module runs only under the Svelte compiler,
    // so a neutral directory holds none. The rule matches the whole file, so
    // its message names the file the moment one appears.
    files: ["src/lib/**/*.svelte.ts", "src/lib/**/*.svelte.js"],
    ignores: bindingFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "A .svelte.ts module needs the Svelte compiler. Outside src/lib/svelte and src/lib/sveltekit, use a plain .ts module on Notifier."
        }
      ]
    }
  },
  {
    // Core ships behaviour, not looks. A stylesheet import inside
    // src/lib/core fails here too, on top of the neutral rules above. One
    // rule setting replaces another for the same file, so this block repeats
    // the neutral patterns.
    files: ["src/lib/core/**/*.ts", "src/lib/core/**/*.js", "src/lib/core/**/*.svelte"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...neutralImports,
        {
          selector: "ImportDeclaration[source.value=/\\.css$/]",
          message: "Core imports no stylesheet. Keep the values in the consumer theme."
        },
        {
          selector: "ExportNamedDeclaration[source.value=/\\.css$/], ExportAllDeclaration[source.value=/\\.css$/]",
          message: "Core re-exports no stylesheet. Keep the values in the consumer theme."
        },
        {
          selector: "ImportExpression[source.value=/\\.css$/]",
          message: "Core imports no stylesheet, even lazily. Keep the values in the consumer theme."
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
