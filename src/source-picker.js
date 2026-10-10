import { profileSchema, profileSections, compatibleDefinition } from './profile.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const compatibleSchema = (row, profile) => profileSchema(profile).filter(s => compatibleDefinition(row, s) && s.indices.length);

export function sourcePicker(row, profile, busy) {
  const mapped = compatibleSchema(row, profile).find(s => s.path === row.path && s.indices.includes(row.index));
  const section = mapped && profileSections(profile).find(s => s.id === mapped.sectionId);
  const record = section?.records[row.index];
  const identity = record?.school || record?.company || record?.fields?.find(f => /姓名|名称|关系/.test(f.label))?.value;
  const label = mapped ? `${section.title}${section.id === 'personal' ? '' : ` ${row.index + 1}${identity ? `（${identity}）` : ''}`} · ${mapped.label.split(' · ').at(-1)}` : row.path ? '无对应档案记录，请重新选择' : '请选择档案字段';
  return `<div class="source-picker"><button type="button" class="source-trigger mapping-select" data-source-trigger="${esc(row.id)}" data-value="${mapped ? `${esc(row.path)}::${row.index}` : ''}" aria-label="${esc(row.label)}档案来源：${esc(label)}" aria-haspopup="menu" aria-expanded="false" ${busy ? 'disabled' : ''}><span>${esc(label)}</span><span aria-hidden="true">⌄</span></button><div class="source-menu" role="menu" aria-label="${esc(row.label)}档案来源" hidden></div></div>`;
}

// Browsing is local UI state. Only a validated field click changes the preview mapping.
export function setupSourcePickers(root, { getProfile, getRow, isBusy, onSelect }) {
  let open = null;
  const focusTrigger = rowId => [...root.querySelectorAll('[data-source-trigger]')].find(el => el.dataset.sourceTrigger === rowId)?.focus({ preventScroll: true });
  function close(restore = false) {
    if (!open) return;
    const { picker, rowId } = open;
    picker.querySelector('.source-menu').hidden = true;
    picker.querySelector('.source-trigger').setAttribute('aria-expanded', 'false');
    open = null;
    if (restore) focusTrigger(rowId);
  }
  function show(sectionId = '') {
    const row = getRow(open.rowId), profile = getProfile(), schema = compatibleSchema(row, profile);
    const sections = profileSections(profile).filter(s => schema.some(def => def.sectionId === s.id));
    const section = sections.find(s => s.id === sectionId);
    open.sectionId = section?.id || '';
    const menu = open.picker.querySelector('.source-menu');
    const entries = section ? section.records.map((record, index) => {
      const fields = schema.filter(s => s.sectionId === section.id && s.indices.includes(index));
      if (!fields.length) return '';
      const identity = record.school || record.company || record.fields?.find(f => /姓名|名称|关系/.test(f.label))?.value || '未命名记录';
      return `<div role="group" aria-label="${esc(section.id === 'personal' ? section.title : `${index + 1} · ${identity}`)}">${section.id === 'personal' ? '' : `<div class="source-record-title" role="presentation">${esc(`${index + 1} · ${identity}`)}</div>`}${fields.map(s => `<button type="button" role="menuitemradio" aria-checked="${row.path === s.path && row.index === index}" data-source-field="${esc(s.path)}" data-source-index="${index}">${esc(s.label.split(' · ').at(-1))}${row.path === s.path && row.index === index ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>`;
    }).join('') : sections.map(s => `<button type="button" role="menuitem" data-source-module="${esc(s.id)}" aria-label="${esc(s.title)}，展开信息"><span>${esc(s.title)}</span><span aria-hidden="true">›</span></button>`).join('');
    menu.innerHTML = `${section ? `<button type="button" role="menuitem" data-source-back>‹ 返回板块 · ${esc(section.title)}</button>` : '<div class="source-record-title" role="presentation">选择板块</div>'}<div class="source-options" role="presentation">${entries || '<p class="source-record-title">没有可选字段</p>'}</div><button type="button" role="menuitem" data-source-clear>清除来源</button>`;
    menu.hidden = false;
    const target = menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-source-field], [data-source-module]') || menu.querySelector('button');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-source-trigger]');
    if (trigger) {
      if (isBusy() || trigger.disabled) return;
      const picker = trigger.closest('.source-picker');
      if (open?.picker === picker) { close(true); return; }
      close();
      open = { picker, rowId: trigger.dataset.sourceTrigger, sectionId: '' };
      trigger.setAttribute('aria-expanded', 'true'); show(); return;
    }
    const button = event.target.closest('.source-menu button');
    if (!button || !open || !open.picker.contains(button) || isBusy()) return;
    if (button.hasAttribute('data-source-module')) { show(button.dataset.sourceModule); return; }
    if (button.hasAttribute('data-source-back')) { show(); return; }
    const rowId = open.rowId, path = button.dataset.sourceField || '', index = Number(button.dataset.sourceIndex || 0);
    if (path && !compatibleSchema(getRow(rowId), getProfile()).some(s => s.path === path && s.indices.includes(index))) return;
    close(); onSelect(rowId, path, index); focusTrigger(rowId);
  });
  root.addEventListener('keydown', event => {
    const trigger = event.target.closest('[data-source-trigger]');
    if (trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); if (!open || open.picker !== trigger.closest('.source-picker')) trigger.click(); return; }
    if (!open || !open.picker.contains(event.target)) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    // Let native Tab move from the trigger to the next/previous control.
    if (event.key === 'Tab') { close(true); return; }
    const menu = open.picker.querySelector('.source-menu');
    const buttons = [...menu.querySelectorAll('button')], index = buttons.indexOf(event.target);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'ArrowRight' && event.target.hasAttribute('data-source-module')) { event.preventDefault(); event.target.click(); }
    else if (event.key === 'ArrowLeft' && open.sectionId) { event.preventDefault(); show(); }
  });
  document.addEventListener('click', event => { if (open && !event.composedPath().includes(open.picker)) close(); });
  document.addEventListener('focusin', event => { if (open && !open.picker.contains(event.target)) close(); });
}
