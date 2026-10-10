export const SCHEMA = [
  { path: 'personal.fullName', label: '基本信息 · 姓名', type: 'text', aliases: ['姓名', '真实姓名', '中文姓名', 'name', 'full name'] },
  { path: 'personal.phone', label: '基本信息 · 手机号', type: 'tel', aliases: ['手机', '手机号', '手机号码', '联系电话', '电话号码', 'phone', 'mobile'] },
  { path: 'personal.email', label: '基本信息 · 邮箱', type: 'email', aliases: ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail'] },
  { path: 'personal.gender', label: '基本信息 · 性别', type: 'text', aliases: ['性别', 'gender'] },
  { path: 'personal.city', label: '基本信息 · 现居城市', type: 'text', aliases: ['现居城市', '现居地', '当前城市'] },
  { path: 'education[].school', label: '教育经历 · 学校', type: 'text', aliases: ['毕业院校', '学校名称', '所在高校', '学校', '院校', 'school', 'university'] },
  { path: 'education[].major', label: '教育经历 · 专业', type: 'text', aliases: ['专业', '专业名称', '所学专业', '主修专业', 'major'] },
  { path: 'education[].degree', label: '教育经历 · 学历', type: 'text', aliases: ['学历', '最高学历', '学位', 'degree'] },
  { path: 'education[].startDate', label: '教育经历 · 入学时间', type: 'date', aliases: ['入学时间', '开始时间', '开始日期', '起始时间', 'start date'] },
  { path: 'education[].endDate', label: '教育经历 · 毕业时间', type: 'date', aliases: ['毕业时间', '毕业日期', '结束时间', '结束日期', 'end date'] },
  { path: 'internships[].company', label: '实习经历 · 公司', type: 'text', aliases: ['公司', '公司名称', '实习单位', '工作单位', '单位名称', 'company'] },
  { path: 'internships[].position', label: '实习经历 · 职位', type: 'text', aliases: ['职位', '岗位', '实习岗位', '职位名称', '担任职务', 'position'] },
  { path: 'internships[].startDate', label: '实习经历 · 开始时间', type: 'date', aliases: ['开始时间', '开始日期', '起始时间', '入职时间', 'start date'] },
  { path: 'internships[].endDate', label: '实习经历 · 结束时间', type: 'date', aliases: ['结束时间', '结束日期', '离职时间', 'end date'] },
  { path: 'internships[].description', label: '实习经历 · 工作内容', type: 'text', aliases: ['工作内容', '实习内容', '工作描述', '职责描述', '主要工作职责', 'description'] },
];

export const emptyProfile = () => ({ schemaVersion: 2, personal: { fullName: '', phone: '', email: '', gender: '', city: '', extraFields: [], removedFields: [] }, education: [], internships: [], sections: [] });
export const sampleProfile = () => validateProfile({
  schemaVersion: 1,
  personal: { fullName: '林知夏', phone: '13800000000', email: 'zhixia@example.com', gender: '女', city: '杭州' },
  education: [
    { school: '浙江大学', major: '软件工程', degree: '硕士', startDate: '2024-09', endDate: '2027-06' },
    { school: '杭州电子科技大学', major: '计算机科学与技术', degree: '本科', startDate: '2020-09', endDate: '2024-06' },
  ],
  internships: [{ company: '示例科技有限公司', position: '前端开发实习生', startDate: '2025-07', endDate: '2025-10', description: '参与招聘管理系统的前端开发，完成表单组件与交互优化。' }],
});

export const GROUP_LABELS = { personal: '基本信息', education: '教育经历', internships: '实习经历' };
export const FIELD_TYPES = ['text', 'date', 'email', 'tel'];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const norm = value => String(value ?? '').toLowerCase().replace(/[\s*＊：:()（）_\-]/g, '');
const safeID = (id, prefix) => typeof id === 'string' && new RegExp(`^${prefix}_[a-zA-Z0-9_-]{1,64}$`).test(id);
export const newID = prefix => `${prefix}_${crypto.randomUUID()}`;
function stringValue(value, name, max = 5000, nonempty = false) {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new Error(`${name}必须是${nonempty ? '非空' : ''}文本，最多 ${max} 字。`);
  return nonempty ? value.trim() : value;
}
function typedValue(value, type) {
  stringValue(value, '内容');
  if (type === 'date' && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('档案日期请使用 YYYY-MM，例如 2024-09。');
  return value;
}
function cleanFields(fields, names = new Set()) {
  if (!Array.isArray(fields) || fields.length > 50) throw new Error('每条记录最多支持 50 个自定义字段。');
  const ids = new Set();
  return fields.map(field => {
    if (!isObject(field) || !safeID(field.id, 'f') || ids.has(field.id) || !FIELD_TYPES.includes(field.type)) throw new Error('自定义字段 ID 或类型不正确。');
    ids.add(field.id);
    const label = stringValue(field.label, '小标题', 80, true);
    if (!norm(label) || names.has(norm(label))) throw new Error('同一条记录的小标题不能重复。');
    names.add(norm(label));
    return { id: field.id, label, value: typedValue(field.value, field.type), type: field.type };
  });
}

export function validateProfile(input) {
  if (!isObject(input) || ![1, 2].includes(input.schemaVersion)) throw new Error('档案格式不正确：需要 schemaVersion: 1 或 2。');
  const result = emptyProfile();
  for (const group of Object.keys(GROUP_LABELS)) {
    const records = group === 'personal' ? [input.personal] : input[group];
    if (!Array.isArray(records) || records.length > 20) throw new Error(`${group} 格式不正确，最多支持 20 段经历。`);
    const definitions = SCHEMA.filter(s => s.path.startsWith(group));
    const cleaned = records.map(record => {
      if (!isObject(record)) throw new Error(`${group} 缺少有效记录。`);
      const keys = definitions.map(s => s.path.split('.').at(-1));
      const removedFields = input.schemaVersion === 2 ? record.removedFields ?? [] : [];
      if (!Array.isArray(removedFields) || removedFields.some(key => !keys.includes(key)) || new Set(removedFields).size !== removedFields.length) throw new Error('删除字段列表不正确。');
      const values = Object.fromEntries(definitions.map(def => {
        const key = def.path.split('.').at(-1);
        return [key, removedFields.includes(key) ? '' : typedValue(record[key] ?? '', def.type)];
      }));
      const names = new Set(definitions.filter(def => !removedFields.includes(def.path.split('.').at(-1))).map(def => norm(def.label.split(' · ').at(-1))));
      return { ...values, removedFields: [...removedFields], extraFields: cleanFields(input.schemaVersion === 2 ? record.extraFields ?? [] : [], names) };
    });
    result[group] = group === 'personal' ? cleaned[0] : cleaned;
  }
  const sections = input.schemaVersion === 2 ? input.sections ?? [] : [];
  if (!Array.isArray(sections) || sections.length > 20) throw new Error('最多支持 20 个自定义板块。');
  const ids = new Set(), titles = new Set(Object.values(GROUP_LABELS).map(norm));
  result.sections = sections.map(section => {
    if (!isObject(section) || !safeID(section.id, 's') || ids.has(section.id)) throw new Error('板块 ID 不正确或重复。');
    ids.add(section.id);
    const title = stringValue(section.title, '板块名称', 80, true);
    if (!norm(title) || titles.has(norm(title))) throw new Error('板块名称不能重复。');
    titles.add(norm(title));
    if (!Array.isArray(section.records) || section.records.length > 20) throw new Error('每个板块最多支持 20 条记录。');
    return { id: section.id, title, records: section.records.map(record => {
      if (!isObject(record)) throw new Error('板块记录格式不正确。');
      return { fields: cleanFields(record.fields) };
    }) };
  });
  for (const section of profileSections(result)) {
    const identities = new Map();
    for (const record of section.records) for (const field of section.custom ? record.fields : record.extraFields) {
      const identity = JSON.stringify([field.label, field.type]);
      if (identities.has(field.id) && identities.get(field.id) !== identity) throw new Error('同一字段 ID 在不同记录中定义不一致。');
      identities.set(field.id, identity);
    }
  }
  if (profileSections(result).reduce((sum, section) => sum + section.records.reduce((n, record) => n + (section.custom ? record.fields.length : fieldsForRecord(result, section.id, section.records.indexOf(record)).length), 0), 0) > 500) throw new Error('档案最多支持 500 个信息字段。');
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1000000) throw new Error('档案总大小不能超过 1 MB。');
  return result;
}

export function profileSections(profile) {
  return [
    ...Object.entries(GROUP_LABELS).map(([id, title]) => ({ id, title, custom: false, records: id === 'personal' ? [profile.personal] : profile[id] })),
    ...(profile.sections ?? []).map(section => ({ ...section, custom: true })),
  ];
}
export function profileSection(profile, id) { return profileSections(profile).find(section => section.id === id); }
export function fieldsForRecord(profile, group, index) {
  const section = profileSection(profile, group), record = section?.records[index];
  if (!record) return [];
  if (section.custom) return record.fields.map(f => ({ ...f, path: `sections.${group}[].${f.id}`, builtin: false }));
  return [
    ...SCHEMA.filter(s => s.path.startsWith(group) && !(record.removedFields ?? []).includes(s.path.split('.').at(-1))).map(s => ({ id: s.path.split('.').at(-1), label: s.label.split(' · ').at(-1), value: record[s.path.split('.').at(-1)] ?? '', type: s.type, path: s.path, builtin: true })),
    ...(record.extraFields ?? []).map(f => ({ ...f, path: `${group}${group === 'personal' ? '' : '[]'}.extra.${f.id}`, builtin: false })),
  ];
}
export function profileSchema(profile) {
  if (!profile) return SCHEMA;
  const schema = new Map();
  for (const section of profileSections(profile)) {
    // Keep standard definitions for empty experience sections, but not deleted fields.
    if (!section.custom && !section.records.length) for (const s of SCHEMA.filter(s => s.path.startsWith(section.id))) schema.set(s.path, { ...s, sectionId: section.id, sectionTitle: section.title, indices: [] });
    section.records.forEach((_, index) => {
      for (const field of fieldsForRecord(profile, section.id, index)) {
        if (!schema.has(field.path)) {
          const standard = SCHEMA.find(s => s.path === field.path);
          schema.set(field.path, { path: field.path, label: `${section.title} · ${field.label}`, type: field.type, aliases: standard?.aliases ?? [field.label], sectionId: section.id, sectionTitle: section.title, indices: [] });
        }
        schema.get(field.path).indices.push(index);
      }
    });
  }
  return [...schema.values()];
}
export function readValue(profile, path, index = 0) {
  const item = profileSchema(profile).find(s => s.path === path);
  if (!item || !Number.isInteger(index) || index < 0) return '';
  return fieldsForRecord(profile, item.sectionId, index).find(field => field.path === path)?.value ?? '';
}
export function compatible(field, path, profile) {
  return compatibleDefinition(field, profileSchema(profile).find(s => s.path === path));
}
export function compatibleDefinition(field, item) {
  if (!item) return false;
  if (['date', 'month'].includes(field.type)) return item.type === 'date';
  if (field.type === 'email') return item.type === 'email';
  if (field.type === 'tel') return item.type === 'tel';
  return ['text', 'textarea', 'select', 'radio'].includes(field.type);
}
export function addProfileField(profile, group, index, label, value, type = 'text') {
  const next = validateProfile(profile), section = profileSection(next, group), record = section?.records[index];
  if (!record) throw new Error('记录已不存在。');
  label = stringValue(label, '小标题', 80, true);
  if (fieldsForRecord(next, group, index).some(f => norm(f.label) === norm(label))) throw new Error('同一条记录的小标题不能重复。');
  const other = section.records.flatMap(r => section.custom ? r.fields : r.extraFields).find(f => norm(f.label) === norm(label) && f.type === type);
  const field = { id: other?.id ?? newID('f'), label: other?.label ?? label, value, type };
  (section.custom ? record.fields : record.extraFields).push(field);
  return validateProfile(next);
}
export function removeProfileField(profile, group, index, id) {
  const next = validateProfile(profile), section = profileSection(next, group), record = section?.records[index];
  const field = fieldsForRecord(next, group, index).find(f => f.id === id);
  if (!record || !field) throw new Error('字段已不存在。');
  if (field.builtin) { record.removedFields.push(id); record[id] = ''; }
  else if (section.custom) record.fields = record.fields.filter(f => f.id !== id);
  else record.extraFields = record.extraFields.filter(f => f.id !== id);
  return validateProfile(next);
}
export function addProfileSection(profile, title) {
  const next = validateProfile(profile);
  next.sections.push({ id: newID('s'), title, records: [{ fields: [] }] });
  return validateProfile(next);
}
export function addProfileRecord(profile, group) {
  const next = validateProfile(profile), section = profileSection(next, group);
  if (!section || group === 'personal') throw new Error('基本信息只支持一条记录。');
  section.records.push(section.custom ? { fields: [] } : { extraFields: [], removedFields: [] });
  return validateProfile(next);
}
export function removeProfileRecord(profile, group, index) {
  const next = validateProfile(profile), section = profileSection(next, group);
  if (!section || group === 'personal' || !section.records[index]) throw new Error('记录已不存在或不能删除。');
  section.records.splice(index, 1);
  return validateProfile(next);
}
export function removeProfileSection(profile, group) {
  const next = validateProfile(profile);
  if (!next.sections.some(s => s.id === group)) throw new Error('标准板块不能删除，可删除其中字段或记录。');
  next.sections = next.sections.filter(s => s.id !== group);
  return validateProfile(next);
}
