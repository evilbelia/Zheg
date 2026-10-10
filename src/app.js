import './style.css';
import { emptyProfile, sampleProfile, validateProfile, profileSchema, profileSections, profileSection, fieldsForRecord, readValue, compatibleDefinition, addProfileField, removeProfileField, addProfileSection, removeProfileSection, addProfileRecord, removeProfileRecord } from './profile.js';
import { matchFields, fillValue, groupForSection } from './matching.js';
import { inferMappings, modelPayload, testConnection } from './model.js';
import { normalizeConfig, validateConfig, configurationReady, permissionOrigin, DEEPSEEK_MODELS, DEEPSEEK_URL } from './model-config.js';
import { emptyMemory, validateMemory, applyMemory, learnMappings } from './recognition-memory.js';
import { getStored, setStored, isExtension, getSavedKey, saveModelSettings, clearSavedKey } from './storage.js';
import { scanPage, fillPage } from './adapter.js';
import { demoForm } from './demo.js';
import { extractProfile, mergeExtraction } from './profile-extraction.js';

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
const storedProfile = await getStored('profile', isExtension ? emptyProfile() : sampleProfile());
try { profile = validateProfile(storedProfile); }
catch { profile = emptyProfile(); }
let config = normalizeConfig(await getStored('modelConfig', {}));
let memory = validateMemory(await getStored('recognitionMemory', emptyMemory()), profile);
let profileDraft = structuredClone(profile), profileText = '';
let apiKey = '', keyLoadError = '';
try { apiKey = await getSavedKey(config); }
catch (error) { keyLoadError = error.message; }
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
  else if (activeTab === 'profile') renderProfile();
  else renderSettings();
}
function sourceOptions(row) {
  let html = '<option value="">请选择档案字段</option>';
  for (const schema of profileSchema(profile)) {
    if (!compatibleDefinition(row, schema)) continue;
    const section = profileSection(profile, schema.sectionId);
    for (const index of schema.indices ?? []) {
      const record = section.records[index];
      const label = section.id === 'personal' ? schema.label : `${schema.label.replace(' · ', ` ${index + 1} · `)}${record.school || record.company ? `（${record.school || record.company}）` : ''}`;
      html += `<option value="${esc(schema.path)}::${index}" ${row.path === schema.path && row.index === index ? 'selected' : ''}>${esc(label)}</option>`;
    }
  }
  return html;
}
function renderPreview() {
  const matched = rows.filter(r => r.path).length;
  const unresolved = rows.length - matched;
  const selected = rows.filter(r => r.selected).length;
  const groups = [...new Set(rows.map(r => r.groupId))];
  document.querySelector('#panel-content').innerHTML = `<div class="scan-toolbar"><div><strong>${scanned ? '当前页面' : '开始一次轻松的填写'}</strong><p>${esc(scanned ? pageTitle : '先识别表单，再检查待填内容')}</p></div><button class="button primary" id="scan" ${busy ? 'disabled' : ''}>${icon('scan', 17)} ${busy ? '处理中…' : scanned ? '重新识别' : '识别表单'}</button></div>
    ${!scanned ? `<div class="empty-state"><div class="empty-illustration"><div class="paper"><span></span><span></span><span></span><span></span></div><div class="illustration-check">${icon('check', 22)}</div></div><h3>重复的信息，交给折桂</h3><p>从本地档案找到对应内容，<br>每一项都由你检查后再填入。</p><div class="steps"><span><b>1</b> 识别字段</span><i>—</i><span><b>2</b> 检查预览</span><i>—</i><span><b>3</b> 确认填写</span></div></div><div class="tip-card">${icon('file', 20)}<div><strong>${isExtension ? '先准备一份个人档案' : '一份演示档案已经准备好'}</strong><p>${isExtension ? '在“本地档案”中录入信息，或粘贴文本让模型整理。' : '林知夏的两段教育经历和一段实习，可直接体验。'}</p><button class="text-button" data-go-profile>查看本地档案 ${icon('arrow', 14)}</button></div></div>` : `
    <div class="preview-stats"><div><strong>${rows.length}</strong><span>网页字段</span></div><div><strong class="green">${matched}</strong><span>已匹配</span></div><div><strong class="amber">${unresolved}</strong><span>待确认</span></div></div>
    <div class="preview-hint">检查档案来源和待填值。取消勾选可跳过；网页已有内容默认保留。</div>
    <div class="preview-list">${groups.map(groupId => {
      const groupRows = rows.filter(r => r.groupId === groupId);
      const kind = groupForSection(groupRows[0].section, profile);
      const records = kind && kind !== 'personal' ? profileSection(profile, kind)?.records : null;
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
function renderProfile(draft = profileDraft) {
  profileDraft = draft;
  document.querySelector('#panel-content').innerHTML = `<div class="panel-intro"><h3>一份档案，多次使用</h3><p>添加或删除信息后，请检查并保存。档案保存在本机浏览器。</p></div>
    <section class="text-profile-loader"><label for="profile-text">粘贴个人信息</label><textarea id="profile-text" rows="6" maxlength="20000" placeholder="粘贴简历、经历描述、表格或列表文本，模型会自动整理到各板块。">${esc(profileText)}</textarea>
    <p class="small-note">点击载入会将上方原文及当前板块 / 小标题发送给已配置的模型服务商，不发送现有档案值。最多 20000 字；同一词条以本次新值更新，未提供的信息保留，本次载入的经历排在前面。结果先进入编辑区，核对并保存后才替换本机档案。</p>
    <button class="button primary" type="button" id="load-profile">${icon('spark', 16)} 载入个人信息</button></section>
    <form id="profile-form">${profileSections(draft).map(section => `<section class="profile-section" data-profile-section="${section.id}"><div class="group-heading"><h3>${esc(section.title)}</h3><div class="section-buttons">${section.id !== 'personal' ? `<button type="button" class="text-button" data-add-record="${section.id}" aria-label="添加${esc(section.title)}记录">＋ 添加记录</button>` : ''}${section.custom ? `<button type="button" class="text-button danger" data-remove-section="${section.id}" aria-label="删除${esc(section.title)}板块">删除板块</button>` : ''}</div></div>
      ${section.records.map((record, index) => `<div class="profile-record" data-record="${section.id}:${index}">${section.id !== 'personal' ? `<div class="record-title"><span>第 ${index + 1} 段</span><button type="button" class="text-button danger" data-remove-record="${section.id}:${index}" aria-label="删除${esc(section.title)}第 ${index + 1} 段">删除记录</button></div>` : ''}
      <div class="profile-fields">${fieldsForRecord(draft, section.id, index).map(field => `<div class="profile-field ${field.id === 'description' ? 'wide' : ''}" data-profile-field="${field.id}">
      <button type="button" class="delete-field" data-delete-field="${section.id}:${index}:${field.id}" aria-label="删除${esc(field.label)}" title="删除小标题及内容">×</button>
      ${field.builtin ? `<label>${esc(field.label)}${field.id === 'description' ? `<textarea data-profile-input="base" data-group="${section.id}" data-index="${index}" data-field="${field.id}" name="${section.id}:${index}:${field.id}" rows="3" maxlength="5000">${esc(field.value)}</textarea>` : `<input data-profile-input="base" data-group="${section.id}" data-index="${index}" data-field="${field.id}" name="${section.id}:${index}:${field.id}" type="${field.type === 'date' ? 'month' : field.type === 'email' ? 'email' : 'text'}" value="${esc(field.value)}" maxlength="5000">`}</label>` : `<label><span class="field-title">${esc(field.label)}</span><textarea data-profile-input="value" data-group="${section.id}" data-index="${index}" data-field="${field.id}" aria-label="${esc(field.label)}内容" rows="2" maxlength="5000">${esc(field.value)}</textarea></label>`}
      </div>`).join('') || '<p class="muted">还没有信息，可在下方添加。</p>'}</div>
      <details class="information-adder"><summary>＋ 添加信息</summary><div class="new-field-form"><label>小标题<input data-new-label placeholder="例如：是否有实习证明" maxlength="80"></label><label>内容<textarea data-new-value placeholder="例如：是" rows="2" maxlength="5000"></textarea></label><button type="button" class="button secondary" data-add-field="${section.id}:${index}">添加信息</button></div></details>
      </div>`).join('') || '<p class="muted">还没有记录，点击右上角添加。</p>'}</section>`).join('')}
    <div class="new-section-form"><label for="new-section-title">新板块名称</label><input id="new-section-title" placeholder="例如：家庭信息" maxlength="80"><button class="button secondary" type="button" id="add-section">＋ 新增板块</button></div>
    <div class="profile-actions"><button class="button primary" type="submit">保存档案</button><span class="muted">保存后请重新识别表单</span></div></form>`;
  document.querySelector('#profile-text').addEventListener('input', event => { profileText = event.target.value; });
  document.querySelector('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const next = validateProfile(collectProfile());
      // Preserve the original v1 snapshot once, before a successful v2 write.
      if (storedProfile?.schemaVersion === 1 && !await getStored('profileV1Backup', null)) await setStored('profileV1Backup', storedProfile);
      await setStored('profile', next); profile = next; profileDraft = structuredClone(next); rows = []; scanned = false;
      memory = validateMemory(memory, profile);
      try { await setStored('recognitionMemory', memory); notice('档案已保存在本机。现在可以识别表单了。'); }
      catch { notice('档案已保存，旧识别记忆未能清理；已删除字段不会参与填写。', true); }
      renderProfile();
    } catch (error) { notice(error.message, true); }
    finally { busy = false; }
  });
}
function collectProfile() {
  const draft = structuredClone(profileDraft);
  for (const el of document.querySelectorAll('#profile-form [data-profile-input]')) {
    const section = profileSection(draft, el.dataset.group), record = section.records[Number(el.dataset.index)];
    if (el.dataset.profileInput === 'base') record[el.dataset.field] = el.value;
    else {
      const field = (section.custom ? record.fields : record.extraFields).find(field => field.id === el.dataset.field);
      if (el.dataset.profileInput === 'value') field.value = el.value;
    }
  }
  return draft;
}
async function loadProfileText() {
  let original;
  try {
    original = validateProfile(collectProfile());
    if (!profileText.trim()) throw new Error('请先粘贴个人信息。');
    if (profileText.length > 20000) throw new Error('粘贴文本最多支持 20000 字，请分批载入。');
    if (!configurationReady(config, apiKey)) throw new Error('请先在智能识别中配置并保存模型和 API Key。');
  } catch (error) { notice(error.message, true); return; }
  busy = true;
  const controls = [...document.querySelectorAll('#panel-content input,#panel-content textarea,#panel-content button')];
  controls.forEach(el => { el.disabled = true; });
  notice('正在整理个人信息…');
  try {
    if (isExtension && !await chrome.permissions.contains({ origins: [permissionOrigin(config)] })) throw new Error('未授权模型服务访问，请在智能识别中保存设置以授权。');
    const extracted = await extractProfile(profileText, config, apiKey, original);
    const merged = mergeExtraction(original, extracted);
    renderProfile(merged.profile);
    notice(`个人信息已载入编辑区，新增或补充 ${merged.added} 项，更新 ${merged.updated} 项${merged.skippedDeleted ? `，跳过已删除字段 ${merged.skippedDeleted} 项` : ''}。同一词条采用本次新值，未提供的信息保留。日期按月保存，无法确定年月的内容保留为文本。请核对后保存档案。`);
  } catch (error) { notice(`${failureMessage(error)} 原编辑内容和已保存档案未改变。`, true); }
  finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
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
    <div class="privacy-box">${icon('shield', 23)}<div><strong>发送结构，档案留在本地</strong><p>网页自动分析会向所选服务商发送过滤后的标签、控件类型、选项和分组；不发送档案值、已有输入值、网页地址或 HTML。标签和选项仍可能包含个人信息，可关闭自动智能识别。</p></div></div>
    <form id="settings-form" class="settings-form">
    <label class="auto-toggle"><input name="autoInfer" type="checkbox" ${config.autoInfer ? 'checked' : ''}> 自动智能识别<span>开关立即保存；关闭后仅使用规则与识别记忆。</span></label>
    <label>服务商<select name="provider"><option value="deepseek" ${config.provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option><option value="custom" ${config.provider === 'custom' ? 'selected' : ''}>自定义兼容接口</option></select></label>
    <label>服务地址<span>兼容 Chat Completions 接口的 API 根地址</span><input name="baseURL" type="url" value="${esc(config.baseURL)}" ${config.provider === 'deepseek' ? 'readonly' : ''} required></label>
    <label id="model-choice">模型名称${config.provider === 'deepseek' ? `<select name="model">${DEEPSEEK_MODELS.map(model => `<option ${config.model === model ? 'selected' : ''}>${model}</option>`).join('')}</select>` : `<input name="model" value="${esc(config.model)}" placeholder="服务商提供的模型名称" maxlength="200" required>`}</label>
    <label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="DeepSeek 必填，本地服务可留空" value="${esc(apiKey)}"></label>
    <p class="small-note">点击保存后，密钥保存在${isExtension ? '本机扩展存储' : '当前浏览器的网站存储'}，重新打开或重启浏览器可恢复；不加密、不云同步。可随时清除。保存或测试时申请服务访问权限。请求超时 20 秒，失败可继续手动选择。</p>
    <div class="settings-actions"><button class="button primary" type="submit">保存模型设置</button><button class="button secondary" id="test-key" type="button">测试 API Key</button><button class="button secondary" id="clear-key" type="button">清除已保存 API Key</button></div>
    <p class="small-note">测试使用当前输入的配置，不自动保存，不发送网页或档案信息，可能产生少量费用。</p></form>
    <div class="memory-actions"><button class="button secondary" id="clear-memory">清空识别记忆</button><p class="small-note">确认填写成功后积累字段映射。记忆仅保存在本机，清空不影响个人档案。</p></div>
    <details class="payload-details"><summary>查看待发送的字段结构（${rows.filter(r => !r.path).length} 个字段）</summary><pre>${esc(JSON.stringify(modelPayload(rows.filter(r => !r.path), profile), null, 2))}</pre></details>`;
  const form = document.querySelector('#settings-form');
  form.elements.provider.addEventListener('change', () => {
    form.elements.apiKey.value = '';
    const deepseek = form.elements.provider.value === 'deepseek';
    form.elements.baseURL.readOnly = deepseek;
    form.elements.baseURL.value = deepseek ? DEEPSEEK_URL : (config.provider === 'custom' ? config.baseURL : '');
    document.querySelector('#model-choice').innerHTML = `模型名称${deepseek ? `<select name="model">${DEEPSEEK_MODELS.map(model => `<option>${model}</option>`).join('')}</select>` : `<input name="model" placeholder="服务商提供的模型名称" maxlength="200" value="${esc(config.provider === 'custom' ? config.model : '')}" required>`}`;
  });
  form.elements.baseURL.addEventListener('input', () => { form.elements.apiKey.value = ''; });
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
        await saveModelSettings(next, key);
        config = next; apiKey = key;
        notice(allowed ? '模型设置已保存。下次识别表单时将按开关设置自动分析。' : '设置已保存，但未授权模型服务访问；识别时仅使用本地匹配。可重新保存设置以授权。', !allowed);
      }
    } catch (error) { notice(failureMessage(error), true); }
    finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
  };
  form.addEventListener('submit', event => run(event, false));
  document.querySelector('#test-key').addEventListener('click', event => run(event, true));
  document.querySelector('#clear-key').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const controls = [...form.querySelectorAll('input,select,button')];
    controls.forEach(el => { el.disabled = true; });
    try {
      await clearSavedKey(config); apiKey = ''; form.elements.apiKey.value = '';
      notice('已保存的 API Key 已清除，档案、模型配置和识别记忆保持不变。');
    } catch (error) { notice(failureMessage(error), true); }
    finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
  });
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
    const mappings = await inferMappings(unresolved, config, apiKey, fetch, profile);
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
    if (activeTab === 'profile') profileDraft = collectProfile();
    activeTab = button.dataset.tab || 'profile'; notice(''); render(); return;
  }
  if (button.id === 'load-profile') { await loadProfileText(); return; }
  if (button.dataset.addRecord || button.dataset.removeRecord || button.dataset.deleteField || button.dataset.addField || button.dataset.removeSection || button.id === 'add-section') {
    try {
      let draft = collectProfile();
      if (button.dataset.addRecord) draft = addProfileRecord(draft, button.dataset.addRecord);
      else if (button.dataset.removeRecord) { const [group, index] = button.dataset.removeRecord.split(':'); draft = removeProfileRecord(draft, group, Number(index)); }
      else if (button.dataset.deleteField) { const [group, index, id] = button.dataset.deleteField.split(':'); draft = removeProfileField(draft, group, Number(index), id); }
      else if (button.dataset.addField) {
        const [group, index] = button.dataset.addField.split(':'), adder = button.closest('.information-adder');
        draft = addProfileField(draft, group, Number(index), adder.querySelector('[data-new-label]').value, adder.querySelector('[data-new-value]').value);
      } else if (button.dataset.removeSection) draft = removeProfileSection(draft, button.dataset.removeSection);
      else draft = addProfileSection(draft, document.querySelector('#new-section-title').value);
      renderProfile(draft); notice('编辑内容已更新，请检查后保存档案。');
    } catch (error) { notice(error.message, true); }
    return;
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
      rows = applyMemory(matchFields(result.fields, profile), memory, pageOrigin, profile); scanned = true; pageTitle = result.title;
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
      const next = learnMappings(memory, rows, pageOrigin, profile);
      try { await setStored('recognitionMemory', next); memory = next; notice(summary); }
      catch { notice(`${summary} 识别记忆保存失败，本次填写结果不受影响。`, true); }
    }
  } catch (error) { notice(error.name === 'TimeoutError' ? '模型请求超时，可继续手动选择档案字段。' : error.message || '操作失败，请重试。', true); }
  finally { busy = false; renderPreview(); }
});
document.querySelector('#app').addEventListener('change', event => {
  if (busy) return;
  const el = event.target;
  if (el.matches('.record-picker') && el.dataset.group) {
    const kind = groupForSection(rows.find(r => r.groupId === el.dataset.group).section, profile);
    for (const row of rows.filter(r => r.groupId === el.dataset.group && profileSchema(profile).find(s => s.path === r.path)?.sectionId === kind)) { row.index = Number(el.value); row.status = ''; }
    renderPreview(); return;
  }
  const row = rows.find(r => r.id === (el.dataset.map || el.dataset.select || el.dataset.overwrite));
  if (!row) return;
  if (el.dataset.map) { const [path, index] = el.value.split('::'); row.path = path; row.index = Number(index || 0); row.source = path ? '手动选择' : '需要确认'; row.selected = Boolean(readValue(profile, row.path, row.index)); row.status = ''; renderPreview(); }
  else if (el.dataset.select) { row.selected = el.checked; const count = rows.filter(r => r.selected).length; document.querySelector('#selected-count').textContent = `已选择 ${count} 项`; document.querySelector('#fill').disabled = !count || busy; }
  else row.override = el.checked;
});
render();
if (keyLoadError) notice(keyLoadError, true);
