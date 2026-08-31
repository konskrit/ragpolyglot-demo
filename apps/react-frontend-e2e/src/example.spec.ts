import { test, expect } from '@playwright/test';

test('shows dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('RAGPolyglot')).toBeVisible();
});
