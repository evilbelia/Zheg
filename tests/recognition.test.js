import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, validateConfig, configurationReady, permissionOrigin, DEEPSEEK_URL } from '../src/model-config.js';
import { emptyMemory, learnMappings, applyMemory, validateMemory } from '../src/recognition-memory.js';
import { matchFields } from '../src/matching.js';
import { sampleProfile } from '../src/profile.js';
import { testConnection, inferMappings, validateMappings } from '../src/model.js';

const origin = 'https://jobs.example';
const field = (overrides = {}) => ({ id: 'f1', groupId: 'g1', label: '就读高校', section: '教育经历', type: 'text', options: [], hasValue: false, ...overrides });
const confirmed = overrides => ({ ...field(), path: 'education[].school', source: '模型建议', result: 'success', selected: true, ...overrides });
const response = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

test('REQ-20261009-02 默认 DeepSeek，旧配置迁移，关闭状态保留及地址拒绝', () => {
  const defaults = normalizeConfig();
  assert.deepEqual(defaults, { provider: 'deepseek', baseURL: DEEPSEEK_URL, model: 'deepseek-chat', autoInfer: true });
  assert.equal(normalizeConfig({ baseURL: '', model: '' }).provider, 'deepseek');
  assert.equal(normalizeConfig({ baseURL: 'https://legacy.example/v1', model: 'legacy' }).provider, 'custom');
  assert.equal(normalizeConfig({ ...defaults, autoInfer: false }).autoInfer, false);
  assert.equal(configurationReady(defaults, ''), false);
  assert.equal(configurationReady(defaults, 'fake'), true);
  assert.equal(configurationReady({ provider: 'custom', baseURL: 'http://localhost:1234/v1', model: 'local' }, ''), true);
  assert.equal(permissionOrigin(defaults), 'https://api.deepseek.com/*');
  assert.throws(() => validateConfig({ provider: 'custom', baseURL: 'http://bad.example/v1', model: 'test' }));
  assert.throws(() => validateConfig({ provider: 'custom', baseURL: 'https://example.com/v1', model: '' }));
});

test('REQ-20261009-02 仅确认成功的模型 / 手动映射入库，保存白名单不含个人值', () => {
  for (const overrides of [{ selected: false }, { result: 'failed' }, { result: 'skipped' }, { result: '' }, { source: '规则匹配' }, { path: 'bad.path' }]) {
    assert.deepEqual(learnMappings(emptyMemory(), [confirmed(overrides)], origin), emptyMemory());
  }
  const memory = learnMappings(emptyMemory(), [confirmed({ value: '个人值', existingValue: '旧值', html: '<input>', apiKey: 'secret' })], origin);
  assert.equal(memory.entries.length, 1);
  for (const secret of ['个人值', '旧值', '<input>', 'secret', 'f1', 'g1']) assert.equal(JSON.stringify(memory).includes(secret), false);
  assert.equal(learnMappings(memory, [confirmed({ source: '手动选择', path: 'education[].major' })], origin).entries[0].path, 'education[].major');
});

test('REQ-20261009-02 按网站、板块、类型、选项复用，保留重复记录索引且需确认', () => {
  const memory = learnMappings(emptyMemory(), [confirmed()], origin);
  const rows = matchFields([field(), field({ id: 'f2', groupId: 'g2' })], sampleProfile());
  const remembered = applyMemory(rows, memory, origin);
  assert.equal(remembered[0].source, '识别记忆');
  assert.equal(remembered[0].selected, false);
  assert.equal(remembered[1].index, 1);
  for (const changed of [field({ section: '实习经历' }), field({ type: 'textarea' }), field({ label: '其他高校' }), field({ options: [{ label: '新选项' }] })]) {
    assert.equal(applyMemory(matchFields([changed], sampleProfile()), memory, origin)[0].source, '需要确认');
  }
  assert.equal(applyMemory(rows, memory, 'https://other.example')[0].path, '');
  const ruleCorrection = learnMappings(emptyMemory(), [confirmed({ label: '学校名称', source: '手动选择', path: 'education[].major' })], origin);
  assert.equal(applyMemory(matchFields([field({ label: '学校名称' })], sampleProfile()), ruleCorrection, origin)[0].path, 'education[].major');
});

test('REQ-20261009-02 非法 / 冲突记忆拒绝，敏感与未知分组不积累，容量有界', () => {
  const memory = learnMappings(emptyMemory(), [confirmed()], origin);
  assert.deepEqual(validateMemory({ version: 2, entries: memory.entries }), emptyMemory());
  assert.deepEqual(validateMemory({ version: 1, entries: [null, { ...memory.entries[0], path: '__proto__.x' }] }), emptyMemory());
  assert.deepEqual(validateMemory({ version: 1, entries: [memory.entries[0], { ...memory.entries[0], path: 'education[].major' }] }), emptyMemory());
  assert.deepEqual(learnMappings(memory, [confirmed(), confirmed({ path: 'education[].major', source: '手动选择' })], origin), emptyMemory());
  for (const label of ['邮箱 private@example.com', '手机号 13812345678', '姓名：张三', 'x'.repeat(81), '<script>']) assert.equal(learnMappings(emptyMemory(), [confirmed({ label })], origin).entries.length, 0);
  assert.equal(learnMappings(emptyMemory(), [confirmed({ section: '未分组' })], origin).entries.length, 0);
  const other = learnMappings(emptyMemory(), [confirmed({ section: '其他信息' })], origin);
  assert.equal(applyMemory(matchFields([field({ section: '其他信息' })], sampleProfile()), other, origin)[0].source, '识别记忆');
  assert.equal(learnMappings(emptyMemory(), [confirmed()], 'https://jobs.example/path?token=secret').entries.length, 0);
  const entries = Array.from({ length: 501 }, (_, i) => confirmed({ label: `新字段${i}` }));
  assert.equal(learnMappings(emptyMemory(), entries, origin).entries.length, 500);
});

test('REQ-20261010-03 记忆映射本人字段不使用第二段经历索引', () => {
  const profile = sampleProfile();
  const memory = learnMappings(emptyMemory(), [confirmed({ label: '联系称呼', path: 'personal.fullName' })], origin, profile);
  const rows = matchFields([field({ label: '学校', groupId: 'g1' }), field({ label: '联系称呼', id: 'f2', groupId: 'g2' })], profile);
  const result = applyMemory(rows, memory, origin, profile);
  assert.equal(result[1].index, 0);
  assert.equal(result[1].groupIndex, 1);
  assert.equal(result[1].path, 'personal.fullName');
  assert.equal(result[1].selected, false);
});

test('REQ-20261009-02 连接测试最小请求，密钥只在鉴权头，空字段不调用模型', async () => {
  let calls = 0;
  const config = normalizeConfig();
  const result = await testConnection(config, 'fake-test-key', async (url, options) => {
    calls++;
    assert.equal(url, `${DEEPSEEK_URL}/chat/completions`);
    assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Reply with OK.' }]);
    assert.equal(body.max_tokens, 64);
    assert.equal(options.body.includes('fake-test-key'), false);
    return response('OK');
  });
  assert.match(result, /连接测试成功/);
  await inferMappings([], config, 'fake', () => { calls++; });
  assert.equal(calls, 1);
  await assert.rejects(testConnection(config, '', () => { calls++; }), /API Key/);
  assert.equal(calls, 1);
});

test('REQ-20261009-02 连接与推理拒绝 HTTP 错误、空响应和非法输出，网络错误不泄露密钥', async () => {
  const config = normalizeConfig();
  for (const status of [401, 403, 429, 500]) await assert.rejects(testConnection(config, 'fake', async () => ({ ok: false, status })), new RegExp(`HTTP ${status}`));
  for (const content of ['', null, 'x'.repeat(50001)]) await assert.rejects(testConnection(config, 'fake', async () => response(content)), /有效/);
  await assert.rejects(testConnection(config, 'fake', async () => ({ ok: true, json: async () => { throw new Error('secret'); } })), /JSON/);
  await assert.rejects(testConnection(config, 'fake', async () => { throw new Error('secret'); }), /无法连接/);
  await assert.rejects(testConnection(config, 'fake', async () => { throw Object.assign(new Error('secret'), { name: 'TimeoutError' }); }), /超时/);
  await assert.rejects(inferMappings([field()], config, 'fake', async () => response('{"mappings":[{"fieldId":"f1","profilePath":"bad.path"}]}')), /路径/);
  assert.throws(() => validateMappings({ mappings: [null] }, [field()]), /结构/);
});
