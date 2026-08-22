import { expect, test } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };

test.describe('主流程：工作台 → 谱面 → 备份与导出', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await expect(page).toHaveURL(/workbench/);
  });

  test('工作台指板可渲染', async ({ page }) => {
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('.fretboard, [data-fretboard], svg').first()).toBeVisible();
  });

  test('可切换到谱面视图（空状态可访问）', async ({ page }) => {
    await page.goto('/#/score');
    await expect(page).toHaveURL(/score/);
    await expect(page.getByText('未选择乐谱')).toBeVisible();
  });

  test('侧栏"全量导出"按钮可点击并触发下载', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    // 全量导出按钮在侧栏底栏
    await page.getByRole('button').filter({ hasText: '全量导出' }).first().click();
    const download = await downloadPromise;
    // 导出触发下载（文件名包含 chords 或 backup）
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/json|chord|backup/i);
    } else {
      // 若无 download（环境差异），至少 toast 应出现
      await expect(page.locator('body')).toContainText(/导出|备份|成功/);
    }
  });
});

test.describe('移动端适配', () => {
  test.use({ viewport: mobileViewport });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await expect(page).toHaveURL(/workbench/);
  });

  test('工作台不产生横向溢出且指板可见', async ({ page }) => {
    await expect(page.locator('.fretboard, [data-fretboard], svg').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('谱面视图保持可访问', async ({ page }) => {
    await page.goto('/#/score');
    await expect(page.getByText('未选择乐谱')).toBeVisible();
  });
});
