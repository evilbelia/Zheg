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

test('模型 mock 消歧：不传档案值、建议需勾选；失败仍可手动映射', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '识别表单', exact: true }).click();
  await page.getByRole('button', { name: /用模型分析/ }).click();
  await page.locator('input[name=baseURL]').fill('https://model.example/v1');
  await page.locator('input[name=model]').fill('test-model');
  await page.locator('input[name=apiKey]').fill('test-secret');
  await page.getByRole('button', { name: '保存模型设置' }).click();
  await page.route('https://model.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    expect(JSON.stringify(body)).not.toContain('林知夏');
    expect(JSON.stringify(body)).not.toContain('QH-CAMPUS');
    const fields = JSON.parse(body.messages[1].content).fields;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ mappings: fields.map(f => ({ fieldId: f.fieldId, profilePath: f.label === '你的称呼' ? 'personal.fullName' : null })) }) } }] }) });
  });
  await page.getByRole('button', { name: '填写预览', exact: true }).click();
  await page.getByRole('button', { name: /用模型分析/ }).click();
  const row = page.locator('.preview-row').filter({ hasText: '你的称呼' });
  await expect(row).toContainText('模型建议');
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  await expect(row).toContainText('林知夏');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-secret');
  await page.route('https://model.example/v1/chat/completions', route => route.fulfill({ status: 500, body: 'error' }));
  await page.getByRole('button', { name: /用模型分析/ }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 500');
  await page.locator('.preview-row').filter({ hasText: '推荐码' }).locator('select').selectOption('personal.phone::0');
  await expect(page.getByRole('button', { name: '确认填写' })).toBeEnabled();
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
