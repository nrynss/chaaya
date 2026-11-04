import { sveltekit } from "@sveltejs/kit/vite"
import { configDefaults, defineConfig } from "vitest/config"

/* Two Vitest projects. The unit project runs every plain test under the
 * server build of Svelte, as it always has. The binding project runs the
 * rune tests (*.svelte.test.ts) under the browser build in jsdom, because
 * effects only run on the client. */
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.svelte.test.ts"]
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
