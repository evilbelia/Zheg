import { readFile, access } from 'node:fs/promises';
const required = ['index.html', 'workspace.html', 'src/app.js', 'src/dom.js', 'src/matching.js', 'src/model.js', 'src/model-config.js', 'src/recognition-memory.js', 'src/profile.js', 'src/profile-extraction.js', 'public/background.js', 'docs/MVP软件设计说明书.md'];
for (const file of required) await access(file);
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
if (manifest.host_permissions || manifest.permissions.includes('tabs')) throw new Error('不得加入常驻全站访问权限');
if (manifest.side_panel.default_path !== 'workspace.html') throw new Error('侧边栏入口错误');
console.log('项目文件和扩展最小权限配置校验通过');
