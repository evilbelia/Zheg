import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function page(html) {
  const dom = new JSDOM(html, { url: 'https://demo.example.com', runScripts: 'outside-only' });
  dom.window.HTMLElement.prototype.getClientRects = function () { return [{ width: 100, height: 20 }]; };
  dom.window.eval(readFileSync(new URL('../src/dom.js', import.meta.url), 'utf8'));
  return { document: dom.window.document, api: dom.window.ZhegDOM };
}
test('提取标签、分组、选项但不返回已有值，排除敏感与隐藏控件', () => {
  const { api } = page('<section data-zheg-section="基本信息"><label>姓名<input value="真实姓名"></label><label>密码<input type="password" value="secret"></label><label hidden>隐藏<input></label><label>文件<input type="file"></label><label>学历<select><option value="">请选择</option><option value="master">硕士</option></select></label></section>');
  const result = api.scan();
  assert.equal(result.fields.length, 2);
  assert.equal(result.fields[0].label, '姓名');
  assert.equal(result.fields[0].hasValue, true);
  assert.equal(JSON.stringify(result).includes('真实姓名'), false);
  assert.equal(result.fields[1].label, '学历');
  assert.equal(result.fields[1].options[0].value, 'master');
});
test('默认保留已有值、显式覆盖，发送 input/change，不提交', () => {
  const { document, api } = page('<form><label>姓名<input value="原内容"></label></form>');
  const { fields } = api.scan();
  let input = 0, change = 0, submit = 0;
  document.querySelector('input').addEventListener('input', () => input++);
  document.querySelector('input').addEventListener('change', () => change++);
  document.querySelector('form').addEventListener('submit', () => submit++);
  assert.equal(api.fill([{ id: fields[0].id, value: '新内容' }])[0].status, 'skipped');
  assert.equal(api.fill([{ id: fields[0].id, value: '新内容', overwrite: true }])[0].status, 'success');
  assert.equal(input, 1); assert.equal(change, 1); assert.equal(submit, 0);
});
test('页面字段变动、失效 ID、无效值、原生约束拒绝', () => {
  const { document, api } = page('<label>入学时间<input type="date" min="2024-01-01"></label>');
  const { fields } = api.scan();
  assert.equal(api.fill([{ id: fields[0].id, value: '2020-01-01' }])[0].status, 'failed');
  assert.equal(document.querySelector('input').value, '');
  assert.equal(api.fill([{ id: 'unknown', value: '2024-01-01' }])[0].status, 'failed');
  document.querySelector('input').setAttribute('aria-label', '毕业时间');
  assert.match(api.fill([{ id: fields[0].id, value: '2024-01-01' }])[0].message, /发生变化/);
  const next = api.scan(); document.querySelector('input').remove();
  assert.equal(api.fill([{ id: next.fields[0].id, value: '2024-01-01' }])[0].status, 'failed');
});
test('支持单选与下拉，扫描前后选项变化拒绝填写', () => {
  const { document, api } = page('<fieldset><legend>性别</legend><label><input type="radio" name="gender" value="female">女</label><label><input type="radio" name="gender" value="male">男</label></fieldset><label>学历<select><option value="">请选择</option><option value="master">硕士</option></select></label>');
  const { fields } = api.scan();
  assert.equal(fields.length, 2);
  assert.equal(fields[0].label, '性别');
  assert.equal(api.fill([{ id: fields[0].id, value: 'female' }])[0].status, 'success');
  assert.equal(document.querySelector('[value=female]').checked, true);
  document.querySelector('option[value=master]').textContent = '博士';
  assert.equal(api.fill([{ id: fields[1].id, value: 'master' }])[0].status, 'failed');
});
