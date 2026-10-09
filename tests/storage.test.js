import test from 'node:test';
import assert from 'node:assert/strict';

const config = { provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', autoInfer: true };
let imports = 0;
async function harness(extension = false) {
  const local = {}, session = {}, levels = [];
  let failure = '';
  const fail = operation => { if (failure === operation) throw new Error('fake-private-key'); };
  if (extension) {
    globalThis.chrome = { runtime: { id: 'test' }, storage: {
      local: {
        setAccessLevel: async value => { fail('protect'); levels.push(value.accessLevel); },
        get: async key => { fail('read'); return { [key]: local[key] }; },
        set: async value => { fail('write'); Object.assign(local, value); },
      },
      session: {
        get: async key => { fail('session'); return { [key]: session[key] }; },
        remove: async key => { fail('remove'); delete session[key]; },
      },
    } };
  } else {
    delete globalThis.chrome;
    globalThis.localStorage = {
      getItem: key => { fail('read'); return local[key] ?? null; },
      setItem: (key, value) => { fail(key === 'zheg:modelCredential' ? 'write' : 'config'); local[key] = value; },
      removeItem: key => { delete local[key]; },
    };
  }
  const storage = await import(`../src/storage.js?storage-test=${imports++}`);
  return { ...storage, local, session, levels, fail: value => { failure = value; } };
}

test('REQ-20261009-05 演示独立保存、替换、地址隔离及清除', async () => {
  const h = await harness();
  assert.equal(await h.getSavedKey(config), '');
  await h.saveModelSettings(config, 'fake-private-key');
  assert.equal(await h.getSavedKey(config), 'fake-private-key');
  assert.equal(h.local['zheg:modelConfig'], JSON.stringify(config));
  assert.equal(await h.getSavedKey({ ...config, baseURL: 'https://another.example/v1' }), '');
  await h.saveModelSettings(config, 'replacement');
  assert.equal(await h.getSavedKey(config), 'replacement');
  await h.clearSavedKey(config);
  assert.equal(await h.getSavedKey(config), '');
  assert.equal(h.local['zheg:modelConfig'], JSON.stringify(config));
  await h.saveModelSettings(config, '');
  assert.equal(await h.getSavedKey(config), '');
});

test('REQ-20261009-05 扩展迁移一次、可信上下文与空标记防旧密钥复活', async () => {
  const h = await harness(true);
  h.session.modelKey = 'legacy-fake';
  assert.equal(await h.getSavedKey(config), 'legacy-fake');
  assert.equal(h.session.modelKey, undefined);
  assert.deepEqual(h.local.modelCredential, { version: 1, baseURL: config.baseURL, key: 'legacy-fake' });
  h.session.modelKey = 'stale-fake';
  assert.equal(await h.getSavedKey(config), 'legacy-fake');
  await h.clearSavedKey(config);
  h.session.modelKey = 'stale-fake';
  assert.equal(await h.getSavedKey(config), '');
  await h.saveModelSettings(config, 'new-fake');
  assert.equal(h.session.modelKey, undefined);
  assert.equal(await h.getSavedKey(config), 'new-fake');
  assert.ok(h.levels.length >= 6);
  assert.ok(h.levels.every(value => value === 'TRUSTED_CONTEXTS'));
  assert.deepEqual(h.local.modelConfig, config);
});

test('REQ-20261009-05 非法凭据拒绝，不回退旧会话、不回显密钥', async () => {
  for (const extension of [false, true]) {
    const h = await harness(extension);
    h.session.modelKey = 'legacy-fake';
    for (const value of [null, false, { version: 2, key: 'fake-private-key' }, { version: 1, baseURL: config.baseURL, key: 123 }]) {
      if (extension) h.local.modelCredential = value;
      else h.local['zheg:modelCredential'] = JSON.stringify(value);
      await assert.rejects(h.getSavedKey(config), { message: 'API Key 读取或迁移失败，请在智能识别中重新保存模型设置。' });
    }
    assert.equal(h.session.modelKey, 'legacy-fake');
  }
});

test('REQ-20261009-05 读写与迁移失败保持原凭据并隐藏底层错误', async () => {
  for (const extension of [false, true]) {
    const h = await harness(extension);
    await h.saveModelSettings(config, 'original-fake');
    h.fail('read');
    await assert.rejects(h.getSavedKey(config), /API Key 读取或迁移失败/);
    h.fail('write');
    await assert.rejects(h.saveModelSettings({ ...config, model: 'another' }, 'fake-private-key'), { message: '模型设置或 API Key 保存失败，请检查本机存储后重试。' });
    await assert.rejects(h.clearSavedKey(config), { message: 'API Key 清除失败，请检查本机存储后重试。' });
    h.fail('');
    assert.equal(await h.getSavedKey(config), 'original-fake');
    assert.deepEqual(extension ? h.local.modelConfig : JSON.parse(h.local['zheg:modelConfig']), config);
  }
  const h = await harness(true);
  h.session.modelKey = 'legacy-fake';
  h.fail('write');
  await assert.rejects(h.getSavedKey(config), /API Key 读取或迁移失败/);
  assert.equal(h.session.modelKey, 'legacy-fake');
  assert.equal(h.local.modelCredential, undefined);
  h.fail('protect');
  await assert.rejects(h.saveModelSettings(config, 'fake-private-key'), /保存失败/);
});
