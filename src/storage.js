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
export async function getSessionKey() {
  return extension ? (await chrome.storage.session.get('modelKey')).modelKey ?? '' : '';
}
export async function setSessionKey(value) {
  if (extension) await chrome.storage.session.set({ modelKey: value });
}
