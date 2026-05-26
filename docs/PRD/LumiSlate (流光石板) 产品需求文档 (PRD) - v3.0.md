# 📄 LumiSlate (流光石板) 产品需求文档 (PRD) - v3.0 全量结算版

## 1. 产品概述与核心定位

### 1.1 产品简介

**LumiSlate (流光石板)** 是一款专为 Obsidian 生态打造的视觉重塑与演示画布插件。它允许用户保持纯净、低心智负担的 Markdown 写作流，通过大模型（LLM）的动态语义理解，将本地笔记实时编译为具备高定视觉设计感、响应式且富有动态交互的 HTML 画布（支持 16:9 幻灯片、9:16 移动端海报、单页落地页等）。

### 1.2 核心痛点闭环（基于 Marp 实测踩坑后的降维打击）

在深度调研传统 MD 转演示工具（如 Marp）后，LumiSlate 针对其暴露的硬伤进行了针对性闭环设计：

- **痛点 1：源码结构脆弱。** 传统工具在表格内多一个空格、少一个转义符 `\|` 会导致排版彻底崩溃。
  - *LumiSlate 解法*：**智能语法容错。** 插件底层解析不强依赖严苛的 MD 标签，而是由大模型提取文本语义后，采用现代前端网格（Grid/Flex）技术重塑 HTML。
- **痛点 2：长数据/长表格无脑溢出。** 文本过多时直接超出固定视口（如 16:9 舱体），内容被截断或红框重叠。
  - *LumiSlate 解法*：**无感自适应与流式分页。** 引入轻量级 DOM 高度监控，一旦溢出自动触发等比缩放（Scale）或由底层引擎无感切分多页，无需用户手写 ``。
- **痛点 3：多媒体排版高心智负担。** 插入 1-2 张图片需要死记硬背反人类的特殊图片语法（如 `![bg contain]`）。
  - *LumiSlate 解法*：**资产智能锚定。** 识别标准 `![](image.png)` 数量，单图自动执行 `object-contain` 居中防裁剪，多图自动开启 Tailwind 商业级分栏排版。
- **痛点 4：画面死板且无法可视化微调。** 预览窗完全只读，改个错别字或间距必须切回源码苦苦搜寻。
  - *LumiSlate 解法*：**双向绑定与无 Token 可视化拖拽。** 允许在 HTML 画布上直接双击改字、鼠标拖拽图片或面板滑块调节间距，修改结果逆向回写（Reverse-mapping）至左侧 Markdown 源码或顶部 Frontmatter。

## 2. 用户核心旅程 (User Flow)

```
[ 1. 唤醒 LumiSlate ] ──> [ 2. 配置 Modal (比例/主题) ] ──> [ 3. 工作台分栏 (Split View) ]
                                                                       │
+----------------------------------------------------------------------+
│
▼
[ 4. 右侧 HTML 画布预览 ] 
   ├── 动态监控 ──> [ 触发自适应缩放 / 智能自动分页 ]
   ├── 双击文本 ──> [ ContentEditable 进入编辑 ] ──> [ 逆向同步回左侧 MD 源码 ]
   └── 鼠标拖拽 ──> [ 触发 Interact.js 位移计算 ] ──> [ 自动将 Tailwind 类名写入 Frontmatter ]
```

## 3. 功能需求矩阵与技术落地方案

### 3.1 基础层：分栏工作台与环境适配

- **需求描述**：用户激活插件后，Obsidian 界面自动切分为左右分栏（Split View）。左侧维持原生 Markdown 源码模式，右侧切出 LumiSlate 专属的 `Custom View`。
- **技术落地**：
  - 通过 Obsidian 插件 API 注册 `ItemView`。
  - 右侧利用 `<iframe>` 沙盒或原生 `view.contentEl.innerHTML` 容器承载生成的 HTML 代码，渲染区外层包裹一层动态配置的 CSS 类名（如选择 9:16 时，容器强制赋予 `w-[360px] h-[640px] rounded-2xl shadow-2xl border` 样式模拟手机壳外观）。

### 3.2 动态智能排版与防溢出引擎 (Anti-Overflow Engine)

- **需求描述**：彻底免去用户手写分页符、缩放符的痛苦，系统自动保证每一页画布的完美饱满呈现。
- **技术落地**：
  - **单图/多图自适应**：后置解析器拦截大模型生成的 `<img>` 标签。单图一律采用 Tailwind 的 `max-h-full max-w-full object-contain mx-auto d-block`；双图自动注入 `grid grid-cols-2 gap-6 items-center`。
  - **长表格溢出防截断**：向 Webview 注入基于 `ResizeObserver` 的轻量监控脚本。一旦计算出某个页面的容器 `scrollHeight > clientHeight`，触发自适应压缩算法，动态调整 `table { font-size: calc(当前字号 * 0.9); }` 降低内边距，直至刚好完全容纳；若内容过长，则由插件在后台 DOM 层通过脚本自动切分为多页展示，实现无感分页。

### 3.3 逆向回写与双向绑定系统 (Reverse-Mapping)

- **需求描述**：用户在右侧画布上的操作，能够零延迟同步影响左侧的 Markdown 笔记，实现所见即所得。
- **技术落地**：
  - **双击改字**：Webview 全局监听 `dblclick` 事件，将触发目标（Text Node）的 `contentEditable` 属性设为 `true`。失焦（`blur`）时，通过 `window.parent.postMessage` 将 `{ oldText: "...", newText: "..." }` 传出。插件端通过 `this.app.workspace.getActiveViewOfType(MarkdownView)` 拿到编辑器实例，调用 `editor.setValue()` 执行精准文本替换。
  - **拖拽排版与滑块微调**：集成 **`Interact.js`** 到 Webview 内。用户在右侧视觉面板调整“元素间距滑块”或拖动图片时，通过正则表达式或 AST（抽象语法树）动态修改对应 DOM 的 Tailwind 类名（如从 `gap-4` 变为 `gap-8`）。这些微调参数不污染正文，而是作为状态字典统一写回至 Markdown 顶部的 YAML Frontmatter（如 `lumislate_config: { gap: 8 }`）。

### 3.4 电影级交互动效层 (Kinetic Design)

- **需求描述**：生成的 HTML 画布必须具备高级商业演示文稿的动态转场与进入动画，告别死板的静态翻页。
- **技术落地**：
  - Webview 的 `<head>` 区域默认动态引入开源 **`Animate.css`** 样式库。
  - 大模型在生成 HTML 结构时，根据元素层级自动为其挂载相应的延迟动画类（如主标题绑定 `animate__animated animate__fadeInUp`，副标题绑定 `animate__delay-1s animate__fadeIn`）。
  - 页面切换时，容器利用 CSS Web Animations API 执行流式翻页或赛博朋克霓虹闪烁（Neon Flicker）滤镜效果。

## 4. 开发起步与准备工作

在 VS Code 中调用 Claude Code 联动 Kimi K2.6 进行“Vibe Coding”之前，请严格按照以下步骤完成本地建桩。

### 4.1 目录结构规划

在你的 Obsidian 测试 Vault 的 `.obsidian/plugins/` 目录下创建一个名为 `obsidian-lumislate` 的文件夹，并搭建如下骨架：

```
obsidian-lumislate/
├── manifest.json         # 插件元数据（身份证）
├── package.json          # 依赖与编译脚本
├── tsconfig.json         # TypeScript 配置文件
├── main.ts               # 插件主入口（注册视图、绑定事件）
├── ai_service.ts         # LLM (Kimi/Claude) API 通信与 Prompt 路由
└── styles.css            # 插件自身的 UI 样式（如微调面板样式）
```

### 4.2 核心元数据配置基准

#### `manifest.json`

JSON

```
{
  "id": "obsidian-lumislate",
  "name": "LumiSlate",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "Transform your Markdown into high-end dynamic HTML canvases with responsive layouts and drag-and-drop inverse mapping.",
  "author": "Izzy",
  "authorUrl": "",
  "isDesktopOnly": true
}
```

#### `package.json`

JSON

```
{
  "name": "obsidian-lumislate",
  "version": "1.0.0",
  "description": "LumiSlate Obsidian Plugin",
  "main": "main.js",
  "scripts": {
    "dev": "tsup main.ts --format cjs --watch --minify --external obsidian",
    "build": "tsup main.ts --format cjs --minify --external obsidian"
  },
  "dependencies": {
    "interactjs": "^1.10.27"
  },
  "devDependencies": {
    "obsidian": "^1.5.7",
    "tsup": "^8.0.2",
    "typescript": "^5.3.3"
  }
}
```

#### `tsconfig.json`

JSON

```
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "CommonJS",
    "target": "ES6",
    "allowJs": true,
    "strict": true,
    "lib": ["DOM", "ES5", "ES6"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["main.ts", "**/*.ts"]
}
```

## 5. Kimi K2.6 & Claude Code 专属工程实施 Prompt

准备工作就绪后，在 VS Code 终端启动 Claude Code，依次复制以下各阶段的**高精度实施指令**投喂给底层的 Kimi K2.6 模型，它将带你一步步输出完美闭环的代码：

### 🧱 阶段一：插件基础骨架与 Webview 分栏注入

> **Prompt (投喂给 Kimi K2.6)**:
>
> 你现在是精通 Obsidian API 的顶尖 TypeScript 架构师。请为我编写 `main.ts` 的基础骨架。
>
> **要求**：
>
> 1. 继承 `Plugin` 基类，在 `onload()` 中注册一个自定义视图 `LumiSlateView`（继承自 `ItemView`）。
> 2. 在 Obsidian 的左侧功能带（Ribbon）上注册一个闪烁图标（`lucide-sparkles`），点击后能够在编辑器的右侧成功切出 Split View 分栏，并渲染一个带有基本样式的 `<iframe>` 容器（srcdoc 先设置为一个简单的 "LumiSlate Ready" 的暗黑背景页面）。
> 3. 提供完整的、无语法错误的 TypeScript 代码。

### 🧠 阶段二：接入大模型并注入防溢出与智能排版 Prompt

> **Prompt (投喂给 Kimi K2.6)**:
>
> 我们已经打通了 `LumiSlate` 的右侧 Webview 视图。现在我们需要实现“读取当前 MD 笔记 ➔ 调用大模型 ➔ 生成自带 Tailwind 的 HTML”的核心链路。
>
> **要求**：
>
> 1. 编写 `ai_service.ts`，利用原生 `fetch` 接口调用大模型 API。
> 2. **设计一段完美的 System Prompt**：要求模型扮演天才 Interaction Designer，将输入的 Markdown 转换为带有 Tailwind CSS CDN 链接的完整单个 HTML 页面。要求其严格使用现代极简科技风、SpaceX 暗黑风或赛博朋克风。
> 3. 在 Prompt 中增加强力约束：单张图片资产必须自动赋予 `max-h-full max-w-full object-contain` 类名；多张图片自动套用 `grid grid-cols-2` 弹性网格。
> 4. 严格限制大模型**100% 只能返回包含在 ```html 和 ``` 之间的干净代码**，拒绝任何废话。请提供完整的 `ai_service.ts` 及 `main.ts` 的联动挂载方案。

### 🔄 阶段三：攻克双向绑定（右侧双击改字，左侧源码逆向同步）

> **Prompt (投喂给 Kimi K2.6)**:
>
> 现在我们要攻克 LumiSlate 最核心的交互壁垒：**所见即所得的逆向回写**。
>
> **要求**：
>
> 1. 编写一段注入到右侧 Webview 的 JS 脚本字符串。该脚本需全局劫持 `body` 的 `dblclick` 事件，当用户双击文本元素时，将其 `contentEditable` 置为 `true`。并在触发 `blur`（失焦）时，通过 `window.parent.postMessage` 将原本的旧文本 `oldText` 和修改后的新文本 `newText` 传回插件端。
> 2. 在 `main.ts` 中编写监听器接收此消息，利用 Obsidian 的 `MarkdownView` 编辑器实例，使用安全的高性能文本替换算法（如带特殊字符转义的正则或行扫描），将左侧 Markdown 源码中对应的文字进行同步更改，实现“右侧改字，左侧自动同步”。
> 3. 请输出极度健壮、带有防抖和字符安全转义的完整代码。

### 🎛️ 阶段四：引入 Interact.js 可视化微调与 Frontmatter 状态保存

> **Prompt (投喂给 Kimi K2.6)**:
>
> 最后一项冲刺：我们需要在不消耗大模型 Token 的前提下，实现右侧画布元素的无代码微调。
>
> **要求**：
>
> 1. 完善 `LumiSlateView`，在 Webview 容器右侧边缘切出一个宽度为 200px 的可收缩底层微调控制面板（Style Panel），包含：文字大小调节滑块、内边距调节滑块。
> 2. 引入 **`Interact.js`**，允许用户鼠标选中 Webview 内的组件并进行拖拽缩放。
> 3. 当用户拖动滑块或调整组件大小时，插件通过 `executeJavaScript()` 直接在 Webview 内存中实时替换对应 DOM 节点的 Tailwind 类名（如从 `p-4` 变为 `p-6`，或 `w-1/2` 变为 `w-2/3`），实现毫秒级视觉同步。
> 4. 当操作释放时，将这些微调类名作为参数，调用 Obsidian API 精准写入到当前 Markdown 笔记最顶部的 `lumislate_config` Frontmatter 区域。
> 5. 请提供完整的控制层与逆向回写代码。

这份 3.0 全量版本的 PRD 已经将 `LumiSlate` 的技术灵魂、工程准备以及面对实际踩坑痛点时的防溢出、逆向绑定机制交待得清清楚楚。你随时可以把它作为开发蓝图，在 VS Code 中用 Claude Code 唤醒 Kimi K2.6，正式敲下属于 LumiSlate 的第一行流光代码！