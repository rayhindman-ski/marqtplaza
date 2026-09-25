import { defineConfig } from '@playwright/test';

// Each regression workflow can run on its own port so parallel runs never
// fight over one dev server.
const port = process.env.PW_PORT ?? '22572';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    command: `env -u REPL_ID PORT=${port} BASE_PATH=/ VITE_ACCOUNTS_ENABLED=1 VITE_BUSINESS_INTAKE_ENABLED=1 VITE_BUSINESS_PUBLICATION_ENABLED=1 VITE_CONSUMER_REGISTRATION_ENABLED=1 pnpm run dev`,
    url: `http://127.0.0.1:${port}/activiteiten/den-haag`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});