export const SCHEMA = [
  { path: 'personal.fullName', label: '基本信息 · 姓名', type: 'text', aliases: ['姓名', '真实姓名', '中文姓名', 'name', 'full name'] },
  { path: 'personal.phone', label: '基本信息 · 手机号', type: 'tel', aliases: ['手机', '手机号', '手机号码', '联系电话', '电话号码', 'phone', 'mobile'] },
  { path: 'personal.email', label: '基本信息 · 邮箱', type: 'email', aliases: ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail'] },
  { path: 'personal.gender', label: '基本信息 · 性别', type: 'text', aliases: ['性别', 'gender'] },
  { path: 'personal.city', label: '基本信息 · 现居城市', type: 'text', aliases: ['现居城市', '现居地', '当前城市'] },
  { path: 'education[].school', label: '教育经历 · 学校', type: 'text', aliases: ['毕业院校', '学校名称', '所在高校', '学校', '院校', 'school', 'university'] },
  { path: 'education[].major', label: '教育经历 · 专业', type: 'text', aliases: ['专业', '专业名称', '所学专业', 'major'] },
  { path: 'education[].degree', label: '教育经历 · 学历', type: 'text', aliases: ['学历', '最高学历', '学位', 'degree'] },
  { path: 'education[].startDate', label: '教育经历 · 入学时间', type: 'date', aliases: ['入学时间', '开始时间', '开始日期', '起始时间', 'start date'] },
  { path: 'education[].endDate', label: '教育经历 · 毕业时间', type: 'date', aliases: ['毕业时间', '毕业日期', '结束时间', '结束日期', 'end date'] },
  { path: 'internships[].company', label: '实习经历 · 公司', type: 'text', aliases: ['公司', '公司名称', '实习单位', '单位名称', 'company'] },
  { path: 'internships[].position', label: '实习经历 · 职位', type: 'text', aliases: ['职位', '岗位', '实习岗位', '职位名称', 'position'] },
  { path: 'internships[].startDate', label: '实习经历 · 开始时间', type: 'date', aliases: ['开始时间', '开始日期', '起始时间', '入职时间', 'start date'] },
  { path: 'internships[].endDate', label: '实习经历 · 结束时间', type: 'date', aliases: ['结束时间', '结束日期', '离职时间', 'end date'] },
  { path: 'internships[].description', label: '实习经历 · 工作内容', type: 'text', aliases: ['工作内容', '实习内容', '工作描述', '职责描述', 'description'] },
];

export const emptyProfile = () => ({ schemaVersion: 1, personal: { fullName: '', phone: '', email: '', gender: '', city: '' }, education: [], internships: [] });
export const sampleProfile = () => ({
  schemaVersion: 1,
  personal: { fullName: '林知夏', phone: '13800000000', email: 'zhixia@example.com', gender: '女', city: '杭州' },
  education: [
    { school: '浙江大学', major: '软件工程', degree: '硕士', startDate: '2024-09', endDate: '2027-06' },
    { school: '杭州电子科技大学', major: '计算机科学与技术', degree: '本科', startDate: '2020-09', endDate: '2024-06' },
  ],
  internships: [{ company: '示例科技有限公司', position: '前端开发实习生', startDate: '2025-07', endDate: '2025-10', description: '参与招聘管理系统的前端开发，完成表单组件与交互优化。' }],
});

export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schemaVersion !== 1) throw new Error('档案格式不正确：需要 schemaVersion: 1。');
  const result = emptyProfile();
  for (const group of ['personal', 'education', 'internships']) {
    const multiple = group !== 'personal';
    const records = multiple ? input[group] : [input[group]];
    if (!Array.isArray(records) || records.length > 20) throw new Error(`${group} 格式不正确，最多支持 20 段经历。`);
    const keys = SCHEMA.filter(s => s.path.startsWith(group)).map(s => s.path.split('.').at(-1));
    const cleaned = records.map(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`${group} 缺少有效记录。`);
      return Object.fromEntries(keys.map(key => {
        const value = record[key] ?? '';
        if (typeof value !== 'string' || value.length > 5000) throw new Error(`${key} 必须是字符串，且不能超过 5000 字。`);
        if (/Date$/.test(key) && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('档案日期请使用 YYYY-MM，例如 2024-09。');
        return [key, value];
      }));
    });
    result[group] = multiple ? cleaned : cleaned[0];
  }
  return result;
}

export function readValue(profile, path, index = 0) {
  if (!SCHEMA.some(s => s.path === path)) return '';
  const [group, key] = path.replace('[]', '').split('.');
  return (path.includes('[]') ? profile[group]?.[index]?.[key] : profile[group]?.[key]) ?? '';
}

export function compatible(field, path) {
  const item = SCHEMA.find(s => s.path === path);
  if (!item) return false;
  if (['date', 'month'].includes(field.type)) return item.type === 'date';
  if (field.type === 'email') return item.type === 'email';
  if (field.type === 'tel') return item.type === 'tel';
  return ['text', 'textarea', 'select', 'radio'].includes(field.type);
}
