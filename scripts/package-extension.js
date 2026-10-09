import { copyFile, readFile } from 'node:fs/promises';
await copyFile('src/dom.js', 'dist/content.js');
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Invalid manifest');
console.log('扩展已生成：dist/（在 chrome://extensions 中加载已解压的扩展）');
