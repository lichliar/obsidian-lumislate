import { App, PluginSettingTab, Setting, setIcon, Notice, Modal } from 'obsidian';
import type LumiSlatePlugin from '../core/main';
import { SKILLS, MODES, type Mode } from '../ai/skills';
import { getAvailableAgents, detectAgents, type DetectedAgent } from '../ai/local_agent';

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
}

const DEFAULT_PREPROCESS_PROMPTS: Record<string, string> = {
	marp: '请确保 Markdown 中的 --- 分页符格式正确，清理多余的空行，保证每个幻灯片页面内容清晰。',
	'blog-post': '规范标题层级（只保留一个 H1），清理多余空行，标准化列表缩进，优化长文阅读结构。',
	'saas-landing': '规范标题层级，清理多余空行，标准化列表缩进，确保各 section 结构清晰可映射。',
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

		containerEl.createEl('h2', { text: 'LumiSlate 设置' });

		// Tab 导航
		const tabNav = containerEl.createEl('div', { cls: 'lumislate-settings-tabs' });
		const tabs = [
			{ id: 'general', label: '常规', icon: 'settings' },
			{ id: 'ai', label: 'AI 接入', icon: 'bot' },
			{ id: 'advanced', label: '高级', icon: 'sliders-horizontal' },
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
			case 'advanced':
				this.renderAdvancedTab(contentEl);
				break;
		}
	}

	/** 常规设置 */
	private renderGeneralTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('默认模式')
			.setDesc('Marp 模式用于生成幻灯片，Design 模式用于美化排版')
			.addDropdown((dropdown) => {
				for (const mode of MODES) {
					dropdown.addOption(mode.id, mode.name);
				}
				dropdown
					.setValue(this.plugin.settings.defaultMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultMode = value as Mode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.defaultMode === 'design') {
			new Setting(containerEl)
				.setName('默认 SKILL')
				.setDesc('AI 渲染时默认使用的排版模板')
				.addDropdown((dropdown) => {
					for (const skill of SKILLS) {
						dropdown.addOption(skill.id, skill.name);
					}
					dropdown
						.setValue(this.plugin.settings.defaultSkill)
						.onChange(async (value) => {
							this.plugin.settings.defaultSkill = value;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName('默认导出目录')
			.setDesc('保存 HTML 到 Vault 时的默认文件夹路径（相对 Vault 根目录），留空则使用当前笔记所在目录')
			.addText((text) =>
				text
					.setPlaceholder('例如: exports')
					.setValue(this.plugin.settings.defaultExportFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultExportFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}

	/** AI 接入设置 */
	private renderAiTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('首选接入方式')
			.setDesc('优先使用本地 CLI Agent（如已安装），或回退到 HTTP API')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('local', '本地 CLI Agent（优先）')
					.addOption('http', 'HTTP API');
				dropdown
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async (value) => {
						this.plugin.settings.aiProvider = value as 'local' | 'http';
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.aiProvider === 'local') {
			containerEl.createEl('h3', { text: '本地 CLI Agent' });

			this.renderAgentDetectionStatus(containerEl);

			const available = getAvailableAgents();
			new Setting(containerEl)
				.setName('选择 Agent')
				.setDesc('选择要使用的本地 CLI 工具')
				.addDropdown((dropdown) => {
					dropdown.addOption('', '-- 未选择 --');
					for (const agent of available) {
						dropdown.addOption(agent.id, `${agent.label} (${agent.vendor})`);
					}
					dropdown
						.setValue(this.plugin.settings.localAgent)
						.onChange(async (value) => {
							this.plugin.settings.localAgent = value;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('自定义二进制路径')
				.setDesc('如果 Agent 不在 PATH 中，可指定绝对路径')
				.addText((text) =>
					text
						.setPlaceholder('留空则自动检测 PATH')
						.setValue(this.plugin.settings.localAgentBinOverride)
						.onChange(async (value) => {
							this.plugin.settings.localAgentBinOverride = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('重新检测')
				.setDesc('点击重新扫描本地安装的 CLI 工具')
				.addButton((btn) => {
					btn.setButtonText('重新检测');
					btn.onClick(() => {
						this.plugin.detectLocalAgents();
						this.display();
					});
				});
		}

		if (this.plugin.settings.aiProvider === 'http') {
			containerEl.createEl('h3', { text: 'HTTP API 配置' });

			new Setting(containerEl)
				.setName('API Base URL')
				.setDesc('OpenAI 兼容格式的完整请求地址')
				.addText((text) =>
					text
						.setPlaceholder('https://api.moonshot.cn/v1/chat/completions')
						.setValue(this.plugin.settings.apiBaseUrl)
						.onChange(async (value) => {
							this.plugin.settings.apiBaseUrl = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName('API Key')
				.setDesc('你的 API 密钥')
				.addText((text) => {
					text.inputEl.type = 'password';
					text
						.setPlaceholder('sk-...')
						.setValue(this.plugin.settings.apiKey)
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value.trim();
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('模型')
				.setDesc('使用的模型 ID')
				.addText((text) =>
					text
						.setPlaceholder('kimi-latest')
						.setValue(this.plugin.settings.model)
						.onChange(async (value) => {
							this.plugin.settings.model = value.trim();
							await this.plugin.saveSettings();
						})
				);

			containerEl.createEl('h4', { text: '常用 API 配置参考' });
			const ref = containerEl.createEl('ul');
			ref.createEl('li', { text: 'Kimi: https://api.moonshot.cn/v1/chat/completions' });
			ref.createEl('li', { text: 'DeepSeek: https://api.deepseek.com/v1/chat/completions' });
			ref.createEl('li', { text: 'OpenRouter: https://openrouter.ai/api/v1/chat/completions' });
			ref.createEl('li', { text: 'SiliconFlow: https://api.siliconflow.cn/v1/chat/completions' });
		}

		// CSS 系统提示词文件管理
		containerEl.createEl('h3', { text: '自定义模式 CSS 系统提示词' });
		containerEl.createEl('p', {
			text: '系统提示词以 JSON 文件形式存储在插件目录中。点击按钮在 Obsidian 中打开编辑。修改保存后，下次打开 CSS 编辑器时生效。',
			cls: 'setting-item-description',
		});

		const openPromptBtn = containerEl.createEl('button', { text: '打开提示词文件' });
		openPromptBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
		openPromptBtn.style.marginBottom = '16px';
		openPromptBtn.addEventListener('click', () => {
			this.plugin.openCssSystemPromptFile();
		});
	}

	/** 高级设置 */
	private renderAdvancedTab(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '文本预处理' });
		containerEl.createEl('p', {
			text: '为每种模式 / SKILL 自定义预处理说明。预处理在 AI 渲染前执行，用于优化 Markdown 结构。',
			cls: 'setting-item-description',
		});

		this.renderPreprocessSetting(containerEl, 'marp', 'Marp 幻灯片');

		for (const skill of SKILLS) {
			this.renderPreprocessSetting(containerEl, skill.id, skill.name);
		}

		containerEl.createEl('h3', { text: 'Marp CSS 预设' });
		containerEl.createEl('p', {
			text: '管理 Marp 幻灯片的 CSS 预设样式，可在 CSS 编辑弹窗中快速应用。',
			cls: 'setting-item-description',
		});

		const presetList = containerEl.createEl('div');
		this.renderCssPresetList(presetList);
	}

	/** 渲染 CSS 预设列表 */
	private renderCssPresetList(containerEl: HTMLElement): void {
		containerEl.empty();
		const presets = this.plugin.settings.marpCssPresets;

		if (presets.length === 0) {
			containerEl.createEl('p', { text: '暂无预设', cls: 'setting-item-description' });
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
				this.plugin.settings.marpCssPresets[i].name = nameInput.value;
				await this.plugin.saveSettings();
			});

			const cssBtn = row.createEl('button', { text: '编辑 CSS' });
			cssBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
			cssBtn.addEventListener('click', () => {
				const modal = new Modal(this.app);
				modal.setTitle(`编辑预设: ${preset.name}`);
				const wrap = modal.contentEl.createEl('div');
				const ta = wrap.createEl('textarea');
				ta.value = preset.css;
				ta.rows = 8;
				ta.style.width = '100%';
				ta.style.fontFamily = 'monospace';
				const btnWrap = wrap.createEl('div', { cls: 'lumislate-modal-buttons' });
				const saveBtn = btnWrap.createEl('button', { text: '保存' });
				saveBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
				saveBtn.addEventListener('click', async () => {
					this.plugin.settings.marpCssPresets[i].css = ta.value;
					await this.plugin.saveSettings();
					modal.close();
					new Notice('CSS 预设已更新');
				});
				const cancelBtn = btnWrap.createEl('button', { text: '取消' });
				cancelBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
				cancelBtn.addEventListener('click', () => modal.close());
				modal.open();
			});

			const delBtn = row.createEl('button');
			setIcon(delBtn, 'trash-2');
			delBtn.addClass('lumislate-btn', 'lumislate-btn-ghost');
			delBtn.addEventListener('click', async () => {
				this.plugin.settings.marpCssPresets.splice(i, 1);
				await this.plugin.saveSettings();
				this.renderCssPresetList(containerEl);
			});
		}

		const addBtn = containerEl.createEl('button', { text: '+ 添加新预设' });
		addBtn.addClass('lumislate-btn', 'lumislate-btn-primary');
		addBtn.style.marginTop = '8px';
		addBtn.addEventListener('click', async () => {
			this.plugin.settings.marpCssPresets.push({ name: '新预设', css: 'section { background: #0f172a; color: #e2e8f0; }' });
			await this.plugin.saveSettings();
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

	/** 渲染本地 agent 检测状态 */
	private renderAgentDetectionStatus(containerEl: HTMLElement): void {
		const detected = detectAgents();
		const available = detected.filter((a) => a.available);

		const statusEl = containerEl.createEl('div', { cls: 'lumislate-agent-status' });

		if (available.length === 0) {
			statusEl.createEl('p', {
				text: '未检测到任何本地 CLI Agent。支持的工具有：claude、codex、gemini、cursor-agent、deepseek、aider、opencode、qwen、qoder',
				cls: 'lumislate-status-warning',
			});
		} else {
			statusEl.createEl('p', {
				text: `检测到 ${available.length} 个可用 Agent：`,
				cls: 'lumislate-status-ok',
			});
			const list = statusEl.createEl('ul');
			for (const agent of available) {
				const li = list.createEl('li');
				li.createEl('code', { text: agent.resolvedBin ?? agent.bin });
				li.appendText(` → ${agent.label} (${agent.path})`);
			}
		}

		// 显示未检测到的
		const unavailable = detected.filter((a) => !a.available);
		if (unavailable.length > 0) {
			const details = statusEl.createEl('details');
			details.createEl('summary', { text: `未检测到 (${unavailable.length})` });
			const ul = details.createEl('ul');
			for (const agent of unavailable) {
				ul.createEl('li', { text: `${agent.label} (${agent.bin})` });
			}
		}
	}
}
