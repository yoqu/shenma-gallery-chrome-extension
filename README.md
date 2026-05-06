# 神马图鉴收集助手 Chrome Extension

一个公开可用的 Chrome Manifest V3 扩展，用侧边栏从网页中收集 AI 图片、提示词、模型和标签，并批量提交到 [趣神马](https://www.qushenma.com/)。

![侧边栏开始页](docs/screenshots/01-sidepanel-start.png)

## 功能

- 右侧常驻 Side Panel，不打断当前网页浏览。
- 页面区域选择器：移动高亮、滚轮切换层级、点击确认。
- AI 整理：把选中区域里的图片、提示词、模型、标签整理为作品列表。
- 人工校对：勾选、编辑字段、候选图片拖拽替换。
- 一键提交：自动上传图片并创建/发布趣神马作品。
- 多服务商预设：OpenAI、豆包、通义千问、Kimi、智谱、硅基流动，以及自定义 OpenAI 兼容接口。

## 安装

1. 下载或克隆本仓库。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择本仓库根目录。
6. 点击浏览器工具栏里的扩展图标，打开右侧边栏。

## 配置

### 趣神马网站

- 默认域名：`www.qushenma.com`
- 授权方式：登录趣神马后，在扩展里点击「获取授权」。
- 私有部署：把域名改成自己的趣神马部署域名。

### AI 大模型

扩展调用 OpenAI Chat Completions 兼容接口。推荐选择一个支持图片理解的模型，否则图片和提示词配对效果会变差。

需要填写：

- `API Base URL`
- `API Key`
- `模型名称`

![设置页](docs/screenshots/02-settings.png)

## 使用流程

1. 打开任意 AI 图片或提示词页面。
2. 点击侧边栏里的「选择页面区域」。
3. 鼠标在网页上移动，选择包含图片和提示词的区域。
4. 点击确认后，等待 AI 整理结果。
5. 勾选要提交的作品，必要时编辑标题、提示词、模型、标签和摘要。
6. 点击「提交到趣神马」，查看提交日志。

![选择网页区域](docs/screenshots/03-select-area.png)

![整理结果](docs/screenshots/04-results.png)

![提交日志](docs/screenshots/05-submit-log.png)

更详细的步骤见 [docs/workflow.md](docs/workflow.md)。

## 权限说明

扩展使用以下 Chrome 权限：

- `activeTab` / `tabs` / `scripting`：在当前网页注入区域选择器。
- `storage`：保存站点域名、Token 和 AI 配置。
- `sidePanel`：提供右侧常驻操作界面。
- `declarativeNetRequest`：移除扩展请求中的 `Origin` 头，避免后端 CORS 拦截。
- `<all_urls>`：允许在不同网站上选择内容和读取候选图片 URL。

## 本地开发

```bash
npm install
npm test
npm run screenshots
```

扩展没有构建步骤。修改源码后，在 `chrome://extensions/` 中点击扩展卡片的刷新按钮即可。

## 目录结构

```text
.
├── manifest.json
├── background.js
├── picker.js
├── providers.js
├── sidepanel.html
├── sidepanel.css
├── sidepanel.js
├── icons/
├── tests/
├── docs/
└── scripts/
```

## 测试

```bash
npm test
```

当前测试覆盖：

- background service worker 的协议判断、AI 响应解析、提交数据结构。
- 内容提取相关启发式规则。
- `tests/test-content-extraction.html` 可作为手动页面选择器测试页。

## 开源协议

[MIT](LICENSE)
