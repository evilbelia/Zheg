import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.ZHEG_CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5188', headless: true, channel: 'chromium', launchOptions: { executablePath } },
  webServer: { command: 'npm run dev -- --port 5188', url: 'http://127.0.0.1:5188', reuseExistingServer: false },
});
