import { expect, test } from '@playwright/test';

test('应用可加载并进入工作台', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/workbench/);
  await expect(page.locator('body')).not.toBeEmpty();
});
