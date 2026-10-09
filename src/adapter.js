import { isExtension } from './storage.js';
import './dom.js';

let scannedTabId;
export async function scanPage() {
  if (!isExtension) return { ...globalThis.ZhegDOM.scan(document.querySelector('#application-form')), title: '青禾科技 · 2027 校园招聘' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url ?? '')) throw new Error('请打开普通网页后，点击浏览器工具栏中的折桂图标。');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'ZHEG_SCAN' });
    scannedTabId = tab.id;
    return { ...result, title: tab.title ?? '当前网申页面' };
  } catch { throw new Error('无法访问此页面。请在目标页面重新点击折桂图标，再识别表单。'); }
}
export async function fillPage(items) {
  if (!isExtension) return globalThis.ZhegDOM.fill(items);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== scannedTabId) throw new Error('当前页面已切换，请重新识别表单。');
  try { return await chrome.tabs.sendMessage(scannedTabId, { type: 'ZHEG_FILL', items }); }
  catch { throw new Error('页面已刷新或关闭，请重新识别表单。'); }
}
