# LumiSlate UX 元素命名表

> 本文档定义了 LumiSlate 插件中所有可见交互元素的统一命名，方便后续讨论时精确指代。
> 命名格式：`类别 / 元素名`（代码中的对应标识）

---

## 一、主视图（LumiSlateView）

主视图是 Obsidian 右侧边栏中的自定义视图，整体分为四层结构：

```
┌─────────────────────────────────────┐
│  Toolbar（顶部工具栏）               │
├─────────────────────────────────────┤
│  Metrics Bar（指标栏，渲染时显示）    │
├─────────────────────────────────────┤
│  Main Area（iframe 画布主体）         │
├─────────────────────────────────────┤
│  Status Bar（底部状态栏）             │
└─────────────────────────────────────┘
```

### 1.1 顶部工具栏（Toolbar）

工具栏分左右两组：

**左侧固定组（`leftGroup` / `lumislate-context-group`）** —— 始终可见：

| 元素名 | 显示文本/图标 | 代码变量 | 说明 |
|--------|--------------|----------|------|
| **模式切换标签** | 自定义模式 / AI模式 | `modeGroup` / `lumislate-mode-tabs` | 两个互斥的 tab 按钮，切换全局模式 |
| **主页按钮** | 🏠 home 图标 | `homeBtn` | 返回欢迎页，激活时高亮 |
| **设置按钮** | ⚙️ settings 图标 | `settingsBtn` | 打开 Obsidian 插件设置面板 |

**右侧动态组（`toolbarActionsEl` / `lumislate-toolbar-actions`）** —— 主页隐藏，非主页显示，随模式重建：

**自定义模式（Marp）下的操作按钮：**

| 元素名 | 显示文本/图标 | 代码变量 | 说明 |
|--------|--------------|----------|------|
| **文本预处理按钮** | 📝 文本预处理 | `marpPreprocessBtn` | 点击弹出下拉菜单（长文模式 / 幻灯片模式） |
| **尺寸选择下拉框** | 16:9 / 4:3 / 1:1 | `marpSizeSelect` | 控制幻灯片比例，无分页符时禁用 |
| **CSS 按钮** | 🎨 CSS | `marpCssBtn` | 打开 CSS 编辑弹窗 |
| **CSS 预设名显示** | （纯文本） | `marpCssNameEl` | 显示当前应用的 CSS 文件名，无则不显示 |
| **导出按钮** | ⬇️ 导出 | `exportBtn` | 打开导出菜单弹窗 |

**AI 模式（Design）下的操作按钮：**

| 元素名 | 显示文本/图标 | 代码变量 | 说明 |
|--------|--------------|----------|------|
| **样式选择按钮** | （当前 Skill 名） | `skillSelectBtn` | 点击打开 Skill Gallery 模态框 |
| **AI 渲染按钮** | ✨ AI 渲染 | `aiRenderBtn` | 发起 AI 渲染请求 |
| **取消按钮** | ⏹ 取消 | `cancelBtn` | 渲染中显示，与 AI 渲染按钮互斥 |
| **导出按钮** | ⬇️ 导出 | `exportBtn` | 同 Marp 模式 |
| **清除缓存按钮** | 🗑 清除缓存 | `clearCacheBtn` | 清除当前笔记缓存并重置到启动界面 |

### 1.2 指标栏（Metrics Bar）

渲染/预处理过程中显示，位于工具栏下方：`metricsEl` / `lumislate-metrics-bar`

| 元素名 | 说明 |
|--------|------|
| **状态指示** | `status-running`（绿点脉冲 + "渲染中"）/ `status-done`（"完成"）|
| **耗时指标** | "耗时 12.3s"（实时更新） |
| **大小指标** | "大小 45.2 KB" |
| **块数指标** | "块数 128"（delta 计数） |
| **模型指标** | "模型 kimi-latest" |
| **Token 指标** | "Token in 2345 / out 1234" |

### 1.3 画布主体（Main Area）

`mainArea` / `lumislate-main` —— 内部是一个 iframe：

| 元素名 | 代码变量 | 说明 |
|--------|----------|------|
| **画布 iframe** | `iframe` / `lumislate-canvas-iframe` | 沙盒 iframe，`sandbox="allow-scripts allow-same-origin"` |

### 1.4 底部状态栏（Status Bar）

`statusBarEl` / `lumislate-status-bar`

| 元素名 | 代码变量 | 说明 |
|--------|----------|------|
| **当前文件显示** | `statusFileEl` | "当前文件：xxx" / "当前文件：未打开" |
| **Agent 状态显示** | `statusAgentEl` | "Agent：kimi-latest" / "Agent：未配置"（错误时红色） |

---

## 二、欢迎页（Welcome Page）

iframe 内的初始页面，用户未选择模式时显示。代码：`getWelcomeHTML()`

| 元素名 | 说明 |
|--------|------|
| **Logo 区域** | "LumiSlate" + "流光石板" 副标题 |
| **自定义模式卡片** | 调色盘图标 + "自定义模式" |
| **AI 模式卡片** | 星星图标 + "AI模式" |
| **副标题提示** | "选择 Markdown 笔记，开始编译高定画布" |

点击卡片通过 `postMessage({ type: 'lumislate-select-mode' })` 通知父窗口切换模式。

---

## 三、AI 模式启动界面（Design Launcher）

AI 模式下无缓存时 iframe 内显示。代码：`getDesignLauncherHTML()`

| 元素名 | 说明 |
|--------|------|
| **标题** | "选择设计样式" |
| **副标题** | "点击卡片选择模板，AI 将立即开始渲染" |
| **Skill 卡片网格** | 每个卡片包含：图标、名称、描述、分类标签（文章/原型） |

点击卡片通过 `postMessage({ type: 'lumislate-skill-select' })` 通知父窗口并自动开始 AI 渲染。

---

## 四、模态框（Modals）

### 4.1 导出菜单弹窗（ExportMenuModal）

通过顶部工具栏「导出按钮」打开。

| 元素名 | 说明 |
|--------|------|
| **下载 HTML 项** | file-code 图标 + "下载 HTML" + "下载为单文件 HTML" |
| **下载 PNG 项** | image 图标 + "下载 PNG" + "导出为高清图片" |
| **保存到 Vault 项** | save 图标 + "保存到 Vault" + "保存 HTML 到 Obsidian 仓库" |

### 4.2 Skill Gallery 模态框（SkillGalleryModal）

通过 AI 模式下「样式选择按钮」打开。

| 元素名 | 说明 |
|--------|------|
| **弹窗标题** | "选择设计样式" |
| **说明文字** | "选择一种设计模板，AI 将根据你的 Markdown 内容生成对应风格的 HTML 页面。" |
| **Skill 卡片网格** | 卡片包含：图标、名称、描述、分类标签；当前选中卡片有 `active` 高亮边框 |

### 4.3 CSS 编辑弹窗（showMarpCssModal）

通过自定义模式下「CSS 按钮」打开。三栏布局：

```
┌─────────┬─────────────────┬──────────┐
│  左侧    │     中间         │   右侧    │
│ 文件列表 │   代码编辑器      │  AI 助手  │
└─────────┴─────────────────┴──────────┘
```

**左侧面板（`lumislate-css-left`）：**

| 元素名 | 说明 |
|--------|------|
| **标题** | "选择预设" |
| **新建按钮** | file-plus 图标 + "新建" |
| **新建输入区** | 文件名输入框 + 创建按钮 + 取消按钮（默认隐藏） |
| **文件列表** | 显示 `pluginDir/css/` 下的 `.css` 文件，单击选中，双击/右键重命名，右键删除 |
| **空列表提示** | "暂无 CSS 预设" |

**中间面板（`lumislate-css-center`）：**

| 元素名 | 说明 |
|--------|------|
| **路径标签** | 显示当前 CSS 目录路径 |
| **代码编辑区** | `textarea`（`lumislate-css-textarea`） |
| **删除按钮** | 🗑 "删除" |
| **保存按钮** | 💾 "保存" |
| **应用到笔记按钮** | ✅ "应用到笔记"（写入 frontmatter `lumislate_css` 字段并自动重新渲染） |

**右侧面板（`lumislate-css-right` / AI 助手）：**

| 元素名 | 说明 |
|--------|------|
| **AI 头部** | "AI 助手" + 状态文字（"思考中…" 脉冲动画） |
| **聊天区域** | AI / 用户消息交替显示，AI 消息带 "应用此 CSS" 按钮 |
| **输入框** | textarea，placeholder "描述你想要的样式…" |
| **发送按钮** | send 图标 |

---

## 五、设置面板（LumiSlateSettingTab）

Obsidian 标准设置面板，分 4 个 Tab：

### 5.1 Tab 导航

| Tab 名 | 图标 | 内容 |
|--------|------|------|
| **常规** | settings | 默认模式、默认 Skill、语言、默认导出目录 |
| **外观** | palette | 主题（浅色/深色/跟随系统/自定义）、自定义主色 |
| **AI 接入** | bot | 接入方式、本地 Agent 卡片、HTTP API 配置、CSS 系统提示词 |
| **高级** | sliders-horizontal | 预处理配置、Marp CSS 预设管理 |

### 5.2 关键设置项

| 设置项 | 控件类型 | 说明 |
|--------|----------|------|
| **默认模式** | 下拉框 | Marp / Design |
| **默认 SKILL** | 下拉框 | 仅 Design 模式默认下显示 |
| **界面语言** | 下拉框 | 简体中文 / English |
| **主题** | 下拉框 | 浅色 / 深色 / 跟随系统 / 自定义 |
| **自定义主色** | 颜色选择器 | 仅自定义主题下显示 |
| **首选接入方式** | 下拉框 | 本地 CLI Agent（优先）/ HTTP API |
| **禁用 AI 额外输出** | 开关 | 禁止 insight、thinking、analysis 等标记 |
| **本地 Agent 卡片网格** | 卡片列表 | 显示检测到的 Agent：claude、codex、gemini、cursor-agent、deepseek、aider、opencode、qwen、qoder |
| **自定义二进制路径** | 文本输入 | 本地 Agent 不在 PATH 时指定 |
| **重新检测按钮** | 按钮 | 重新扫描本地 CLI 工具 |
| **API Base URL** | 文本输入 | 默认 Kimi 接口 |
| **API Key** | 密码输入 | |
| **模型** | 文本输入 | 默认 kimi-latest |
| **CSS 系统提示词** | 按钮 | 打开 `css-system-prompt.json` 编辑 |
| **Marp CSS 预设** | 列表 + 按钮 | 预设名称输入 + 编辑 CSS 按钮 + 删除按钮 + 添加新预设按钮 |

---

## 六、Obsidian 全局入口

### 6.1 Ribbon 图标

| 元素名 | 图标 | 说明 |
|--------|------|------|
| **LumiSlate 入口** | sparkles | 点击打开/激活 LumiSlate 右侧视图 |

### 6.2 命令面板命令

| 命令名 | 命令 ID | 说明 |
|--------|---------|------|
| **打开 LumiSlate 画布** | `open-lumislate-canvas` | 同 Ribbon 图标 |
| **LumiSlate：AI 渲染当前笔记** | `ai-render-current-note` | 直接发起 AI 渲染 |
| **LumiSlate：清除当前笔记缓存** | `clear-lumislate-cache` | 清除当前笔记缓存 |

---

## 七、iframe 内部交互（渲染后的画布）

AI 渲染或降级渲染完成后，iframe 内的 HTML 页面支持以下交互：

### 7.1 双向文本编辑（Reverse Mapping）

脚本：`getReverseMappingScript()`

| 交互行为 | 说明 |
|----------|------|
| **Hover 高亮** | 鼠标悬停在可编辑文本（P、H1-H6、LI、SPAN、STRONG、EM、TD、TH、A、BLOCKQUOTE）上时，添加 `lumislate-hover` 类（淡蓝背景） |
| **点击编辑** | 点击文本进入编辑状态，转换为 `contenteditable` span（`lumislate-editing` 类，虚线蓝框） |
| **Enter 确认** | 发送 `lumislate-text-change` postMessage，同步修改 Markdown 源码 |
| **Escape 取消** | 恢复原文本 |

### 7.2 图片交互（Image Interaction）

脚本：`getImageInteractionScript()`

| 交互行为 | 说明 |
|----------|------|
| **Hover 效果** | `lumislate-img-hover`（蓝色虚线框） |
| **点击激活** | `lumislate-img-active`（蓝色实线框）+ 显示 8 个方向调整手柄（`lumislate-handle`） |
| **拖拽移动** | 鼠标拖拽可移动图片位置（`translate` transform），带边界约束 |
| **拖拽调整大小** | 8 个手柄支持等比例 resize（nw、n、ne、e、se、s、sw、w），带容器边界约束 |
| **Escape 取消激活** | 移除所有选中状态 |
| **点击空白处** | 取消当前激活的图片 |

---

## 八、快捷键对照表

| 快捷键 | 作用域 | 功能 |
|--------|--------|------|
| `Ctrl/Cmd + P` → "AI 渲染" | 全局 | 命令面板发起 AI 渲染 |
| `Enter` | iframe 编辑中 | 确认文本编辑 |
| `Escape` | iframe 编辑中 | 取消文本编辑 |
| `Escape` | iframe 图片激活 | 取消图片选中 |
| `Shift + Enter` | CSS AI 助手输入框 | 换行（不发送） |
| `Enter` | CSS AI 助手输入框 | 发送消息 |

---

## 九、文件与目录结构（运行时）

| 路径 | 说明 |
|------|------|
| `.obsidian/plugins/obsidian-lumislate/` | 插件根目录 |
| `├── main.js` | 插件主代码（构建产物） |
| `├── styles.css` | 插件样式（构建产物） |
| `├── manifest.json` | 插件清单 |
| `├── data.json` | 用户设置存储 |
| `├── cache/` | 渲染结果缓存目录 |
| `├── css/` | 用户自定义 CSS 预设目录 |
| `└── css-system-prompt.json` | CSS AI 助手的系统提示词 |

---

## 十、术语速查

| 术语 | 说明 |
|------|------|
| **自定义模式（Marp）** | 基于 Markdown `---` 分页符生成幻灯片，支持自定义 CSS |
| **AI 模式（Design）** | 基于 Skill 模板调用 AI 生成精美排版 HTML |
| **Skill** | AI 模式下的设计模板（如 blog-post、saas-landing 等） |
| **降级渲染** | 无 AI/无缓存时，用本地函数将 Markdown 转为简单 HTML |
| **预处理** | AI 驱动的 Markdown 清理优化（Marp 模式专用） |
| **双向编辑 / 逆向映射** | iframe 内编辑文本后自动同步回 Markdown 源码 |
| **缓存** | 按 `内容 + 提示词` 哈希存储渲染结果，避免重复调用 AI |
| **Agent** | 本地 CLI AI 工具（claude、codex 等）或 HTTP API |
| **CSS 预设** | 存储在 `css/` 目录中的 `.css` 文件，通过 frontmatter `lumislate_css` 引用 |
