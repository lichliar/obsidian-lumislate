import { App, Modal, ButtonComponent, setIcon } from 'obsidian';
import type { Skill } from '../ai/skills';

export type ExportType = 'html-download' | 'png-download' | 'html-vault';

/**
 * 导出菜单弹窗
 * 显示导出选项：下载 HTML / 下载 PNG / 保存到 Vault
 */
export class ExportMenuModal extends Modal {
	constructor(
		app: App,
		private onExport: (type: ExportType) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: '导出' });

		const menu = contentEl.createEl('div', { cls: 'lumislate-export-menu' });

		this.createMenuItem(menu, 'file-code', '下载 HTML', '下载为单文件 HTML', () => {
			this.onExport('html-download');
			this.close();
		});

		this.createMenuItem(menu, 'image', '下载 PNG', '导出为高清图片', () => {
			this.onExport('png-download');
			this.close();
		});

		this.createMenuItem(menu, 'save', '保存到 Vault', '保存 HTML 到 Obsidian 仓库', () => {
			this.onExport('html-vault');
			this.close();
		});
	}

	private createMenuItem(
		container: HTMLElement,
		icon: string,
		title: string,
		desc: string,
		onClick: () => void
	): void {
		const item = container.createEl('div', { cls: 'lumislate-export-item' });
		const titleEl = item.createEl('div', { cls: 'lumislate-export-item-title' });
		setIcon(titleEl.createSpan(), icon);
		titleEl.appendText(' ' + title);
		item.createEl('div', { cls: 'lumislate-export-item-desc', text: desc });
		item.addEventListener('click', onClick);
	}
}

/** 分类标签中文映射 */
function getCategoryLabel(category: string): string {
	const map: Record<string, string> = {
		article: '文章',
		prototype: '原型',
	};
	return map[category] || category;
}

/**
 * Skill Gallery 模态框
 * 以卡片网格形式展示所有可用 Design Skills，供用户直观选择
 */
export class SkillGalleryModal extends Modal {
	constructor(
		app: App,
		private skills: Skill[],
		private currentSkillId: string,
		private onSelect: (skillId: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lumislate-skill-gallery-modal');

		// 扩大模态框宽度以容纳网格
		this.modalEl.style.maxWidth = '720px';

		contentEl.createEl('h3', {
			text: '选择设计样式',
			cls: 'lumislate-skill-gallery-title',
		});
		contentEl.createEl('p', {
			text: '选择一种设计模板，AI 将根据你的 Markdown 内容生成对应风格的 HTML 页面。',
			cls: 'lumislate-skill-gallery-subtitle',
		});

		const grid = contentEl.createEl('div', { cls: 'lumislate-skill-grid' });

		for (const skill of this.skills) {
			const isActive = skill.id === this.currentSkillId;
			const card = grid.createEl('div', {
				cls: `lumislate-skill-card${isActive ? ' active' : ''}`,
			});

			const iconWrap = card.createEl('div', { cls: 'lumislate-skill-card-icon' });
			setIcon(iconWrap, skill.icon);

			card.createEl('div', {
				cls: 'lumislate-skill-card-name',
				text: skill.name,
			});

			if (skill.description) {
				card.createEl('div', {
					cls: 'lumislate-skill-card-desc',
					text: skill.description,
				});
			}

			card.createEl('div', {
				cls: 'lumislate-skill-card-badge',
				text: getCategoryLabel(skill.category),
			});

			card.addEventListener('click', () => {
				this.onSelect(skill.id);
				this.close();
			});
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
