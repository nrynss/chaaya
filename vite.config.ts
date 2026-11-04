import { sveltekit } from "@sveltejs/kit/vite"
import { configDefaults, defineConfig } from "vitest/config"

/** The binding directories, the only library code that may reach Svelte. */
const bindingTests = ["src/lib/svelte/**", "src/lib/sveltekit/**"]

/** Every library test outside the binding directories. */
const neutralTests = ["src/lib/!(svelte|sveltekit)/**/*.test.ts", "src/lib/*.test.ts"]

/* Three Vitest projects. The neutral project runs every library test outside
 * the binding directories with no Svelte plugin at all, so a module that
 * still needs the Svelte compiler fails to load there. The unit project runs
 * the remaining plain tests under the server build of Svelte, as it always
 * has. The binding project runs the rune tests (*.svelte.test.ts) under the
 * browser build in jsdom, because effects only run on the client. */
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        // No `extends`: this project inherits no plugin from the root, so
        // neither the Svelte compiler nor SvelteKit is in the pipeline.
        test: {
          name: "neutral",
          include: ["src/lib/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...bindingTests, "src/**/*.svelte.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          // The neutral project above runs every library test outside the
          // binding directories, so this one keeps the rest.
          exclude: [
            ...configDefaults.exclude,
            "src/**/*.svelte.test.ts",
            ...neutralTests
          ]
        }
      },
      {
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "svelte-client",
          include: ["src/**/*.svelte.test.ts"],
          environment: "jsdom"
        }
      }
    ]
  }
})
