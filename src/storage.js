const extension = Boolean(globalThis.chrome?.runtime?.id);
export const isExtension = extension;
export async function getStored(key, fallback) {
  if (extension) return (await chrome.storage.local.get(key))[key] ?? fallback;
  try { return JSON.parse(localStorage.getItem(`zheg:${key}`)) ?? fallback; } catch { return fallback; }
}
export async function setStored(key, value) {
  if (extension) await chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(`zheg:${key}`, JSON.stringify(value));
}
const credentialKey = 'modelCredential';
const credential = (config, key) => ({ version: 1, baseURL: config.baseURL, key });
async function protectCredentials() {
  if (extension) await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
export async function getSavedKey(config) {
  try {
    await protectCredentials();
    // Read directly: missing storage may migrate, but malformed or empty storage must not.
    const raw = extension ? (await chrome.storage.local.get(credentialKey))[credentialKey]
      : localStorage.getItem(`zheg:${credentialKey}`);
    const present = extension ? raw !== undefined : raw !== null;
    const saved = extension ? raw : present ? JSON.parse(raw) : undefined;
    if (present) {
      if (!saved || saved.version !== 1 || typeof saved.baseURL !== 'string' || typeof saved.key !== 'string') throw new Error();
      return saved.baseURL === config.baseURL ? saved.key : '';
    }
    if (!extension) return '';
    const oldKey = (await chrome.storage.session.get('modelKey')).modelKey;
    if (typeof oldKey !== 'string' || !oldKey) return '';
    await chrome.storage.local.set({ [credentialKey]: credential(config, oldKey) });
    await chrome.storage.session.remove('modelKey');
    return oldKey;
  } catch {
    throw new Error('API Key 读取或迁移失败，请在智能识别中重新保存模型设置。');
  }
}
export async function saveModelSettings(config, key) {
  try {
    await protectCredentials();
    if (extension) {
      await chrome.storage.session.remove('modelKey');
      await chrome.storage.local.set({ modelConfig: config, [credentialKey]: credential(config, key) });
    } else {
      const previousConfig = localStorage.getItem('zheg:modelConfig');
      localStorage.setItem('zheg:modelConfig', JSON.stringify(config));
      try { localStorage.setItem(`zheg:${credentialKey}`, JSON.stringify(credential(config, key))); }
      catch (error) {
        if (previousConfig === null) localStorage.removeItem('zheg:modelConfig');
        else localStorage.setItem('zheg:modelConfig', previousConfig);
        throw error;
      }
    }
  } catch {
    throw new Error('模型设置或 API Key 保存失败，请检查本机存储后重试。');
  }
}
export async function clearSavedKey(config) {
  try {
    await protectCredentials();
    if (extension) await chrome.storage.session.remove('modelKey');
    // Keep an empty marker so an old session key cannot be migrated back after clearing.
    await setStored(credentialKey, credential(config, ''));
  } catch {
    throw new Error('API Key 清除失败，请检查本机存储后重试。');
  }
}
