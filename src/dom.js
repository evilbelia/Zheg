/* Self-contained: runs in the extension's isolated world or the demo page. */
(() => {
  if (globalThis.ZhegDOM) return;
  let registry = new Map();
  const visible = el => !el.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  function labelText(node) {
    const copy = node?.cloneNode(true);
    copy?.querySelectorAll('input, select, textarea, button, [aria-hidden="true"]').forEach(el => el.remove());
    return text(copy);
  }
  function label(el) {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return ids.map(id => labelText(document.getElementById(id))).join(' ') || el.getAttribute('aria-label') || Array.from(el.labels || []).map(labelText).join(' ') || labelText(el.closest('label')) || el.getAttribute('placeholder') || el.name || '';
  }
  function group(el) {
    const root = el.closest('[data-zheg-section]') || el.closest('section, .form-section, fieldset, [role="group"]') || el.form || document.body;
    const section = root.getAttribute('data-zheg-section') || root.getAttribute('aria-label') || text(root.querySelector(':scope > legend, :scope > h2, :scope > h3, :scope > h4')) || '未分组';
    return { root, section };
  }
  function describe(el, radios) {
    const type = radios ? 'radio' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type;
    const radioRoot = radios ? el.closest('[role="group"], .radio-group, fieldset') : null;
    const fieldLabel = radios ? radioRoot?.getAttribute('aria-label') || text(radioRoot?.querySelector(':scope > legend, :scope > .field-label')) || el.name : label(el);
    return {
      label: fieldLabel, type,
      options: type === 'select' ? Array.from(el.options).filter(o => !o.disabled && o.value !== '').map(o => ({ label: text(o), value: o.value })) : radios ? radios.filter(r => !r.disabled).map(r => ({ label: label(r), value: r.value })) : [],
      hasValue: radios ? radios.some(r => r.checked) : Boolean(el.value),
      ...group(el),
    };
  }
  function scan(root = document) {
    registry = new Map();
    const fields = [], groups = new Map(), seenRadio = new Set();
    const controls = Array.from(root.querySelectorAll('input, select, textarea'));
    let unsupported = 0;
    for (const el of controls) {
      if (!visible(el) || el.disabled || el.readOnly) continue;
      if (el.tagName === 'INPUT' && !['text', 'email', 'tel', 'date', 'month', 'radio'].includes(el.type) || el.tagName === 'SELECT' && el.multiple) { unsupported++; continue; }
      let radios;
      if (el.type === 'radio') {
        if (!el.name) { unsupported++; continue; }
        radios = controls.filter(r => r.type === 'radio' && r.name === el.name && r.form === el.form && visible(r));
        if (seenRadio.has(radios[0])) continue;
        seenRadio.add(radios[0]);
      }
      const info = describe(el, radios);
      if (!info.label) { unsupported++; continue; }
      if (!groups.has(info.root)) groups.set(info.root, `group_${groups.size + 1}`);
      const id = `field_${crypto.randomUUID()}`;
      const { root: sectionRoot, ...clean } = info;
      const field = { id, ...clean, groupId: groups.get(sectionRoot) };
      fields.push(field);
      registry.set(id, { el, radios, field, sectionRoot });
      if (fields.length >= 200) break;
    }
    return { fields, unsupported, truncated: fields.length >= 200 };
  }
  function fill(items) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('填写请求无效');
    return items.map(item => {
      const result = { id: item.id, status: 'failed', message: '' };
      const record = registry.get(item.id);
      if (!record) return { ...result, message: '字段已失效，请重新识别页面' };
      const { el, radios, field, sectionRoot } = record;
      if (!el.isConnected || !visible(el) || el.disabled || el.readOnly || (radios && radios.some(r => !r.isConnected))) return { ...result, message: '字段已移除、隐藏或不可编辑' };
      const now = describe(el, radios);
      if (now.type !== field.type || now.label !== field.label || now.root !== sectionRoot || now.section !== field.section || JSON.stringify(now.options) !== JSON.stringify(field.options)) return { ...result, message: '页面字段发生变化，请重新识别' };
      if (now.hasValue && !item.overwrite) return { ...result, status: 'skipped', message: '保留网页已有内容' };
      if (typeof item.value !== 'string' || !item.value || item.value.length > 5000) return { ...result, message: '待填值无效或为空' };
      try {
        if (radios) {
          const option = radios.find(r => r.value === item.value && !r.disabled && visible(r));
          if (!option) return { ...result, message: '单选项不存在或不可用' };
          option.click();
          return { ...result, status: option.checked ? 'success' : 'failed', message: option.checked ? '已填写' : '页面未接受单选值' };
        }
        if (el.tagName === 'SELECT' && !now.options.some(o => o.value === item.value)) return { ...result, message: '下拉选项不存在' };
        if (el.maxLength > -1 && item.value.length > el.maxLength) return { ...result, message: '超过字段最大长度' };
        const previous = el.value;
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
        set.call(el, item.value);
        if (el.value !== item.value || !el.checkValidity()) { set.call(el, previous); return { ...result, message: '值不符合页面的输入格式或范围' }; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ...result, status: el.value === item.value ? 'success' : 'failed', message: el.value === item.value ? '已填写' : '页面未接受填写值' };
      } catch { return { ...result, message: '控件填写失败，请手动填写' }; }
    });
  }
  globalThis.ZhegDOM = { scan, fill };
  if (globalThis.chrome?.runtime?.id) chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'ZHEG_SCAN') respond(scan());
    if (message.type === 'ZHEG_FILL') respond(fill(message.items));
  });
})();
