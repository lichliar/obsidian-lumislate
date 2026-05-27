import { App } from 'obsidian';

export interface CacheMetadata {
	hash: string;
	theme: string;
	prompt: string;
	created: string;
}

/**
 * LumiSlate 缓存管理器
 * 负责将 AI 生成的 HTML 快照存储在插件目录下，与 Markdown 正文解耦
 */
export class CacheManager {
	private cacheDir: string;

	constructor(private app: App, pluginDir: string) {
		this.cacheDir = `${pluginDir}/cache`;
	}

	/** 确保缓存目录存在 */
	async ensureCacheDir(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.cacheDir))) {
			await adapter.mkdir(this.cacheDir);
		}
	}

	/** 根据笔记路径生成缓存文件路径 */
	private getCacheFilePath(notePath: string): string {
		const safeName = notePath.replace(/[\\/]/g, '_').replace(/\.md$/i, '');
		return `${this.cacheDir}/${safeName}.html`;
	}

	/** FNV-1a 哈希，用于校验缓存有效性 */
	private generateHash(content: string, prompt: string = ''): string {
		const str = content + '|' + prompt;
		let h = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
		}
		return (h >>> 0).toString(16).padStart(8, '0');
	}

	/** 解析缓存文件头部的元数据注释 */
	private parseCacheHeader(html: string): { metadata: CacheMetadata | null; body: string } {
		const match = html.match(/<!--\s*LUMISLATE-CACHE\s*\n([\s\S]*?)\n\s*-->/);
		if (!match) return { metadata: null, body: html };

		const metadata: Partial<CacheMetadata> = {};
		const lines = match[1].split('\n');
		for (const line of lines) {
			const idx = line.indexOf(':');
			if (idx > 0) {
				const key = line.slice(0, idx).trim();
				const value = line.slice(idx + 1).trim();
				(metadata as Record<string, string>)[key] = value;
			}
		}

		const body = html.slice(match[0].length).trimStart();
		return { metadata: metadata as CacheMetadata, body };
	}

	/** 构建缓存头部注释 */
	private buildCacheHeader(metadata: CacheMetadata): string {
		return `<!-- LUMISLATE-CACHE
hash: ${metadata.hash}
theme: ${metadata.theme}
prompt: ${metadata.prompt}
created: ${metadata.created}
-->`;
	}

	/** 从 frontmatter 原始文本中提取单个字段值 */
	private extractFrontmatterValue(frontmatter: string, key: string): string {
		const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
		const match = frontmatter.match(regex);
		if (!match) return '';
		return match[1].trim().replace(/^["']|["']$/g, '');
	}

	// ==================== 公开 API ====================

	/**
	 * 读取缓存
	 * @param notePath 笔记在 vault 中的相对路径
	 * @param currentContent 当前 Markdown 完整内容（用于哈希校验）
	 * @param prompt 设计指令（参与哈希校验）
	 * @returns 缓存的 HTML body（不含头部元数据），失效则返回 null
	 */
	async readCache(notePath: string, currentContent: string, prompt: string = ''): Promise<string | null> {
		const cachePath = this.getCacheFilePath(notePath);
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(cachePath))) return null;

		const html = await adapter.read(cachePath);
		const { metadata, body } = this.parseCacheHeader(html);

		if (!metadata) return null;

		const currentHash = this.generateHash(currentContent, prompt);
		if (metadata.hash !== currentHash) return null;

		return body;
	}

	/**
	 * 写入缓存
	 * @param notePath 笔记路径
	 * @param htmlBody 完整的 HTML 页面内容
	 * @param currentContent 当前 Markdown 内容
	 * @param theme 当前主题标识
	 * @param prompt 设计指令
	 */
	async writeCache(
		notePath: string,
		htmlBody: string,
		currentContent: string,
		theme: string = '',
		prompt: string = ''
	): Promise<void> {
		await this.ensureCacheDir();

		const hash = this.generateHash(currentContent, prompt);
		const metadata: CacheMetadata = {
			hash,
			theme,
			prompt,
			created: new Date().toISOString(),
		};

		const header = this.buildCacheHeader(metadata);
		const fullHtml = `${header}\n${htmlBody}`;

		const cachePath = this.getCacheFilePath(notePath);
		await this.app.vault.adapter.write(cachePath, fullHtml);
	}

	/**
	 * 同步更新缓存中的文字（画布编辑后调用）
	 * 同时更新头部哈希，使缓存继续有效
	 */
	async updateCacheText(
		notePath: string,
		oldText: string,
		newText: string,
		currentContent: string,
		prompt: string = ''
	): Promise<void> {
		const cachePath = this.getCacheFilePath(notePath);
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(cachePath))) return;

		let html = await adapter.read(cachePath);
		const { metadata, body } = this.parseCacheHeader(html);
		if (!metadata) return;

		// 简单文本替换：仅替换第一处匹配（与 MD 端逻辑保持一致）
		const newBody = body.replace(oldText, newText);
		if (newBody === body) return;

		// 更新哈希，保持缓存有效
		const newHash = this.generateHash(currentContent, prompt);
		const newMetadata: CacheMetadata = {
			...metadata,
			hash: newHash,
			created: new Date().toISOString(),
		};

		const newHeader = this.buildCacheHeader(newMetadata);
		await adapter.write(cachePath, `${newHeader}\n${newBody}`);
	}

	/** 清理指定笔记的缓存；不传则清理全部 */
	async clearCache(notePath?: string): Promise<void> {
		const adapter = this.app.vault.adapter;

		if (notePath) {
			const cachePath = this.getCacheFilePath(notePath);
			if (await adapter.exists(cachePath)) {
				await adapter.remove(cachePath);
			}
		} else {
			if (await adapter.exists(this.cacheDir)) {
				const list = await adapter.list(this.cacheDir);
				for (const file of list.files) {
					if (file.endsWith('.html')) {
						await adapter.remove(file);
					}
				}
			}
		}
	}

	/** 获取缓存目录路径（调试用） */
	getCacheDir(): string {
		return this.cacheDir;
	}
}
