import { defineConfig } from "@playwright/test"

/** The browser gate proves what jsdom cannot. The library ships no server of
 * its own, so the leg serves the production node build. Three engines keep
 * engine specific behaviour honest, and one invocation shares one server for
 * all of them.
 *
 * The sink loss pin needs a firefox whose audio sink dies under a playing
 * clip. PULSE_SERVER points libpulse at a unix socket no server owns, and
 * ALSA_CONFIG_PATH hides the alsa-lib configuration from the alsa fallback.
 * Neither backend opens, so a clip that plays loses its sink moments in. The
 * break also kills the Web Audio path the capture specs record through, so
 * the plain firefox project skips the playback spec and the firefox-sink
 * project runs that spec alone. A sink the host happens to lack is a
 * coincidence, so the loss comes from this environment instead. Chromium and
 * webkit inherit the shell environment. */
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
    /** The command builds the production bundle before the server answers.
     * Sixty seconds is not enough for that build on a busy machine. */
    timeout: 180_000,
    env: {
      PORT: "4173",
      HOST: "127.0.0.1",
      ORIGIN: "http://127.0.0.1:4173"
    }
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      testIgnore: "**/audio-playback.spec.ts",
      use: { browserName: "firefox" }
    },
    {
      name: "firefox-sink",
      testMatch: "**/audio-playback.spec.ts",
      use: {
        browserName: "firefox",
        launchOptions: {
          env: {
            ...process.env,
            PULSE_SERVER: "unix:/nonexistent",
            ALSA_CONFIG_PATH: "/nonexistent/asound.conf"
          }
        }
      }
    },
    { name: "webkit", use: { browserName: "webkit" } }
  ]
})
