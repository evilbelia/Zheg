import { compatibleDefinition, profileSchema } from './profile.js';
import { normalize, sectionKind, mappingIndex } from './matching.js';
import { safeText } from './model.js';

const LIMIT = 500;
export const emptyMemory = () => ({ version: 1, entries: [] });
function cleanLabel(value) {
  // Do not persist labels containing stripped personal data or truncated text.
  const text = String(value ?? '').trim();
  return text && safeText(text) === text ? normalize(text) : '';
}
function identity(field, origin, profile) {
  let url;
  try { url = new URL(origin); } catch { return null; }
  const namedSection = cleanLabel(field.section), label = cleanLabel(field.label);
  if (['未分组', '未知分组'].includes(namedSection)) return null;
  const customSection = profile?.sections?.some(s => normalize(s.title) === normalize(field.section));
  const section = String(field.section).startsWith('named/') ? namedSection : customSection ? (namedSection && `named/${namedSection}`) : sectionKind(field.section) ?? (namedSection && `named/${namedSection}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || !section || !label) return null;
  const options = (field.options ?? []).map(o => cleanLabel(o.label));
  if (options.some(label => !label) || options.length > 100) return null;
  return { origin, section, label, type: field.type, options };
}
const signature = value => JSON.stringify([value.origin, value.section, value.label, value.type, value.options]);
export function validateMemory(input, profile) {
  const result = emptyMemory();
  if (input?.version !== 1 || !Array.isArray(input.entries)) return result;
  const unique = new Map(), conflicts = new Set();
  const schema = new Map(profileSchema(profile).map(s => [s.path, s]));
  for (const entry of input.entries.slice(-LIMIT)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.options)) continue;
    const id = identity({ label: entry.label, section: entry.section, type: entry.type, options: entry.options.map(label => ({ label })) }, entry.origin);
    const def = schema.get(entry.path);
    if (!id || !compatibleDefinition({ type: id.type }, def)) continue;
    const dynamic = entry.path.startsWith('sections.') || entry.path.includes('.extra.');
    if (!def || (dynamic && entry.definition !== JSON.stringify([def.label, def.type]))) continue;
    const key = signature(id);
    if (unique.has(key) && unique.get(key).path !== entry.path) conflicts.add(key);
    unique.set(key, { ...id, path: entry.path, ...(entry.definition ? { definition: entry.definition } : {}) });
  }
  result.entries = [...unique].filter(([key]) => !conflicts.has(key)).map(([, value]) => value);
  return result;
}
export function applyMemory(rows, memory, origin, profile) {
  const entries = validateMemory(memory, profile).entries;
  const schema = new Map(profileSchema(profile).map(s => [s.path, s]));
  return rows.map(row => {
    const id = identity(row, origin, profile);
    const entry = id && entries.find(e => signature(e) === signature(id));
    if (!entry || !compatibleDefinition(row, schema.get(entry.path))) return row;
    return { ...row, path: entry.path, index: mappingIndex(rows, row, entry.path, profile), source: '识别记忆', selected: false };
  });
}
export function learnMappings(memory, rows, origin, profile) {
  const entries = new Map(validateMemory(memory, profile).entries.map(e => [signature(e), e]));
  const candidates = new Map(), conflicts = new Set();
  const schema = new Map(profileSchema(profile).map(s => [s.path, s]));
  for (const row of rows) {
    const def = schema.get(row.path);
    if (!row.selected || row.result !== 'success' || !['模型建议', '手动选择'].includes(row.source) || !compatibleDefinition(row, def)) continue;
    const id = identity(row, origin, profile);
    if (!id) continue;
    const key = signature(id);
    if (candidates.has(key) && candidates.get(key).path !== row.path) conflicts.add(key);
    candidates.set(key, { ...id, path: row.path, ...(row.path.startsWith('sections.') || row.path.includes('.extra.') ? { definition: JSON.stringify([def.label, def.type]) } : {}) });
  }
  for (const [key, entry] of candidates) {
    entries.delete(key);
    if (!conflicts.has(key)) entries.set(key, entry);
  }
  return { version: 1, entries: [...entries.values()].slice(-LIMIT) };
}
