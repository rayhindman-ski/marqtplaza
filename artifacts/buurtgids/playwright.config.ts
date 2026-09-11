import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:22572',
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    // Cross-platform equivalent of `env -u REPL_ID PORT=22572 BASE_PATH=/ pnpm run dev`.
    // The previous inline `env -u ...` shell syntax is bash-only and fails on
    // Windows (cmd/PowerShell don't have an `env` binary). Setting env vars via
    // Playwright's `env` option avoids depending on a shell builtin entirely.
    // REPL_ID must stay unset (not just empty) so vite.config.ts's cartographer
    // plugin check (`REPL_ID !== undefined`) is skipped during e2e runs; passing
    // `undefined` here makes Node drop the key from the child process env.
    command: 'pnpm run dev',
    env: {
      PORT: '22572',
      BASE_PATH: '/',
      REPL_ID: undefined,
    },
    url: 'http://127.0.0.1:22572/activiteiten/den-haag',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});