import { App, Modal, ButtonComponent, setIcon } from 'obsidian';

export type PreprocessChoice = 'preprocess' | 'direct' | 'cancel';

/**
 * 预处理确认弹窗
 * 当用户点击 AI 渲染但笔记未预处理时弹出
 */
export class PreprocessConfirmModal extends Modal {
	private choice: PreprocessChoice = 'cancel';
	private resolved = false;

	constructor(
		app: App,
		private skillName: string,
		private preprocessedFileName: string,
		private onChoose: (choice: PreprocessChoice) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: '文本预处理' });
		contentEl.createEl('p', {
			text: `当前笔记尚未针对「${this.skillName}」进行预处理。`,
		});
		contentEl.createEl('p', {
			text: `预处理会优化 Markdown 结构（规范化标题层级、清理多余空行、标准化列表缩进），以提高 AI 渲染质量。预处理后将在同目录创建「${this.preprocessedFileName}」，不会修改原始文件。`,
		});

		const buttonContainer = contentEl.createEl('div', {
			cls: 'lumislate-modal-buttons',
		});

		new ButtonComponent(buttonContainer)
			.setButtonText('预处理并渲染')
			.setCta()
			.onClick(() => {
				this.choice = 'preprocess';
				this.resolved = true;
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('直接渲染（不推荐）')
			.onClick(() => {
				this.choice = 'direct';
				this.resolved = true;
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('取消')
			.onClick(() => {
				this.choice = 'cancel';
				this.resolved = true;
				this.close();
			});
	}

	onClose(): void {
		if (!this.resolved) {
			this.choice = 'cancel';
		}
		this.onChoose(this.choice);
	}
}

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
