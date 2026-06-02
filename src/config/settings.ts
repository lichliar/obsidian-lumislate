import { App, PluginSettingTab, Setting, setIcon, Notice, Modal } from 'obsidian';
import type LumiSlatePlugin from '../core/main';
import { SKILLS, MODES, type Mode } from '../ai/skills';
import { detectAgents } from '../ai/local_agent';

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
	/** 各 mode / skill 对应的预处理 prompt，key 为 modeId 或 skillId */
	preprocessPrompts: Record<string, string>;
	/** Marp CSS 预设列表 */
	marpCssPresets: Array<{ name: string; css: string }>;
	/** 界面主题 */
	theme: 'light' | 'dark' | 'system' | 'custom';
	/** 自定义主题主色 */
	customThemePrimary: string;
	/** 界面语言 */
	language: 'en' | 'zh-cn';
	/** 禁用 AI 输出中的 insight / thinking / analysis 等额外标记 */
	disableAiExtras: boolean;
}

const DEFAULT_PREPROCESS_PROMPTS: Record<string, string> = {
	marp: '请确保 Markdown 中的 --- 分页符格式正确，清理多余的空行，保证每个幻灯片页面内容清晰。',
};

/** 默认 CSS 系统提示词（用于 AI 辅助 CSS 编辑） */
export const DEFAULT_CSS_SYSTEM_PROMPT = `## LumiSlate CSS 架构规范（必须遵守）

### 1. 选择器规范
- 幻灯片本体用 \`section\` 选择器设置视觉样式
- **不要使用 \`.slide\`**：这是插件布局引擎的保留类，对其设置样式会被强制覆盖或无效
- 子元素用 \`section h1\`、\`section p\`、\`section ul\`、\`section .callout\` 等

### 2. 不可覆盖的规则（插件强制，用户 CSS 中设置无效）
以下属性由插件强制执行，请勿在输出中依赖它们：
- \`.slide\` 的 \`width\` / \`height\` —— 由 frontmatter \`size\` 字段控制（16:9=1280x720, 4:3=1024x768, 1:1=800x800）
- \`.slide\` 的 \`transform-origin: 0 0\` —— 缩放算法的锚点
- \`.slide\` 的 \`position: relative\`、\`flex-shrink: 0\`、\`overflow: visible\`
- \`#marp-deck\` 和 \`.slide-wrapper\` 的 flex 布局结构

### 3. 可自由覆盖的基础样式
- 幻灯片整体：background、color、font-family、padding、border-radius、box-shadow、border
- 标题：font-size、color、margin、font-weight
- 段落：margin、color、font-size、line-height
- 列表：margin、color、list-style-type
- 表格：border、background、color、padding
- 引用块：border-left、color、background
- 页码：\`.slide-paginate\` 的 font-size、color、opacity

### 4. CSS 变量覆盖
插件在 :root 中定义 \`--ls-*\` 系列变量，可覆盖它们改变全局默认值：
- \`--ls-body-bg\` / \`--ls-body-color\`：页面背景/文字色
- \`--ls-slide-bg\` / \`--ls-slide-radius\` / \`--ls-slide-padding\`：幻灯片样式
- \`--ls-h1-size\` / \`--ls-h1-weight\` / \`--ls-h1-margin\`：H1 样式（同理 H2/H3）

### 5. 代码块样式
渲染为 \`<pre>\` 包裹 \`<code>\` 的结构。选择器：\`section pre\`、\`section pre code\`（块级）、\`section code\`（行内）。
推荐：与幻灯片背景形成对比的深色背景、等宽字体、圆角、适当 padding。控制 max-height 防止溢出幻灯片。

### 6. 图片样式
插件已为图片提供基础样式（max-width: 100%、圆角等），你只需覆盖视觉效果：
- 单图：\`section img\`，可覆盖 border-radius、box-shadow
- 双图并排：父容器 flex + gap，子元素各约 48% 宽度
- 多图网格：grid 布局（如 3 列），图片固定高度 + object-fit: cover
- 图片不要超出幻灯片边界，必要时限制 max-height（如 45%）
- 深色背景下，白边图片可通过 border 或 background 过渡

### 7. 巨量长数据表格防截断
列数多或行数多时容易溢出幻灯片：
- **优先策略**：缩小字体（如 0.7rem）和 cell padding，表格 width: 100% + table-layout: fixed
- 仍溢出时：用 \`transform: scale(0.85)\` 整体缩放（transform-origin: top left）
- 表头固定 + 行交替色帮助阅读超长表格

### 8. Callout 样式
渲染为 \`<div class="callout callout-{type}">\`，内含 \`.callout-title\` 和 \`.callout-content\`。
类型包括 note/tip/warning/danger/question/example 等。推荐：左侧彩色边框 + 轻微背景，与整体风格协调。

### 9. Markdown 全语法样式要求（核心）
**你必须为所有主流 Markdown 语法提供精心设计的 CSS**，包括但不限于：
- **标准语法**：H1-H6、段落、粗体 \`<strong>\`、斜体 \`<em>\`、删除线 \`<del>\`、行内代码 \`<code>\`、代码块 \`<pre>\`、链接 \`<a>\`、无序/有序列表、表格、引用块 \`<blockquote>\`、水平线 \`<hr>\`
- **扩展语法**：高亮 \`<mark>\`（醒目背景色如黄色半透明 + 圆角 padding）、下划线 \`<u>\`（带颜色偏移的优雅下划线）、H4-H6（清晰字号层级，不可与正文同大小）、任务列表（CSS/SVG 绘制美观勾选框，已勾选可添加删除线效果）、数学公式（KaTeX 渲染，块级可加背景容器，确保深色/浅色背景都有足够对比度）

### 10. 输出要求
- 输出**完整**的 CSS 代码（含原有内容和你的修改）
- 不要添加 markdown 代码围栏（如 \`\`\`css\`）
- 不要包含任何解释性文字，只输出纯 CSS
- 保持代码整洁，适当缩进`;

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
	preprocessPrompts: { ...DEFAULT_PREPROCESS_PROMPTS },
	marpCssPresets: [
		{ name: '默认深色', css: 'section { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #e2e8f0; }' },
		{ name: '纯白简约', css: 'section { background: #ffffff; color: #1a1a1a; }' },
		{ name: '暖色渐变', css: 'section { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #e94560; }' },
	],
	theme: 'system',
	customThemePrimary: '#6366f1',
	language: 'zh-cn',
	disableAiExtras: true,
};

// ============================================================
// i18n 简单实现
// ============================================================

const I18N = {
	'zh-cn': {
		settingsTitle: 'LumiSlate 设置',
		tabGeneral: '常规',
		tabAppearance: '外观',
		tabAi: 'AI 接入',
		tabAdvanced: '高级',
		defaultMode: '默认模式',
		defaultModeDesc: 'Marp 模式用于生成幻灯片，Design 模式用于美化排版',
		defaultSkill: '默认 SKILL',
		defaultSkillDesc: 'AI 渲染时默认使用的排版模板',
		defaultExportFolder: '默认导出目录',
		defaultExportFolderDesc: '保存 HTML 到 Vault 时的默认文件夹路径（相对 Vault 根目录），留空则使用当前笔记所在目录',
		defaultExportFolderPlaceholder: '例如: exports',
		language: '界面语言',
		languageDesc: '选择插件界面的显示语言',
		langZhCn: '简体中文',
		langEn: 'English',
		theme: '主题',
		themeDesc: '选择插件界面的配色主题',
		themeLight: '浅色',
		themeDark: '深色',
		themeSystem: '跟随系统',
		themeCustom: '自定义',
		customThemePrimary: '自定义主色',
		customThemePrimaryDesc: '自定义主题下的强调色',
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
		disableAiExtras: '禁用 AI 额外输出',
		disableAiExtrasDesc: '开启后，AI 渲染时将禁止输出 insight、thinking、analysis 等额外标记，避免干扰 HTML 渲染',
		cssPromptTitle: '自定义模式 CSS 系统提示词',
		cssPromptDesc: '系统提示词以 JSON 文件形式存储在插件目录中。点击按钮在 Obsidian 中打开编辑。修改保存后，下次打开 CSS 编辑器时生效。',
		openPromptFile: '打开提示词文件',
		preprocessTitle: '文本预处理',
		preprocessDesc: '自定义模式的预处理配置（向后兼容）。实际预处理 Prompt 已内置在插件中，AI 模式不再使用预处理。',
		marpCssPresetsTitle: 'Marp CSS 预设',
		marpCssPresetsDesc: '管理 Marp 幻灯片的 CSS 预设样式，可在 CSS 编辑弹窗中快速应用。',
		noPresets: '暂无预设',
		editCss: '编辑 CSS',
		addPreset: '+ 添加新预设',
		presetUpdated: 'CSS 预设已更新',
		noAgentDetected: '未检测到任何本地 CLI Agent。支持的工具有：',
		agentDetected: (n: number) => `检测到 ${n} 个可用 Agent`,
		agentNotDetected: (n: number) => `未检测到 (${n})`,
		agentAvailable: '可用',
		agentUnavailable: '未安装',
		agentPath: '路径',
		agentVendor: '厂商',
		agentSelected: '已选中',
		agentClickToSelect: '点击选择',
	},
	en: {
		settingsTitle: 'LumiSlate Settings',
		tabGeneral: 'General',
		tabAppearance: 'Appearance',
		tabAi: 'AI Access',
		tabAdvanced: 'Advanced',
		defaultMode: 'Default Mode',
		defaultModeDesc: 'Marp mode for slides, Design mode for styled layouts',
		defaultSkill: 'Default SKILL',
		defaultSkillDesc: 'Default template for AI rendering',
		defaultExportFolder: 'Default Export Folder',
		defaultExportFolderDesc: 'Default folder for saving HTML to Vault (relative to Vault root). Leave empty to use current note directory.',
		defaultExportFolderPlaceholder: 'e.g. exports',
		language: 'Language',
		languageDesc: 'Select the plugin interface language',
		langZhCn: '简体中文',
		langEn: 'English',
		theme: 'Theme',
		themeDesc: 'Choose the plugin interface color theme',
		themeLight: 'Light',
		themeDark: 'Dark',
		themeSystem: 'System',
		themeCustom: 'Custom',
		customThemePrimary: 'Custom Primary Color',
		customThemePrimaryDesc: 'Accent color for custom theme',
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
		disableAiExtras: 'Disable AI Extra Output',
		disableAiExtrasDesc: 'When enabled, AI rendering will suppress insight, thinking, analysis, and other extra markers to avoid interfering with HTML rendering',
		cssPromptTitle: 'Custom Mode CSS System Prompt',
		cssPromptDesc: 'System prompts are stored as JSON in the plugin directory. Click to open and edit in Obsidian. Changes take effect next time the CSS editor opens.',
		openPromptFile: 'Open Prompt File',
		preprocessTitle: 'Text Preprocessing',
		preprocessDesc: 'Custom mode preprocessing config (backward compatible). Actual preprocess prompts are built into the plugin. AI mode no longer uses preprocessing.',
		marpCssPresetsTitle: 'Marp CSS Presets',
		marpCssPresetsDesc: 'Manage CSS preset styles for Marp slides, quickly applicable in the CSS editor.',
		noPresets: 'No presets',
		editCss: 'Edit CSS',
		addPreset: '+ Add New Preset',
		presetUpdated: 'CSS preset updated',
		noAgentDetected: 'No local CLI Agent detected. Supported tools: ',
		agentDetected: (n: number) => `${n} agent(s) available`,
		agentNotDetected: (n: number) => `Not detected (${n})`,
		agentAvailable: 'Available',
		agentUnavailable: 'Not installed',
		agentPath: 'Path',
		agentVendor: 'Vendor',
		agentSelected: 'Selected',
		agentClickToSelect: 'Click to select',
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
		const { containerEl } = this;
		containerEl.empty();

		const p = this.plugin;
		containerEl.createEl('h2', { text: t(p, 'settingsTitle') });

		// Tab 导航
		const tabNav = containerEl.createEl('div', { cls: 'lumislate-settings-tabs' });
		const tabs = [
			{ id: 'general', label: t(p, 'tabGeneral'), icon: 'settings' },
			{ id: 'appearance', label: t(p, 'tabAppearance'), icon: 'palette' },
			{ id: 'ai', label: t(p, 'tabAi'), icon: 'bot' },
			{ id: 'advanced', label: t(p, 'tabAdvanced'), icon: 'sliders-horizontal' },
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
			case 'appearance':
				this.renderAppearanceTab(contentEl);
				break;
			case 'ai':
				this.renderAiTab(contentEl);
				break;
			case 'advanced':
				this.renderAdvancedTab(contentEl);
				break;
		}
	}

	/** 常规设置 */
	private renderGeneralTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		new Setting(containerEl)
			.setName(t(p, 'defaultMode'))
			.setDesc(t(p, 'defaultModeDesc'))
			.addDropdown((dropdown) => {
				for (const mode of MODES) {
					dropdown.addOption(mode.id, mode.name);
				}
				dropdown
					.setValue(p.settings.defaultMode)
					.onChange(async (value) => {
						p.settings.defaultMode = value as Mode;
						await p.saveSettings();
						this.display();
					});
			});

		if (p.settings.defaultMode === 'design') {
			new Setting(containerEl)
				.setName(t(p, 'defaultSkill'))
				.setDesc(t(p, 'defaultSkillDesc'))
				.addDropdown((dropdown) => {
					for (const skill of SKILLS) {
						dropdown.addOption(skill.id, skill.name);
					}
					dropdown
						.setValue(p.settings.defaultSkill)
						.onChange(async (value) => {
							p.settings.defaultSkill = value;
							await p.saveSettings();
						});
				});
		}

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
	}

	/** 外观设置 */
	private renderAppearanceTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		new Setting(containerEl)
			.setName(t(p, 'theme'))
			.setDesc(t(p, 'themeDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('light', t(p, 'themeLight'));
				dropdown.addOption('dark', t(p, 'themeDark'));
				dropdown.addOption('system', t(p, 'themeSystem'));
				dropdown.addOption('custom', t(p, 'themeCustom'));
				dropdown
					.setValue(p.settings.theme)
					.onChange(async (value) => {
						p.settings.theme = value as 'light' | 'dark' | 'system' | 'custom';
						await p.saveSettings();
						this.applyTheme();
						this.display();
					});
			});

		if (p.settings.theme === 'custom') {
			new Setting(containerEl)
				.setName(t(p, 'customThemePrimary'))
				.setDesc(t(p, 'customThemePrimaryDesc'))
				.addText((text) => {
					text.inputEl.type = 'color';
					text
						.setValue(p.settings.customThemePrimary)
						.onChange(async (value) => {
							p.settings.customThemePrimary = value;
							await p.saveSettings();
							this.applyTheme();
						});
				});
		}
	}

	/** 应用主题到设置面板 */
	private applyTheme(): void {
		const { containerEl } = this;
		const theme = this.plugin.settings.theme;
		const isDark =
			theme === 'dark' ||
			(theme === 'system' &&
				window.matchMedia('(prefers-color-scheme: dark)').matches);

		containerEl.classList.remove('lumislate-theme-light', 'lumislate-theme-dark');
		if (theme === 'light' || (theme === 'system' && !isDark)) {
			containerEl.classList.add('lumislate-theme-light');
		} else if (theme === 'dark' || theme === 'system') {
			containerEl.classList.add('lumislate-theme-dark');
		}

		if (theme === 'custom') {
			containerEl.style.setProperty('--ls-custom-primary', this.plugin.settings.customThemePrimary);
		} else {
			containerEl.style.removeProperty('--ls-custom-primary');
		}
	}

	/** AI 接入设置 */
	private renderAiTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		new Setting(containerEl)
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

		new Setting(containerEl)
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
			containerEl.createEl('h3', { text: t(p, 'localAgentTitle') });

			this.renderAgentCards(containerEl);

			new Setting(containerEl)
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

			new Setting(containerEl)
				.setName(t(p, 'redetect'))
				.setDesc(t(p, 'redetectDesc'))
				.addButton((btn) => {
					btn.setButtonText(t(p, 'redetectBtn'));
					btn.onClick(() => {
						p.detectLocalAgents();
						this.display();
					});
				});
		}

		if (p.settings.aiProvider === 'http') {
			containerEl.createEl('h3', { text: t(p, 'httpApiTitle') });

			new Setting(containerEl)
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

			new Setting(containerEl)
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

			new Setting(containerEl)
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

			containerEl.createEl('h4', { text: t(p, 'apiRefTitle') });
			const ref = containerEl.createEl('ul');
			ref.createEl('li', { text: 'Kimi: https://api.moonshot.cn/v1/chat/completions' });
			ref.createEl('li', { text: 'DeepSeek: https://api.deepseek.com/v1/chat/completions' });
			ref.createEl('li', { text: 'OpenRouter: https://openrouter.ai/api/v1/chat/completions' });
			ref.createEl('li', { text: 'SiliconFlow: https://api.siliconflow.cn/v1/chat/completions' });
		}

		// CSS 系统提示词文件管理
		containerEl.createEl('h3', { text: t(p, 'cssPromptTitle') });
		containerEl.createEl('p', {
			text: t(p, 'cssPromptDesc'),
			cls: 'setting-item-description',
		});

		const openPromptBtn = containerEl.createEl('button', { text: t(p, 'openPromptFile') });
		openPromptBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
		openPromptBtn.style.marginBottom = '16px';
		openPromptBtn.addEventListener('click', () => {
			p.openCssSystemPromptFile();
		});
	}

	/** 高级设置 */
	private renderAdvancedTab(containerEl: HTMLElement): void {
		const p = this.plugin;

		// 自定义模式预处理提示词（向后兼容，实际 prompt 已内置在代码中）
		containerEl.createEl('h3', { text: t(p, 'preprocessTitle') });
		containerEl.createEl('p', {
			text: t(p, 'preprocessDesc'),
			cls: 'setting-item-description',
		});

		this.renderPreprocessSetting(containerEl, 'marp', '自定义模式');

		containerEl.createEl('h3', { text: t(p, 'marpCssPresetsTitle') });
		containerEl.createEl('p', {
			text: t(p, 'marpCssPresetsDesc'),
			cls: 'setting-item-description',
		});

		const presetList = containerEl.createEl('div');
		this.renderCssPresetList(presetList);
	}

	/** 渲染 CSS 预设列表 */
	private renderCssPresetList(containerEl: HTMLElement): void {
		containerEl.empty();
		const p = this.plugin;
		const presets = p.settings.marpCssPresets;

		if (presets.length === 0) {
			containerEl.createEl('p', { text: t(p, 'noPresets'), cls: 'setting-item-description' });
		}

		for (let i = 0; i < presets.length; i++) {
			const preset = presets[i];
			const row = containerEl.createEl('div', { cls: 'lumislate-preset-row' });
			row.style.display = 'flex';
			row.style.gap = '8px';
			row.style.alignItems = 'center';
			row.style.marginBottom = '8px';

			const nameInput = row.createEl('input');
			nameInput.type = 'text';
			nameInput.value = preset.name;
			nameInput.style.flex = '1';
			nameInput.addEventListener('change', async () => {
				p.settings.marpCssPresets[i].name = nameInput.value;
				await p.saveSettings();
			});

			const cssBtn = row.createEl('button', { text: t(p, 'editCss') });
			cssBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
			cssBtn.addEventListener('click', () => {
				const modal = new Modal(this.app);
				modal.setTitle(`${preset.name}`);
				const wrap = modal.contentEl.createEl('div');
				const ta = wrap.createEl('textarea');
				ta.value = preset.css;
				ta.rows = 8;
				ta.style.width = '100%';
				ta.style.fontFamily = 'monospace';
				const btnWrap = wrap.createEl('div', { cls: 'lumislate-modal-buttons' });
				const saveBtn = btnWrap.createEl('button', { text: 'Save' });
				saveBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
				saveBtn.addEventListener('click', async () => {
					p.settings.marpCssPresets[i].css = ta.value;
					await p.saveSettings();
					modal.close();
					new Notice(t(p, 'presetUpdated'));
				});
				const cancelBtn = btnWrap.createEl('button', { text: 'Cancel' });
				cancelBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
				cancelBtn.addEventListener('click', () => modal.close());
				modal.open();
			});

			const delBtn = row.createEl('button');
			setIcon(delBtn, 'trash-2');
			delBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
			delBtn.addEventListener('click', async () => {
				p.settings.marpCssPresets.splice(i, 1);
				await p.saveSettings();
				this.renderCssPresetList(containerEl);
			});
		}

		const addBtn = containerEl.createEl('button', { text: t(p, 'addPreset') });
		addBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
		addBtn.style.marginTop = '8px';
		addBtn.addEventListener('click', async () => {
			p.settings.marpCssPresets.push({ name: 'New Preset', css: 'section { background: #0f172a; color: #e2e8f0; }' });
			await p.saveSettings();
			this.renderCssPresetList(containerEl);
		});
	}

	/** 渲染单个预处理 prompt 设置项 */
	private renderPreprocessSetting(containerEl: HTMLElement, key: string, label: string): void {
		const current = this.plugin.settings.preprocessPrompts[key] ?? '';
		new Setting(containerEl)
			.setName(label)
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text.inputEl.style.width = '100%';
				text.setPlaceholder('输入预处理说明 prompt…')
					.setValue(current)
					.onChange(async (value) => {
						this.plugin.settings.preprocessPrompts[key] = value.trim();
						await this.plugin.saveSettings();
					});
			});
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
