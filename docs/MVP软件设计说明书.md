# 折桂 MVP 软件设计说明书

版本 0.1 / 需求 REQ-20261009-01 / 2026-10-09。

## 产品流程

本地档案 → 打开目标网页并点击扩展 → 识别当前页面 → 规则匹配 → 可选模型处理待确认项 → 修改档案来源或选择经历 → 勾选待填字段 → 确认填写 → 用户自行检查并提交。

演示网页使用同一套档案、规则、模型和 DOM 填写逻辑，内置虚构档案和不可提交的表单。真实扩展初次运行使用空档案。

预览展示网页标签、档案来源、待填值与结果。明确规则匹配且档案有值的字段默认选中；模型建议默认未选中。无法确定、缺少经历和空值不自动填写。已有内容默认保留，需逐字段勾选覆盖。

首版不支持跨页、iframe、自动新增经历、文件上传、验证码、自动提交或第三方自定义控件。只识别可见可编辑的原生 text/email/tel/date/month、textarea、单选组和单选 select，最多 200 个字段。已填写状态表示原生控件接受值，不保证第三方前端或服务端已接受申请。

## 实现架构

- JavaScript / Vite，双入口：index.html 演示；workspace.html 扩展侧边栏。
- Chrome / Edge MV3，最低 Chromium 116。background.js 配置点击工具栏图标打开侧边栏。
- 权限：activeTab、scripting、storage、sidePanel。无常驻全站读取权限；云端模型访问仅在用户点击模型分析时请求目标服务域名权限。
- src/adapter.js 区分演示 DOM 与 chrome.scripting / tabs 消息。
- src/dom.js 为自包含脚本，在隔离环境提取 DOM、维护扫描期间字段注册表并执行填写。扫描不修改输入值。
- src/profile.js 提供 schema、数据校验、读取和控件兼容检查。
- src/matching.js 通过别名与分组上下文匹配，序号分配重复经历，转换日期和原生选项。
- src/model.js 负责过滤结构、构建提示、请求服务并校验输出。
- src/app.js / style.css 为侧边栏和演示界面。

没有业务后端、数据库、Docker 或 Python / Java 服务。无需环境变量。开发 npm run dev，构建 npm run build，输出 dist 为可加载扩展。

## 档案结构及存储

schemaVersion: 1；personal 为对象；education、internships 为最多 20 条记录的数组。字段见 SCHEMA；值为字符串，最多 5000 字，日期为 YYYY-MM。导入只保留白名单字段，文件限制 1 MB，无效导入保留当前档案。编辑 / 导入 / 演示档案载入后，点击保存才替换存储；导出始终导出已保存档案。

扩展使用 chrome.storage.local；演示使用 localStorage，二者互不共享。无账号、云同步和加密，档案保存在当前浏览器配置中。JSON 导出文件含个人信息。

模型地址、名称本地保存；密钥仅使用 chrome.storage.session（浏览器会话结束失效），演示仅保留在页面内存。不会导出密钥。

## 字段与映射协议

扫描消息 ZHEG_SCAN，响应：fields[] / unsupported / truncated。

字段：id（扫描期间 UUID）、label、type、section、groupId、options[{label,value}]、hasValue（布尔）。不会提取输入值、HTML、页面个人档案；原生选项和字段标签仍可能包含页面信息。

规则根据教育、实习、个人等分组消除歧义。重复分组按页面顺序默认对应档案序号，用户可在分组下拉中改记录，也可逐字段修改来源。来源路径只允许 schema；索引由本地 UI 管理。

ZHEG_FILL 输入 items[{id,value,overwrite}]，响应 [{id,status,message}]。status 为 success / failed / skipped。只使用扫描注册表中的 DOM 引用；校验字段仍存在、可见、类型/标签/分组/选项未变。已有内容且没有 overwrite 时跳过；值需通过原生格式、范围、长度约束。填写触发 input/change，单选触发 click，不触发 submit。重新扫描使旧 ID 失效；切换标签页和刷新页面需重新识别。

档案精度为月。month 控件直接填写；date 控件使用当月 1 日，预览明确提示用户检查。

## 可选模型

用户指定 HTTPS API 根地址、模型名和可选 API Key，本机 localhost / 127.0.0.1 可用 HTTP。POST {baseURL}/chat/completions，Bearer 鉴权，20 秒超时；演示需要服务允许浏览器 CORS，扩展需目标域名授权。

请求只有待确认字段结构与固定档案 schema。字段标签限长、过滤长数字 / 邮箱 / URL，分组归一化，选项仅发送最多 30 条过滤后的显示文字，不发送选项 value、已有输入、个人档案、网页地址或 HTML。过滤无法识别所有个人信息：模型设置中提供完整待发送 JSON，界面说明调用前检查。该过滤和系统提示不能保证彻底防御提示注入；模型仅返回映射，不能直接执行工具或网页操作。

输出 {mappings:[{fieldId,profilePath}]}，不确定返回 null，忽略自报置信度。程序校验 ID 存在、无重复、路径在 schema、类型兼容。任一非法映射拒绝整个响应。系统提示将页面文字视作不可信数据。模型建议默认不选中，须用户核对勾选后填写。HTTP、超时、错误 JSON、权限拒绝均不影响规则和手动路径。

## 质量门及交付

make ci：静态项目/权限校验、Node 单元测试、双入口构建、Playwright 演示与扩展集成测试。make verify：浏览器完整流程。实模型只做 mock 协议验证，真实供应商与真实招聘平台兼容性由后续选定平台再验证。

扩展测试使用打包产物的临时副本，仅在该副本授权回环测试网站，替代人手点击工具栏授予 activeTab。验证真实 MV3 后台、侧边栏页面、存储、脚本注入、消息和填写；未自动验证真实浏览器工具栏点击及侧边栏容器。生产 manifest 无此测试网站常驻授权。

测试映射：档案结构与导入 A1；上下文 / 重复经历 A2；不提前填写 / 跳过 / 覆盖 A3；模型协议、白名单、拒绝、密钥存储 A4；字段变动 / 原生约束 / 不提交 A5；演示浏览器流程与打包扩展注入 A6。
