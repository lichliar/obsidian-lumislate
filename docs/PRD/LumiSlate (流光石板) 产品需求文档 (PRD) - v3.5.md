1. 这份全新迭代的 **LumiSlate (流光石板) v3.5 智能体架构版 PRD** 已完成更新。

   本次更新重点引入了 **“内置 AI Agent 与 Skill 技能路由系统”**。这意味着 LumiSlate 不再只是一个被动的“Markdown 编译器”，而是一个**自带技能库、能主动协助用户进行高阶排版和视觉魔改的智能助手**。用户可以在插件内直接调用特定 Skill（例如“一键生成 SpaceX 风格封面”、“生成量化 K 线数据看板插件”），由 Agent 自动改写 HTML 与样式。

   # 📄 LumiSlate (流光石板) 产品需求文档 (PRD) - v3.5

   ## 1. 产品核心定位与新增愿景

   **LumiSlate** 是一款结合 **Markdown 渲染、可视化双向绑定与 AI Agent 技能流** 的 Obsidian 视觉控制台。

   - **新增愿景**：通过在插件内部集成轻量级 AI Agent 架构，允许用户通过“技能（Skills）”的方式，零代码扩展画布的功能边界。Agent 可以感知当前画布的 DOM 结构，并调用预设或自定义的 Skill 脚本，帮助用户完成极其复杂的组件组装（如动态图表、复杂多栏布局、特效动效）。

   ## 2. 核心功能需求（新增：AI Agent & Skill 系统）

   ### 2.1 内置 AI Agent 核心架构

   - **上下文感知 (Context Awareness)**：Agent 能够实时读取左侧的 Markdown 源码、顶部的 Frontmatter 配置，以及右侧 Webview 当前渲染的 `JSON DOM 树`（知道用户当前选中了哪个元素、哪一页溢出了）。
   - **Skill 技能路由**：插件Settings面板提供 `Skills 仓库`。每个 Skill 是一个独立的 Prompt 模板或 JS 插件。Agent 根据用户输入的短指令（如 `/skill k-line`）或 UI 点击，自动路由并激活对应的技能。

   ### 2.2 核心预设 Skill (内置技能库)

   | **技能名称 (Skill ID)**                     | **触发场景/指令**                   | **技能核心逻辑 (Agent Action)**                              |
   | ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
   | **智能图表生成** `skill-data-chart`         | 检测到表格数据，或用户输入 `/chart` | Agent 自动拦截原始 MD 表格，在右侧 HTML 中引入 `Chart.js` 或 `ECharts` CDN，将枯燥的数据自动编译为**动态可交互的折线图、柱状图或 K 线图**。 |
   | **高定主题瞬移** `skill-theme-switch`       | 侧边栏主题面板，或输入 `/theme`     | 根据用户输入的氛围关键词（如 "SpaceX 极简"、"赛博朋克"），Agent 自动重写 YAML 中的样式字典，并在不破坏正文内容的前提下，重绘全局 CSS 变量。 |
   | **溢出智能急救** `skill-overflow-fix`       | 系统检测到 `ResizeObserver` 报错    | 当单页长文本溢出时，Agent 自动介入。分析文本结构，执行“语义断句”，自动在最合理的地方切分页面，或重组为“左图右书”的紧凑网格。 |
   | **交互组件注入** `skill-component-injector` | 用户输入 `/add [组件名]`            | 在当前选中的 HTML 节点下方，直接注入带有复杂交互的 Web 组件（如倒计时器、动态进度条、可折叠看板）。 |

   ### 2.3 技能执行与逆向回写闭环

   1. 用户在 HTML 画布上选中一个区块，点击“AI 助手”输入：`“把这段文字变成左右双栏，左边放字，右边放一个高科技感环形图”`。
   2. **Agent 拆解任务**：调用 `skill-data-chart` 与 `skill-component-injector`。
   3. **代码生成与注入**：Agent 生成带有 Tailwind 和 Chart.js 的 HTML 片段，直接替换右侧 Webview 里的目标 DOM。
   4. **逆向回写**：更新完毕后，Agent 将生成的复杂 HTML 组件转化为标准的可读标签（或通过短代码/Custom Component 语法），**自动重写写回左侧的 Markdown 源码**，保持两端一致。

   ## 3. 系统界面升级 (UI/UX)

   ```
   +------------------------------------+---------------------------------------+
   |  Obsidian 左侧：纯净编辑器 (Source)  |   VibeCanvas 右侧：高定画布 (Webview)  |
   |                                    |                                       |
   |  ### 1.6 其他实用命令               |  +---------------------------------+  |
   |                                    |  | ⚡ PREVIEW                       |  |
   |  | 命令     | 说明 |                |  |                                 |  |
   |  | /add-dir | 添加目录 |            |  |  [已激活 skill-data-chart 📊]    |  |
   |  | /btw     | 快速提问 |            |  |                                 |  |
   |                                    |  |   (右侧已将表格自动转化为)        |  |
   |                                    |  |   (炫酷的 ECharts 赛博折线图)     |  |
   |                                    |  |  +---------------------------+  |  |
   |                                    |  |  | [ 📈 动态图表显示区域 ]    |  |  |
   |                                    |  |  +---------------------------+  |  |
   |                                    |  +---------------------------------+  |
   |                                    +---------------------------------------+
   |                                    | 🤖 LumiSlate Agent 控制台              |
   |                                    |  > 输入指令或调起技能 (/skill ...)      |
   |                                    |  [ /skill-data-chart         ] (已启用) |
   +------------------------------------+---------------------------------------+
   ```

   ## 4. Kimi K2.6 & Claude Code 专属工程实施 Prompt（新增 Agent 阶段）

   项目的骨架搭建完成后，直接在 VS Code 终端使用 Claude Code 向 Kimi K2.6 投喂以下**阶段五**的攻坚指令，彻底打通 Agent 与 Skill 系统：

   ### 📥 攻坚阶段五：构建内置 Agent 架构与 Skill 路由机制

   > **Prompt (投喂给 Kimi K2.6)**:
   >
   > 我正在开发 LumiSlate 插件，现在需要实现 PRD v3.5 中最核心的 **AI Agent 与 Skill 技能系统**。
   >
   > **Task**: 请帮我编写 `agent_manager.ts` 和 `skills_router.ts`：
   >
   > 1. **Agent 经理 (AgentManager)**：创建一个类，能够接收用户在插件 UI 界面输入的自然语言指令。它拥有一个方法 `executeCommand(userInput: string, currentMD: string, currentHTML: string)`。
   > 2. **技能路由 (SkillsRouter)**：设计一个技能分发机制。解析用户输入，如果包含关键词（如 “图表”、“折线”、“K线”），自动路由给 `skill-data-chart` 技能。
   > 3. **编写预设 Skill（以图表技能为例）**：实现 `skill-data-chart` 核心逻辑。它的 System Prompt 极其严格：
   >    - 必须分析输入的 Markdown 表格数据。
   >    - 必须在返回的 HTML 中自动通过 `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` 引入图表库。
   >    - 必须将原始表格无缝转化为一个配置了暗黑科技风/赛博朋克风的 `<canvas>` 可交互图表组件。
   > 4. **逆向回写联动**：当 Agent 技能执行完毕、右侧 Webview 渲染出图表后，利用我们之前做好的 `postMessage` 机制，将这一段新生成的 HTML 节点（或者作为特殊扩展标签）无缝回写更新到左侧的 Obsidian 编辑器源码中。
   >
   > 请给出整套 Agent 架构与图表技能库的完整 TypeScript 实现方案。

   这份 3.5 版本的蓝图已经把 Agent 的主动辅助能力和 Skill 技能完全结构化了。在 Kimi K2.6 的配合下，LumiSlate 将拥有极强的可扩展性，变成一个能自己查漏补缺、自己画图表的超级“流光石板”！随时可以开始用 Claude Code 构建它。