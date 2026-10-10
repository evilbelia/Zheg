import { test, expect } from '@playwright/test';

const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), '界面操作不能产生未处理的运行时错误').toEqual([]);
});

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

test('档案保存刷新恢复；旧导入导出和演示载入入口移除', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('#profile-text')).toBeVisible();
  await expect(page.getByRole('button', { name: '载入个人信息', exact: true })).toBeVisible();
  for (const name of ['导出 JSON', '导入 JSON', '载入虚构演示档案']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.locator('input[name="personal:0:fullName"]').fill('测试用户');
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('测试用户');
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

test('REQ-20261009-05 演示保存、刷新、关闭重开、替换与清除密钥', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await configureCustom(page);
  await page.reload();
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(page.locator('input[name=apiKey]')).toHaveValue('test-secret');
  await expect(page.locator('input[name=apiKey]')).toHaveAttribute('type', 'password');
  await page.close();
  const reopened = await context.newPage();
  const errors = [];
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/');
  await reopened.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(reopened.locator('input[name=apiKey]')).toHaveValue('test-secret');
  await reopened.locator('input[name=apiKey]').fill('replacement-fake');
  await reopened.getByRole('button', { name: '保存模型设置' }).click();
  await expect(reopened.getByRole('status')).toContainText('模型设置已保存');
  await reopened.reload();
  await reopened.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(reopened.locator('input[name=apiKey]')).toHaveValue('replacement-fake');
  let calls = 0;
  await reopened.route('https://model.example/**', async route => {
    calls++;
    expect(route.request().headers().authorization).toBe('Bearer replacement-fake');
    expect(route.request().postData()).not.toContain('replacement-fake');
    await route.fulfill({ contentType: 'application/json', body: completion('OK') });
  });
  await reopened.getByRole('button', { name: '测试 API Key' }).click();
  await expect(reopened.getByRole('status')).toContainText('连接测试成功');
  expect(calls).toBe(1);
  const before = await reopened.evaluate(() => [localStorage.getItem('zheg:profile'), localStorage.getItem('zheg:modelConfig'), localStorage.getItem('zheg:recognitionMemory')]);
  await reopened.getByRole('button', { name: '清除已保存 API Key' }).click();
  await expect(reopened.getByRole('status')).toContainText('API Key 已清除');
  await reopened.reload();
  await reopened.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(reopened.locator('input[name=apiKey]')).toHaveValue('');
  expect(await reopened.evaluate(() => [localStorage.getItem('zheg:profile'), localStorage.getItem('zheg:modelConfig'), localStorage.getItem('zheg:recognitionMemory')])).toEqual(before);
  // DeepSeek cannot silently send a request after explicit clearing.
  await reopened.locator('select[name=provider]').selectOption('deepseek');
  await reopened.getByRole('button', { name: '测试 API Key' }).click();
  await expect(reopened.getByRole('status')).toContainText('请先输入');
  expect(errors).toEqual([]);
});

test('REQ-20261009-05 变更目标不带旧密钥，测试草稿不替换已保存凭据', async ({ page }) => {
  await page.goto('/');
  await configureCustom(page);
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.locator('input[name=apiKey]').fill('unsaved-fake');
  await page.route('https://model.example/**', route => route.fulfill({ contentType: 'application/json', body: completion('OK') }));
  await page.getByRole('button', { name: '测试 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('连接测试成功');
  await page.reload();
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(page.locator('input[name=apiKey]')).toHaveValue('test-secret');
  await page.locator('input[name=baseURL]').fill('https://another.example/v1');
  await expect(page.locator('input[name=apiKey]')).toHaveValue('');
  await page.locator('input[name=apiKey]').fill('another-fake');
  await page.locator('select[name=provider]').selectOption('deepseek');
  await expect(page.locator('input[name=apiKey]')).toHaveValue('');
});

test('REQ-20261009-05 存储错误不假报成功、不泄露密钥，读取失败仍可手动匹配', async ({ page }) => {
  await page.goto('/');
  await configureCustom(page);
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'zheg:modelCredential') throw new Error('test-secret');
      return original.call(this, key, value);
    };
  });
  await page.locator('input[name=apiKey]').fill('replacement-fake');
  await page.getByRole('button', { name: '保存模型设置' }).click();
  await expect(page.getByRole('status')).toContainText('保存失败');
  await page.getByRole('button', { name: '清除已保存 API Key' }).click();
  await expect(page.getByRole('status')).toContainText('清除失败');
  await expect(page.getByRole('status')).not.toContainText('test-secret');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:modelCredential')).key)).toBe('test-secret');
  await page.reload();
  await page.evaluate(() => localStorage.setItem('zheg:modelCredential', '{invalid'));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('API Key 读取或迁移失败');
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await expect(page.locator('input[name=apiKey]')).toHaveValue('');
  await page.locator('input[name=autoInfer]').uncheck();
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认填写', exact: true })).toBeEnabled();
});

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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:modelCredential')).key)).toBe('test-secret');
  expect(await page.evaluate(() => JSON.stringify(['profile', 'modelConfig', 'recognitionMemory'].map(key => localStorage.getItem(`zheg:${key}`))))).not.toContain('test-secret');
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

test('REQ-20261009-03 文本载入归类、草稿不自动保存、重复去重与失败保护', async ({ page }) => {
  await page.goto('/');
  await configureCustom(page, { auto: false });
  const text = '姓名：另一姓名\n实习：示例科技有限公司，是否有实习证明：是\n家庭：父亲，教师';
  let calls = 0;
  await page.route('https://model.example/v1/chat/completions', async route => {
    calls++;
    const body = route.request().postDataJSON(), payload = JSON.parse(body.messages[1].content);
    expect(payload.text).toBe(text);
    expect(JSON.stringify(payload.outline)).not.toContain('林知夏');
    expect(JSON.stringify(payload.outline)).not.toContain('浙江大学');
    expect(Object.keys(payload).sort()).toEqual(['outline', 'text']);
    await route.fulfill({ contentType: 'application/json', body: completion(JSON.stringify({ sections: [
      { title: '基本信息', records: [{ fields: [{ label: '姓名', value: '另一姓名', type: 'text' }, { label: '英语等级', value: '六级', type: 'text' }] }] },
      { title: '实习经历', records: [{ fields: [{ label: '公司', value: '示例科技有限公司', type: 'text' }, { label: '是否有实习证明', value: '是', type: 'text' }] }] },
      { title: '家庭信息', records: [{ fields: [{ label: '成员关系', value: '父亲', type: 'text' }, { label: '职业', value: '教师', type: 'text' }] }] },
    ] })) });
  });
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.getByText(/点击载入会将上方原文/)).toBeVisible();
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('请先粘贴');
  expect(calls).toBe(0);
  await page.locator('#profile-text').fill(text);
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('个人信息已载入编辑区');
  await expect(page.getByRole('status')).toContainText('保留原值或删除状态 1 项');
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('林知夏');
  await expect(page.getByRole('textbox', { name: '是否有实习证明内容', exact: true })).toHaveValue('是');
  await expect(page.getByRole('textbox', { name: '成员关系内容', exact: true })).toHaveValue('父亲');
  await expect(page.locator('[data-profile-input=label]')).toHaveCount(0);
  await expect(page.locator('.profile-field').filter({ has: page.getByRole('textbox', { name: '成员关系内容', exact: true }) }).locator('.field-title')).toHaveText('成员关系');
  expect(await page.evaluate(() => localStorage.getItem('zheg:profile'))).toBeNull();
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('新增或补充 0 项');
  expect(await page.locator('[data-profile-section=internships] .profile-record').count()).toBe(1);
  expect(await page.locator('[data-profile-section]').filter({ has: page.getByRole('heading', { name: '家庭信息', exact: true }) }).locator('.profile-record').count()).toBe(1);
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  const before = await page.evaluate(() => localStorage.getItem('zheg:profile'));
  expect(before).not.toContain(text);
  await page.locator('input[name="personal:0:fullName"]').fill('未保存姓名');
  await page.route('https://model.example/**', route => route.fulfill({ contentType: 'application/json', body: completion('{bad') }));
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('原编辑内容和已保存档案未改变');
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('未保存姓名');
  expect(await page.evaluate(() => localStorage.getItem('zheg:profile'))).toBe(before);
  await page.route('https://model.example/**', route => route.fulfill({ status: 401, body: 'do not expose test-secret' }));
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 401');
  await expect(page.getByRole('status')).not.toContainText('test-secret');
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('#profile-text')).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '成员关系内容', exact: true })).toHaveValue('父亲');
});

test('REQ-20261010-01 混合日期不阻断个人信息载入，保存刷新恢复与失败保护', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('zheg:profile', JSON.stringify({ schemaVersion: 1, personal: {}, education: [], internships: [] })));
  await page.reload();
  await configureCustom(page, { auto: false });
  const text = '# 个人信息\n**姓名：**虚构用户\n# 教育经历\n学校：测试大学\n主修专业：计算机\n开始日期：2023年9月\n# 实习工作经历\n工作单位：测试公司\n开始时间：2025-07-28\n结束日期：至今\n项目时间：2025.06-2025.07';
  const result = { sections: [
    { title: '个人信息', records: [{ fields: [{ label: '姓名', value: '虚构用户', type: 'text' }, { label: '爱好', value: '阅读', type: 'text' }] }] },
    { title: '教育经历', records: [{ fields: [{ label: '学校', value: '测试大学', type: 'text' }, { label: '主修专业', value: '计算机', type: 'text' }, { label: '开始日期', value: '2023年9月', type: 'text' }] }] },
    { title: '实习工作经历', records: [{ fields: [{ label: '工作单位', value: '测试公司', type: 'text' }, { label: '开始时间', value: '2025-07-28', type: 'date' }, { label: '结束日期', value: '至今', type: 'date' }, { label: '项目时间', value: '2025.06-2025.07', type: 'date' }] }] },
  ] };
  let calls = 0;
  await page.route('https://model.example/v1/chat/completions', route => {
    calls++;
    expect(JSON.parse(route.request().postDataJSON().messages[1].content).text).toBe(text);
    return route.fulfill({ contentType: 'application/json', body: completion(JSON.stringify(result)) });
  });
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  const original = await page.evaluate(() => localStorage.getItem('zheg:profile'));
  await page.locator('#profile-text').fill(text);
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('个人信息已载入编辑区');
  await expect(page.getByRole('status')).toContainText('日期按月保存');
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('虚构用户');
  await expect(page.locator('input[name="education:0:major"]')).toHaveValue('计算机');
  await expect(page.locator('input[name="education:0:startDate"]')).toHaveValue('2023-09');
  await expect(page.locator('input[name="internships:0:company"]')).toHaveValue('测试公司');
  await expect(page.locator('input[name="internships:0:startDate"]')).toHaveValue('2025-07');
  await expect(page.locator('input[name="internships:0:endDate"]')).toHaveValue('');
  await expect(page.getByRole('textbox', { name: '结束时间（原文）内容', exact: true })).toHaveValue('至今');
  await expect(page.getByRole('textbox', { name: '项目时间内容', exact: true })).toHaveValue('2025.06-2025.07');
  expect(await page.evaluate(() => localStorage.getItem('zheg:profile'))).toBe(original);
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('新增或补充 0 项');
  expect(calls).toBe(2);
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  const saved = await page.evaluate(() => localStorage.getItem('zheg:profile'));
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('input[name="internships:0:startDate"]')).toHaveValue('2025-07');
  await expect(page.getByRole('textbox', { name: '结束时间（原文）内容', exact: true })).toHaveValue('至今');
  // A structurally broken response must still preserve unsaved edits and saved data.
  await page.locator('input[name="personal:0:fullName"]').fill('未保存编辑');
  await page.locator('#profile-text').fill(text);
  await page.route('https://model.example/**', route => route.fulfill({ contentType: 'application/json', body: completion(JSON.stringify({ sections: [{ title: '基本信息', records: [{ fields: [{ label: '日期', value: '2025-07-28', type: 'script' }] }] }] })) }));
  await page.getByRole('button', { name: '载入个人信息' }).click();
  await expect(page.getByRole('status')).toContainText('原编辑内容和已保存档案未改变');
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('未保存编辑');
  expect(await page.evaluate(() => localStorage.getItem('zheg:profile'))).toBe(saved);
});

async function addInformation(record, label, value) {
  await record.locator('.information-adder summary').click();
  await record.locator('[data-new-label]').fill(label);
  await record.locator('[data-new-value]').fill(value);
  await record.getByRole('button', { name: '添加信息', exact: true }).click();
}

test('REQ-20261009-03 子信息与家庭板块增删、动态规则 / 模型 / 记忆完整填写', async ({ page }) => {
  await page.goto('/');
  await configureCustom(page);
  let calls = 0, storedPath;
  await page.route('https://model.example/v1/chat/completions', async route => {
    calls++;
    const payload = JSON.parse(route.request().postDataJSON().messages[1].content);
    expect(JSON.stringify(payload)).not.toContain('林知夏');
    const schema = payload.profileSchema.find(s => s.description === '实习经历 · 是否有实习证明');
    if (schema) storedPath = schema.path;
    const mappings = payload.fields.map(f => ({ fieldId: f.fieldId, profilePath: f.label === '能否提供实习证明' && schema ? schema.path : null }));
    if (calls === 2) expect(payload.fields.some(f => f.label === '能否提供实习证明')).toBe(false);
    await route.fulfill({ contentType: 'application/json', body: completion(JSON.stringify({ mappings })) });
  });
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  const internship = page.locator('[data-profile-section=internships] .profile-record').first();
  await addInformation(internship, '是否有实习证明', '是');
  await expect(page.getByRole('textbox', { name: '是否有实习证明内容', exact: true })).toHaveValue('是');
  await page.getByRole('button', { name: '删除现居城市', exact: true }).click();
  await expect(page.locator('input[name="personal:0:city"]')).toHaveCount(0);
  await page.locator('#new-section-title').fill('家庭信息');
  await page.getByRole('button', { name: '＋ 新增板块', exact: true }).click();
  const family = page.locator('[data-profile-section]').filter({ has: page.getByRole('heading', { name: '家庭信息', exact: true }) });
  await addInformation(family.locator('.profile-record').first(), '成员关系', '父亲');
  await page.getByRole('button', { name: '添加家庭信息记录', exact: true }).click();
  await addInformation(family.locator('.profile-record').nth(1), '成员关系', '母亲');
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '成员关系内容', exact: true }).nth(1)).toHaveValue('母亲');
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  await page.locator('#application-form').evaluate(form => {
    form.querySelector('[data-zheg-section=实习经历] .form-grid').insertAdjacentHTML('beforeend', '<label>能否提供实习证明<input name="proof" type="text"></label>');
    form.insertAdjacentHTML('beforeend', '<section data-zheg-section="家庭信息"><label>成员关系<input name="family1"></label></section><section data-zheg-section="家庭信息"><label>成员关系<input name="family2"></label></section>');
  });
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  const proof = page.locator('.preview-row').filter({ has: page.getByRole('checkbox', { name: '填写 能否提供实习证明', exact: true }) });
  await expect(proof).toContainText('模型建议');
  await proof.locator('input[type=checkbox]').check();
  await expect(page.getByRole('combobox', { name: '家庭信息对应记录' }).nth(1)).toHaveValue('1');
  await page.getByRole('button', { name: '确认填写', exact: true }).click();
  await expect(page.locator('input[name=proof]')).toHaveValue('是');
  await expect(page.locator('input[name=family1]')).toHaveValue('父亲');
  await expect(page.locator('input[name=family2]')).toHaveValue('母亲');
  await expect(page.locator('input[name=city]')).toHaveValue('');
  await page.getByRole('button', { name: '重新识别', exact: true }).click();
  await expect(proof).toContainText('识别记忆');
  expect(calls).toBe(2);
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await page.getByRole('button', { name: '删除是否有实习证明', exact: true }).click();
  await page.getByRole('button', { name: '删除家庭信息第 2 段', exact: true }).click();
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  const memory = await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:recognitionMemory')));
  expect(memory.entries.some(entry => entry.path === storedPath)).toBe(false);
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await expect(proof).toContainText('需要确认');
  await expect(proof.locator(`option[value="${storedPath}::0"]`)).toHaveCount(0);
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await page.getByRole('button', { name: '删除家庭信息板块', exact: true }).click();
  await expect(family).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('REQ-20261009-03 旧档案迁移备份、拒绝重复/空标题、删除后刷新不恢复', async ({ page }) => {
  const legacy = { schemaVersion: 1, personal: { fullName: '旧用户', city: '旧城市' }, education: [], internships: [{ company: '旧公司' }] };
  await page.addInitScript(value => {
    if (!localStorage.getItem('zheg:profile')) localStorage.setItem('zheg:profile', JSON.stringify(value));
  }, legacy);
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('input[name="personal:0:fullName"]')).toHaveValue('旧用户');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:profile')))).schemaVersion).toBe(1);
  await page.getByRole('button', { name: '＋ 新增板块', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('非空');
  await page.locator('#new-section-title').fill('实习经历');
  await page.getByRole('button', { name: '＋ 新增板块', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('不能重复');
  const record = page.locator('[data-profile-section=internships] .profile-record').first();
  await addInformation(record, '公司', '重复公司');
  await expect(page.getByRole('status')).toContainText('不能重复');
  await page.getByRole('button', { name: '删除现居城市', exact: true }).click();
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:profileV1Backup')))).toEqual(legacy);
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(page.locator('input[name="personal:0:city"]')).toHaveCount(0);
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:profileV1Backup')))).toEqual(legacy);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('zheg:profile')))).schemaVersion).toBe(2);
});

test('REQ-20261009-04 新增后标题固定，内容可编辑保存，删除及换名重建', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  const personal = page.locator('[data-profile-section=personal] .profile-record');
  await addInformation(personal, '邮政编码', '310000');
  const postal = page.locator('.profile-field').filter({ has: page.getByRole('textbox', { name: '邮政编码内容', exact: true }) });
  await expect(postal.locator('.field-title')).toHaveText('邮政编码');
  await expect(postal.locator('input')).toHaveCount(0);
  await expect(page.locator('[data-profile-input=label]')).toHaveCount(0);
  await postal.getByRole('textbox', { name: '邮政编码内容', exact: true }).fill('310001');
  await page.locator('#new-section-title').fill('家庭信息');
  await page.getByRole('button', { name: '＋ 新增板块', exact: true }).click();
  const family = page.locator('[data-profile-section]').filter({ has: page.getByRole('heading', { name: '家庭信息', exact: true }) });
  await addInformation(family.locator('.profile-record'), '家庭地址', '测试地址');
  const address = family.locator('.profile-field');
  await expect(address.locator('.field-title')).toHaveText('家庭地址');
  await expect(address.locator('input')).toHaveCount(0);
  await address.getByRole('textbox', { name: '家庭地址内容', exact: true }).fill('修改后的测试地址');
  await page.getByRole('button', { name: '智能识别', exact: true }).click();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(postal.getByRole('textbox')).toHaveValue('310001');
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(postal.locator('.field-title')).toHaveText('邮政编码');
  await expect(postal.getByRole('textbox')).toHaveValue('310001');
  await expect(address.getByRole('textbox')).toHaveValue('修改后的测试地址');
  await expect(page.locator('[data-profile-input=label]')).toHaveCount(0);
  await postal.getByRole('button', { name: '删除邮政编码', exact: true }).click();
  await expect(postal).toHaveCount(0);
  await page.getByRole('button', { name: '保存档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存在本机');
  await page.reload();
  await page.getByRole('button', { name: '本地档案', exact: true }).click();
  await expect(postal).toHaveCount(0);
  await addInformation(personal, '通信邮编', '310002');
  await expect(page.getByRole('textbox', { name: '通信邮编内容', exact: true })).toHaveValue('310002');
  await expect(page.getByRole('button', { name: '删除通信邮编', exact: true })).toBeVisible();
  await expect(page.locator('[data-profile-input=label]')).toHaveCount(0);
});
