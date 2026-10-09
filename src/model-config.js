import { endpointURL } from './model.js';

export const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
export function normalizeConfig(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const legacyCustom = value.baseURL && value.baseURL !== DEEPSEEK_URL;
  const provider = value.provider === 'custom' || (!value.provider && legacyCustom) ? 'custom' : 'deepseek';
  return {
    provider,
    baseURL: provider === 'deepseek' ? DEEPSEEK_URL : String(value.baseURL ?? '').trim(),
    model: provider === 'deepseek' ? (DEEPSEEK_MODELS.includes(value.model) ? value.model : 'deepseek-chat') : String(value.model ?? '').trim(),
    autoInfer: value.autoInfer !== false,
  };
}
export function validateConfig(input) {
  const config = normalizeConfig(input);
  endpointURL(config.baseURL);
  if (!config.model || config.model.length > 200) throw new Error('请输入有效的模型名称（最多 200 字）。');
  return config;
}
export function configurationReady(config, apiKey) {
  return Boolean(config.baseURL && config.model && (config.provider !== 'deepseek' || apiKey?.trim()));
}
export function permissionOrigin(config) {
  const url = new URL(endpointURL(config.baseURL));
  return `${url.protocol}//${url.hostname}/*`;
}
