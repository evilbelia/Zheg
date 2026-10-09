import { test, expect } from '@playwright/test';

test('完整演示：识别不填、上下文映射、多段经历、手动映射与跳过', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '重复的信息，交给折桂' })).toBeVisible();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(page.locator('#application-form input[name=applicantName]')).toHaveValue('');
  await expect(page.locator('.preview-stats strong').nth(0)).toHaveText('22');
  await expect(page.locator('.preview-stats strong').nth(1)).toHaveText('20');
  await expect(page.locator('.preview-stats strong').nth(2)).toHaveText('2');
  const fillBox = await page.getByRole('button', { name: '确认填写', exact: true }).boundingBox();
  expect(fillBox.y + fillBox.height).toBeLessThanOrEqual(page.viewportSize().height);
  const nameRow = page.locator('.preview-row').filter({ has: page.getByRole('checkbox', { name: '填写 姓名 *', exact: true }) });
  await nameRow.locator('input[type=checkbox]').uncheck();
  const preferred = page.locator('.preview-row').filter({ hasText: '你的称呼' });
  await preferred.locator('select').selectOption('personal.fullName::0');
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.locator('#application-form input[name=applicantName]')).toHaveValue('');
  await expect(page.locator('#application-form input[name=preferredName]')).toHaveValue('林知夏');
  await expect(page.locator('#application-form input[name=school1]')).toHaveValue('浙江大学');
  await expect(page.locator('#application-form input[name=school2]')).toHaveValue('杭州电子科技大学');
  await expect(page.locator('#application-form input[name=eduStart1]')).toHaveValue('2024-09');
  await expect(page.locator('#application-form input[name=internStart]')).toHaveValue('2025-07');
  await expect(page.locator('#application-form select[name=degree1]')).toHaveValue('master');
  await expect(page.locator('#application-form input[value=female]')).toBeChecked();
  await expect(page.locator('#application-form input[name=referral]')).toHaveValue('QH-CAMPUS');
  await expect(page.getByRole('status')).toContainText('填写完成');
});

test('已有值保护与显式覆盖；切换教育记录', async ({ page }) => {
  await page.goto('/');
  await page.locator('#application-form input[name=applicantName]').fill('已有姓名');
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await page.getByRole('combobox', { name: '教育经历对应记录', exact: true }).first().selectOption('1');
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.locator('#application-form input[name=applicantName]')).toHaveValue('已有姓名');
  await expect(page.locator('#application-form input[name=school1]')).toHaveValue('杭州电子科技大学');
  const nameRow = page.locator('.preview-row').filter({ has: page.getByRole('checkbox', { name: '填写 姓名 *', exact: true }) });
  await nameRow.getByRole('checkbox', { name: '覆盖网页已有内容' }).check();
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.locator('#application-form input[name=applicantName]')).toHaveValue('林知夏');
});

test('档案保存刷新恢复、非法导入不覆盖；导出 JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await page.locator('input[name="personal:0:fullName"]').fill('测试用户');
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('测试用户');
  await page.locator('#import-profile').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.getByRole('status')).toContainText('导入失败');
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('测试用户');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  expect((await download).suggestedFilename()).toBe('zheg-profile.json');
});

async function configureCustom(page, { auto = true, key = 'test-secret' } = {}) {
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.locator('select[name=provider]').selectOption('custom');
  await page.locator('input[name=baseURL]').fill('https://model.example/v1');
  await page.locator('input[name=model]').fill('test-model');
  await page.locator('input[name=apiKey]').fill(key);
  await page.locator('input[name=autoInfer]').setChecked(auto);
  await page.getByRole('button', { name: '保存模型设置' }).click();
  await expect(page.getByRole('status')).toContainText('模型设置已保存');
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
}
const completion = content => JSON.stringify({ choices: [{ message: { content } }] });

test('自动模型 mock：仅发送待确认字段，确认成功后复用记忆，刷新恢复与清空', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('https://model.example/v1/chat/completions', async route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(JSON.stringify(body)).not.toContain('林知夏');
    expect(JSON.stringify(body)).not.toContain('QH-CAMPUS');
    expect(JSON.stringify(body)).not.toContain('http://127.0.0.1');
    const fields = JSON.parse(body.messages[1].content).fields;
    expect(fields.map(f => f.label)).toEqual(['你的称呼']);
    await route.fulfill({ contentType: 'application/json', body: completion(JSON.stringify({ mappings: fields.map(f => ({ fieldId: f.fieldId, profilePath: 'personal.fullName' })) })) });
  });
  await configureCustom(page);
  expect(calls).toBe(0);
  await page.locator('input[name=referral]').evaluate(el => el.closest('label').remove());
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  const row = page.locator('.preview-row').filter({ hasText: '你的称呼' });
  await expect(row).toContainText('模型建议');
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  await expect(page.locator('input[name=preferredName]')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('zheg:recognitionMemory'))).toBeNull();
  await row.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('填写完成');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:recognitionMemory')));
  expect(stored.entries).toHaveLength(1);
  expect(stored.entries[0].path).toBe('personal.fullName');
  expect(JSON.stringify(stored)).not.toContain('林知夏');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-secret');
  await page.reload();
  await page.locator('input[name=referral]').evaluate(el => el.closest('label').remove());
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(row).toContainText('识别记忆');
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.getByRole('button', { name: '清空识别记忆' }).click();
  await expect(page.getByRole('status')).toContainText('识别记忆已清空');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:recognitionMemory')).entries)).toEqual([]);
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '重新识别', exact: true }).click();
  await expect(row).toContainText('模型建议');
  expect(calls).toBe(2);
});

test('关闭自动智能识别立即生效并持久化；手动成功映射仍可积累', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('https://model.example/**', route => { calls++; return route.abort(); });
  await configureCustom(page, { auto: false });
  await page.reload();
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(page.locator('input[name=autoInfer]')).not.toBeChecked();
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  const row = page.locator('.preview-row').filter({ hasText: '你的称呼' });
  await expect(row).toContainText('需要确认');
  await expect(page.locator('#infer')).toHaveCount(0);
  await row.locator('select').selectOption('personal.fullName::0');
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('填写完成');
  await page.getByRole('button', { name: '重新识别', exact: true }).click();
  await expect(row).toContainText('识别记忆');
  expect(calls).toBe(0);
});

test('全匹配不调用模型；自动模型失败仍可手动填写', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('https://model.example/**', route => { calls++; return route.fulfill({ status: 500, body: 'test-secret must not be shown' }); });
  await configureCustom(page);
  await page.locator('input[name=preferredName]').evaluate(el => el.closest('label').remove());
  await page.locator('input[name=referral]').evaluate(el => el.closest('label').remove());
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(page.locator('.preview-stats strong').nth(2)).toHaveText('0');
  expect(calls).toBe(0);
  await page.reload();
  await configureCustom(page);
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 500');
  await expect(page.getByRole('status')).not.toContainText('test-secret');
  await page.locator('.preview-row').filter({ hasText: '你的称呼' }).locator('select').selectOption('personal.fullName::0');
  await page.getByRole('button', { name: '确认填写' }).click();
  await expect(page.locator('input[name=preferredName]')).toHaveValue('林知夏');
  expect(calls).toBe(1);
});

test('DeepSeek 默认配置与测试 API Key：当前草稿、不自动保存、401 与无效回答', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(page.locator('select[name=provider]')).toHaveValue('deepseek');
  await expect(page.locator('input[name=baseURL]')).toHaveValue('https://api.deepseek.com/v1');
  await expect(page.locator('input[name=baseURL]')).toHaveAttribute('readonly', '');
  await expect(page.locator('select[name=model]')).toHaveValue('deepseek-chat');
  await expect(page.locator('input[name=autoInfer]')).toBeChecked();
  await page.getByRole('button', { name: '测试 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('请先输入');
  await page.locator('input[name=apiKey]').fill('draft-fake-key');
  await page.route('https://api.deepseek.com/v1/chat/completions', async route => {
    expect(route.request().headers().authorization).toBe('Bearer draft-fake-key');
    const body = route.request().postDataJSON();
    expect(body.messages).toEqual([{ role: 'user', content: 'Reply with OK.' }]);
    await route.fulfill({ contentType: 'application/json', body: completion('OK') });
  });
  await page.getByRole('button', { name: '测试 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('连接测试成功');
  expect(await page.evaluate(() => localStorage.getItem('zheg:modelConfig'))).toBeNull();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('draft-fake-key');
  await page.route('https://api.deepseek.com/**', route => route.fulfill({ status: 401, body: 'draft-fake-key' }));
  await page.getByRole('button', { name: '测试 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('API Key 无效');
  await expect(page.getByRole('status')).not.toContainText('draft-fake-key');
  await page.route('https://api.deepseek.com/**', route => route.fulfill({ contentType: 'application/json', body: completion('') }));
  await page.getByRole('button', { name: '测试 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('有效的回答');
  await expect(page.getByRole('button', { name: '保存模型设置' })).toBeEnabled();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('窄屏无水平溢出，页面不执行脚本标签', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await page.locator('input[name="personal:0:fullName"]').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.preview-list img')).toHaveCount(0);
});
