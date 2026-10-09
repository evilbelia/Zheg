import { profileSchema, profileSections, compatibleDefinition, readValue } from './profile.js';

export const normalize = value => String(value ?? '').toLowerCase().replace(/[\s*＊：:()（）_\-]/g, '');
export function sectionKind(section) {
  if (/教育|学历|education/i.test(section)) return 'education';
  if (/实习|工作经历|工作经验|internship|employment|work experience/i.test(section)) return 'internships';
  if (/个人|基本|联系|personal|contact/i.test(section)) return 'personal';
  return null;
}

export function groupForSection(section, profile) {
  return profileSections(profile).find(s => normalize(s.title) === normalize(section))?.id ?? sectionKind(section);
}
export function matchFields(fields, profile) {
  const counts = Object.fromEntries(profileSections(profile).filter(s => s.id !== 'personal').map(s => [s.id, new Map()]));
  const schema = profileSchema(profile);
  return fields.map(field => {
    const kind = groupForSection(field.section, profile);
    let index = 0;
    if (counts[kind]) {
      const group = field.groupId;
      if (!counts[kind].has(group)) counts[kind].set(group, counts[kind].size);
      index = counts[kind].get(group);
    }
    const candidates = schema.filter(item => compatibleDefinition(field, item) && item.aliases.some(a => normalize(a) === normalize(field.label)));
    const scoped = candidates.filter(item => !kind || item.sectionId === kind || item.sectionId === 'personal');
    const path = scoped.length === 1 ? scoped[0].path : '';
    const value = readValue(profile, path, index);
    return { ...field, path, index, source: path ? '规则匹配' : '需要确认', selected: Boolean(path && value), status: '', override: false };
  });
}

export function fillValue(field, value) {
  if (!value) return { ok: false, reason: '档案没有可填写的值' };
  if (field.type === 'date') return { ok: true, value: /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value, note: /^\d{4}-\d{2}$/.test(value) ? '档案只有月份，按当月 1 日填写' : '' };
  if (field.type === 'month') return { ok: true, value: value.slice(0, 7) };
  if (['select', 'radio'].includes(field.type)) {
    const synonyms = { 女: ['female', 'woman', '女'], 男: ['male', 'man', '男'], 本科: ['本科', '学士', 'bachelor'], 硕士: ['硕士', '研究生', 'master'], 博士: ['博士', 'doctor', 'phd'] };
    const allowed = [value, ...(synonyms[value] || [])].map(normalize);
    const options = field.options.filter(o => allowed.includes(normalize(o.label)) || allowed.includes(normalize(o.value)));
    return options.length === 1 ? { ok: true, value: options[0].value } : { ok: false, reason: options.length > 1 ? '存在多个匹配选项，请手动选择' : '网页没有与档案值匹配的选项' };
  }
  return { ok: true, value };
}
