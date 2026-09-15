import adapter from "@sveltejs/adapter-node"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/* The harness carries runtime routes that a static export cannot serve, so the
 * node adapter keeps them live in a production server. The browser leg runs
 * that build, which has no dependency re-optimization and no reloading graph. */

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
}

export default config
