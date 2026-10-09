import './style.css';
import { emptyProfile, sampleProfile, validateProfile, SCHEMA, readValue, compatible } from './profile.js';
import { matchFields, fillValue, sectionKind } from './matching.js';
import { inferMappings, modelPayload, testConnection } from './model.js';
import { normalizeConfig, validateConfig, configurationReady, permissionOrigin, DEEPSEEK_MODELS, DEEPSEEK_URL } from './model-config.js';
import { emptyMemory, validateMemory, applyMemory, learnMappings } from './recognition-memory.js';
import { getStored, setStored, isExtension, getSessionKey, setSessionKey } from './storage.js';
import { scanPage, fillPage } from './adapter.js';
import { demoForm } from './demo.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, size = 20) => {
  const paths = {
    scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M7 9h10M7 13h7"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
};
let profile;
try { profile = validateProfile(await getStored('profile', isExtension ? emptyProfile() : sampleProfile())); }
catch { profile = emptyProfile(); }
let config = normalizeConfig(await getStored('modelConfig', {}));
let memory = validateMemory(await getStored('recognitionMemory', emptyMemory()));
let apiKey = await getSessionKey();
let rows = [], activeTab = 'preview', busy = false, scanned = false, pageTitle = '', lastScan = '', pageOrigin = '';

document.body.classList.toggle('extension', isExtension);
document.querySelector('#app').innerHTML = `${!isExtension ? `<header class="site-header"><a class="brand" href="/"><span class="brand-mark">桂</span><strong>折桂<span>ZHEG</span></strong></a><div class="header-links"><span class="version">MVP 0.1</span><span class="local-note">${icon('shield', 16)} 个人档案保存在本地</span></div></header>
  <main class="page"><div class="page-heading"><div><div class="eyebrow green">少一点重复，多一点机会</div><h1>把时间留给下一次机会<span>。</span></h1><p>一份档案，少填一次。先检查，再填写。</p></div><div class="experience-label"><span class="live-dot"></span> 交互体验 · 使用虚构档案</div></div><div class="workspace"><div class="application-card">${demoForm()}</div>` : '<main class="extension-main">'}
  <aside class="assistant-card" aria-label="折桂填写助手">
    <div class="assistant-heading"><div class="assistant-symbol">${icon('spark', 22)}</div><div><h2>折桂填写助手</h2><p>${isExtension ? '当前网页 · 预览确认后填写' : '演示档案 · 数据均为虚构'}</p></div><span class="tag green-tag">本地档案</span></div>
    <nav class="tabs" aria-label="助手功能"><button data-tab="preview" class="active">填写预览</button><button data-tab="profile">本地档案</button><button data-tab="settings">智能识别</button></nav>
    <div id="notice" role="status" aria-live="polite" hidden></div>
    <div id="panel-content"></div>
    <div id="fill-actions"></div>
    <div class="assistant-footer">${icon('shield', 14)} ${isExtension ? '确认后填写 · 最终提交由你完成' : '演示数据只保存在当前浏览器'}</div>
  </aside>${!isExtension ? '</div><footer class="page-footer"><span>折桂 Zheg</span><span>让每一次秋招投递，都算数。</span><span>规则匹配 + 自动智能识别</span></footer></main>' : '</main>'}`;

function notice(message, error = false) {
  const el = document.querySelector('#notice');
  el.hidden = !message;
  el.textContent = message;
  el.className = error ? 'notice error' : 'notice';
}
function render() {
  document.querySelector('#fill-actions').replaceChildren();
  document.querySelectorAll('[data-tab]').forEach(el => { el.classList.toggle('active', el.dataset.tab === activeTab); el.setAttribute('aria-current', el.dataset.tab === activeTab ? 'page' : 'false'); });
  if (activeTab === 'preview') renderPreview();
  else if (activeTab === 'profile') renderProfile(profile);
  else renderSettings();
}
function sourceOptions(row) {
  let html = '<option value="">请选择档案字段</option>';
  for (const schema of SCHEMA) {
    if (!compatible(row, schema.path)) continue;
    const group = schema.path.split('[')[0];
    const records = schema.path.includes('[]') ? profile[group] : [null];
    records.forEach((record, index) => {
      const label = schema.path.includes('[]') ? `${schema.label.replace(' · ', ` ${index + 1} · `)}${record.school || record.company ? `（${record.school || record.company}）` : ''}` : schema.label;
      html += `<option value="${esc(schema.path)}::${index}" ${row.path === schema.path && row.index === index ? 'selected' : ''}>${esc(label)}</option>`;
    });
  }
  return html;
}
function renderPreview() {
  const matched = rows.filter(r => r.path).length;
  const unresolved = rows.length - matched;
  const selected = rows.filter(r => r.selected).length;
  const groups = [...new Set(rows.map(r => r.groupId))];
  document.querySelector('#panel-content').innerHTML = `<div class="scan-toolbar"><div><strong>${scanned ? '当前页面' : '开始一次轻松的填写'}</strong><p>${esc(scanned ? pageTitle : '先识别表单，再检查待填内容')}</p></div><button class="button primary" id="scan" ${busy ? 'disabled' : ''}>${icon('scan', 17)} ${busy ? '处理中…' : scanned ? '重新识别' : '识别表单'}</button></div>
    ${!scanned ? `<div class="empty-state"><div class="empty-illustration"><div class="paper"><span></span><span></span><span></span><span></span></div><div class="illustration-check">${icon('check', 22)}</div></div><h3>重复的信息，交给折桂</h3><p>从本地档案找到对应内容，<br>每一项都由你检查后再填入。</p><div class="steps"><span><b>1</b> 识别字段</span><i>—</i><span><b>2</b> 检查预览</span><i>—</i><span><b>3</b> 确认填写</span></div></div><div class="tip-card">${icon('file', 20)}<div><strong>${isExtension ? '先准备一份个人档案' : '一份演示档案已经准备好'}</strong><p>${isExtension ? '在“本地档案”中录入信息，或导入 JSON。' : '林知夏的两段教育经历和一段实习，可直接体验。'}</p><button class="text-button" data-go-profile>查看本地档案 ${icon('arrow', 14)}</button></div></div>` : `
    <div class="preview-stats"><div><strong>${rows.length}</strong><span>网页字段</span></div><div><strong class="green">${matched}</strong><span>已匹配</span></div><div><strong class="amber">${unresolved}</strong><span>待确认</span></div></div>
    <div class="preview-hint">检查档案来源和待填值。取消勾选可跳过；网页已有内容默认保留。</div>
    <div class="preview-list">${groups.map(groupId => {
      const groupRows = rows.filter(r => r.groupId === groupId);
      const kind = sectionKind(groupRows[0].section);
      const records = ['education', 'internships'].includes(kind) ? profile[kind] : null;
      return `<section class="preview-group"><div class="group-heading"><h3>${esc(groupRows[0].section)}</h3>${records?.length ? `<select class="record-picker" ${busy ? 'disabled' : ''} data-group="${groupId}" aria-label="${esc(groupRows[0].section)}对应记录">${records.map((r, i) => `<option value="${i}" ${groupRows[0].index === i ? 'selected' : ''}>${i + 1} · ${esc(r.school || r.company || '未命名记录')}</option>`).join('')}</select>` : ''}</div>${groupRows.map(row => {
        const value = readValue(profile, row.path, row.index);
        const conversion = fillValue(row, value);
        return `<article class="preview-row ${row.path ? '' : 'unresolved'}" data-row="${row.id}"><div class="row-title"><label class="row-checkbox"><input type="checkbox" ${busy ? 'disabled' : ''} data-select="${row.id}" ${row.selected ? 'checked' : ''} aria-label="填写 ${esc(row.label)}"><strong>${esc(row.label)}</strong></label><span class="source-badge ${row.path ? '' : 'pending'}">${esc(row.source)}</span></div><select class="mapping-select" ${busy ? 'disabled' : ''} data-map="${row.id}" aria-label="${esc(row.label)}档案来源">${sourceOptions(row)}</select><div class="value-preview"><span>待填值</span><div>${esc(value || (row.path ? '档案中尚未填写' : '请先选择档案字段'))}</div></div>${!conversion.ok && row.path ? `<p class="field-warning">${esc(conversion.reason)}</p>` : conversion.note ? `<p class="field-warning">${esc(conversion.note)}</p>` : ''}${row.hasValue ? `<label class="overwrite"><input type="checkbox" ${busy ? 'disabled' : ''} data-overwrite="${row.id}" ${row.override ? 'checked' : ''}> 覆盖网页已有内容</label>` : ''}${row.status ? `<div class="fill-status ${row.result === 'success' ? 'success' : ''}">${esc(row.status)}</div>` : ''}</article>`;
      }).join('')}</section>`;
    }).join('') || '<div class="no-fields">未找到可支持的表单字段。<br>请确认输入框可见且可编辑。</div>'}</div>
    <div class="fill-bar"><div><strong id="selected-count">已选择 ${selected} 项</strong><span>${esc(lastScan)}</span></div><button class="button primary" id="fill" ${busy || !selected ? 'disabled' : ''}>${icon('check', 17)} 确认填写</button></div>`}`;
  const bar = document.querySelector('#panel-content .fill-bar');
  document.querySelector('#fill-actions').replaceChildren(...(bar ? [bar] : []));
}
function renderProfile(draft) {
  const labels = { personal: '基本信息', education: '教育经历', internships: '实习经历' };
  document.querySelector('#panel-content').innerHTML = `<div class="panel-intro"><h3>一份档案，多次使用</h3><p>档案仅存于本机浏览器。填写前请检查信息。</p></div><form id="profile-form">
    ${Object.keys(labels).map(group => `<section class="profile-section"><div class="group-heading"><h3>${labels[group]}</h3>${group !== 'personal' ? `<button type="button" class="text-button" data-add="${group}">＋ 添加经历</button>` : ''}</div>${(group === 'personal' ? [draft.personal] : draft[group]).map((record, index) => `<div class="profile-record">${group !== 'personal' ? `<div class="record-title"><span>第 ${index + 1} 段</span><button type="button" class="text-button danger" data-remove="${group}:${index}">删除</button></div>` : ''}<div class="profile-fields">${SCHEMA.filter(s => s.path.startsWith(group)).map(s => { const key = s.path.split('.').at(-1); return `<label>${esc(s.label.split(' · ').at(-1))}${key === 'description' ? `<textarea name="${group}:${index}:${key}" rows="3">${esc(record[key])}</textarea>` : `<input name="${group}:${index}:${key}" type="${s.type === 'date' ? 'month' : s.type === 'email' ? 'email' : 'text'}" value="${esc(record[key])}" maxlength="5000">`}</label>`; }).join('')}</div></div>`).join('') || '<p class="muted">还没有经历，点击右上角添加。</p>'}</section>`).join('')}
    <div class="profile-actions"><button class="button primary" type="submit">保存档案</button><span class="muted">保存后请重新识别表单</span></div></form><div class="import-actions"><button class="button secondary" id="export-profile">导出 JSON</button><label class="button secondary file-button">导入 JSON<input type="file" id="import-profile" accept="application/json,.json"></label><button class="text-button" id="sample-profile">载入虚构演示档案</button></div><p class="small-note">导入及载入演示档案会替换当前编辑内容，点击“保存档案”后生效。导出的文件含个人信息，请自行保管。</p>`;
  document.querySelector('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { const next = validateProfile(collectProfile()); await setStored('profile', next); profile = next; rows = []; scanned = false; notice('档案已保存在本机。现在可以识别表单了。'); }
    catch (error) { notice(error.message, true); }
  });
  document.querySelector('#import-profile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('档案文件不能超过 1 MB。');
      const imported = validateProfile(JSON.parse(await file.text()));
      renderProfile(imported); notice('档案已导入到编辑区，请检查后保存。');
    } catch (error) { notice(`导入失败：${error instanceof SyntaxError ? '不是有效的 JSON 文件' : error.message}`, true); }
  });
}
function collectProfile() {
  const draft = emptyProfile();
  for (const [path, value] of new FormData(document.querySelector('#profile-form'))) {
    const [group, index, key] = path.split(':');
    if (group === 'personal') draft.personal[key] = value;
    else { draft[group][Number(index)] ??= {}; draft[group][Number(index)][key] = value; }
  }
  return draft;
}
function settingsConfig(form) {
  const data = new FormData(form);
  return validateConfig({ provider: data.get('provider'), baseURL: data.get('baseURL'), model: data.get('model'), autoInfer: data.has('autoInfer') });
}
function failureMessage(error) {
  return error.name === 'TimeoutError' ? '模型请求超时，可继续手动选择档案字段。' : error.message || '操作失败，请重试。';
}
function renderSettings() {
  document.querySelector('#panel-content').innerHTML = `<div class="panel-intro"><h3>让歧义字段更容易理解</h3><p>点击识别后，先使用规则和本地识别记忆，再自动用模型分析待确认字段。填写前仍由你核对。</p></div>
    <div class="privacy-box">${icon('shield', 23)}<div><strong>发送结构，档案留在本地</strong><p>自动分析会向所选服务商发送过滤后的标签、控件类型、选项和分组；不发送档案值、已有输入值、网页地址或 HTML。标签和选项仍可能包含个人信息，可关闭自动智能识别。</p></div></div>
    <form id="settings-form" class="settings-form">
    <label class="auto-toggle"><input name="autoInfer" type="checkbox" ${config.autoInfer ? 'checked' : ''}> 自动智能识别<span>开关立即保存；关闭后仅使用规则与识别记忆。</span></label>
    <label>服务商<select name="provider"><option value="deepseek" ${config.provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option><option value="custom" ${config.provider === 'custom' ? 'selected' : ''}>自定义兼容接口</option></select></label>
    <label>服务地址<span>兼容 Chat Completions 接口的 API 根地址</span><input name="baseURL" type="url" value="${esc(config.baseURL)}" ${config.provider === 'deepseek' ? 'readonly' : ''} required></label>
    <label id="model-choice">模型名称${config.provider === 'deepseek' ? `<select name="model">${DEEPSEEK_MODELS.map(model => `<option ${config.model === model ? 'selected' : ''}>${model}</option>`).join('')}</select>` : `<input name="model" value="${esc(config.model)}" placeholder="服务商提供的模型名称" maxlength="200" required>`}</label>
    <label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="DeepSeek 必填，本地服务可留空" value="${esc(apiKey)}"></label>
    <p class="small-note">密钥${isExtension ? '仅存于扩展会话存储，浏览器会话结束后需重新输入' : '仅保留在此页面内存，刷新后需重新输入'}。保存或测试时申请服务访问权限。请求超时 20 秒，失败可继续手动选择。</p>
    <div class="settings-actions"><button class="button primary" type="submit">保存模型设置</button><button class="button secondary" id="test-key" type="button">测试 API Key</button></div>
    <p class="small-note">测试使用当前输入的配置，不自动保存，不发送网页或档案信息，可能产生少量费用。</p></form>
    <div class="memory-actions"><button class="button secondary" id="clear-memory">清空识别记忆</button><p class="small-note">确认填写成功后积累字段映射。记忆仅保存在本机，清空不影响个人档案。</p></div>
    <details class="payload-details"><summary>查看待发送的字段结构（${rows.filter(r => !r.path).length} 个字段）</summary><pre>${esc(JSON.stringify(modelPayload(rows.filter(r => !r.path)), null, 2))}</pre></details>`;
  const form = document.querySelector('#settings-form');
  form.elements.provider.addEventListener('change', () => {
    const deepseek = form.elements.provider.value === 'deepseek';
    form.elements.baseURL.readOnly = deepseek;
    form.elements.baseURL.value = deepseek ? DEEPSEEK_URL : (config.provider === 'custom' ? config.baseURL : '');
    document.querySelector('#model-choice').innerHTML = `模型名称${deepseek ? `<select name="model">${DEEPSEEK_MODELS.map(model => `<option>${model}</option>`).join('')}</select>` : `<input name="model" placeholder="服务商提供的模型名称" maxlength="200" value="${esc(config.provider === 'custom' ? config.model : '')}" required>`}`;
  });
  form.elements.autoInfer.addEventListener('change', async event => {
    const el = event.target, next = { ...config, autoInfer: el.checked };
    busy = true; el.disabled = true;
    try { await setStored('modelConfig', next); config = next; notice(config.autoInfer ? '自动智能识别已开启，下次识别时生效。' : '自动智能识别已关闭，仍可使用规则和识别记忆。'); }
    catch { el.checked = config.autoInfer; notice('开关保存失败，请重试。', true); }
    finally { busy = false; el.disabled = false; }
  });
  const run = async (event, testing) => {
    event.preventDefault();
    if (busy) return;
    let next, key, permission;
    try {
      next = settingsConfig(form); key = form.elements.apiKey.value.trim();
      if (!configurationReady(next, key)) throw new Error('请先输入 DeepSeek API Key。');
      // Request from this user gesture, before storage/network awaits. Automatic scans only check permission.
      permission = isExtension ? chrome.permissions.request({ origins: [permissionOrigin(next)] }) : Promise.resolve(true);
    } catch (error) { notice(failureMessage(error), true); return; }
    busy = true;
    const controls = [...form.querySelectorAll('input,select,button')];
    controls.forEach(el => { el.disabled = true; });
    notice(testing ? '正在测试连接…' : '正在保存设置…');
    try {
      const allowed = await permission;
      if (testing) {
        if (!allowed) throw new Error('未授权模型服务访问，无法测试连接。');
        notice(await testConnection(next, key));
      } else {
        await setSessionKey(key);
        await setStored('modelConfig', next);
        config = next; apiKey = key;
        notice(allowed ? '模型设置已保存。下次识别表单时将按开关设置自动分析。' : '设置已保存，但未授权模型服务访问；识别时仅使用本地匹配。可重新保存设置以授权。', !allowed);
      }
    } catch (error) { notice(failureMessage(error), true); }
    finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
  };
  form.addEventListener('submit', event => run(event, false));
  document.querySelector('#test-key').addEventListener('click', event => run(event, true));
}
async function automaticallyInfer() {
  const unresolved = rows.filter(row => !row.path);
  if (!config.autoInfer || !unresolved.length) return;
  if (!configurationReady(config, apiKey)) {
    notice('本地匹配完成。请在智能识别中配置 API Key，或关闭自动智能识别；当前可继续手动选择。'); return;
  }
  try {
    if (isExtension && !await chrome.permissions.contains({ origins: [permissionOrigin(config)] })) {
      throw new Error('未授权模型服务访问，请在智能识别中保存设置以授权；可继续手动选择。');
    }
    notice('正在自动分析待确认字段…');
    const mappings = await inferMappings(unresolved, config, apiKey);
    for (const mapping of mappings) {
      const row = rows.find(r => r.id === mapping.fieldId);
      if (mapping.profilePath) { row.path = mapping.profilePath; row.source = '模型建议'; row.selected = false; }
    }
    notice('智能识别完成。模型建议默认未勾选，请核对后选择填写；仍未匹配的字段可手动选择。');
  } catch (error) { notice(`${failureMessage(error)} 本地匹配已保留，可继续手动选择。`, true); }
}

document.querySelector('#app').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || busy) return;
  if (button.dataset.tab || button.hasAttribute('data-go-profile')) {
    activeTab = button.dataset.tab || 'profile'; notice(''); render(); return;
  }
  if (button.dataset.add) {
    const draft = collectProfile(), group = button.dataset.add;
    if (draft[group].length >= 20) return notice('最多支持 20 段经历。', true);
    draft[group].push(Object.fromEntries(SCHEMA.filter(s => s.path.startsWith(group)).map(s => [s.path.split('.').at(-1), '']))); renderProfile(draft); return;
  }
  if (button.dataset.remove) { const draft = collectProfile(); const [group, index] = button.dataset.remove.split(':'); draft[group].splice(Number(index), 1); renderProfile(draft); return; }
  if (button.id === 'sample-profile') { renderProfile(sampleProfile()); notice('已载入虚构演示档案，请点击“保存档案”后使用。'); return; }
  if (button.id === 'export-profile') {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'zheg-profile.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  if (button.id === 'reset-demo') { rows = []; scanned = false; lastScan = ''; if (activeTab === 'preview') renderPreview(); notice('演示表单已重置，可以重新识别。'); return; }
  if (button.id === 'clear-memory') {
    busy = true;
    try { await setStored('recognitionMemory', emptyMemory()); memory = emptyMemory(); notice('识别记忆已清空，下次识别时生效。'); }
    catch { notice('识别记忆清空失败，请重试。', true); }
    finally { busy = false; }
    return;
  }
  if (!['scan', 'fill'].includes(button.id)) return;
  const action = button.id;
  busy = true; notice(''); renderPreview();
  try {
    if (action === 'scan') {
      const result = await scanPage();
      pageOrigin = result.origin;
      rows = applyMemory(matchFields(result.fields, profile), memory, pageOrigin); scanned = true; pageTitle = result.title;
      lastScan = result.unsupported ? `另有 ${result.unsupported} 个控件暂不支持` : '最终提交由你完成';
      await automaticallyInfer();
      if (result.truncated) notice(`${document.querySelector('#notice').textContent} 页面字段较多，仅识别前 200 个可用字段。`);
    } else if (action === 'fill') {
      const items = [];
      for (const row of rows.filter(r => r.selected)) {
        row.status = ''; row.result = '';
        const conversion = fillValue(row, readValue(profile, row.path, row.index));
        if (!conversion.ok) { row.status = conversion.reason; row.result = 'failed'; }
        else items.push({ id: row.id, value: conversion.value, overwrite: row.override });
      }
      const results = await fillPage(items);
      for (const result of results) {
        const row = rows.find(r => r.id === result.id);
        row.status = result.message; row.result = result.status;
        if (result.status === 'success') { row.hasValue = true; row.override = false; }
      }
      const count = type => rows.filter(r => r.selected && r.result === type).length;
      const summary = `填写完成：成功 ${count('success')} 项，保留已有内容 ${count('skipped')} 项，需手动处理 ${count('failed')} 项。`;
      const next = learnMappings(memory, rows, pageOrigin);
      try { await setStored('recognitionMemory', next); memory = next; notice(summary); }
      catch { notice(`${summary} 识别记忆保存失败，本次填写结果不受影响。`, true); }
    }
  } catch (error) { notice(error.name === 'TimeoutError' ? '模型请求超时，可继续手动选择档案字段。' : error.message || '操作失败，请重试。', true); }
  finally { busy = false; renderPreview(); }
});
document.querySelector('#app').addEventListener('change', event => {
  if (busy) return;
  const el = event.target;
  if (el.dataset.group) {
    const kind = sectionKind(rows.find(r => r.groupId === el.dataset.group).section);
    for (const row of rows.filter(r => r.groupId === el.dataset.group && r.path.startsWith(kind))) { row.index = Number(el.value); row.status = ''; }
    renderPreview(); return;
  }
  const row = rows.find(r => r.id === (el.dataset.map || el.dataset.select || el.dataset.overwrite));
  if (!row) return;
  if (el.dataset.map) { const [path, index] = el.value.split('::'); row.path = path; row.index = Number(index || 0); row.source = path ? '手动选择' : '需要确认'; row.selected = Boolean(readValue(profile, row.path, row.index)); row.status = ''; renderPreview(); }
  else if (el.dataset.select) { row.selected = el.checked; const count = rows.filter(r => r.selected).length; document.querySelector('#selected-count').textContent = `已选择 ${count} 项`; document.querySelector('#fill').disabled = !count || busy; }
  else row.override = el.checked;
});
render();
