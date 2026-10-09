import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('打包扩展：MV3、存储、真实注入通信、填写和页面切换保护', async () => {
  test.setTimeout(60000);
  const temp = await mkdtemp(join(tmpdir(), 'zheg-extension-'));
  let context;
  try {
    const extensionPath = join(temp, 'extension');
    await cp(resolve('dist'), extensionPath, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'sidePanel']);
    // Only the temporary harness gets loopback permission. This substitutes for
    // a human toolbar click granting activeTab; production manifest is unchanged.
    manifest.host_permissions = ['http://127.0.0.1/*'];
    await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(join(temp, 'browser'), {
      channel: 'chromium', executablePath: chromium.executablePath(), headless: true, timeout: 15000,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(worker.url()).host;
    const settings = await worker.evaluate(() => chrome.sidePanel.getPanelBehavior());
    expect(settings.openPanelOnActionClick).toBe(true);
    const form = await context.newPage();
    await form.goto('http://127.0.0.1:5188');
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(panel.locator('body')).toHaveClass('extension');
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('');
    await panel.getByRole('button', { name: '载入虚构演示档案' }).click();
    await panel.getByRole('button', { name: '保存档案', exact: true }).click();
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await form.bringToFront();
    await panel.getByRole('button', { name: '识别表单', exact: true }).click();
    await expect(panel.locator('.preview-stats strong').first()).toHaveText('22');
    await panel.getByRole('button', { name: '确认填写', exact: true }).click();
    await expect(form.locator('#application-form input[name=applicantName]')).toHaveValue('林知夏');
    await expect(form.locator('#application-form input[name=school2]')).toHaveValue('杭州电子科技大学');
    await expect(form.locator('#application-form select[name=degree1]')).toHaveValue('master');
    await panel.reload();
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('林知夏');
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await form.bringToFront();
    await panel.getByRole('button', { name: '识别表单', exact: true }).click();
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:5188');
    await other.bringToFront();
    await panel.getByRole('button', { name: '确认填写', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('当前页面已切换');
    await expect(other.locator('#application-form input[name=applicantName]')).toHaveValue('');
  } finally {
    await context?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
