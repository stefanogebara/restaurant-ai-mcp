import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Em CI o reporter 'html' sozinho não imprime UMA linha durante a execução.
  // Quando o live-smoke voltou a rodar (ago/2026), isso produziu 24 minutos de
  // silêncio absoluto seguidos de "operation was canceled" pelo timeout do job:
  // impossível saber se travou, se estava lento ou em que teste parou. O 'list'
  // ao lado devolve progresso por teste; o html segue sendo gerado para o
  // artefato. Local continua só html.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.PW_BASE_URL || 'https://seatable.one',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // One-time auth setup: npx playwright test e2e/auth.setup.ts --headed
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: [],  // don't force setup — auth-state.json is optional
    },
  ],
});
