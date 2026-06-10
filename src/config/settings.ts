import { App, PluginSettingTab, Setting, setIcon, Notice } from 'obsidian';
import type LumiSlatePlugin from '../core/main';
import { MODES, type Mode } from '../ai/skills';
import { detectAgents, refreshAgents, detectAgent } from '../ai/local_agent';
import { testHttpConnection } from '../ai/ai_service';

export interface LumiSlateSettings {
	aiProvider: 'local' | 'http';
	apiBaseUrl: string;
	apiKey: string;
	model: string;
	defaultMode: Mode;
	defaultSkill: string;
	localAgent: string;
	localAgentBinOverride: string;
	defaultExportFolder: string;
	/** 界面语言 */
	language: 'en' | 'zh-cn';
	/** 禁用 AI 输出中的 insight / thinking / analysis 等额外标记 */
	disableAiExtras: boolean;
	/** 自定义模式 CSS 系统提示词 */
	cssSystemPrompt: string;
	/**
	 * Slide 版式映射表
	 * key = 文件路径, value = { slideIndex: layoutId }
	 * 版式信息存储在插件设置中，不污染 Markdown 源码
	 */
	slideLayouts: Record<string, Record<number, string>>;
	/** 自定义模式基准字号（px），影响所有 rem 单位的标题与间距 */
	customBaseFontSize: number;
	/** 自定义模式文字颜色（HEX） */
	customTextColor: string;
	/** 自定义模式字体 */
	customFontFamily: string;
	/** HTML 默认保存地址（相对 Vault 根目录），留空则使用当前笔记所在目录 */
	htmlDefaultSaveFolder: string;
}

/** 默认 CSS 系统提示词（用于 AI 辅助 CSS 编辑） */
export const DEFAULT_CSS_SYSTEM_PROMPT = `## LumiSlate 自定义模式 CSS 架构规范（必须遵守）

### 1. 架构概述
自定义模式将 Markdown 按 \`---\` 分页符切分为若干页，每页渲染为一个 \`<section>\` 元素。
- 所有样式必须使用 \`section\` 作为根选择器（如 \`section h1\`、\`section p\`）
- **严禁使用 \`.slide\` 类选择器**：这是插件布局引擎的保留类，对其设置样式会被强制覆盖
- 插件在 :root 中预定义 \`--ls-*\` CSS 变量，覆盖它们可改变全局默认值

### 2. Markdown → HTML 元素映射（CSS 编写核心依据）
自定义模式使用标准 Markdown 渲染引擎，以下内容会被转换为对应的 HTML 标签。你的 CSS 必须为**每一种**元素提供精心设计的样式：

#### 2.1 标题体系（必须建立清晰层级）
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| \`# H1\` | \`<h1>\` | 幻灯片主标题，字号最大（建议 2.5-3rem），字重 bold，上下 margin 充足 |
| \`## H2\` | \`<h2>\` | 章节标题，比 H1 小 20%（建议 2-2.2rem），颜色可略浅 |
| \`### H3\` | \`<h3>\` | 小节标题（建议 1.5-1.7rem），与正文有明确区分 |
| \`#### H4\` | \`<h4>\` | 子标题（建议 1.2-1.3rem），**不可与正文同大小** |
| \`##### H5\` | \`<h5>\` | 辅助标题（建议 1.05-1.1rem），可加颜色区分 |
| \`###### H6\` | \`<h6>\` | 最小标题（建议 0.95-1rem），通常用作标签或元信息 |

**选择器**：\`section h1\` ~ \`section h6\`
**关键**：H1-H6 必须形成递减的字号阶梯，不可出现 H3 比 H2 大或 H4 与正文同大小的情况。

#### 2.2 段落与文本修饰
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| 普通段落 | \`<p>\` | line-height: 1.6-1.8，适当 margin-bottom（0.5-0.8em） |
| \`**粗体**\` | \`<strong>\` | font-weight: 700 或 600，颜色可略亮于正文 |
| \`*斜体*\` | \`<em>\` | font-style: italic，可附加轻微颜色偏移 |
| \`~~删除线~~\` | \`<del>\` | text-decoration: line-through，颜色略淡（如 opacity: 0.6） |
| \`==高亮==\` | \`<mark>\` | **必须**设计醒目的高亮样式：如黄色半透明底色（rgba(255,215,0,0.3)）+ 圆角 padding（2px 6px） |
| \`<u>下划线</u>\` | \`<u>\` | 使用带颜色偏移的下划线（如 border-bottom: 2px solid var(--ls-accent)），避免默认样式的生硬感 |
| \`[链接](url)\` | \`<a>\` | color 使用主题强调色，hover 时加下划线或颜色变化，transition: all 0.2s |
| \`行内代码\` | \`<code>\`（行内） | 等宽字体、轻微背景色（与幻灯片背景形成对比）、圆角 padding（2px 4px）、字号略小（0.9em） |

#### 2.3 列表（无序/有序/任务）
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| \`- 项目\` | \`<ul><li>\` | 左侧缩进一致（padding-left: 1.5em），list-style 可使用自定义符号（如圆点、方块） |
| \`1. 项目\` | \`<ol><li>\` | 数字/字母序号样式清晰，与正文对齐 |
| \`- [ ] 任务\` | 自定义 HTML（CSS/SVG 勾选框） | **严禁使用原生 \`<input type="checkbox">\`**。用 CSS/SVG 绘制：未勾选时为空方框，勾选时显示 ✓ 符号 + 添加删除线效果（text-decoration: line-through） |

**选择器**：\`section ul\`、\`section ol\`、\`section li\`
**关键**：列表项间距要均匀（margin-bottom: 0.3-0.5em），嵌套列表缩进清晰。

#### 2.4 代码块
Markdown 代码块渲染为 \`<pre>\` 包裹 \`<code>\` 的结构。
- **块级选择器**：\`section pre\`、\`section pre code\`
- **样式要求**：与幻灯片背景形成对比的深色背景（如 #1e293b）、等宽字体（font-family: 'Fira Code', monospace）、圆角（border-radius: 8px）、适当 padding（12-16px）、控制 max-height（如 400px，防止溢出幻灯片）
- **行内选择器**：\`section code\`（已在 2.2 中说明）

#### 2.5 表格
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| \`\| 表头 \| 数据 \|\` | \`<table><thead><tbody><tr><th><td>\` | 清晰的边框（border-collapse）、表头背景色突出、行交替色（striped rows）、cell padding 充足（8-12px） |

**选择器**：\`section table\`、\`section th\`、\`section td\`
**防截断策略**：列数多或行数多时容易溢出幻灯片 → 优先缩小字体（如 0.7rem）和 cell padding；仍溢出时用 \`transform: scale(0.85)\` 整体缩放（transform-origin: top left）。

#### 2.6 引用块
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| \`> 引用\` | \`<blockquote>\` | 左侧彩色边框（border-left: 4px solid var(--ls-accent)）、轻微背景色、内部 padding（12-16px）、斜体或略淡的文字色 |

#### 2.7 水平线
| Markdown | HTML | CSS 要求 |
|----------|------|----------|
| \`---\` | \`<hr>\` | 简洁优雅的分隔线：border: none、border-top: 1px solid var(--ls-border)、适当 margin（1.5em 0）、可使用渐变或虚线增强视觉效果 |

#### 2.8 Callout（警告框）
渲染为 \`<div class="callout callout-{type}">\`，内含 \`.callout-title\` 和 \`.callout-content\`。
- **类型**：note/tip/warning/danger/question/example 等
- **样式要求**：左侧彩色边框（类型决定颜色，如 note=blue, warning=orange, danger=red）+ 轻微背景色 + 圆角，与整体风格协调
- **选择器**：\`section .callout\`、\`section .callout-title\`、\`section .callout-content\`、\`section .callout-note\` 等类型选择器

#### 2.9 图片
插件已为图片提供基础样式，你只需覆盖视觉效果：
- **单图**：\`section img\` → border-radius、box-shadow、border
- **双图并排**：父容器 flex + gap，子元素各约 48% 宽度
- **多图网格**：grid 布局（如 3 列），图片固定高度 + object-fit: cover
- **约束**：图片不要超出幻灯片边界，必要时限制 max-height（如 45%）

#### 2.10 数学公式
KaTeX 渲染的数学公式，块级可加背景容器。
- **选择器**：\`section .katex\`、\`section .katex-display\`
- **要求**：确保深色/浅色背景都有足够对比度，块级公式可加轻微背景色容器

### 3. 幻灯片整体布局规范
- **幻灯片本体选择器**：\`section\`（不要使用 \`.slide\`）
- **可自由覆盖**：background、color、font-family、padding、border-radius、box-shadow、border
- **尺寸约束**：由 frontmatter \`size\` 字段控制（16:9=1280x720, 4:3=1024x768, 1:1=800x800），CSS 中不可覆盖
- **页码**：\`.slide-paginate\` 的 font-size、color、opacity

### 4. CSS 变量体系
插件在 :root 中定义以下变量，推荐优先使用它们以确保一致性：
- \`--ls-body-bg\` / \`--ls-body-color\`：页面背景/文字色
- \`--ls-slide-bg\` / \`--ls-slide-radius\` / \`--ls-slide-padding\`：幻灯片样式
- \`--ls-h1-size\` / \`--ls-h1-weight\` / \`--ls-h1-margin\`：H1 样式（同理 H2-H6）
- \`--ls-accent\`：主题强调色，用于链接、边框、高亮等

### 5. 输出要求
- 输出**完整**的 CSS 代码（含原有内容和你的修改）
- 不要添加 markdown 代码围栏（如 \`\`\`css\`）
- 不要包含任何解释性文字，只输出纯 CSS
- 保持代码整洁，适当缩进
- **覆盖所有上述 Markdown 元素的选择器**，不要遗漏任何一种`;

export const DEFAULT_SETTINGS: LumiSlateSettings = {
	aiProvider: 'local',
	apiBaseUrl: 'https://api.moonshot.cn/v1/chat/completions',
	apiKey: '',
	model: 'kimi-latest',
	defaultMode: 'design',
	defaultSkill: 'blog-post',
	localAgent: '',
	localAgentBinOverride: '',
	defaultExportFolder: '',
	language: 'zh-cn',
	disableAiExtras: true,
	cssSystemPrompt: DEFAULT_CSS_SYSTEM_PROMPT,
	slideLayouts: {},
	customBaseFontSize: 16,
	customTextColor: '#e2e8f0',
	customFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
	htmlDefaultSaveFolder: '',
};

// ============================================================
// i18n 简单实现
// ============================================================

const I18N = {
	'zh-cn': {
		settingsTitle: 'LumiSlate 设置',
		tabGeneral: '常规',
		tabAi: 'AI 设置',
		defaultExportFolder: '默认导出目录',
		defaultExportFolderDesc: '保存 HTML 到 Vault 时的默认文件夹路径（相对 Vault 根目录），留空则使用当前笔记所在目录',
		defaultExportFolderPlaceholder: '例如: exports',
		htmlDefaultSaveFolder: 'HTML 默认保存地址',
		htmlDefaultSaveFolderDesc: '自定义模式下保存 HTML 的默认文件夹路径（相对 Vault 根目录），留空则使用当前笔记所在目录',
		htmlDefaultSaveFolderPlaceholder: '例如: lumislate-html',
		language: '界面语言',
		languageDesc: '选择插件界面的显示语言',
		langZhCn: '简体中文',
		langEn: 'English',
		aiProvider: '首选接入方式',
		aiProviderDesc: '优先使用本地 CLI Agent（如已安装），或回退到 HTTP API',
		aiProviderLocal: '本地 CLI Agent（优先）',
		aiProviderHttp: 'HTTP API',
		localAgentTitle: '本地 CLI Agent',
		httpApiTitle: 'HTTP API 配置',
		selectAgent: '选择 Agent',
		selectAgentDesc: '选择要使用的本地 CLI 工具',
		agentNotSelected: '-- 未选择 --',
		customBinPath: '自定义二进制路径',
		customBinPathDesc: '如果 Agent 不在 PATH 中，可指定绝对路径',
		customBinPathPlaceholder: '留空则自动检测 PATH',
		redetect: '重新检测',
		redetectDesc: '点击重新扫描本地安装的 CLI 工具',
		redetectBtn: '重新检测',
		apiBaseUrl: 'API Base URL',
		apiBaseUrlDesc: 'OpenAI 兼容格式的完整请求地址',
		apiKey: 'API Key',
		apiKeyDesc: '你的 API 密钥',
		model: '模型',
		modelDesc: '使用的模型 ID',
		apiRefTitle: '常用 API 配置参考',
		testConnection: '检测连接',
		testConnectionDesc: '测试当前配置的 API 或 Agent 是否可以正常连接',
		testConnectionBtn: '检测连接',
		connectionOk: '连接成功',
		connectionFailed: '连接失败',
		disableAiExtras: '禁用 AI 额外输出',
		disableAiExtrasDesc: '开启后，AI 渲染时将禁止输出 insight、thinking、analysis 等额外标记，避免干扰 HTML 渲染',
		sectionAiAccess: 'AI 接入配置',
		sectionSystemPrompts: '系统提示词设置',
		cssDesignTitle: 'CSS 设计',
		cssDesignDesc: '自定义 AI 辅助 CSS 编辑时遵循的系统提示词。修改保存后，下次打开 CSS 编辑器时立即生效。',
		useSkillLabel: '使用 Skill',
		useSkillPlaceholder: '暂不可用',
		btnSave: '确认保存',
		btnReset: '重置为默认',
		promptSaved: '系统提示词已保存',
		promptReset: '已重置为默认',
		noAgentDetected: '未检测到任何本地 CLI Agent。支持的工具有：',
		agentDetected: (n: number) => `检测到 ${n} 个可用 Agent`,
		agentNotDetected: (n: number) => `未检测到 (${n})`,
		agentAvailable: '可用',
		agentUnavailable: '未安装',
		agentPath: '路径',
		agentVendor: '厂商',
		agentSelected: '已选中',
		agentClickToSelect: '点击选择',
		sectionCustomStyle: '自定义模式样式',
		customBaseFontSize: '基准字号',
		customBaseFontSizeDesc: '自定义模式的基准字号（px）。修改后，所有标题、间距等 rem 单位会按比例缩放',
		customTextColor: '文字颜色',
		customTextColorDesc: '自定义模式的默认文字颜色（HEX 格式）',
		customFontFamily: '字体',
		customFontFamilyDesc: '自定义模式的字体族（CSS font-family 格式）',
	},
	en: {
		settingsTitle: 'LumiSlate Settings',
		tabGeneral: 'General',
		tabAi: 'AI Settings',
		defaultExportFolder: 'Default Export Folder',
		defaultExportFolderDesc: 'Default folder for saving HTML to Vault (relative to Vault root). Leave empty to use current note directory.',
		defaultExportFolderPlaceholder: 'e.g. exports',
		htmlDefaultSaveFolder: 'HTML Default Save Folder',
		htmlDefaultSaveFolderDesc: 'Default folder for saving HTML in custom mode (relative to Vault root). Leave empty to use current note directory.',
		htmlDefaultSaveFolderPlaceholder: 'e.g. lumislate-html',
		language: 'Language',
		languageDesc: 'Select the plugin interface language',
		langZhCn: '简体中文',
		langEn: 'English',
		aiProvider: 'Preferred Provider',
		aiProviderDesc: 'Use local CLI Agent (if installed) or fallback to HTTP API',
		aiProviderLocal: 'Local CLI Agent (Preferred)',
		aiProviderHttp: 'HTTP API',
		localAgentTitle: 'Local CLI Agents',
		httpApiTitle: 'HTTP API Configuration',
		selectAgent: 'Select Agent',
		selectAgentDesc: 'Choose a local CLI tool to use',
		agentNotSelected: '-- None --',
		customBinPath: 'Custom Binary Path',
		customBinPathDesc: 'Specify absolute path if Agent is not on PATH',
		customBinPathPlaceholder: 'Leave empty for auto-detection',
		redetect: 'Redetect',
		redetectDesc: 'Click to rescan locally installed CLI tools',
		redetectBtn: 'Redetect',
		apiBaseUrl: 'API Base URL',
		apiBaseUrlDesc: 'Full OpenAI-compatible request URL',
		apiKey: 'API Key',
		apiKeyDesc: 'Your API key',
		model: 'Model',
		modelDesc: 'Model ID to use',
		apiRefTitle: 'Common API Configurations',
		testConnection: 'Test Connection',
		testConnectionDesc: 'Test whether the current API or Agent can connect successfully',
		testConnectionBtn: 'Test',
		connectionOk: 'Connection successful',
		connectionFailed: 'Connection failed',
		disableAiExtras: 'Disable AI Extra Output',
		disableAiExtrasDesc: 'When enabled, AI rendering will suppress insight, thinking, analysis, and other extra markers to avoid interfering with HTML rendering',
		sectionAiAccess: 'AI Access Configuration',
		sectionSystemPrompts: 'System Prompt Settings',
		cssDesignTitle: 'CSS Design',
		cssDesignDesc: 'Custom system prompt for AI-assisted CSS editing. Changes take effect immediately the next time the CSS editor opens.',
		useSkillLabel: 'Use Skill',
		useSkillPlaceholder: 'Not available',
		btnSave: 'Save',
		btnReset: 'Reset to Default',
		promptSaved: 'System prompt saved',
		promptReset: 'Reset to default',
		noAgentDetected: 'No local CLI Agent detected. Supported tools: ',
		agentDetected: (n: number) => `${n} agent(s) available`,
		agentNotDetected: (n: number) => `Not detected (${n})`,
		agentAvailable: 'Available',
		agentUnavailable: 'Not installed',
		agentPath: 'Path',
		agentVendor: 'Vendor',
		agentSelected: 'Selected',
		agentClickToSelect: 'Click to select',
		sectionCustomStyle: 'Custom Mode Style',
		customBaseFontSize: 'Base Font Size',
		customBaseFontSizeDesc: 'Base font size for custom mode (px). All headings and spacing in rem units will scale proportionally',
		customTextColor: 'Text Color',
		customTextColorDesc: 'Default text color for custom mode (HEX format)',
		customFontFamily: 'Font Family',
		customFontFamilyDesc: 'Font family for custom mode (CSS font-family format)',
	},
};

function t(plugin: LumiSlatePlugin, key: keyof typeof I18N['en']): string {
	const lang = plugin.settings.language;
	const dict = I18N[lang] ?? I18N['zh-cn'];
	const value = dict[key];
	if (typeof value === 'function') {
		// 不应该发生，但类型安全
		return (value as (n: number) => string)(0);
	}
	return value ?? key;
}

function tf(plugin: LumiSlatePlugin, key: 'agentDetected' | 'agentNotDetected', n: number): string {
	const lang = plugin.settings.language;
	const dict = I18N[lang] ?? I18N['zh-cn'];
	const fn = dict[key] as (n: number) => string;
	return fn(n);
}

// Agent 图标映射（Lucide icon 名称）
const AGENT_ICONS: Record<string, string> = {
	claude: 'brain-circuit',
	codex: 'code-2',
	gemini: 'sparkles',
	'cursor-agent': 'mouse-pointer-2',
	deepseek: 'search',
	aider: 'git-branch',
	opencode: 'terminal',
	qwen: 'bot',
	qoder: 'cpu',
};

export class LumiSlateSettingTab extends PluginSettingTab {
	plugin: LumiSlatePlugin;
	private currentTab: string = 'general';

	constructor(app: App, plugin: LumiSlatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		// 设置页打开时刷新 agent 列表（用户可能刚安装了新 CLI）
		refreshAgents();

		const { containerEl } = this;
		containerEl.empty();

		const p = this.plugin;
		containerEl.createEl('h2', { text: t(p, 'settingsTitle') });

		// Tab 导航
		const tabNav = containerEl.createEl('div', { cls: 'lumislate-settings-tabs' });
		const tabs = [
			{ id: 'general', label: t(p, 'tabGeneral'), icon: 'settings' },
			{ id: 'ai', label: t(p, 'tabAi'), icon: 'bot' },
		];
		for (const tab of tabs) {
			const btn = tabNav.createEl('button', {
				cls: `lumislate-settings-tab ${tab.id === this.currentTab ? 'active' : ''}`,
			});
			setIcon(btn.createSpan(), tab.icon);
			btn.appendText(' ' + tab.label);
			btn.addEventListener('click', () => {
				this.currentTab = tab.id;
				this.display();
			});
		}

		// Tab 内容区
		const contentEl = containerEl.createEl('div', { cls: 'lumislate-settings-content' });

		switch (this.currentTab) {
			case 'general':
				this.renderGeneralTab(contentEl);
				break;
			case 'ai':
				this.renderAiTab(contentEl);
				break;
		}
	}

	/** 常规设置 */
	private renderGeneralTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		// 语言设置
		new Setting(containerEl)
			.setName(t(p, 'language'))
			.setDesc(t(p, 'languageDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('zh-cn', t(p, 'langZhCn'));
				dropdown.addOption('en', t(p, 'langEn'));
				dropdown
					.setValue(p.settings.language)
					.onChange(async (value) => {
						p.settings.language = value as 'en' | 'zh-cn';
						await p.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName(t(p, 'defaultExportFolder'))
			.setDesc(t(p, 'defaultExportFolderDesc'))
			.addText((text) =>
				text
					.setPlaceholder(t(p, 'defaultExportFolderPlaceholder'))
					.setValue(p.settings.defaultExportFolder)
					.onChange(async (value) => {
						p.settings.defaultExportFolder = value.trim();
						await p.saveSettings();
					})
			);

			new Setting(containerEl)
				.setName(t(p, 'htmlDefaultSaveFolder'))
				.setDesc(t(p, 'htmlDefaultSaveFolderDesc'))
				.addText((text) =>
					text
						.setPlaceholder(t(p, 'htmlDefaultSaveFolderPlaceholder'))
						.setValue(p.settings.htmlDefaultSaveFolder)
						.onChange(async (value) => {
							p.settings.htmlDefaultSaveFolder = value.trim();
							await p.saveSettings();
						})
				);

		// ==== 自定义模式样式设置 ====
		containerEl.createEl('h3', { text: t(p, 'sectionCustomStyle'), cls: 'lumislate-settings-subsection-title' });

		new Setting(containerEl)
			.setName(t(p, 'customBaseFontSize'))
			.setDesc(t(p, 'customBaseFontSizeDesc'))
			.addSlider((slider) =>
				slider
					.setLimits(12, 24, 1)
					.setValue(p.settings.customBaseFontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						p.settings.customBaseFontSize = value;
						await p.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t(p, 'customTextColor'))
			.setDesc(t(p, 'customTextColorDesc'))
			.addText((text) =>
				text
					.setPlaceholder('#e2e8f0')
					.setValue(p.settings.customTextColor)
					.onChange(async (value) => {
						p.settings.customTextColor = value.trim() || '#e2e8f0';
						await p.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t(p, 'customFontFamily'))
			.setDesc(t(p, 'customFontFamilyDesc'))
			.addText((text) =>
				text
					.setPlaceholder('system-ui, -apple-system, sans-serif')
					.setValue(p.settings.customFontFamily)
					.onChange(async (value) => {
						p.settings.customFontFamily = value.trim() || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
						await p.saveSettings();
					})
			);
	}

	/** AI 设置 */
	private renderAiTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		// ==== 折叠区域 1：AI 接入配置 ====
		this.renderCollapsibleSection(containerEl, t(p, 'sectionAiAccess'), (el) => {
			new Setting(el)
				.setName(t(p, 'aiProvider'))
				.setDesc(t(p, 'aiProviderDesc'))
				.addDropdown((dropdown) => {
					dropdown
						.addOption('local', t(p, 'aiProviderLocal'))
						.addOption('http', t(p, 'aiProviderHttp'));
					dropdown
						.setValue(p.settings.aiProvider)
						.onChange(async (value) => {
							p.settings.aiProvider = value as 'local' | 'http';
							await p.saveSettings();
							this.display();
						});
				});

			new Setting(el)
				.setName(t(p, 'disableAiExtras'))
				.setDesc(t(p, 'disableAiExtrasDesc'))
				.addToggle((toggle) =>
					toggle
						.setValue(p.settings.disableAiExtras)
						.onChange(async (value) => {
							p.settings.disableAiExtras = value;
							await p.saveSettings();
						})
				);

			if (p.settings.aiProvider === 'local') {
				el.createEl('h3', { text: t(p, 'localAgentTitle') });

				this.renderAgentCards(el);

				new Setting(el)
					.setName(t(p, 'customBinPath'))
					.setDesc(t(p, 'customBinPathDesc'))
					.addText((text) =>
						text
							.setPlaceholder(t(p, 'customBinPathPlaceholder'))
							.setValue(p.settings.localAgentBinOverride)
							.onChange(async (value) => {
								p.settings.localAgentBinOverride = value.trim();
								await p.saveSettings();
							})
					);

				new Setting(el)
					.setName(t(p, 'redetect'))
					.setDesc(t(p, 'redetectDesc'))
					.addButton((btn) => {
						btn.setButtonText(t(p, 'redetectBtn'));
						btn.onClick(() => {
							p.detectLocalAgents();
							this.display();
						});
					});

				new Setting(el)
					.setName(t(p, 'testConnection'))
					.setDesc(t(p, 'testConnectionDesc'))
					.addButton((btn) => {
						btn.setButtonText(t(p, 'testConnectionBtn'));
						btn.onClick(async () => {
							const agent = detectAgent(p.settings.localAgent);
							if (agent?.available) {
								new Notice(`${t(p, 'connectionOk')}: ${agent.label}`);
							} else {
								new Notice(`${t(p, 'connectionFailed')}: ${p.settings.localAgent || '未选择 Agent'}`);
							}
						});
					});
			}

			if (p.settings.aiProvider === 'http') {
				el.createEl('h3', { text: t(p, 'httpApiTitle') });

				new Setting(el)
					.setName(t(p, 'apiBaseUrl'))
					.setDesc(t(p, 'apiBaseUrlDesc'))
					.addText((text) =>
						text
							.setPlaceholder('https://api.moonshot.cn/v1/chat/completions')
							.setValue(p.settings.apiBaseUrl)
							.onChange(async (value) => {
								p.settings.apiBaseUrl = value.trim();
								await p.saveSettings();
							})
					);

				new Setting(el)
					.setName(t(p, 'apiKey'))
					.setDesc(t(p, 'apiKeyDesc'))
					.addText((text) => {
						text.inputEl.type = 'password';
						text
							.setPlaceholder('sk-...')
							.setValue(p.settings.apiKey)
							.onChange(async (value) => {
								p.settings.apiKey = value.trim();
								await p.saveSettings();
							});
					});

				new Setting(el)
					.setName(t(p, 'model'))
					.setDesc(t(p, 'modelDesc'))
					.addText((text) =>
						text
							.setPlaceholder('kimi-latest')
							.setValue(p.settings.model)
							.onChange(async (value) => {
								p.settings.model = value.trim();
								await p.saveSettings();
							})
					);

				el.createEl('h4', { text: t(p, 'apiRefTitle') });
				const ref = el.createEl('ul');
				ref.createEl('li', { text: 'Kimi: https://api.moonshot.cn/v1/chat/completions' });
				ref.createEl('li', { text: 'DeepSeek: https://api.deepseek.com/v1/chat/completions' });
				ref.createEl('li', { text: 'OpenRouter: https://openrouter.ai/api/v1/chat/completions' });
				ref.createEl('li', { text: 'SiliconFlow: https://api.siliconflow.cn/v1/chat/completions' });

				new Setting(el)
					.setName(t(p, 'testConnection'))
					.setDesc(t(p, 'testConnectionDesc'))
					.addButton((btn) => {
						btn.setButtonText(t(p, 'testConnectionBtn'));
						btn.onClick(async () => {
							const result = await testHttpConnection({
								apiKey: p.settings.apiKey,
								baseURL: p.settings.apiBaseUrl,
								model: p.settings.model,
							});
							if (result.success) {
								new Notice(t(p, 'connectionOk'));
							} else {
								new Notice(`${t(p, 'connectionFailed')}: ${result.message}`);
							}
						});
					});
			}
		}, true);

		// ==== 折叠区域 2：系统提示词设置 ====
		this.renderCollapsibleSection(containerEl, t(p, 'sectionSystemPrompts'), (el) => {
			el.createEl('h3', { text: t(p, 'cssDesignTitle'), cls: 'lumislate-settings-subsection-title' });
			el.createEl('p', {
				text: t(p, 'cssDesignDesc'),
				cls: 'setting-item-description',
			});

			this.renderSystemPromptBlock(el, {
				label: t(p, 'cssDesignTitle'),
				getValue: () => p.settings.cssSystemPrompt,
				setValue: (v) => { p.settings.cssSystemPrompt = v; },
				defaultValue: DEFAULT_CSS_SYSTEM_PROMPT,
			});
		}, false);
	}

	/** 渲染单个系统提示词编辑块 */
	private renderSystemPromptBlock(
		containerEl: HTMLElement,
		options: {
			label: string;
			getValue: () => string;
			setValue: (v: string) => void;
			defaultValue: string;
		}
	): void {
		const p = this.plugin;
		const block = containerEl.createEl('div', { cls: 'lumislate-system-prompt-block' });

		// 标签
		block.createEl('div', { text: options.label, cls: 'lumislate-system-prompt-label' });

		// 文本输入框
		const textAreaEl = block.createEl('textarea', {
			cls: 'lumislate-system-prompt-textarea',
		});
		textAreaEl.value = options.getValue();
		textAreaEl.rows = 8;
		textAreaEl.style.width = '100%';
		textAreaEl.style.fontFamily = 'var(--font-monospace)';

		// 使用 Skill（预留，disabled）
		const skillRow = block.createEl('div', { cls: 'lumislate-system-prompt-skill-row' });
		skillRow.createEl('span', { text: t(p, 'useSkillLabel') + '：', cls: 'lumislate-system-prompt-skill-label' });
		const skillSelect = skillRow.createEl('select', { cls: 'lumislate-system-prompt-skill-select' });
		skillSelect.disabled = true;
		const opt = skillSelect.createEl('option');
		opt.text = t(p, 'useSkillPlaceholder');
		opt.value = '';

		// 按钮行
		const btnRow = block.createEl('div', { cls: 'lumislate-system-prompt-btn-row' });

		const saveBtn = btnRow.createEl('button', { text: t(p, 'btnSave') });
		saveBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
		saveBtn.addEventListener('click', async () => {
			options.setValue(textAreaEl.value.trim());
			await p.saveSettings();
			new Notice(t(p, 'promptSaved'));
		});

		const resetBtn = btnRow.createEl('button', { text: t(p, 'btnReset') });
		resetBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
		resetBtn.addEventListener('click', () => {
			textAreaEl.value = options.defaultValue;
			options.setValue(options.defaultValue);
			p.saveSettings();
			new Notice(t(p, 'promptReset'));
		});
	}

	/** 渲染可折叠区域 */
	private renderCollapsibleSection(
		containerEl: HTMLElement,
		title: string,
		renderContent: (el: HTMLElement) => void,
		defaultExpanded: boolean = false
	): void {
		const section = containerEl.createEl('div', { cls: 'lumislate-collapsible-section' });
		if (defaultExpanded) {
			section.classList.add('expanded');
		}

		const header = section.createEl('div', { cls: 'lumislate-collapsible-header' });
		const icon = header.createEl('span', { cls: 'lumislate-collapsible-icon' });
		setIcon(icon, defaultExpanded ? 'chevron-down' : 'chevron-right');
		header.createEl('span', { cls: 'lumislate-collapsible-title', text: title });

		const content = section.createEl('div', { cls: 'lumislate-collapsible-content' });
		if (!defaultExpanded) {
			content.style.display = 'none';
		}

		header.addEventListener('click', () => {
			const isExpanded = content.style.display !== 'none';
			content.style.display = isExpanded ? 'none' : 'block';
			setIcon(icon, isExpanded ? 'chevron-right' : 'chevron-down');
			section.classList.toggle('expanded', !isExpanded);
		});

		renderContent(content);
	}

	/** 渲染本地 Agent 图形化卡片网格 */
	private renderAgentCards(containerEl: HTMLElement): void {
		const p = this.plugin;
		const detected = detectAgents();
		const available = detected.filter((a) => a.available);

		// 状态摘要
		const summaryEl = containerEl.createEl('div', { cls: 'lumislate-agent-summary' });
		if (available.length === 0) {
			summaryEl.createEl('p', {
				text: `${t(p, 'noAgentDetected')}claude、codex、gemini、cursor-agent、deepseek、aider、opencode、qwen、qoder`,
				cls: 'lumislate-status-warning',
			});
		} else {
			summaryEl.createEl('p', {
				text: `${tf(p, 'agentDetected', available.length)}`,
				cls: 'lumislate-status-ok',
			});
		}

		// 卡片网格
		const gridEl = containerEl.createEl('div', { cls: 'lumislate-agent-grid' });

		for (const agent of detected) {
			const isSelected = p.settings.localAgent === agent.id;
			const card = gridEl.createEl('div', {
				cls: `lumislate-agent-card ${agent.available ? 'available' : 'unavailable'} ${isSelected ? 'selected' : ''}`,
			});

			// 图标区域
			const iconWrap = card.createEl('div', { cls: 'lumislate-agent-card-icon' });
			const iconName = AGENT_ICONS[agent.id] ?? 'terminal';
			setIcon(iconWrap, iconName);

			// 信息区域
			const info = card.createEl('div', { cls: 'lumislate-agent-card-info' });
			const header = info.createEl('div', { cls: 'lumislate-agent-card-header' });
			header.createEl('span', { cls: 'lumislate-agent-card-name', text: agent.label });

			// 状态标签
			const badge = header.createEl('span', {
				cls: `lumislate-agent-card-badge ${agent.available ? 'ok' : 'missing'}`,
				text: agent.available ? t(p, 'agentAvailable') : t(p, 'agentUnavailable'),
			});

			// 厂商
			info.createEl('div', {
				cls: 'lumislate-agent-card-vendor',
				text: `${t(p, 'agentVendor')}: ${agent.vendor}`,
			});

			// 路径（仅可用时显示）
			if (agent.available && agent.path) {
				info.createEl('div', {
					cls: 'lumislate-agent-card-path',
					text: `${t(p, 'agentPath')}: ${agent.path}`,
				});
			}

			// 选中指示
			if (isSelected) {
				const selectedMark = card.createEl('div', { cls: 'lumislate-agent-card-selected' });
				setIcon(selectedMark, 'check-circle-2');
			}

			// 交互：点击选择
			if (agent.available) {
				card.style.cursor = 'pointer';
				card.title = t(p, 'agentClickToSelect');
				card.addEventListener('click', async () => {
					p.settings.localAgent = agent.id;
					await p.saveSettings();
					this.display();
				});
			} else {
				card.style.cursor = 'not-allowed';
				card.style.opacity = '0.55';
			}
		}
	}
}
