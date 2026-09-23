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
    command: 'env -u REPL_ID PORT=22572 BASE_PATH=/ VITE_ACCOUNTS_ENABLED=1 VITE_BUSINESS_INTAKE_ENABLED=1 VITE_BUSINESS_PUBLICATION_ENABLED=1 VITE_CONSUMER_REGISTRATION_ENABLED=1 pnpm run dev',
    url: 'http://127.0.0.1:22572/activiteiten/den-haag',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});