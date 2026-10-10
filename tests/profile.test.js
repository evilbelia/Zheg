import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProfile, emptyProfile, validateProfile, profileSchema, profileSection, fieldsForRecord, addProfileField, removeProfileField, addProfileSection, addProfileRecord, removeProfileRecord, removeProfileSection, readValue, compatible } from '../src/profile.js';
import { extractProfile, validateExtraction, mergeExtraction, extractionMonth } from '../src/profile-extraction.js';
import { matchFields } from '../src/matching.js';
import { modelPayload, inferMappings, validateMappings } from '../src/model.js';
import { emptyMemory, learnMappings, applyMemory, validateMemory } from '../src/recognition-memory.js';

const webField = (label, section, id = 'w1', groupId = 'g1', type = 'text') => ({ id, label, section, groupId, type, options: [], hasValue: false });
const info = (label, value, type = 'text') => ({ label, value, type });
const extracted = (title, fields) => ({ sections: [{ title, records: [{ fields }] }] });
const config = { provider: 'custom', baseURL: 'https://model.example/v1', model: 'mock' };
const response = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

test('REQ-20261009-03 版本 1 升级可重复，不修改原对象，未知版本和非法字段拒绝', () => {
  const legacy = { schemaVersion: 1, personal: { fullName: '旧档案', unknown: 'discard' }, education: [{ school: '旧学校', startDate: '2020-09' }], internships: [] };
  const original = structuredClone(legacy), upgraded = validateProfile(legacy);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.personal.fullName, '旧档案');
  assert.equal(upgraded.education[0].school, '旧学校');
  assert.equal(upgraded.personal.unknown, undefined);
  assert.deepEqual(validateProfile(upgraded), upgraded);
  assert.deepEqual(legacy, original);
  assert.throws(() => validateProfile({ ...upgraded, schemaVersion: 3 }));
  assert.throws(() => validateProfile({ ...upgraded, sections: [{ id: '__proto__', title: '恶意', records: [] }] }));
  assert.throws(() => validateProfile({ ...upgraded, personal: { ...upgraded.personal, removedFields: ['bad'] } }));
});

test('REQ-20261009-03 添加小标题、内容、重复经历及 x 删除标准 / 自定义字段', () => {
  const original = sampleProfile();
  let profile = addProfileField(original, 'internships', 0, '是否有实习证明', '是');
  const id = profile.internships[0].extraFields[0].id;
  profile = addProfileRecord(profile, 'internships');
  profile = addProfileField(profile, 'internships', 1, '是否有实习证明', '否');
  assert.equal(profile.internships[1].extraFields[0].id, id);
  const path = `internships[].extra.${id}`;
  assert.equal(readValue(profile, path, 0), '是');
  assert.equal(readValue(profile, path, 1), '否');
  assert.throws(() => addProfileField(profile, 'internships', 0, ' 是否有实习证明 ', '重复'), /重复/);
  profile = removeProfileField(profile, 'internships', 0, id);
  assert.equal(readValue(profile, path, 0), '');
  assert.equal(readValue(profile, path, 1), '否');
  profile = removeProfileField(profile, 'personal', 0, 'fullName');
  assert.equal(profile.personal.fullName, '');
  assert.equal(profileSchema(profile).some(s => s.path === 'personal.fullName'), false);
  assert.deepEqual(validateProfile(profile), profile);
  assert.equal(original.personal.fullName, '林知夏');
  assert.throws(() => removeProfileField(profile, 'personal', 0, 'fullName'), /不存在/);
});

test('REQ-20261009-03 自定义板块、多记录与重复字段的上下文映射及删除', () => {
  let profile = addProfileSection(sampleProfile(), '家庭信息');
  const section = profile.sections[0].id;
  profile = addProfileField(profile, section, 0, '成员关系', '父亲');
  profile = addProfileRecord(profile, section);
  profile = addProfileField(profile, section, 1, '成员关系', '母亲');
  const path = fieldsForRecord(profile, section, 0)[0].path;
  const rows = matchFields([webField('成员关系', '家庭信息'), webField('成员关系', '家庭信息', 'w2', 'g2')], profile);
  assert.equal(rows[0].path, path);
  assert.equal(rows[1].index, 1);
  assert.equal(readValue(profile, rows[1].path, rows[1].index), '母亲');
  assert.equal(compatible(webField('关系', '家庭信息', 'w1', 'g1', 'date'), path, profile), false);
  assert.equal(readValue(profile, 'sections.__proto__[].x'), '');
  assert.equal(readValue(profile, path, -1), '');
  assert.throws(() => addProfileSection(profile, '家庭信息'), /重复/);
  assert.throws(() => addProfileSection(profile, '基本信息'), /重复/);
  profile = removeProfileRecord(profile, section, 1);
  assert.equal(profileSection(profile, section).records.length, 1);
  profile = removeProfileSection(profile, section);
  assert.equal(compatible(rows[0], path, profile), false);
  assert.throws(() => removeProfileSection(profile, 'personal'), /标准板块/);
});

test('REQ-20261009-03 标题、类型、ID、日期与容量边界拒绝', () => {
  const base = sampleProfile();
  for (const label of ['', '   ', '*', 'x'.repeat(81)]) assert.throws(() => addProfileField(base, 'personal', 0, label, 'value'));
  assert.throws(() => addProfileField(base, 'personal', 0, '生日', '2020-99', 'date'), /日期/);
  assert.throws(() => addProfileField(base, 'personal', 0, '字段', 'x'.repeat(5001)), /5000/);
  assert.throws(() => addProfileField(base, 'personal', 0, '字段', 'x', 'file'), /类型/);
  const withField = addProfileField(base, 'internships', 0, '证明', '是');
  const invalidID = structuredClone(withField); invalidID.internships[0].extraFields[0].id = 'constructor';
  assert.throws(() => validateProfile(invalidID), /ID/);
  const duplicate = structuredClone(withField); duplicate.internships[0].extraFields.push(duplicate.internships[0].extraFields[0]);
  assert.throws(() => validateProfile(duplicate), /ID/);
  const fields = Array.from({ length: 51 }, (_, i) => ({ id: `f_${i}`, label: `字段${i}`, value: '', type: 'text' }));
  assert.throws(() => validateProfile({ ...base, personal: { ...base.personal, extraFields: fields } }), /50/);
  const records = Array.from({ length: 20 }, () => ({ fields: fields.slice(0, 30) }));
  assert.throws(() => validateProfile({ ...base, sections: [{ id: 's_capacity', title: '容量', records }] }), /500/);
  const large = Array.from({ length: 10 }, () => ({ fields: fields.slice(0, 40).map(f => ({ ...f, value: '汉'.repeat(1000) })) }));
  assert.throws(() => validateProfile({ ...base, sections: [{ id: 's_large', title: '大档案', records: large }] }), /1 MB/);
  assert.throws(() => validateProfile({ ...base, sections: Array(21).fill({}) }), /20/);
});

test('REQ-20261009-03 模型归类、重复载入去重、已有值与删除状态保留、原对象不变', () => {
  let profile = removeProfileField(sampleProfile(), 'personal', 0, 'city');
  const original = structuredClone(profile);
  const result = mergeExtraction(profile, { sections: [
    { title: '个人信息', records: [{ fields: [info('姓名', '新姓名'), info('现居城市', '上海'), info('英语等级', '六级')] }] },
    { title: '实习经历', records: [{ fields: [info('公司', '示例科技有限公司'), info('是否有实习证明', '是')] }] },
    { title: '家庭信息', records: [{ fields: [info('成员关系', '父亲'), info('职业', '教师')] }, { fields: [info('成员关系', '母亲'), info('职业', '医生')] }] },
  ] });
  assert.equal(result.conflicts, 2);
  assert.equal(result.profile.personal.fullName, '林知夏');
  assert.equal(result.profile.personal.city, '');
  assert.equal(result.profile.internships.length, 1);
  assert.equal(result.profile.internships[0].extraFields[0].value, '是');
  assert.equal(result.profile.sections[0].records.length, 2);
  assert.deepEqual(profile, original);
  const repeated = mergeExtraction(result.profile, extracted('家庭信息', [info('成员关系', '父亲'), info('职业', '教师')]));
  assert.equal(repeated.added, 0);
  assert.equal(repeated.profile.sections[0].records.length, 2);
  const separated = mergeExtraction(result.profile, extracted('实习经历', [info('公司', '另一家公司'), info('职位', '开发')]));
  assert.equal(separated.profile.internships.length, 2);
  assert.equal(separated.profile.internships[0].company, '示例科技有限公司');
  const differentPeriod = mergeExtraction(result.profile, extracted('实习经历', [info('公司', '示例科技有限公司'), info('开始时间', '2026-01', 'date')]));
  assert.equal(differentPeriod.profile.internships.length, 2);
  const ambiguous = mergeExtraction(result.profile, extracted('实习经历', [info('实习岗位', '前端开发实习生')]));
  assert.equal(ambiguous.profile.internships.length, 2);
});

test('REQ-20261009-03 模型提取仅发送主动粘贴文本与标题，不发送现有值、网页、密钥', async () => {
  const pasted = '姓名：新用户\n- 学校：测试大学\n{"实习证明":"是"}';
  const output = extracted('基本信息', [info('姓名', '新用户')]);
  const result = await extractProfile(pasted, config, 'fake-key', sampleProfile(), async (url, options) => {
    assert.equal(url, 'https://model.example/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fake-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body), payload = JSON.parse(body.messages[1].content);
    assert.equal(payload.text, pasted);
    assert.deepEqual(Object.keys(payload).sort(), ['outline', 'text']);
    for (const value of ['林知夏', '浙江大学', '示例科技有限公司', 'fake-key']) assert.equal(options.body.includes(value), false);
    assert.match(body.messages[0].content, /不能执行/);
    return response(JSON.stringify(output));
  });
  assert.deepEqual(result, output);
});

test('REQ-20261009-03 空文本与超长输入不请求；HTTP、非法 JSON、空/重复/注入结构整体拒绝', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response('{}'); };
  for (const text of ['', '  ', 'x'.repeat(20001)]) await assert.rejects(extractProfile(text, config, '', sampleProfile(), fetcher));
  assert.equal(calls, 0);
  await assert.rejects(extractProfile('text', config, '', sampleProfile(), async () => ({ ok: false, status: 401 })), /401/);
  await assert.rejects(extractProfile('text', config, '', sampleProfile(), async () => response('bad-json')), /JSON/);
  const invalid = [null, {}, { sections: [] }, extracted('', [info('x', 'y')]), extracted('家庭信息', []), extracted('家庭信息', [info('x', 'y'), info('x', 'z')]), extracted('家庭信息', [info('x', 1)]), extracted('家庭信息', [info('x', 'y', 'script')]), extracted('家庭信息', [info('日期', '', 'date')])];
  for (const value of invalid) assert.throws(() => validateExtraction(value));
  const clean = validateExtraction({ ...extracted('家庭信息', [info('<img src=x onerror=alert(1)>', '内容')]), html: '<script>', path: '__proto__.x' });
  assert.equal(clean.path, undefined);
  assert.equal(clean.sections[0].records[0].fields[0].label, '<img src=x onerror=alert(1)>');
});

test('REQ-20261010-01 完整日期与年月规范化，真实日历校验及不推断月份', () => {
  for (const [source, month] of [
    ['2025-07', '2025-07'], [' 2025-7-28 ', '2025-07'], ['2025.6', '2025-06'],
    ['2025/06/30', '2025-06'], ['2025年6月', '2025-06'], ['2024年2月29日', '2024-02'],
    ['2000-2-29', '2000-02'], ['2025年6月3号', '2025-06'],
  ]) {
    assert.equal(extractionMonth(source), month);
    const result = validateExtraction(extracted('测试板块', [info('日期', source, 'date')]));
    assert.deepEqual(result.sections[0].records[0].fields, [info('日期', month, 'date')]);
    assert.deepEqual(validateExtraction(result), result);
  }
  for (const source of ['2020-99', '2025-00', '2025-13-01', '2025-02-29', '1900-02-29', '2025/04/31', '2025-07-00', '0000-01', '2025', '至今', '2025.06-2025.07', '06/07/2025', '2025-07-28T12:00:00Z', '2025-07/28', '2025-07-28 多余文字']) {
    assert.equal(extractionMonth(source), '');
    const result = validateExtraction(extracted('测试板块', [info('日期', source, 'date')]));
    assert.deepEqual(result.sections[0].records[0].fields, [info('日期', source, 'text')]);
  }
});

test('REQ-20261010-01 混合日期载入、标准别名、重复去重与原数据不变', () => {
  const original = emptyProfile();
  const output = { sections: [
    { title: '个人信息', records: [{ fields: [info('姓名', '虚构用户'), info('爱好', '阅读')] }] },
    { title: '教育经历', records: [{ fields: [info('学校', '测试大学'), info('主修专业', '计算机'), info('开始日期', '2023年9月', 'text')] }] },
    { title: '实习工作经历', records: [{ fields: [info('工作单位', '测试公司'), info('担任职务', '开发实习生'), info('主要工作职责', '测试内容'), info('开始时间', '2025-7-28', 'date'), info('结束日期', '至今', 'date')] }] },
    { title: '项目经历', records: [{ fields: [info('项目名称', '虚构项目'), info('项目时间', '2025.06-2025.07', 'date')] }] },
  ] };
  const snapshot = structuredClone(output);
  const merged = mergeExtraction(original, output);
  assert.equal(merged.profile.personal.fullName, '虚构用户');
  assert.equal(merged.profile.education[0].startDate, '2023-09');
  assert.equal(merged.profile.education[0].major, '计算机');
  assert.equal(merged.profile.internships[0].company, '测试公司');
  assert.equal(merged.profile.internships[0].position, '开发实习生');
  assert.equal(merged.profile.internships[0].description, '测试内容');
  assert.equal(merged.profile.internships[0].startDate, '2025-07');
  assert.equal(merged.profile.internships[0].endDate, '');
  assert.equal(merged.profile.internships[0].extraFields.find(f => f.label === '结束时间（原文）').value, '至今');
  assert.equal(merged.profile.sections[0].records[0].fields.find(f => f.label === '项目时间').value, '2025.06-2025.07');
  assert.deepEqual(validateProfile(merged.profile), merged.profile);
  const repeated = mergeExtraction(merged.profile, output);
  assert.equal(repeated.added, 0);
  assert.deepEqual(repeated.profile, merged.profile);
  assert.deepEqual(original, emptyProfile());
  assert.deepEqual(output, snapshot);
});

test('REQ-20261010-01 日期原文不污染标准或自定义 month 字段，不恢复已删除日期', () => {
  let base = addProfileField(sampleProfile(), 'internships', 0, '转正日期', '2025-10', 'date');
  base = removeProfileField(base, 'internships', 0, 'endDate');
  const output = extracted('实习经历', [info('公司', '示例科技有限公司'), info('开始时间', '2025-02-30', 'date'), info('结束日期', '至今', 'date'), info('转正日期', '待定', 'date')]);
  const merged = mergeExtraction(base, output);
  assert.equal(merged.profile.internships.length, 1);
  assert.equal(merged.profile.internships[0].startDate, '2025-07');
  assert.equal(merged.profile.internships[0].endDate, '');
  const fields = fieldsForRecord(merged.profile, 'internships', 0);
  assert.equal(fields.find(f => f.label === '开始时间（原文）').value, '2025-02-30');
  assert.equal(fields.find(f => f.label === '转正日期').value, '2025-10');
  assert.equal(fields.find(f => f.label === '转正日期（原文）').value, '待定');
  assert.equal(fields.some(f => f.label.startsWith('结束')), false);
  assert.equal(merged.conflicts, 1);
  assert.equal(mergeExtraction(merged.profile, output).added, 0);
  assert.deepEqual(validateProfile(merged.profile), merged.profile);
});

test('REQ-20261010-01 日期兼容不放宽结构、容量与重复字段拒绝', async () => {
  for (const fields of [[info('日期', 123, 'date')], [info('日期', 'x'.repeat(5001), 'date')], [info('日期', '2025-7-28', 'date'), info('日期', '2025-7-29', 'date')]]) {
    assert.throws(() => validateExtraction(extracted('项目经历', fields)));
  }
  const output = extracted('实习经历', [info('开始时间', '2025-7-28', 'date')]);
  let calls = 0;
  const result = await extractProfile('虚构实习\n开始时间：2025-7-28', config, '', emptyProfile(), async (_, options) => {
    calls++;
    assert.match(JSON.parse(options.body).messages[0].content, /不得从身份证、学号推断日期/);
    return response(JSON.stringify(output));
  });
  assert.equal(calls, 1);
  assert.equal(result.sections[0].records[0].fields[0].value, '2025-07');
});

test('REQ-20261009-03 动态 schema 参与模型协议，拒绝不存在 / 已删除 / 类型不兼容路径', async () => {
  let profile = addProfileField(sampleProfile(), 'internships', 0, '实习证明', '是');
  const path = fieldsForRecord(profile, 'internships', 0).at(-1).path;
  const field = webField('证明材料是否提供', '实习经历');
  const payload = modelPayload([field], profile);
  assert.ok(payload.profileSchema.some(s => s.path === path));
  assert.equal(JSON.stringify(payload).includes('林知夏'), false);
  assert.equal(JSON.stringify(payload).includes('"是"'), false);
  const result = await inferMappings([field], config, '', async () => response(JSON.stringify({ mappings: [{ fieldId: field.id, profilePath: path }] })), profile);
  assert.equal(result[0].profilePath, path);
  assert.throws(() => validateMappings({ mappings: [{ fieldId: field.id, profilePath: 'sections.s_unknown[].f_x' }] }, [field], profile));
  const id = profile.internships[0].extraFields[0].id;
  profile = removeProfileField(profile, 'internships', 0, id);
  assert.throws(() => validateMappings({ mappings: [{ fieldId: field.id, profilePath: path }] }, [field], profile));
});

test('REQ-20261009-03 动态记忆删除/改名失效，固定字段回归兼容', () => {
  let profile = addProfileField(sampleProfile(), 'internships', 0, '实习证明', '是');
  const field = webField('证明材料', '实习经历'), id = profile.internships[0].extraFields[0].id;
  const path = fieldsForRecord(profile, 'internships', 0).at(-1).path;
  const confirmed = { ...field, path, selected: true, result: 'success', source: '模型建议' };
  const memory = learnMappings(emptyMemory(), [confirmed], 'https://jobs.example', profile);
  assert.equal(memory.entries.length, 1);
  assert.equal(applyMemory(matchFields([field], profile), memory, 'https://jobs.example', profile)[0].path, path);
  const renamed = structuredClone(profile); renamed.internships[0].extraFields[0].label = '其他事项';
  assert.equal(validateMemory(memory, renamed).entries.length, 0);
  const deleted = removeProfileField(profile, 'internships', 0, id);
  assert.equal(validateMemory(memory, deleted).entries.length, 0);
  assert.equal(applyMemory(matchFields([field], deleted), memory, 'https://jobs.example', deleted)[0].path, '');
  const standard = { ...webField('你的称呼', '基本信息'), path: 'personal.fullName', selected: true, result: 'success', source: '手动选择' };
  const legacyMemory = learnMappings(emptyMemory(), [standard], 'https://jobs.example');
  assert.equal(validateMemory(legacyMemory, sampleProfile()).entries.length, 1);
  let custom = addProfileSection(profile, '家庭联系方式');
  const sectionId = custom.sections[0].id;
  custom = addProfileField(custom, sectionId, 0, '成员手机', '13900000000');
  const dynamicPath = fieldsForRecord(custom, sectionId, 0)[0].path;
  const familyField = webField('联系电话', '家庭联系方式');
  const isolatedMemory = learnMappings(emptyMemory(), [{ ...familyField, path: dynamicPath, selected: true, result: 'success', source: '手动选择' }], 'https://jobs.example', custom);
  const basicField = webField('联系电话', '基本信息');
  assert.equal(applyMemory(matchFields([basicField], custom), isolatedMemory, 'https://jobs.example', custom)[0].path, 'personal.phone');
  assert.equal(applyMemory(matchFields([familyField], custom), isolatedMemory, 'https://jobs.example', custom)[0].path, dynamicPath);
});
