import { App, PluginSettingTab, Setting } from 'obsidian';
import type LumiSlatePlugin from './main';
import { SKILLS, MODES, type Mode } from './skills';
import { getAvailableAgents, detectAgents, type DetectedAgent } from './local_agent';

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
}

const DEFAULT_PREPROCESS_PROMPTS: Record<string, string> = {
	marp: '请确保 Markdown 中的 --- 分页符格式正确，清理多余的空行，保证每个幻灯片页面内容清晰。',
	'blog-post': '规范标题层级（只保留一个 H1），清理多余空行，标准化列表缩进，优化长文阅读结构。',
	'saas-landing': '规范标题层级，清理多余空行，标准化列表缩进，确保各 section 结构清晰可映射。',
};

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
};

export class LumiSlateSettingTab extends PluginSettingTab {
	plugin: LumiSlatePlugin;

	constructor(app: App, plugin: LumiSlatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'LumiSlate 设置' });

		// ========== AI 接入方式 ==========
		containerEl.createEl('h3', { text: 'AI 接入方式' });

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
						this.display(); // 刷新显示相关设置
					});
			});

		// ========== 本地 CLI 配置 ==========
		if (this.plugin.settings.aiProvider === 'local') {
			containerEl.createEl('h3', { text: '本地 CLI Agent' });

			// 检测状态
			this.renderAgentDetectionStatus(containerEl);

			// Agent 选择
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

			// 自定义二进制路径
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

			// 重新检测按钮
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

		// ========== HTTP API 配置 ==========
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

		// ========== 工作模式 ==========
		containerEl.createEl('h3', { text: '工作模式' });

		new Setting(containerEl)
			.setName('默认模式')
			.setDesc('Marp 模式用于生成幻灯片，Design 模式用于美化排版')
			.addDropdown((dropdown) => {
				for (const mode of MODES) {
					dropdown.addOption(mode.id, `${mode.emoji} ${mode.name}`);
				}
				dropdown
					.setValue(this.plugin.settings.defaultMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultMode = value as Mode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Design 模式下才显示 SKILL 选择
		if (this.plugin.settings.defaultMode === 'design') {
			new Setting(containerEl)
				.setName('默认 SKILL')
				.setDesc('AI 渲染时默认使用的排版模板')
				.addDropdown((dropdown) => {
					for (const skill of SKILLS) {
						dropdown.addOption(skill.id, `${skill.emoji} ${skill.name}`);
					}
					dropdown
						.setValue(this.plugin.settings.defaultSkill)
						.onChange(async (value) => {
							this.plugin.settings.defaultSkill = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// ========== 导出设置 ==========
		containerEl.createEl('h3', { text: '导出设置' });

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

		// ========== 预处理设置 ==========
		containerEl.createEl('h3', { text: '文本预处理' });
		containerEl.createEl('p', {
			text: '为每种模式 / SKILL 自定义预处理说明。预处理在 AI 渲染前执行，用于优化 Markdown 结构。',
			cls: 'setting-item-description',
		});

		// Marp 预处理 prompt
		this.renderPreprocessSetting(containerEl, 'marp', 'Marp 幻灯片');

		// Design 各 skill 的预处理 prompt
		for (const skill of SKILLS) {
			this.renderPreprocessSetting(containerEl, skill.id, `${skill.emoji} ${skill.name}`);
		}
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
