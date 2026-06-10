# ✨ LumiSlate · 流光石板

> 将 Obsidian 的 Markdown 笔记，一键转换为精美、可交互的 HTML 画布。

LumiSlate 是一个 Obsidian 插件，为你的笔记赋予**幻灯片演示**与**AI 驱动设计**两种形态。左侧编辑 Markdown，右侧实时渲染为可编辑、可导出、可交互的高定页面——就像一块被点亮的发光石板。

---

## 🎬 效果预览

| 自定义模式（幻灯片） | AI 模式（设计生成） |
|:--:|:--:|
| 基于 `---` 分页符生成专业演示幻灯片 | 选择模板，AI 自动生成精美排版 |
| ![自定义模式]() | ![AI 模式]() |

---

## 🌟 核心特性

- **🎨 双模式工作流**
  - **自定义模式**：用 Markdown `---` 分页符编写幻灯片，支持 16:9 / 4:3 / 1:1 比例、自定义 CSS、键盘翻页
  - **AI 模式**：从 78+ 个设计模板中选择，AI 自动生成 SaaS 落地页、博客长文、数据看板、社交媒体卡片等

- **🤖 双通路 AI 接入**
  - **本地 Agent**：自动检测并调用 claude、codex、gemini、cursor-agent、deepseek、aider 等 CLI 工具
  - **HTTP API**：支持 Kimi、DeepSeek、Claude、Ollama 等 OpenAI 兼容接口

- **🔄 双向实时同步**
  - 左侧 Markdown 编辑 → 右侧自动跟随光标位置滚动到对应幻灯片
  - 右侧点击文本进入 `contenteditable` 编辑 → 修改自动同步回 Markdown 源码
  - 右侧点击图片 → 支持拖拽移动、八向手柄调整大小

- **⚡ 智能缓存系统**
  - 按 `内容 + 提示词` FNV-1a 哈希缓存渲染结果
  - 避免重复调用 AI，秒级恢复已生成页面

- **📤 多种导出方式**
  - 下载单文件 HTML（可离线打开）
  - 导出高清 PNG 截图（2x 分辨率）
  - 保存到 Vault 指定目录

- **🧩 Markdown 扩展语法全支持**
  - `==高亮==`、`<u>下划线</u>`、任务列表 `- [x]`
  - Mermaid 图表（流程图、时序图、类图、甘特图）
  - KaTeX 数学公式（行内 `$...$`、块级 `$$...$$`）

---

## 🚀 快速开始

### 1. 安装插件

**方式一：手动安装（推荐）**

1. 下载最新 Release 中的 `main.js`、`styles.css`、`manifest.json`
2. 复制到 Obsidian Vault 的 `.obsidian/plugins/obsidian-lumislate/` 目录
3. 在 Obsidian 设置 → 第三方插件中启用 LumiSlate

**方式二：BRAT 安装**

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 添加 `lichliar/obsidian-lumislate`

### 2. 打开画布

- 点击左侧 Ribbon 栏的 ✨ 图标
- 或使用命令面板 `Ctrl/Cmd + P` → "打开 LumiSlate 画布"

### 3. 选择模式

| 模式 | 适用场景 | 操作 |
|------|----------|------|
| **自定义模式** | 幻灯片演示、课程讲义、技术分享 | 在 Markdown 中用 `---` 分隔页面，右侧自动生成幻灯片 |
| **AI 模式** | 产品落地页、数据报告、博客排版、社交媒体 | 选择一个 Skill 模板，点击 ✨ AI 渲染 |

### 4. 自定义模式示例

```markdown
---
theme: default
size: 16:9
paginate: true
---

# 欢迎使用 LumiSlate

流光石板 — 让 Markdown 发光

---

## 核心特性

- 双模式工作流
- AI 驱动设计
- 双向实时同步

---

## 开始创作

1. 在左侧编辑 Markdown
2. 右侧自动渲染为幻灯片
3. 点击文本可直接编辑
```

---

## 🎨 Skill 模板系统

AI 模式下，LumiSlate 提供 **78+** 个精心设计的设计模板（Skill），覆盖 9 大场景：

| 分类 | 代表模板 | 说明 |
|------|----------|------|
| **📰 文章/博客** | `blog-post`、`article-magazine`、`doc-kami-parchment` | 杂志感长文、技术文档、羊皮卷风格 |
| **🚀 产品/营销** | `saas-landing`、`pricing-page`、`waitlist-page` | SaaS 落地页、定价页、等待列表 |
| **📊 数据/报告** | `dashboard`、`data-report`、`finance-report` | 数据看板、财务报告、实验复盘 |
| **📑 幻灯片/演示** | `deck-pitch`、`deck-product-launch`、`deck-tech-sharing` | 融资路演、产品发布、技术分享 |
| **📱 社交媒体** | `card-xiaohongshu`、`social-x-post-card`、`social-spotify-card` | 小红书卡片、X/Twitter 卡片、Spotify 风格 |
| **📋 文档/规范** | `pm-spec`、`meeting-notes`、`weekly-update` | 产品需求文档、会议记录、周报 |
| **🧪 原型/线框** | `prototype-web`、`wireframe-sketch`、`mockup-device-3d` | 网页原型、线框图、3D 设备模型 |
| **🎬 动效/视觉** | `motion-frames`、`vfx-text-cursor`、`video-hyperframes` | 帧动画、文字特效、超帧视频 |
| **🏢 企业/办公** | `hr-onboarding`、`team-okrs`、`invoice` | 入职指引、OKR 看板、发票模板 |

每个 Skill 是一个独立文件夹，包含：
- `SKILL.md`：设计意图、布局结构、设计细节
- 可选 `preview.png`：模板预览图

> 💡 **自定义 Skill**：在插件目录 `skills/` 下新建文件夹，按 `SKILL.md` 格式编写即可自动识别。

---

## 🔧 核心功能详解

### 自定义模式（幻灯片）

**Frontmatter 指令**

```yaml
---
theme: default        # default | gaia | uncover
size: 16:9            # 16:9 | 4:3 | 1:1
paginate: true        # 是否显示页码
layout: cover         # default | cover | center | two-cols | statement | section
backgroundColor: '#0f172a'
header: '页眉文本'
footer: '页脚文本'
---
```

**局部指令**（以 `_` 前缀，仅作用于下一页）：

```markdown
_backgroundColor: red
_layout: cover

# 这一页是红色背景封面
```

**幻灯片版式**

| 版式 | 说明 |
|------|------|
| `default` | 标准页（标题+内容自上而下） |
| `cover` | 封面页（大标题居中放大） |
| `center` | 居中页（所有内容居中堆叠） |
| `two-cols` | 双栏布局（左侧内容 + `::right::` 分隔右侧） |
| `statement` | 金句页（超大字号居中引用） |
| `section` | 章节分隔页（仅保留大标题） |

**键盘翻页**：`→` / `←` / `空格` / `PgUp` / `PgDown`

### AI 模式（设计生成）

1. 在工具栏选择 **AI 模式**
2. 点击「样式选择」打开 Skill Gallery
3. 选择一个模板（如 `saas-landing`）
4. 点击 ✨ **AI 渲染**
5. AI 根据你的 Markdown 内容生成精美 HTML 页面

**支持的 AI 接入方式**：

| 方式 | 配置路径 | 说明 |
|------|----------|------|
| 本地 CLI Agent | 设置 → AI 接入 → 本地 Agent | 自动检测 PATH 中的 claude/codex/gemini 等 |
| HTTP API | 设置 → AI 接入 → HTTP API | 填写 Base URL、API Key、模型名 |

### 双向编辑（逆向映射）

iframe 内渲染的每个页面都注入了逆向映射脚本：

- **Hover**：可编辑文本（P、H1-H6、LI、SPAN 等）高亮显示
- **点击**：进入 `contenteditable` 编辑模式
- **Enter**：确认修改，自动同步回 Markdown 源码
- **Escape**：取消编辑

### 图片交互

渲染后的图片支持：

- **点击激活**：显示蓝色边框 + 八向调整手柄
- **拖拽移动**：自由调整图片位置（带边界约束）
- **拖拽缩放**：八向手柄支持等比例 resize
- **Escape**：取消选中

### 预处理功能

AI 驱动的 Markdown 预处理（自定义模式专用）：

- **长文模式**：移除分页符，优化为连续阅读格式
- **幻灯片模式**：在合适的逻辑断点自动插入 `---` 分页符

### 导出

点击工具栏「导出」按钮：

- 📄 **下载 HTML**：单文件 HTML，可离线打开
- 🖼️ **下载 PNG**：高清截图（2x 分辨率）
- 💾 **保存到 Vault**：写入 Vault 指定目录

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian 主窗口                           │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  Markdown 编辑器     │  │     LumiSlate 画布 (iframe)   │  │
│  │  (CodeMirror 6)      │  │     sandbox="allow-scripts"   │  │
│  └──────────┬──────────┘  └──────────────┬───────────────┘  │
│             │                            │                   │
│             │  cursorActivity            │  postMessage      │
│             │  (轮询 200ms)              │  (scrollToSlide)  │
│             └────────────┬───────────────┘                   │
│                          │                                   │
│              ┌───────────┴───────────┐                       │
│              │   LumiSlatePlugin     │                       │
│              │  ┌─────────────────┐  │                       │
│              │  │  compileWithAI  │──┼──→ 本地 Agent / HTTP │
│              │  │  (ai_service.ts)│  │                       │
│              │  └─────────────────┘  │                       │
│              │  ┌─────────────────┐  │                       │
│              │  │  CacheManager   │──┼──→ {pluginDir}/cache/ │
│              │  │ (cache_manager) │  │                       │
│              │  └─────────────────┘  │                       │
│              └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 渲染管线

```
Markdown
  → extractFrontmatter          # 分离 frontmatter 与正文
  → assemblePrompt              # 组装 AI 提示词
  → compileWithAI               # 本地 Agent / HTTP API 调用
  → extractHtml                 # 清洗 AI 输出（去 markdown 围栏）
  → injectReverseMappingScript  # 注入双向编辑脚本
  → iframe.srcdoc               # 渲染到沙盒 iframe
```

### 关键设计决策

- **iframe 沙盒**：所有渲染内容在 sandbox iframe 中运行，隔离 CSS/JS，避免与 Obsidian 冲突
- **postMessage 通信**：父窗口与 iframe 之间通过标准 postMessage 协议通信（滚动指令、编辑同步、模式切换）
- **轮询光标同步**：使用 200ms 轮询检测编辑器光标变化，平衡实时性与性能
- **FNV-1a 缓存**：按 `内容 + 提示词` 哈希存储，保证缓存命中的同时支持内容变化检测

---

## 📁 目录结构

```
obsidian-lumislate/
├── src/
│   ├── core/
│   │   └── main.ts              # 插件主类 + LumiSlateView + 渲染逻辑
│   ├── ai/
│   │   ├── ai_service.ts        # AI 调用统一入口（本地/HTTP）
│   │   ├── local_agent.ts       # 本地 CLI Agent 检测与调用
│   │   ├── skills.ts            # Skill 接口、prompt 组装、Marp 指令解析
│   │   ├── skill_loader.ts      # 从磁盘加载 Skill 定义
│   │   └── skills_router.ts     # Skill 路由框架
│   ├── ui/
│   │   ├── modals.ts            # 模态框（导出、Skill Gallery、预处理确认）
│   │   └── styles.css           # 插件样式（Obsidian CSS 变量兼容）
│   ├── utils/
│   │   ├── cache_manager.ts     # 文件级 HTML 缓存
│   │   ├── export.ts            # HTML/PNG/Vault 导出
│   │   └── preprocess.ts        # Markdown 预处理
│   └── config/
│       └── settings.ts          # 设置面板 + 配置项定义
├── skills/                      # 78+ 个设计模板（构建时复制到 dist/）
│   ├── blog-post/
│   ├── saas-landing/
│   └── ...
├── docs/                        # 文档
│   ├── UX-Glossary.md           # UX 元素命名表
│   └── research/                # 调研报告
├── scripts/
│   └── deploy.js                # 自动部署到 Obsidian Vault
├── dist/                        # 构建产物
│   ├── main.js                  # 插件主代码
│   ├── styles.css               # 插件样式
│   └── skills/                  # 复制的设计模板
├── manifest.json                # Obsidian 插件清单
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 🛠️ 开发构建

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 生产构建 → dist/main.js + dist/styles.css
npm run build
```

**构建产物说明**：

`npm run build` 会执行：
1. `tsup` 编译 TypeScript → `dist/main.js`
2. 复制 `src/ui/styles.css` → `dist/styles.css`
3. 复制 `skills/` 目录 → `dist/skills/`
4. 运行 `scripts/deploy.js` 自动部署到 Obsidian Vault

**部署配置**：编辑 `scripts/deploy.js` 中的 `targetDir` 为你的 Vault 插件路径。

---

## 🗺️ 路线图

- [ ] 自定义模式：Slidev 风格 MDC 语法扩展
- [ ] 自定义模式：Shiki 代码高亮 + 行高亮
- [ ] AI 模式：流式渲染进度条
- [ ] AI 模式：多模型对比渲染
- [ ] 导出：PDF 直接导出
- [ ] 移动端适配

---

## 📄 许可证

[MIT](LICENSE)

---

> **LumiSlate** — 让每一份 Markdown 都值得被精美呈现。
