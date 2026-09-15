import { defineConfig } from "@playwright/test"

/** The browser gate proves what jsdom cannot. The library ships no server of
 * its own, so the leg serves the production node build. Three engines keep
 * engine specific behaviour honest, and one invocation shares one server for
 * all of them. */
export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && node build/index.js",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: {
      PORT: "4173",
      HOST: "127.0.0.1",
      ORIGIN: "http://127.0.0.1:4173"
    }
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ]
})
