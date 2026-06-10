# ✨ LumiSlate · 流光石板

> 将 Obsidian 的 Markdown 笔记，转换为精美、可交互的 HTML 画布。

LumiSlate 是一个 Obsidian 插件，将你的笔记转换为带设计的HTML画布。

**自定义模式**允许你自由快速转换Markdown文本→HTML，左侧编辑 Markdown，右侧实时渲染为可编辑、可导出、可交互的高定页面。

**AI 模式**则自动检测你的本地Agent，利用本地Agent的力量快速美化你的Markdown文本。

---

## 🎬 效果预览

| 自定义模式（幻灯片） | AI 模式（设计生成） |
|:--:|:--:|
| 基于 `---` 分页符生成专业演示幻灯片，高度自定义。 | 选择模板，AI 自动生成精美排版，将设计全权交给你的本地AI |
| ![自定义模式]() | ![AI 模式]() |

---

## 🚀 安装插件

**方式一：手动安装（推荐）**

1. 点击下方链接下载最新版的插件压缩包： 👉 [obsidian-lumislate.zip](https://github.com/lichliar/obsidian-lumislate/releases/download/1.0.0/obsidian-lumislate.zip)  (点击下载)
2. 打开你的 Obsidian 库文件夹，找到隐藏目录 `.obsidian/plugins/`。
3. **直接将下载好的 `.zip` 文件解压到 `plugins/` 目录中**。 *(解压后会自动生成 `obsidian-lumislate` 文件夹，内部包含核心运行文件。)*
4. 进入 Obsidian 设置 ➔ 社区插件 ➔ 刷新，找到 **LumiSlate** 并点击开启。闪耀你的 SaaS 流式画布！⚡

**方式二：BRAT 安装**

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 添加 `lichliar/obsidian-lumislate`

**方式三：obsidian官方市场（待定）**

1. 还没上架官方市场。

---

## 如何使用

### 1. 打开画布

- 点击左侧 Ribbon 栏的 ✨ 图标
- 或使用命令面板 `Ctrl/Cmd + P` → "打开 LumiSlate 画布"

### 2. 选择模式

| 模式 | 适用场景 | 操作 |
|------|----------|------|
| **自定义模式** | 幻灯片演示、课程讲义、技术分享 | 在 Markdown 中用 `---` 分隔页面，右侧自动生成幻灯片 |
| **AI 模式** | 产品落地页、数据报告、博客排版、社交媒体 | 连接好你的本地agent，选择一个 Skill 模板，点击 ✨ AI 渲染 |

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

---

## 🙏 借鉴与渊源

LumiSlate 的设计与实现深受以下优秀项目的启发：

- **[open-design](https://github.com/nexu-io/open-design)** — 设计模板系统的组织方式与 Skill 目录结构深受其启发。
- **[Slidev](https://github.com/slidevjs/slidev)** — 自定义模式的幻灯片渲染管线、Frontmatter 配置系统、布局模板机制参考了 Slidev 的设计思路。
- **[obsidian-marp-slides](https://github.com/samuele-cozzi/obsidian-marp-slides)** — Marp 模式与 Obsidian 集成的整体架构理念参考了该项目。

---

## 📄 许可证

[MIT](LICENSE)

---

## **LumiSlate** — 让每一份 Markdown 都值得被精美呈现。
