import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sampleProfile, profileSections, fieldsForRecord } from '../../src/profile.js';

test('REQ-20261009-05 真实扩展浏览器重启恢复、请求鉴权、可信存储与清除后重启', async () => {
  test.setTimeout(60000);
  const temp = await mkdtemp(join(tmpdir(), 'zheg-key-restart-'));
  let context;
  try {
    const extensionPath = join(temp, 'extension');
    await cp(resolve('dist'), extensionPath, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
    manifest.host_permissions = ['http://127.0.0.1/*']; // Harness only, for content-script access rejection check.
    await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
    const launch = async () => {
      context = await chromium.launchPersistentContext(join(temp, 'browser'), {
        channel: 'chromium', executablePath: chromium.executablePath(), headless: true, timeout: 15000,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
      const panel = await context.newPage();
      panel.on('pageerror', error => errors.push(error.message));
      await panel.goto(`chrome-extension://${new URL(worker.url()).host}/workspace.html`);
      await panel.getByRole('button', { name: '智能识别', exact: true }).click();
      return { panel, worker };
    };
    const errors = [];
    let { panel, worker } = await launch();
    await panel.locator('select[name=provider]').selectOption('custom');
    await panel.locator('input[name=baseURL]').fill('http://127.0.0.1:5188/mock');
    await panel.locator('input[name=model]').fill('mock-model');
    await panel.locator('input[name=apiKey]').fill('restart-fake-key');
    await panel.getByRole('button', { name: '保存模型设置' }).click();
    await expect(panel.getByRole('status')).toContainText('模型设置已保存');
    // Close the entire browser, rather than reloading a panel or service worker.
    await context.close();
    ({ panel, worker } = await launch());
    await expect(panel.locator('input[name=apiKey]')).toHaveValue('restart-fake-key');
    await expect(panel.locator('input[name=baseURL]')).toHaveValue('http://127.0.0.1:5188/mock');
    expect(await worker.evaluate(async () => (await chrome.storage.session.get('modelKey')).modelKey)).toBeUndefined();
    let calls = 0;
    await context.route('http://127.0.0.1:5188/mock/chat/completions', async route => {
      calls++;
      expect(route.request().headers().authorization).toBe('Bearer restart-fake-key');
      expect(route.request().postData()).not.toContain('restart-fake-key');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) });
    });
    await panel.getByRole('button', { name: '测试 API Key' }).click();
    await expect(panel.getByRole('status')).toContainText('连接测试成功');
    expect(calls).toBe(1);
    const webPage = await context.newPage();
    await webPage.goto('http://127.0.0.1:5188');
    const denied = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:5188/*' });
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
        try { await chrome.storage.local.get('modelCredential'); return false; }
        catch { return true; }
      } });
      return result.result;
    });
    expect(denied).toBe(true);
    await worker.evaluate(() => chrome.storage.local.set({ profile: { marker: 'profile-unchanged' }, recognitionMemory: { marker: 'memory-unchanged' } }));
    const before = await worker.evaluate(() => chrome.storage.local.get(['profile', 'modelConfig', 'recognitionMemory']));
    await panel.getByRole('button', { name: '清除已保存 API Key' }).click();
    await expect(panel.getByRole('status')).toContainText('API Key 已清除');
    await context.close();
    ({ panel, worker } = await launch());
    await expect(panel.locator('input[name=apiKey]')).toHaveValue('');
    expect(await worker.evaluate(() => chrome.storage.local.get(['profile', 'modelConfig', 'recognitionMemory']))).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await rm(temp, { recursive: true, force: true });
  }
});

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
    const runtimeErrors = [];
    panel.on('pageerror', error => runtimeErrors.push(error.message));
    await panel.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(panel.locator('body')).toHaveClass('extension');
    await expect(panel.locator('.tip-card')).not.toContainText('JSON');
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('');
    await panel.locator('#profile-text').fill('未配置时的虚构文本');
    await panel.getByRole('button', { name: '载入个人信息' }).click();
    await expect(panel.getByRole('status')).toContainText('请先在智能识别中配置');
    await panel.getByRole('button', { name: '智能识别', exact: true }).click();
    await panel.locator('select[name=provider]').selectOption('custom');
    await panel.locator('input[name=baseURL]').fill('http://127.0.0.1:5188/mock');
    await panel.locator('input[name=model]').fill('mock-model');
    await panel.locator('input[name=apiKey]').fill('fake-extension-key');
    await panel.getByRole('button', { name: '保存模型设置' }).click();
    await expect(panel.getByRole('status')).toContainText('模型设置已保存');
    const fixture = sampleProfile();
    const extracted = { sections: profileSections(fixture).filter(s => s.records.length).map(s => ({ title: s.title, records: s.records.map((_, i) => ({ fields: fieldsForRecord(fixture, s.id, i).map(({ label, value, type }) => ({ label, value, type })) })) })) };
    // Regression: a model can echo day precision despite the month-only prompt.
    extracted.sections.find(s => s.title === '实习经历').records[0].fields.find(f => f.label === '开始时间').value = '2025-07-28';
    await context.route('http://127.0.0.1:5188/mock/chat/completions', async route => {
      const body = route.request().postDataJSON(), input = JSON.parse(body.messages[1].content);
      expect(input.text).toBe('虚构测试简历');
      expect(JSON.stringify(input.outline)).not.toContain('林知夏');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(extracted) } }] }) });
    });
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await panel.locator('#profile-text').fill('虚构测试简历');
    await panel.getByRole('button', { name: '载入个人信息' }).click();
    await expect(panel.getByRole('status')).toContainText('个人信息已载入编辑区');
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('profile')).profile)).toBeUndefined();
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('林知夏');
    await expect(panel.locator('input[name="internships:0:startDate"]')).toHaveValue('2025-07');
    // New extraction values update the draft while leaving persisted data untouched.
    await panel.locator('input[name="personal:0:fullName"]').fill('旧的虚构姓名');
    await panel.locator('input[name="internships:0:position"]').fill('旧的虚构职位');
    await panel.getByRole('button', { name: '载入个人信息' }).click();
    await expect(panel.getByRole('status')).toContainText('更新 2 项');
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('林知夏');
    await expect(panel.locator('input[name="internships:0:position"]')).toHaveValue('前端开发实习生');
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('profile')).profile)).toBeUndefined();
    await panel.getByRole('button', { name: '智能识别', exact: true }).click();
    await panel.locator('input[name=autoInfer]').uncheck();
    await expect(panel.getByRole('status')).toContainText('已关闭');
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await panel.getByRole('button', { name: '保存档案', exact: true }).click();
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await form.bringToFront();
    await panel.getByRole('button', { name: '识别表单', exact: true }).click();
    await expect(panel.locator('.preview-stats strong').first()).toHaveText('22');
    const schoolSource = panel.locator('.preview-row').filter({ hasText: '所在高校 *' }).first();
    await expect(schoolSource.locator('.source-trigger')).toContainText('教育经历');
    await expect(schoolSource.locator('.source-trigger')).toHaveAttribute('data-value', 'education[].school::0');
    await schoolSource.locator('.source-trigger').click();
    await schoolSource.locator('[data-source-module=education]').click();
    expect(await schoolSource.locator('[data-source-field]').allTextContents()).not.toContain('姓名');
    await schoolSource.locator('[data-source-field="education[].school"][data-source-index="0"]').click();
    await expect(schoolSource.locator('.source-trigger')).toHaveAttribute('aria-expanded', 'false');
    await panel.getByRole('button', { name: '确认填写', exact: true }).click();
    await expect(form.locator('#application-form input[name=applicantName]')).toHaveValue('林知夏');
    await expect(form.locator('#application-form input[name=school2]')).toHaveValue('杭州电子科技大学');
    await expect(form.locator('#application-form select[name=degree1]')).toHaveValue('master');
    let modelCalls = 0;
    await context.route('http://127.0.0.1:5188/mock/chat/completions', async route => {
      expect(route.request().headers().authorization).toBe('Bearer fake-extension-key');
      const body = route.request().postDataJSON();
      let content = 'OK';
      if (body.messages[0].content !== 'Reply with OK.') {
        modelCalls++;
        const payload = JSON.parse(body.messages[1].content);
        expect(JSON.stringify(payload)).not.toContain('林知夏');
        expect(payload.fields).toHaveLength(modelCalls === 1 ? 2 : 1);
        content = JSON.stringify({ mappings: payload.fields.map(f => ({ fieldId: f.fieldId, profilePath: f.label === '你的称呼' ? 'personal.fullName' : null })) });
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }] }) });
    });
    await panel.getByRole('button', { name: '智能识别', exact: true }).click();
    await panel.locator('select[name=provider]').selectOption('custom');
    await panel.locator('input[name=baseURL]').fill('http://127.0.0.1:5188/mock');
    await panel.locator('input[name=model]').fill('mock-model');
    await panel.locator('input[name=apiKey]').fill('fake-extension-key');
    await panel.getByRole('button', { name: '测试 API Key' }).click();
    await expect(panel.getByRole('status')).toContainText('连接测试成功');
    expect((await worker.evaluate(async () => (await chrome.storage.local.get('modelConfig')).modelConfig)).autoInfer).toBe(false);
    await panel.locator('input[name=autoInfer]').check();
    await expect(panel.getByRole('status')).toContainText('已开启');
    await panel.getByRole('button', { name: '保存模型设置' }).click();
    await expect(panel.getByRole('status')).toContainText('模型设置已保存');
    expect(await worker.evaluate(async () => (await chrome.storage.session.get('modelKey')).modelKey)).toBeUndefined();
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('modelCredential')).modelCredential.key)).toBe('fake-extension-key');
    expect(JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(['profile', 'modelConfig', 'recognitionMemory'])))).not.toContain('fake-extension-key');
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await form.bringToFront();
    await panel.getByRole('button', { name: '重新识别', exact: true }).click();
    const preferred = panel.locator('.preview-row').filter({ hasText: '你的称呼' });
    await expect(preferred).toContainText('模型建议');
    await expect(preferred.locator('input[type=checkbox]').first()).not.toBeChecked();
    await expect(form.locator('input[name=preferredName]')).toHaveValue('');
    await preferred.locator('input[type=checkbox]').first().check();
    await panel.getByRole('button', { name: '确认填写', exact: true }).click();
    await expect(form.locator('input[name=preferredName]')).toHaveValue('林知夏');
    await expect(panel.getByRole('status')).toContainText('填写完成');
    const memory = await worker.evaluate(async () => (await chrome.storage.local.get('recognitionMemory')).recognitionMemory);
    // The new real picker interaction also confirms the school mapping.
    expect(memory.entries).toEqual([
      { origin: 'http://127.0.0.1:5188', section: 'education', label: '所在高校', type: 'text', options: [], path: 'education[].school' },
      { origin: 'http://127.0.0.1:5188', section: 'named/其他信息', label: '你的称呼', type: 'text', options: [], path: 'personal.fullName' },
    ]);
    expect(JSON.stringify(memory)).not.toContain('林知夏');
    await panel.reload();
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await expect(panel.locator('input[name="personal:0:fullName"]')).toHaveValue('林知夏');
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await form.bringToFront();
    await panel.getByRole('button', { name: '识别表单', exact: true }).click();
    await expect(preferred).toContainText('识别记忆');
    expect(modelCalls).toBe(2);
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:5188');
    await other.bringToFront();
    await panel.getByRole('button', { name: '确认填写', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('当前页面已切换');
    await expect(other.locator('#application-form input[name=applicantName]')).toHaveValue('');
    // Permission denial is deterministic; the production automatic scan still
    // uses the real permissions.contains API and never requests permission itself.
    let deniedCalls = 0;
    await context.route('https://api.deepseek.com/**', route => { deniedCalls++; return route.abort(); });
    await panel.getByRole('button', { name: '智能识别', exact: true }).click();
    await panel.locator('select[name=provider]').selectOption('deepseek');
    await panel.locator('input[name=apiKey]').fill('fake-deepseek-key');
    await panel.evaluate(() => { chrome.permissions.request = async () => false; });
    await panel.getByRole('button', { name: '测试 API Key' }).click();
    await expect(panel.getByRole('status')).toContainText('未授权模型服务访问');
    await panel.getByRole('button', { name: '保存模型设置' }).click();
    await expect(panel.getByRole('status')).toContainText('设置已保存，但未授权');
    await panel.getByRole('button', { name: '填写预览', exact: true }).click();
    await other.bringToFront();
    await panel.getByRole('button', { name: '重新识别', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('未授权模型服务访问');
    await expect(panel.getByRole('button', { name: '确认填写', exact: true })).toBeEnabled();
    expect(deniedCalls).toBe(0);
    await panel.getByRole('button', { name: '本地档案', exact: true }).click();
    await panel.locator('#profile-text').fill('权限拒绝的虚构信息');
    const profileBefore = await worker.evaluate(async () => (await chrome.storage.local.get('profile')).profile);
    await panel.getByRole('button', { name: '载入个人信息' }).click();
    await expect(panel.getByRole('status')).toContainText('未授权模型服务访问');
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('profile')).profile)).toEqual(profileBefore);
    expect(deniedCalls).toBe(0);
    expect(runtimeErrors).toEqual([]);

  } finally {
    await context?.close();
    await rm(temp, { recursive: true, force: true });
  }
});
