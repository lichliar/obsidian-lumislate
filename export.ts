import { domToBlob } from 'modern-screenshot';
import { App, Notice } from 'obsidian';

/** 下载 HTML 为本地文件 */
export function downloadHtml(html: string, basename: string): void {
	const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
	downloadBlob(blob, `${basename}.html`);
	new Notice('HTML 下载已开始');
}

/** 通用 Blob 下载辅助 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 将 iframe 内容导出为 PNG
 * 使用 modern-screenshot 的 domToBlob，scale=2 保证高清
 */
export async function downloadPngFromIframe(
	iframe: HTMLIFrameElement,
	basename: string
): Promise<void> {
	try {
		const doc = iframe.contentDocument || iframe.contentWindow?.document;
		if (!doc || !doc.body) {
			throw new Error('iframe 内容未加载');
		}

		const blob = await domToBlob(doc.body, {
			scale: 2,
			backgroundColor: '#ffffff',
		});

		if (!blob) {
			throw new Error('截图失败');
		}

		downloadBlob(blob, `${basename}.png`);
		new Notice('PNG 导出成功');
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		new Notice(`PNG 导出失败: ${msg}`);
		throw err;
	}
}

/** 将 HTML 保存到 Vault 指定路径 */
export async function saveHtmlToVault(
	app: App,
	html: string,
	targetPath: string
): Promise<void> {
	const adapter = app.vault.adapter;

	// 确保目录存在
	const dir = targetPath.split('/').slice(0, -1).join('/');
	if (dir && !(await adapter.exists(dir))) {
		await adapter.mkdir(dir);
	}

	await adapter.write(targetPath, html);
	new Notice(`HTML 已保存到: ${targetPath}`);
}
