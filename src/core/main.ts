import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, Notice, Modal, TextAreaComponent, ButtonComponent, TFile, setIcon } from 'obsidian';
import { CacheManager } from '../utils/cache_manager';
import { extractFrontmatter, extractFrontmatterValue, compileWithAI, previewHtml } from '../ai/ai_service';
import { getAvailableAgents, detectAgent } from '../ai/local_agent';
import { SKILLS, getSkillById, assemblePrompt, parseMarpDirectives, MARP_BODY, MODES, getModeById } from '../ai/skills';
import type { Mode } from '../ai/skills';
import { LumiSlateSettingTab, DEFAULT_SETTINGS, DEFAULT_CSS_SYSTEM_PROMPT } from '../config/settings';
import type { LumiSlateSettings } from '../config/settings';
import { createPreprocessedFile, checkPreprocessedState } from '../utils/preprocess';
import { downloadHtml, downloadPngFromIframe, saveHtmlToVault } from '../utils/export';
import { PreprocessConfirmModal, ExportMenuModal } from '../ui/modals';

export const LUMISLATE_VIEW_TYPE = 'lumislate-canvas-view';

// ============================================================
// 工具函数
// ============================================================

/** HTML 特殊字符转义 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * 将 Markdown 中的图片路径解析为 Vault 内可访问的 URL
 * - ![[wiki-link]] → 通过 metadataCache 解析为 app:// 资源路径
 * - ![alt](relative/path) → 尝试在 Vault 中查找并转换
 */
function resolveImagePaths(markdown: string, app: App, sourcePath: string): string {
	// Wiki 链接图片（支持 Obsidian 的 |width 语法：![[filename|300]]）
	let result = markdown.replace(/!\[\[([^\]]+?)\]\]/g, (match, linkpath) => {
		const pipeIndex = linkpath.indexOf('|');
		const filename = pipeIndex >= 0 ? linkpath.slice(0, pipeIndex).trim() : linkpath;
		const file = app.metadataCache.getFirstLinkpathDest(filename, sourcePath);
		if (file instanceof TFile) {
			return `![${filename}](${app.vault.getResourcePath(file)})`;
		}
		return match;
	});

	// 标准 Markdown 图片（跳过已转换的外部 URL）
	result = result.replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, (match, alt, path) => {
		if (/^(https?:|data:|app:|obsidian:)/i.test(path)) {
			return match;
		}
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return `![${alt}](${app.vault.getResourcePath(file)})`;
		}
		const sourceDir = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';
		const relPath = sourceDir ? `${sourceDir}/${path}` : path;
		const relFile = app.vault.getAbstractFileByPath(relPath);
		if (relFile instanceof TFile) {
			return `![${alt}](${app.vault.getResourcePath(relFile)})`;
		}
		return match;
	});

	return result;
}

/**
 * Markdown 转简单 HTML（无 AI 时的降级渲染）
 */
function markdownToSimpleHTML(markdown: string): string {
	const lines = markdown.split('\n');
	let html = '';
	let inList = false;
	let listType: 'normal' | 'task' | null = null;
	let inParagraph = false;

	function closeParagraph(): void {
		if (inParagraph) {
			html += '</p>';
			inParagraph = false;
		}
	}
	function closeList(): void {
		if (inList) {
			html += '</ul>';
			inList = false;
			listType = null;
		}
	}
	function openParagraph(): void {
		if (!inParagraph) {
			html += '<p>';
			inParagraph = true;
		} else {
			html += '<br>';
		}
	}
	function inlineFormat(text: string): string {
		return escapeHtml(text)
			.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
			.replace(/==(.+?)==/g, '<mark>$1</mark>')
			.replace(/~~(.+?)~~/g, '<del>$1</del>')
			.replace(/`([^`]+?)`/g, '<code>$1</code>')
			.replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, '<img alt="$1" src="$2">')
			.replace(/!\[\[([^\]]+?)\]\]/g, '<img alt="$1" src="$1">')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>');
	}

	/** 检测一行是否只包含单个图片（无其他文本），返回 img HTML 或 null */
	function extractImageOnly(line: string): string | null {
		const trimmed = line.trim();
		// 标准 Markdown 图片 ![alt](url) — resolveImagePaths 后 wiki 链接已被转换
		const mdMatch = trimmed.match(/^!\[([^\]]*?)\]\((.*)\)$/);
		if (mdMatch) {
			return `<img alt="${escapeHtml(mdMatch[1])}" src="${escapeHtml(mdMatch[2])}">`;
		}
		// Wiki 链接图片 ![[filename]]（降级渲染未经过 resolveImagePaths 时可能遇到）
		const wikiMatch = trimmed.match(/^!\[\[([^\]]+?)\]\]$/);
		if (wikiMatch) {
			return `<img alt="${escapeHtml(wikiMatch[1])}" src="${escapeHtml(wikiMatch[1])}">`;
		}
		return null;
	}

	/** 解析 Markdown 表格块，返回 HTML 和结束行索引 */
	function parseTableBlock(start: number): { html: string; end: number } | null {
		let i = start;
		const rows: string[][] = [];
		let sepSeen = false;

		while (i < lines.length) {
			const trimmed = lines[i].trim();
			if (!trimmed.includes('|')) break;

			// 分隔行 |---|---|
			if (/^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('-')) {
				sepSeen = true;
				i++;
				continue;
			}

			const cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => {
				if (idx === 0 && trimmed.startsWith('|') && c === '') return false;
				if (idx === arr.length - 1 && trimmed.endsWith('|') && c === '') return false;
				return true;
			});
			if (cells.length === 0) break;
			rows.push(cells);
			i++;
		}

		if (rows.length === 0) return null;
		// 单行且无分隔行 → 不认为是表格（避免 ![[...|width]] 被误解析）
		if (rows.length === 1 && !sepSeen) return null;

		let tableHtml = '<table>';
		if (sepSeen) {
			tableHtml += '<thead><tr>';
			for (const cell of rows[0]) {
				tableHtml += `<th>${inlineFormat(cell)}</th>`;
			}
			tableHtml += '</tr></thead><tbody>';
			for (let r = 1; r < rows.length; r++) {
				tableHtml += '<tr>';
				for (const cell of rows[r]) {
					tableHtml += `<td>${inlineFormat(cell)}</td>`;
				}
				tableHtml += '</tr>';
			}
			tableHtml += '</tbody>';
		} else {
			tableHtml += '<tbody>';
			for (const row of rows) {
				tableHtml += '<tr>';
				for (const cell of row) {
					tableHtml += `<td>${inlineFormat(cell)}</td>`;
				}
				tableHtml += '</tr>';
			}
			tableHtml += '</tbody>';
		}
		tableHtml += '</table>';
		return { html: tableHtml, end: i - 1 };
	}

	/** 解析围栏代码块，返回 HTML 和结束行索引 */
	function parseCodeBlock(start: number): { html: string; end: number } | null {
		const firstLine = lines[start].trim();
		const fenceMatch = firstLine.match(/^```(\w*)/);
		if (!fenceMatch) return null;
		const lang = fenceMatch[1] || '';
		let i = start + 1;
		const codeLines: string[] = [];
		while (i < lines.length) {
			if (lines[i].trim() === '```') {
				i++;
				break;
			}
			codeLines.push(lines[i]);
			i++;
		}
		const codeHtml = escapeHtml(codeLines.join('\n'));
		const langClass = lang ? ` class="language-${lang}"` : '';
		return {
			html: `<pre><code${langClass}>${codeHtml}</code></pre>`,
			end: i - 1,
		};
	}

	/** 解析引用块 / Callout 块 */
	function parseBlockquote(start: number): { html: string; end: number } | null {
		let i = start;
		const quoteLines: string[] = [];

		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.trim();
			if (!trimmed.startsWith('>')) break;
			// 去掉开头的 > 和可选的空格
			quoteLines.push(line.replace(/^>\s?/, ''));
			i++;
		}

		if (quoteLines.length === 0) return null;

		// 检测是否是 Callout：第一行匹配 [!TYPE] 或 [!TYPE] 标题
		const firstLine = quoteLines[0].trim();
		const calloutMatch = firstLine.match(/^\[!([\w-]+)\]\s*(.*)$/);

		if (calloutMatch) {
			const type = calloutMatch[1].toLowerCase();
			const title = calloutMatch[2] || type.charAt(0).toUpperCase() + type.slice(1);
			const contentLines = quoteLines.slice(1);
			const contentHtml = contentLines.length > 0
				? contentLines.map(l => inlineFormat(l)).join('<br>')
				: '';
			return {
				html: `<div class="callout callout-${type}"><div class="callout-title">${inlineFormat(title)}</div>${contentHtml ? `<div class="callout-content">${contentHtml}</div>` : ''}</div>`,
				end: i - 1,
			};
		}

		// 普通引用块
		const contentHtml = quoteLines.map(l => inlineFormat(l)).join('<br>');
		return { html: `<blockquote>${contentHtml}</blockquote>`, end: i - 1 };
	}

	/** 解析数学公式块 $$...$$ */
	function parseMathBlock(start: number): { html: string; end: number } | null {
		let i = start + 1;
		const mathLines: string[] = [];
		while (i < lines.length) {
			if (lines[i].trim() === '$$') {
				i++;
				break;
			}
			mathLines.push(lines[i]);
			i++;
		}
		if (mathLines.length === 0) return null;
		return {
			html: `<div class="math-block">${escapeHtml(mathLines.join('\n'))}</div>`,
			end: i - 1,
		};
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		if (trimmed === '---') {
			closeParagraph();
			closeList();
			html += '<hr>';
			continue;
		}
		if (trimmed === '') {
			closeParagraph();
			closeList();
			continue;
		}

		// 代码块检测
		if (trimmed.startsWith('```')) {
			const cb = parseCodeBlock(i);
			if (cb) {
				closeParagraph();
				closeList();
				html += cb.html;
				i = cb.end;
				continue;
			}
		}

		// 数学公式块检测
		if (trimmed === '$$') {
			const mb = parseMathBlock(i);
			if (mb) {
				closeParagraph();
				closeList();
				html += mb.html;
				i = mb.end;
				continue;
			}
		}

		// 表格检测
		if (trimmed.includes('|')) {
			const table = parseTableBlock(i);
			if (table) {
				closeParagraph();
				closeList();
				html += table.html;
				i = table.end;
				continue;
			}
		}

		// 引用块 / Callout 检测
		if (trimmed.startsWith('>')) {
			const bq = parseBlockquote(i);
			if (bq) {
				closeParagraph();
				closeList();
				html += bq.html;
				i = bq.end;
				continue;
			}
		}

		if (trimmed.startsWith('# ')) {
			closeParagraph();
			closeList();
			html += `<h1>${inlineFormat(trimmed.slice(2))}</h1>`;
		} else if (trimmed.startsWith('## ')) {
			closeParagraph();
			closeList();
			html += `<h2>${inlineFormat(trimmed.slice(3))}</h2>`;
		} else if (trimmed.startsWith('### ')) {
			closeParagraph();
			closeList();
			html += `<h3>${inlineFormat(trimmed.slice(4))}</h3>`;
		} else if (trimmed.startsWith('#### ')) {
			closeParagraph();
			closeList();
			html += `<h4>${inlineFormat(trimmed.slice(5))}</h4>`;
		} else if (trimmed.startsWith('##### ')) {
			closeParagraph();
			closeList();
			html += `<h5>${inlineFormat(trimmed.slice(6))}</h5>`;
		} else if (trimmed.startsWith('###### ')) {
			closeParagraph();
			closeList();
			html += `<h6>${inlineFormat(trimmed.slice(7))}</h6>`;
		} else if (trimmed.startsWith('- ')) {
			closeParagraph();
			const isTask = /^- \[[ xX]\] /.test(trimmed);
			const newListType = isTask ? 'task' : 'normal';
			if (!inList || listType !== newListType) {
				closeList();
				html += isTask ? '<ul class="task-list">' : '<ul>';
				inList = true;
				listType = newListType;
			}
			if (isTask) {
				const isChecked = trimmed[3] === 'x' || trimmed[3] === 'X';
				const text = trimmed.slice(6);
				html += `<li class="task-list-item"><input type="checkbox" disabled${isChecked ? ' checked' : ''}> ${inlineFormat(text)}</li>`;
			} else {
				html += `<li>${inlineFormat(trimmed.slice(2))}</li>`;
			}
		} else {
			// 图片组检测：连续的图片-only 行自动并排
			const imgOnly = extractImageOnly(line);
			if (imgOnly) {
				closeParagraph();
				closeList();
				const images = [imgOnly];
				let j = i + 1;
				while (j < lines.length) {
					const nextTrimmed = lines[j].trim();
					if (nextTrimmed === '') { j++; continue; }
					const nextImg = extractImageOnly(lines[j]);
					if (nextImg) {
						images.push(nextImg);
						j++;
					} else {
						break;
					}
				}
				if (images.length > 1) {
					html += `<div class="image-group">${images.join('')}</div>`;
				} else {
					html += `<div class="image-group">${imgOnly}</div>`;
				}
				i = j - 1;
			} else {
				closeList();
				openParagraph();
				html += inlineFormat(line);
			}
		}
	}
	closeParagraph();
	closeList();
	return html;
}

/**
 * 将正文 HTML 包装为完整页面（降级渲染用）
 */
function buildHTMLPage(bodyContent: string): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; min-height: 100%; }
body {
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 2.5rem;
  line-height: 1.75;
}
h1 { font-size: 1.875rem; font-weight: 800; margin-bottom: 1rem; letter-spacing: -0.02em; }
h2 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
h3 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
p  { margin-bottom: 0.75rem; }
ul { margin-left: 1.5rem; margin-bottom: 0.75rem; }
li { margin-bottom: 0.25rem; }
hr { border: none; border-top: 1px solid #334155; margin: 1.5rem 0; }
mark { background: rgba(250, 204, 21, 0.3); color: inherit; padding: 0.1em 0.25em; border-radius: 3px; }
u { text-decoration: underline; text-decoration-color: rgba(96, 165, 250, 0.6); text-underline-offset: 3px; }
h4 { font-size: 1.125rem; font-weight: 600; margin: 1rem 0 0.5rem; }
h5 { font-size: 1rem; font-weight: 600; margin: 0.875rem 0 0.5rem; }
h6 { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.5rem; color: rgba(226, 232, 240, 0.8); }
.task-list { list-style: none; margin-left: 0; padding-left: 0; }
.task-list-item { display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.35rem; }
.task-list-item input[type="checkbox"] { margin-top: 0.25rem; accent-color: #60a5fa; }
.math-block { background: rgba(0,0,0,0.15); padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; font-family: 'KaTeX_Math', 'Times New Roman', serif; text-align: center; margin: 0.75rem 0; }
.lumislate-hover {
  background: rgba(96, 165, 250, 0.12);
  cursor: text;
  border-radius: 2px;
  transition: background 0.15s ease;
}
.lumislate-editing {
  outline: 2px dashed #60a5fa;
  outline-offset: 2px;
  border-radius: 4px;
  background: rgba(96, 165, 250, 0.06);
  cursor: text;
}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
</head>
<body>
${bodyContent}
<script>
(function() {
  function initMath() {
    if (typeof renderMathInElement === 'undefined') {
      setTimeout(initMath, 100);
      return;
    }
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMath);
  } else {
    initMath();
  }
})();
</script>
</body>
</html>`;
}

/** 解析 size 字符串为 CSS aspect-ratio 值 */
function parseAspectRatio(size: string): string | null {
	if (!size || size === 'auto') return null;
	const match = size.match(/^(\d+):(\d+)$/);
	if (match) {
		return `${match[1]}/${match[2]}`;
	}
	return null;
}

/** 根据 size 比例计算固定逻辑尺寸（基准宽度 1280） */
function getSlideFixedSize(size: string): { width: number; height: number } {
	const match = size.match(/^(\d+):(\d+)$/);
	if (!match) return { width: 1280, height: 720 };
	const w = parseInt(match[1], 10);
	const h = parseInt(match[2], 10);
	const width = 1280;
	const height = Math.round(width * (h / w));
	return { width, height };
}

/** 长文模式：无分页符时的连续滚动页面 */
function buildLongFormPage(body: string, options: { bgColor: string; textColor: string; customCss?: string }): string {
	const bodyHtml = markdownToSimpleHTML(body);
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --ls-body-bg: ${options.bgColor};
  --ls-body-color: ${options.textColor};
  --ls-font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --ls-content-padding: 3rem 4rem;
  --ls-line-height: 1.75;
  --ls-h1-size: 2.5rem;
  --ls-h1-weight: 800;
  --ls-h1-margin: 0 0 1.5rem 0;
  --ls-h2-size: 1.75rem;
  --ls-h2-weight: 700;
  --ls-h2-margin: 1.5rem 0 1rem 0;
  --ls-h3-size: 1.25rem;
  --ls-h3-weight: 600;
  --ls-h3-margin: 1rem 0 0.5rem 0;
  --ls-p-margin: 0 0 0.75rem 0;
  --ls-list-margin: 0 0 0.75rem 2rem;
  --ls-li-margin: 0 0 0.35rem 0;
  --ls-hr-border: 1px solid rgba(255,255,255,0.1);
  --ls-hr-margin: 1.5rem 0;
  --ls-table-margin: 1rem 0;
  --ls-table-border: rgba(255,255,255,0.15);
  --ls-table-cell-padding: 0.5rem 0.75rem;
  --ls-table-head-bg: rgba(255,255,255,0.08);
  --ls-table-row-alt-bg: rgba(255,255,255,0.03);
  --ls-blockquote-margin: 1rem 0;
  --ls-blockquote-padding: 0.75rem 1rem;
  --ls-blockquote-border: 3px solid rgba(255,255,255,0.2);
  --ls-blockquote-color: rgba(255,255,255,0.8);
  --ls-callout-margin: 1rem 0;
  --ls-callout-padding: 0.75rem 1rem;
  --ls-callout-radius: 8px;
  --ls-callout-border-width: 4px;
  --ls-callout-bg: rgba(255,255,255,0.04);
  --ls-callout-title-size: 0.95rem;
  --ls-callout-title-weight: 700;
  --ls-callout-title-margin: 0 0 0.35rem 0;
  --ls-callout-content-size: 0.9rem;
  --ls-callout-content-line-height: 1.6;
  --ls-callout-note-color: #3b82f6;
  --ls-callout-tip-color: #22c55e;
  --ls-callout-warning-color: #f59e0b;
  --ls-callout-danger-color: #ef4444;
  --ls-callout-question-color: #a855f7;
  --ls-callout-example-color: #6b7280;
}
html, body { width: 100%; min-height: 100%; background: var(--ls-body-bg); color: var(--ls-body-color); font-family: var(--ls-font-family); }
#longform-content { width: 100%; min-height: 100%; padding: var(--ls-content-padding); line-height: var(--ls-line-height); }
#longform-content h1 { font-size: var(--ls-h1-size); font-weight: var(--ls-h1-weight); margin: var(--ls-h1-margin); }
#longform-content h2 { font-size: var(--ls-h2-size); font-weight: var(--ls-h2-weight); margin: var(--ls-h2-margin); }
#longform-content h3 { font-size: var(--ls-h3-size); font-weight: var(--ls-h3-weight); margin: var(--ls-h3-margin); }
#longform-content p { margin: var(--ls-p-margin); }
#longform-content ul, #longform-content ol { margin: var(--ls-list-margin); }
#longform-content li { margin: var(--ls-li-margin); }
#longform-content hr { border: none; border-top: var(--ls-hr-border); margin: var(--ls-hr-margin); }
#longform-content table { width: 100%; border-collapse: collapse; margin: var(--ls-table-margin); }
#longform-content th, #longform-content td { border: 1px solid var(--ls-table-border); padding: var(--ls-table-cell-padding); text-align: left; }
#longform-content th { background: var(--ls-table-head-bg); font-weight: 600; }
#longform-content tr:nth-child(even) { background: var(--ls-table-row-alt-bg); }
#longform-content blockquote { margin: var(--ls-blockquote-margin); padding: var(--ls-blockquote-padding); border-left: var(--ls-blockquote-border); font-style: italic; color: var(--ls-blockquote-color); }
#longform-content .callout { margin: var(--ls-callout-margin); padding: var(--ls-callout-padding); border-radius: var(--ls-callout-radius); border-left: var(--ls-callout-border-width) solid; background: var(--ls-callout-bg); }
#longform-content .callout-title { font-weight: var(--ls-callout-title-weight); margin: var(--ls-callout-title-margin); font-size: var(--ls-callout-title-size); }
#longform-content .callout-content { font-size: var(--ls-callout-content-size); line-height: var(--ls-callout-content-line-height); }
#longform-content .callout-note, #longform-content .callout-info, #longform-content .callout-todo { border-left-color: var(--ls-callout-note-color); }
#longform-content .callout-note > .callout-title, #longform-content .callout-info > .callout-title, #longform-content .callout-todo > .callout-title { color: var(--ls-callout-note-color); }
#longform-content .callout-tip, #longform-content .callout-hint, #longform-content .callout-important, #longform-content .callout-success, #longform-content .callout-check, #longform-content .callout-done { border-left-color: var(--ls-callout-tip-color); }
#longform-content .callout-tip > .callout-title, #longform-content .callout-hint > .callout-title, #longform-content .callout-important > .callout-title, #longform-content .callout-success > .callout-title, #longform-content .callout-check > .callout-title, #longform-content .callout-done > .callout-title { color: var(--ls-callout-tip-color); }
#longform-content .callout-warning, #longform-content .callout-caution, #longform-content .callout-attention { border-left-color: var(--ls-callout-warning-color); }
#longform-content .callout-warning > .callout-title, #longform-content .callout-caution > .callout-title, #longform-content .callout-attention > .callout-title { color: var(--ls-callout-warning-color); }
#longform-content .callout-danger, #longform-content .callout-error, #longform-content .callout-bug { border-left-color: var(--ls-callout-danger-color); }
#longform-content .callout-danger > .callout-title, #longform-content .callout-error > .callout-title, #longform-content .callout-bug > .callout-title { color: var(--ls-callout-danger-color); }
#longform-content .callout-question, #longform-content .callout-help, #longform-content .callout-faq { border-left-color: var(--ls-callout-question-color); }
#longform-content .callout-question > .callout-title, #longform-content .callout-help > .callout-title, #longform-content .callout-faq > .callout-title { color: var(--ls-callout-question-color); }
#longform-content .callout-example, #longform-content .callout-quote { border-left-color: var(--ls-callout-example-color); }
#longform-content .callout-example > .callout-title, #longform-content .callout-quote > .callout-title { color: var(--ls-callout-example-color); }
#longform-content img { max-width: 100%; height: auto; display: block; border-radius: 6px; margin: 0.5rem 0; object-fit: contain; }
#longform-content .image-group { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; align-items: flex-start; margin: 0.5rem 0; }
#longform-content .image-group img { flex: 1 1 0; min-width: 0; max-width: 48%; margin: 0; }
#longform-content .image-group img:only-child { flex: 0 0 auto; max-width: 100%; }
#longform-content pre { background: rgba(0,0,0,0.2); padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; max-width: 100%; margin: 0.5rem 0; }
#longform-content pre code { font-family: 'Fira Code', 'JetBrains Mono', 'SF Mono', Monaco, monospace; font-size: 0.8rem; line-height: 1.5; background: transparent; padding: 0; }
#longform-content code { font-family: 'Fira Code', 'JetBrains Mono', 'SF Mono', Monaco, monospace; font-size: 0.85em; background: rgba(0,0,0,0.15); padding: 0.15rem 0.35rem; border-radius: 4px; }
#longform-content del { opacity: 0.6; text-decoration: line-through; }
#longform-content mark { background: rgba(250, 204, 21, 0.3); color: inherit; padding: 0.1em 0.25em; border-radius: 3px; }
#longform-content u { text-decoration: underline; text-decoration-color: rgba(96, 165, 250, 0.6); text-underline-offset: 3px; }
#longform-content h4 { font-size: 1.125rem; font-weight: 600; margin: 1rem 0 0.5rem 0; }
#longform-content h5 { font-size: 1rem; font-weight: 600; margin: 0.875rem 0 0.5rem 0; opacity: 0.9; }
#longform-content h6 { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.5rem 0; opacity: 0.8; }
#longform-content .task-list { list-style: none; margin-left: 0; padding-left: 0; }
#longform-content .task-list-item { display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.35rem; }
#longform-content .task-list-item input[type="checkbox"] { margin-top: 0.25rem; accent-color: #60a5fa; }
#longform-content .math-block { background: rgba(0,0,0,0.15); padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; font-family: 'KaTeX_Math', 'Times New Roman', serif; text-align: center; margin: 0.75rem 0; }
${options.customCss || ''}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
</head>
<body>
<div id="longform-content">
${bodyHtml}
</div>
<script>
(function() {
  function initMath() {
    if (typeof renderMathInElement === 'undefined') {
      setTimeout(initMath, 100);
      return;
    }
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMath);
  } else {
    initMath();
  }
})();
</script>
</body>
</html>`
}

/**
 * Marp 降级渲染: 按 --- 分页生成简单幻灯片 HTML
 * - 有分页符：固定比例 slide 模式，纵向滚动浏览
 * - 无分页符：长文模式，不设高度限制，宽度自适应
 */
async function buildMarpFallbackPage(markdown: string, app: App, pluginDir: string): Promise<string> {
	const { frontmatter, body } = extractFrontmatter(markdown);
	const bgColor = extractFrontmatterValue(frontmatter, 'backgroundcolor') || extractFrontmatterValue(frontmatter, 'backgroundColor') || '#0f172a';
	const textColor = extractFrontmatterValue(frontmatter, 'color') || '#e2e8f0';
	const paginate = extractFrontmatterValue(frontmatter, 'paginate');
	const showPaginate = paginate === 'true';
	const size = extractFrontmatterValue(frontmatter, 'size') || '16:9';

	// 读取用户自定义 CSS 预设
	const cssFile = extractFrontmatterValue(frontmatter, 'lumislate_css');
	let customCss = '';
	if (cssFile) {
		const cssPath = `${pluginDir}/css/${cssFile}`;
		customCss = await app.vault.adapter.read(cssPath).catch(() => '');
	}

	// 检测是否有分页符
	const hasDividers = /^---\s*$/m.test(body);

	// 无分页符 → 长文模式
	if (!hasDividers) {
		return buildLongFormPage(body, { bgColor, textColor, customCss });
	}

	// 有分页符 → 幻灯片模式
	const slideTexts = body.split(/^---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 0);
	if (slideTexts.length === 0) {
		slideTexts.push(body.trim() || '(空幻灯片)');
	}

	const { width: fixedWidth, height: fixedHeight } = getSlideFixedSize(size);

	const slidesHtml = slideTexts
		.map((text, idx) => {
			const bodyHtml = markdownToSimpleHTML(text);
			const pageNum = showPaginate ? `<div class="slide-paginate">${idx + 1} / ${slideTexts.length}</div>` : '';
			return `<div class="slide-wrapper"><section class="slide" data-index="${idx}">${bodyHtml}${pageNum}</section></div>`;
		})
		.join('\n');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --ls-body-bg: ${bgColor};
  --ls-body-color: ${textColor};
  --ls-font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --ls-deck-gap: 1rem;
  --ls-deck-padding: 1rem;
  --ls-slide-padding: 3rem 4rem;
  --ls-slide-bg: rgba(255,255,255,0.03);
  --ls-slide-radius: 12px;
  --ls-slide-line-height: 1.75;
  --ls-h1-size: 2.5rem;
  --ls-h1-weight: 800;
  --ls-h1-margin: 0 0 1.5rem 0;
  --ls-h2-size: 1.75rem;
  --ls-h2-weight: 700;
  --ls-h2-margin: 1.5rem 0 1rem 0;
  --ls-h3-size: 1.25rem;
  --ls-h3-weight: 600;
  --ls-h3-margin: 1rem 0 0.5rem 0;
  --ls-p-margin: 0 0 0.75rem 0;
  --ls-list-margin: 0 0 0.75rem 2rem;
  --ls-li-margin: 0 0 0.35rem 0;
  --ls-table-font-size: 0.85rem;
  --ls-table-margin: 0.75rem 0;
  --ls-table-border: rgba(255,255,255,0.15);
  --ls-table-cell-padding: 0.35rem 0.5rem;
  --ls-table-head-bg: rgba(255,255,255,0.08);
  --ls-table-row-alt-bg: rgba(255,255,255,0.03);
  --ls-blockquote-margin: 0.5rem 0;
  --ls-blockquote-padding: 0.4rem 0.6rem;
  --ls-blockquote-border: 2px solid rgba(255,255,255,0.2);
  --ls-blockquote-color: rgba(255,255,255,0.8);
  --ls-blockquote-font-size: 0.85rem;
  --ls-callout-margin: 0.5rem 0;
  --ls-callout-padding: 0.4rem 0.6rem;
  --ls-callout-radius: 6px;
  --ls-callout-border-width: 3px;
  --ls-callout-bg: rgba(255,255,255,0.04);
  --ls-callout-title-size: 0.8rem;
  --ls-callout-title-weight: 700;
  --ls-callout-title-margin: 0 0 0.2rem 0;
  --ls-callout-content-size: 0.75rem;
  --ls-callout-content-line-height: 1.5;
  --ls-callout-note-color: #3b82f6;
  --ls-callout-tip-color: #22c55e;
  --ls-callout-warning-color: #f59e0b;
  --ls-callout-danger-color: #ef4444;
  --ls-callout-question-color: #a855f7;
  --ls-callout-example-color: #6b7280;
  --ls-paginate-font-size: 12px;
  --ls-paginate-bottom: 16px;
  --ls-paginate-right: 24px;
  --ls-paginate-opacity: 0.5;
}
html, body { width: 100%; height: 100%; overflow-x: visible; overflow-y: auto; }
body { background: var(--ls-body-bg); color: var(--ls-body-color); font-family: var(--ls-font-family); }
#marp-deck { width: 100%; min-height: 100%; overflow-x: visible; overflow-y: auto; display: flex; flex-direction: column; gap: var(--ls-deck-gap); padding: var(--ls-deck-padding); align-items: center; }
.slide-wrapper { display: flex; overflow: hidden; flex-shrink: 0; }
/* 必须写死的布局引擎（用户不应覆盖） */
.slide { position: relative; width: ${fixedWidth}px !important; height: ${fixedHeight}px !important; flex-shrink: 0; transform-origin: 0 0; overflow: hidden; }
/* 视觉样式放在 section 上，用户写 section { ... } 即可覆盖 */
section { background: var(--ls-slide-bg); border-radius: var(--ls-slide-radius); padding: var(--ls-slide-padding); display: flex; flex-direction: column; justify-content: center; line-height: var(--ls-slide-line-height); }
section h1 { font-size: var(--ls-h1-size); font-weight: var(--ls-h1-weight); margin: var(--ls-h1-margin); }
section h2 { font-size: var(--ls-h2-size); font-weight: var(--ls-h2-weight); margin: var(--ls-h2-margin); }
section h3 { font-size: var(--ls-h3-size); font-weight: var(--ls-h3-weight); margin: var(--ls-h3-margin); }
section p { margin: var(--ls-p-margin); }
section ul, section ol { margin: var(--ls-list-margin); }
section li { margin: var(--ls-li-margin); }
section table { width: 100%; border-collapse: collapse; margin: var(--ls-table-margin); font-size: var(--ls-table-font-size); }
section th, section td { border: 1px solid var(--ls-table-border); padding: var(--ls-table-cell-padding); text-align: left; }
section th { background: var(--ls-table-head-bg); font-weight: 600; }
section tr:nth-child(even) { background: var(--ls-table-row-alt-bg); }
section blockquote { margin: var(--ls-blockquote-margin); padding: var(--ls-blockquote-padding); border-left: var(--ls-blockquote-border); font-style: italic; color: var(--ls-blockquote-color); font-size: var(--ls-blockquote-font-size); }
section .callout { margin: var(--ls-callout-margin); padding: var(--ls-callout-padding); border-radius: var(--ls-callout-radius); border-left: var(--ls-callout-border-width) solid; background: var(--ls-callout-bg); }
section .callout-title { font-weight: var(--ls-callout-title-weight); margin: var(--ls-callout-title-margin); font-size: var(--ls-callout-title-size); }
section .callout-content { font-size: var(--ls-callout-content-size); line-height: var(--ls-callout-content-line-height); }
section .callout-note, section .callout-info, section .callout-todo { border-left-color: var(--ls-callout-note-color); }
section .callout-note > .callout-title, section .callout-info > .callout-title, section .callout-todo > .callout-title { color: var(--ls-callout-note-color); }
section .callout-tip, section .callout-hint, section .callout-important, section .callout-success, section .callout-check, section .callout-done { border-left-color: var(--ls-callout-tip-color); }
section .callout-tip > .callout-title, section .callout-hint > .callout-title, section .callout-important > .callout-title, section .callout-success > .callout-title, section .callout-check > .callout-title, section .callout-done > .callout-title { color: var(--ls-callout-tip-color); }
section .callout-warning, section .callout-caution, section .callout-attention { border-left-color: var(--ls-callout-warning-color); }
section .callout-warning > .callout-title, section .callout-caution > .callout-title, section .callout-attention > .callout-title { color: var(--ls-callout-warning-color); }
section .callout-danger, section .callout-error, section .callout-bug { border-left-color: var(--ls-callout-danger-color); }
section .callout-danger > .callout-title, section .callout-error > .callout-title, section .callout-bug > .callout-title { color: var(--ls-callout-danger-color); }
section .callout-question, section .callout-help, section .callout-faq { border-left-color: var(--ls-callout-question-color); }
section .callout-question > .callout-title, section .callout-help > .callout-title, section .callout-faq > .callout-title { color: var(--ls-callout-question-color); }
section .callout-example, section .callout-quote { border-left-color: var(--ls-callout-example-color); }
section .callout-example > .callout-title, section .callout-quote > .callout-title { color: var(--ls-callout-example-color); }
section img { max-width: 100%; max-height: 280px; height: auto; display: block; border-radius: 6px; margin: 0.5rem auto; object-fit: contain; }
section .image-group { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; align-items: center; margin: 0.5rem 0; }
section .image-group img { max-height: 220px; flex: 1 1 0; min-width: 0; margin: 0; }
section .image-group img:only-child { flex: 0 0 auto; max-width: 100%; max-height: 280px; }
section pre { background: rgba(0,0,0,0.2); padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; overflow-y: auto; max-width: 100%; max-height: 45%; margin: 0.5rem 0; }
section pre code { font-family: 'Fira Code', 'JetBrains Mono', 'SF Mono', Monaco, monospace; font-size: 0.8rem; line-height: 1.5; background: transparent; padding: 0; }
section code { font-family: 'Fira Code', 'JetBrains Mono', 'SF Mono', Monaco, monospace; font-size: 0.85em; background: rgba(0,0,0,0.15); padding: 0.15rem 0.35rem; border-radius: 4px; }
section del { opacity: 0.6; text-decoration: line-through; }
section mark { background: rgba(250, 204, 21, 0.3); color: inherit; padding: 0.1em 0.25em; border-radius: 3px; }
section u { text-decoration: underline; text-decoration-color: rgba(96, 165, 250, 0.6); text-underline-offset: 3px; }
section h4 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.4rem 0; }
section h5 { font-size: 1rem; font-weight: 600; margin: 0.65rem 0 0.35rem 0; opacity: 0.9; }
section h6 { font-size: 0.9rem; font-weight: 600; margin: 0.55rem 0 0.3rem 0; opacity: 0.8; }
section .task-list { list-style: none; margin-left: 0; padding-left: 0; }
section .task-list-item { display: flex; align-items: flex-start; gap: 0.4rem; margin-bottom: 0.25rem; font-size: 0.85rem; }
section .task-list-item input[type="checkbox"] { margin-top: 0.15rem; accent-color: #60a5fa; }
section .math-block { background: rgba(0,0,0,0.15); padding: 0.5rem 0.75rem; border-radius: 6px; overflow-x: auto; font-family: 'KaTeX_Math', 'Times New Roman', serif; text-align: center; margin: 0.5rem 0; font-size: 0.85rem; }
.slide-paginate { position: absolute; bottom: var(--ls-paginate-bottom); right: var(--ls-paginate-right); font-size: var(--ls-paginate-font-size); opacity: var(--ls-paginate-opacity); }
${customCss}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
</head>
<body>
<div id="marp-deck">
${slidesHtml}
</div>
<script>
(function() {
  function fitSlides() {
    var deck = document.getElementById('marp-deck');
    if (!deck) return;
    var deckWidth = deck.clientWidth - 32;
    var slides = document.querySelectorAll('.slide');
    for (var i = 0; i < slides.length; i++) {
      var slide = slides[i];
      var wrapper = slide.parentElement;
      slide.style.transform = 'none';
      var w0 = slide.offsetWidth;
      var h0 = slide.offsetHeight;
      var scale = Math.min(1, deckWidth / w0);
      slide.style.transform = 'scale(' + scale + ')';
      wrapper.style.width = (w0 * scale) + 'px';
      wrapper.style.height = (h0 * scale) + 'px';
    }
  }
  window.addEventListener('resize', fitSlides);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fitSlides);
  } else {
    fitSlides();
  }
  setTimeout(fitSlides, 50);
})();
</script>
<script>
(function() {
  function initMath() {
    if (typeof renderMathInElement === 'undefined') {
      setTimeout(initMath, 100);
      return;
    }
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMath);
  } else {
    initMath();
  }
})();
</script>
</body>
</html>`;
}

/** 生成 iframe 暗黑欢迎页面的 srcdoc HTML */
function getWelcomeHTML(): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e2e8f0;
}
.welcome {
  text-align: center;
  animation: fadeIn 0.8s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.logo-area h1 {
  font-size: 3rem; font-weight: 800; letter-spacing: -0.02em;
  color: #e2e8f0;
  background: linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.logo-area .tagline {
  font-size: 0.9rem; color: #64748b; letter-spacing: 0.08em;
}
.mode-buttons {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,0.15);
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 160px;
}
.mode-btn:hover {
  border-color: rgba(96,165,250,0.4);
  background: rgba(30,41,59,0.7);
  transform: translateY(-2px);
}
.mode-btn .icon {
  font-size: 2rem;
}
.mode-btn .label {
  font-size: 1rem; font-weight: 600; color: #e2e8f0;
}
.mode-btn .hint {
  font-size: 0.7rem; color: #475569;
}
.subtitle { font-size: 0.75rem; color: #475569; margin-top: 1rem; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="welcome">
  <div class="logo-area">
    <h1>LumiSlate</h1>
    <div class="tagline">流光石板</div>
  </div>
  <div class="mode-buttons">
    <div class="mode-btn" data-mode="marp" onclick="selectMode('marp')">
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></div>
      <div class="label">自定义模式</div>
      <div class="hint">Marp 幻灯片渲染</div>
    </div>
    <div class="mode-btn" data-mode="design" onclick="selectMode('design')">
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg></div>
      <div class="label">AI模式</div>
      <div class="hint">AI 设计样式渲染</div>
    </div>
  </div>
  <div class="subtitle">选择 Markdown 笔记，开始编译高定画布</div>
</div>
<script>
function selectMode(mode) {
  window.parent.postMessage({ type: 'lumislate-select-mode', mode: mode }, '*');
}
</script>
</body>
</html>`;
}

/** AI模式启动界面 */
function getDesignLauncherHTML(): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e2e8f0;
}
.launcher {
  text-align: center;
  animation: fadeIn 0.6s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}
.launcher h1 {
  font-size: 2.5rem; font-weight: 700;
  color: #e2e8f0;
}
.launcher .tagline {
  font-size: 1rem; color: #94a3b8;
}
.launcher .hint {
  font-size: 0.8rem; color: #475569;
  margin-top: 1rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: 1px dashed rgba(148,163,184,0.2);
  background: rgba(15,23,42,0.4);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="launcher">
  <h1>AI模式</h1>
  <div class="tagline">选择设计样式，让 AI 为你渲染</div>
  <div class="hint">在下方操作栏选择 SKILL，然后点击 AI 渲染开始</div>
</div>
</body>
</html>`;
}

/**
 * iframe 内双向绑定脚本（注入到每个渲染的 HTML 中）
 */
function getReverseMappingScript(): string {
	return `<script>
(function() {
  'use strict';

  var EDITABLE_TAGS = ['P','H1','H2','H3','H4','H5','H6','LI','SPAN','STRONG','EM','TD','TH','A','BLOCKQUOTE'];
  var HOVER_CLASS = 'lumislate-hover';
  var EDIT_CLASS  = 'lumislate-editing';
  var currentEdit = null;

  function getTextNodeAtPoint(x, y) {
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      return pos ? pos.offsetNode : null;
    }
    if (document.caretRangeFromPoint) {
      var range = document.caretRangeFromPoint(x, y);
      return range ? range.startContainer : null;
    }
    return null;
  }

  function isEditableElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return false;
    return EDITABLE_TAGS.indexOf(el.tagName) !== -1;
  }

  function getPath(el) {
    var path = [];
    while (el && el !== document.body) {
      var parent = el.parentElement;
      if (!parent) break;
      var siblings = Array.from(parent.children);
      var idx = siblings.indexOf(el);
      path.unshift(el.tagName.toLowerCase() + '[' + idx + ']');
      el = parent;
    }
    return path.join('>');
  }

  function getContext(el) {
    return (el.textContent || '').slice(0, 80);
  }

  function clearHover() {
    document.querySelectorAll('.' + HOVER_CLASS).forEach(function(e) {
      e.classList.remove(HOVER_CLASS);
    });
  }

  function setHover(el) {
    clearHover();
    if (el) el.classList.add(HOVER_CLASS);
  }

  function startEdit(textNode, parent) {
    if (currentEdit) finishEdit();

    currentEdit = {
      parent: parent,
      textNode: textNode,
      oldText: textNode.textContent,
      path: getPath(parent)
    };

    var span = document.createElement('span');
    span.contentEditable = 'true';
    span.className = EDIT_CLASS;
    span.textContent = textNode.textContent;

    parent.replaceChild(span, textNode);
    span.focus();

    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function finishEdit() {
    if (!currentEdit) return;

    var edit = currentEdit;
    var span = edit.parent.querySelector('.' + EDIT_CLASS);
    if (!span) { currentEdit = null; return; }

    var newText = span.textContent;
    var newNode = document.createTextNode(newText);
    edit.parent.replaceChild(newNode, span);
    clearHover();

    if (newText !== edit.oldText) {
      window.parent.postMessage({
        type: 'lumislate-text-change',
        oldText: edit.oldText,
        newText: newText,
        tagName: edit.parent.tagName,
        path: edit.path,
        context: getContext(edit.parent)
      }, '*');
    }

    currentEdit = null;
  }

  function cancelEdit() {
    if (!currentEdit) return;

    var edit = currentEdit;
    var span = edit.parent.querySelector('.' + EDIT_CLASS);
    if (span) {
      var newNode = document.createTextNode(edit.oldText);
      edit.parent.replaceChild(newNode, span);
    }
    clearHover();
    currentEdit = null;
  }

  document.body.addEventListener('mousemove', function(e) {
    if (currentEdit) return;

    var node = getTextNodeAtPoint(e.clientX, e.clientY);
    if (!node) { clearHover(); return; }

    var parent = node.nodeType === 3 ? node.parentElement : node;
    if (!parent || !isEditableElement(parent)) { clearHover(); return; }

    setHover(parent);
  });

  document.body.addEventListener('click', function(e) {
    if (currentEdit) {
      if (!currentEdit.parent.contains(e.target)) {
        finishEdit();
      }
      return;
    }

    var node = getTextNodeAtPoint(e.clientX, e.clientY);
    if (!node || node.nodeType !== 3) return;

    var parent = node.parentElement;
    if (!parent || !isEditableElement(parent)) return;

    startEdit(node, parent);
  });

  document.addEventListener('keydown', function(e) {
    if (!currentEdit) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      finishEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
})();
</script>`;
}

/** 图片交互脚本：支持拖拽移动位置、拖拽手柄调整大小（带边界限制） */
function getImageInteractionScript(): string {
	return `<script>
(function() {
	'use strict';

	var activeImage = null;
	var handlesContainer = null;
	var dragOverlay = null;
	var isDragging = false;
	var isResizing = false;
	var dragStart = { x: 0, y: 0, tx: 0, ty: 0 };
	var resizeStart = { x: 0, y: 0, w: 0, h: 0, handle: '' };

	function getTransformValues(el) {
		var style = window.getComputedStyle(el).transform;
		if (style === 'none') return { x: 0, y: 0 };
		var m = style.match(/matrix\(([^,]+),[^,]+,[^,]+,[^,]+, *([^,]+), *([^)]+)\)/);
		if (m) return { x: parseFloat(m[2]) || 0, y: parseFloat(m[3]) || 0 };
		return { x: 0, y: 0 };
	}

	/** 获取图片的约束容器（slide 或页面主体） */
	function getConstraintContainer(img) {
		return img.closest('section.slide') || img.closest('.slide') || img.closest('#longform-content') || img.closest('section') || document.body;
	}

	/** 限制拖拽 translate 值，使图片至少保留 minVis 像素在容器内 */
	function constrainTranslate(img, tx, ty) {
		var container = getConstraintContainer(img);
		var cRect = container.getBoundingClientRect();
		var iRect = img.getBoundingClientRect();
		var cur = getTransformValues(img);
		// 图片原始位置（不含当前 transform）
		var rawLeft = iRect.left - cur.x;
		var rawTop = iRect.top - cur.y;
		var minVis = 40;
		var maxTx = cRect.right - minVis - rawLeft;
		var minTx = cRect.left + minVis - rawLeft - iRect.width;
		var maxTy = cRect.bottom - minVis - rawTop;
		var minTy = cRect.top + minVis - rawTop - iRect.height;
		return {
			x: Math.max(minTx, Math.min(maxTx, tx)),
			y: Math.max(minTy, Math.min(maxTy, ty))
		};
	}

	/** 限制 resize 尺寸（强制保持比例），不超过容器边界 */
	function constrainResize(img, w, h, aspect) {
		var container = getConstraintContainer(img);
		var cRect = container.getBoundingClientRect();
		var minSize = 40;
		var maxW = Math.round(cRect.width);
		var maxH = Math.round(cRect.height);

		// 限制最小尺寸
		if (w < minSize) { w = minSize; h = w / aspect; }
		if (h < minSize) { h = minSize; w = h * aspect; }
		// 限制最大尺寸
		if (w > maxW) { w = maxW; h = w / aspect; }
		if (h > maxH) { h = maxH; w = h * aspect; }
		// 限制后可能再次超出最小，重新兜底
		if (w < minSize) { w = minSize; h = w / aspect; }
		if (h < minSize) { h = minSize; w = h * aspect; }

		return { w: w, h: h };
	}

	/** 判断点 (x,y) 是否在元素 el 的 bounding rect 内（含 10px 边缘容错） */
	function isPointInEl(x, y, el) {
		if (!el) return false;
		var r = el.getBoundingClientRect();
		var tolerance = 10;
		return x >= r.left - tolerance && x <= r.right + tolerance &&
		       y >= r.top - tolerance && y <= r.bottom + tolerance;
	}

	function createDragOverlay() {
		if (dragOverlay) return;
		dragOverlay = document.createElement('div');
		dragOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;cursor:grabbing;display:none;';
		document.body.appendChild(dragOverlay);
	}

	function createHandles() {
		if (handlesContainer) return;
		handlesContainer = document.createElement('div');
		handlesContainer.className = 'lumislate-img-handles';
		var positions = ['nw','n','ne','e','se','s','sw','w'];
		var cursors = {
			nw: 'nw-resize', n: 'ns-resize', ne: 'ne-resize',
			e: 'ew-resize', se: 'se-resize', s: 'ns-resize',
			sw: 'sw-resize', w: 'ew-resize'
		};
		positions.forEach(function(pos) {
			var h = document.createElement('div');
			h.className = 'lumislate-handle lumislate-handle-' + pos;
			h.dataset.handle = pos;
			var size = 14;
			var half = size / 2;
			var base = 'position:absolute;width:'+size+'px;height:'+size+'px;background:#3b82f6;border:2px solid #fff;border-radius:50%;pointer-events:auto;cursor:'+cursors[pos]+';box-shadow:0 1px 4px rgba(0,0,0,0.4);transition:transform 0.1s,background 0.1s;';
			switch(pos) {
				case 'nw': h.style.cssText = base + 'top:-'+half+'px;left:-'+half+'px;'; break;
				case 'n':  h.style.cssText = base + 'top:-'+half+'px;left:50%;transform:translateX(-50%);'; break;
				case 'ne': h.style.cssText = base + 'top:-'+half+'px;right:-'+half+'px;'; break;
				case 'e':  h.style.cssText = base + 'top:50%;right:-'+half+'px;transform:translateY(-50%);'; break;
				case 'se': h.style.cssText = base + 'bottom:-'+half+'px;right:-'+half+'px;'; break;
				case 's':  h.style.cssText = base + 'bottom:-'+half+'px;left:50%;transform:translateX(-50%);'; break;
				case 'sw': h.style.cssText = base + 'bottom:-'+half+'px;left:-'+half+'px;'; break;
				case 'w':  h.style.cssText = base + 'top:50%;left:-'+half+'px;transform:translateY(-50%);'; break;
			}
			handlesContainer.appendChild(h);
		});
		document.body.appendChild(handlesContainer);
	}

	function updateHandlesPosition() {
		if (!activeImage || !handlesContainer) return;
		var rect = activeImage.getBoundingClientRect();
		handlesContainer.style.left = rect.left + 'px';
		handlesContainer.style.top = rect.top + 'px';
		handlesContainer.style.width = rect.width + 'px';
		handlesContainer.style.height = rect.height + 'px';
		handlesContainer.style.display = 'block';
	}

	function activateImage(img) {
		if (activeImage === img) return;
		deactivateImage();
		activeImage = img;
		img.classList.remove('lumislate-img-hover');
		img.classList.add('lumislate-img-active');

		var computedPos = window.getComputedStyle(img).position;
		if (computedPos === 'static') {
			img.style.position = 'relative';
		}

		createHandles();
		createDragOverlay();
		updateHandlesPosition();
	}

	function deactivateImage() {
		if (!activeImage) return;
		activeImage.classList.remove('lumislate-img-active');
		activeImage.classList.remove('lumislate-img-hover');
		activeImage = null;
		if (handlesContainer) handlesContainer.style.display = 'none';
		if (dragOverlay) dragOverlay.style.display = 'none';
		isDragging = false;
		isResizing = false;
	}

	// 注入样式
	var style = document.createElement('style');
	style.textContent = '.lumislate-img-hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:grab;} .lumislate-img-active{outline:2px solid #3b82f6;outline-offset:2px;cursor:grab;} .lumislate-img-handles{position:fixed;z-index:9999;display:none;pointer-events:none;} .lumislate-handle:hover{background:#60a5fa;transform:scale(1.2);}';
	document.head.appendChild(style);

	// mouseover: 给图片添加 hover 效果
	document.body.addEventListener('mouseover', function(e) {
		if (isDragging || isResizing) return;
		var img = e.target.closest('img');
		if (img && img !== activeImage) {
			img.classList.add('lumislate-img-hover');
		}
	}, true);

	document.body.addEventListener('mouseout', function(e) {
		var img = e.target.closest('img');
		if (img && img !== activeImage) {
			img.classList.remove('lumislate-img-hover');
		}
	}, true);

	// click: 激活/取消图片编辑
	document.body.addEventListener('click', function(e) {
		var handle = e.target.closest('.lumislate-handle');
		if (handle) {
			e.stopPropagation();
			return;
		}

		var img = e.target.closest('img');
		if (img) {
			e.stopPropagation();
			e.preventDefault();
			activateImage(img);
			return;
		}

		// 点击空白处（且不在 activeImage 范围内）则退出
		if (!isPointInEl(e.clientX, e.clientY, activeImage)) {
			deactivateImage();
		}
	}, true);

	// mousedown: 开始拖拽或调整大小
	document.body.addEventListener('mousedown', function(e) {
		// 优先检测手柄（resize）
		var handle = e.target.closest('.lumislate-handle');
		if (handle && activeImage) {
			isResizing = true;
			resizeStart = {
				x: e.clientX, y: e.clientY,
				w: activeImage.offsetWidth,
				h: activeImage.offsetHeight,
				handle: handle.dataset.handle
			};
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		// 检测是否在 activeImage 区域内（支持 pointer-events 穿透场景）
		if (activeImage && isPointInEl(e.clientX, e.clientY, activeImage)) {
			isDragging = true;
			var tv = getTransformValues(activeImage);
			dragStart = { x: e.clientX, y: e.clientY, tx: tv.x, ty: tv.y };
			activeImage.style.cursor = 'grabbing';
			if (dragOverlay) dragOverlay.style.display = 'block';
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		// 点击非 activeImage 区域，取消激活
		if (activeImage && !isPointInEl(e.clientX, e.clientY, activeImage)) {
			deactivateImage();
		}
	}, true);

	// mousemove: 拖拽或调整大小中
	document.body.addEventListener('mousemove', function(e) {
		if (isDragging && activeImage) {
			var dx = e.clientX - dragStart.x;
			var dy = e.clientY - dragStart.y;
			var rawTx = dragStart.tx + dx;
			var rawTy = dragStart.ty + dy;
			var constrained = constrainTranslate(activeImage, rawTx, rawTy);
			activeImage.style.transform = 'translate(' + constrained.x + 'px, ' + constrained.y + 'px)';
			updateHandlesPosition();
			return;
		}

		if (isResizing && activeImage) {
			var dx = e.clientX - resizeStart.x;
			var dy = e.clientY - resizeStart.y;
			var aspect = resizeStart.w / resizeStart.h;
			var handle = resizeStart.handle;
			var newW, newH;

			// 强制等比例 resize：根据手柄方向选择基准轴
			if (handle === 'n' || handle === 's') {
				// 垂直手柄：以高度变化为准
				newH = resizeStart.h + (handle === 's' ? dy : -dy);
				newW = newH * aspect;
			} else if (handle === 'e' || handle === 'w') {
				// 水平手柄：以宽度变化为准
				newW = resizeStart.w + (handle === 'e' ? dx : -dx);
				newH = newW / aspect;
			} else {
				// 角点：取鼠标移动绝对值较大的方向为基准
				var ddx = (handle.indexOf('e') !== -1) ? dx : -dx;
				var ddy = (handle.indexOf('s') !== -1) ? dy : -dy;
				if (Math.abs(ddx) >= Math.abs(ddy)) {
					newW = resizeStart.w + ddx;
					newH = newW / aspect;
				} else {
					newH = resizeStart.h + ddy;
					newW = newH * aspect;
				}
			}

			var constrained = constrainResize(activeImage, newW, newH, aspect);
			var rw = Math.round(constrained.w) + 'px';
			var rh = Math.round(constrained.h) + 'px';
			activeImage.style.width = rw;
			activeImage.style.height = rh;
			activeImage.style.maxWidth = rw;
			activeImage.style.maxHeight = rh;
			updateHandlesPosition();
		}
	}, true);

	// mouseup: 结束操作
	document.body.addEventListener('mouseup', function(e) {
		if (isDragging) {
			isDragging = false;
			if (activeImage) activeImage.style.cursor = 'grab';
			if (dragOverlay) dragOverlay.style.display = 'none';
		}
		if (isResizing) {
			isResizing = false;
		}
	}, true);

	// Escape 取消
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && activeImage) {
			deactivateImage();
		}
	});

	// 滚动/resize 时更新手柄位置
	window.addEventListener('scroll', function() {
		if (activeImage) updateHandlesPosition();
	}, true);
	window.addEventListener('resize', function() {
		if (activeImage) updateHandlesPosition();
	});

	// 观察图片加载完成，更新手柄位置
	var imgObserver = new MutationObserver(function(mutations) {
		if (activeImage && !activeImage.complete) {
			activeImage.addEventListener('load', function onLoad() {
				activeImage.removeEventListener('load', onLoad);
				updateHandlesPosition();
			});
		}
	});
	imgObserver.observe(document.body, { childList: true, subtree: true });
})();
</script>`;
}

/** 将所有交互脚本（反向映射 + 图片交互）注入到 HTML 中（在 </body> 前插入） */
function injectInteractionScripts(html: string): string {
	const rmScript = getReverseMappingScript();
	const imgScript = getImageInteractionScript();
	const bodyClose = html.lastIndexOf('</body>');
	if (bodyClose !== -1) {
		return html.slice(0, bodyClose) + rmScript + '\n' + imgScript + '\n' + html.slice(bodyClose);
	}
	// 如果没有 </body>，直接在末尾追加（流式预览时常见）
	return html + '\n' + rmScript + '\n' + imgScript + '\n</body>\n</html>';
}

// ============================================================
// LumiSlateView — 右侧画布视图（含工具栏）
// ============================================================

export interface RunStats {
	startedAt: number;
	firstByteAt?: number;
	endedAt?: number;
	deltaCount: number;
	outputBytes: number;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
}

export class LumiSlateView extends ItemView {
	private iframe: HTMLIFrameElement | null = null;
	private toolbarEl: HTMLElement | null = null;
	private metricsEl: HTMLElement | null = null;
	private actionBarEl: HTMLElement | null = null;

	private currentMode: Mode = 'design';

	// 操作按钮引用（用于动态状态更新）
	private preprocessBtn: HTMLButtonElement | null = null;
	private aiRenderBtn: HTMLButtonElement | null = null;
	private exportBtn: HTMLButtonElement | null = null;
	private cancelBtn: HTMLButtonElement | null = null;
	private settingsBtn: HTMLButtonElement | null = null;
	private marpSizeSelect: HTMLSelectElement | null = null;
	private marpCssBtn: HTMLButtonElement | null = null;
	private skillSelect: HTMLSelectElement | null = null;

	// 上下文信息元素
	private contextFileEl: HTMLElement | null = null;
	private contextCacheEl: HTMLElement | null = null;
	private contextPreprocessEl: HTMLElement | null = null;

	// 内部状态
	private _isRendering = false;
	private _hasCache = false;
	private _isPreprocessed = false;
	private _hasDividers = false;
	private _currentFileName: string | null = null;

	onModeChange: ((mode: Mode) => void) | null = null;
	onSkillChange: ((skillId: string) => void) | null = null;
	onAiRender: (() => void) | null = null;
	onAiCancel: (() => void) | null = null;
	onOpenSettings: (() => void) | null = null;
	onPreprocess: (() => void) | null = null;
	onExport: (() => void) | null = null;
	onMarpSizeChange: ((size: string) => void) | null = null;
	onMarpCss: (() => void) | null = null;
	onGoHome: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return LUMISLATE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'LumiSlate Canvas';
	}

	/** 视图初始化 */
	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('lumislate-canvas-container');

		// 工具栏（顶部：模式切换 + 上下文）
		this.toolbarEl = container.createEl('div', { cls: 'lumislate-toolbar' });
		this.buildToolbar(this.toolbarEl);

		// 指标栏
		this.metricsEl = container.createEl('div', { cls: 'lumislate-metrics-bar' });
		this.metricsEl.style.display = 'none';

		// 主内容区（iframe）
		const mainArea = container.createEl('div', { cls: 'lumislate-main' });
		this.iframe = mainArea.createEl('iframe', {
			cls: 'lumislate-canvas-iframe',
		});
		this.iframe.setAttribute('srcdoc', getWelcomeHTML());
		this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

		// 底部操作栏
		this.actionBarEl = container.createEl('div', { cls: 'lumislate-action-bar' });
		this.buildActionBar(this.actionBarEl);
	}

	async onClose(): Promise<void> {
		this.iframe = null;
		this.toolbarEl = null;
		this.metricsEl = null;
		this.actionBarEl = null;
	}

	// ============ 工具栏 ============

	private buildToolbar(el: HTMLElement): void {
		el.empty();

		// 左侧：主页按钮 + 模式切换
		const leftGroup = el.createEl('div', { cls: 'lumislate-context-group' });

		const homeBtn = leftGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-icon',
			attr: { 'aria-label': '返回主页' },
		});
		setIcon(homeBtn, 'home');
		homeBtn.addEventListener('click', () => this.onGoHome?.());

		const modeGroup = leftGroup.createEl('div', { cls: 'lumislate-mode-tabs' });
		for (const mode of MODES) {
			const tab = modeGroup.createEl('button', {
				cls: `lumislate-mode-tab ${mode.id === this.currentMode ? 'active' : ''}`,
			});
			setIcon(tab.createSpan(), mode.icon);
			tab.appendText(' ' + mode.name);
			tab.addEventListener('click', () => {
				if (this.currentMode !== mode.id) {
					this.currentMode = mode.id;
					this.onModeChange?.(mode.id);
					this.buildToolbar(el);
					if (this.actionBarEl) this.buildActionBar(this.actionBarEl);
				}
			});
		}

		// 右侧：上下文信息（仅 AI 模式显示）+ 设置按钮
		const rightGroup = el.createEl('div', { cls: 'lumislate-context-group' });

		this.contextFileEl = rightGroup.createEl('span', { cls: 'lumislate-context-item' });
		this.contextFileEl.style.display = 'none';

		this.contextPreprocessEl = rightGroup.createEl('span', {
			cls: 'lumislate-context-item lumislate-context-preprocess',
		});
		this.contextPreprocessEl.style.display = 'none';

		this.contextCacheEl = rightGroup.createEl('span', {
			cls: 'lumislate-context-item lumislate-context-cache',
		});
		this.contextCacheEl.style.display = 'none';

		this.settingsBtn = rightGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-icon',
			attr: { 'aria-label': '设置' },
		});
		setIcon(this.settingsBtn, 'settings');
		this.settingsBtn.addEventListener('click', () => this.onOpenSettings?.());

		this.updateContextDisplay();
	}

	// ============ 底部操作栏 ============

	private buildActionBar(el: HTMLElement): void {
		el.empty();

		const leftGroup = el.createEl('div', { cls: 'lumislate-action-group' });
		const rightGroup = el.createEl('div', { cls: 'lumislate-action-group' });

		if (this.currentMode === 'marp') {
			this.buildMarpActionBar(leftGroup, rightGroup);
		} else {
			this.buildDesignActionBar(leftGroup, rightGroup);
		}

		this.updateActionBarState();
	}

	private buildMarpActionBar(left: HTMLElement, right: HTMLElement): void {
		// 尺寸选择下拉框
		this.marpSizeSelect = left.createEl('select', { cls: 'lumislate-skill-select' });
		const sizes = [
			{ label: '16:9', value: '16:9' },
			{ label: '4:3', value: '4:3' },
			{ label: '1:1', value: '1:1' },
		];
		for (const s of sizes) {
			this.marpSizeSelect.createEl('option', { text: s.label, value: s.value });
		}
		this.marpSizeSelect.addEventListener('change', () => {
			this.onMarpSizeChange?.(this.marpSizeSelect!.value);
		});

		this.marpCssBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.marpCssBtn.createSpan(), 'palette');
		this.marpCssBtn.appendText(' CSS');
		this.marpCssBtn.addEventListener('click', () => this.onMarpCss?.());

		// 导出
		this.exportBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.exportBtn.createSpan(), 'download');
		this.exportBtn.appendText(' 导出');
		this.exportBtn.addEventListener('click', () => this.onExport?.());
	}

	private buildDesignActionBar(left: HTMLElement, right: HTMLElement): void {
		// SKILL 选择
		this.skillSelect = left.createEl('select', { cls: 'lumislate-skill-select' });
		for (const skill of SKILLS) {
			this.skillSelect.createEl('option', {
				text: skill.name,
				value: skill.id,
			});
		}
		this.skillSelect.addEventListener('change', () => {
			this.onSkillChange?.(this.skillSelect!.value);
		});

		// 预处理
		this.preprocessBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.preprocessBtn.createSpan(), 'file-text');
		this.preprocessBtn.appendText(' 预处理');
		this.preprocessBtn.addEventListener('click', () => this.onPreprocess?.());

		// AI 渲染 / 取消（同一位置互斥显示）
		this.aiRenderBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-primary' });
		setIcon(this.aiRenderBtn.createSpan(), 'sparkles');
		this.aiRenderBtn.appendText(' AI 渲染');
		this.aiRenderBtn.addEventListener('click', () => this.onAiRender?.());

		this.cancelBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-danger' });
		setIcon(this.cancelBtn.createSpan(), 'square');
		this.cancelBtn.appendText(' 取消');
		this.cancelBtn.style.display = 'none';
		this.cancelBtn.addEventListener('click', () => this.onAiCancel?.());

		// 导出
		this.exportBtn = left.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.exportBtn.createSpan(), 'download');
		this.exportBtn.appendText(' 导出');
		this.exportBtn.addEventListener('click', () => this.onExport?.());
	}

	// ============ 状态管理 ============

	setMode(mode: Mode): void {
		if (this.currentMode !== mode) {
			this.currentMode = mode;
			if (this.toolbarEl) this.buildToolbar(this.toolbarEl);
			if (this.actionBarEl) this.buildActionBar(this.actionBarEl);
		}
	}

	getMode(): Mode {
		return this.currentMode;
	}

	setSelectedSkill(skillId: string): void {
		if (this.skillSelect) this.skillSelect.value = skillId;
	}

	getSelectedSkill(): string {
		return this.skillSelect?.value || SKILLS[0]?.id || '';
	}

	setMarpSize(size: string): void {
		if (this.marpSizeSelect) this.marpSizeSelect.value = size;
	}

	/** 设置上下文信息 */
	setContextInfo(fileName: string | null, hasCache: boolean, isPreprocessed: boolean, hasDividers?: boolean): void {
		this._currentFileName = fileName;
		this._hasCache = hasCache;
		this._isPreprocessed = isPreprocessed;
		if (hasDividers !== undefined) this._hasDividers = hasDividers;
		this.updateContextDisplay();
		this.updateActionBarState();
	}

	private updateContextDisplay(): void {
		const isMarp = this.currentMode === 'marp';

		if (this.contextFileEl) {
			if (this._currentFileName && !isMarp) {
				this.contextFileEl.empty();
				setIcon(this.contextFileEl.createSpan(), 'file-text');
				this.contextFileEl.appendText(' ' + this._currentFileName);
				this.contextFileEl.style.display = 'inline-flex';
			} else {
				this.contextFileEl.style.display = 'none';
			}
		}
		if (this.contextPreprocessEl) {
			if (this._isPreprocessed && !isMarp) {
				this.contextPreprocessEl.empty();
				setIcon(this.contextPreprocessEl.createSpan(), 'check');
				this.contextPreprocessEl.appendText(' 已预处理');
				this.contextPreprocessEl.style.display = 'inline-flex';
			} else {
				this.contextPreprocessEl.style.display = 'none';
			}
		}
		if (this.contextCacheEl) {
			if (this._hasCache && !isMarp) {
				this.contextCacheEl.empty();
				setIcon(this.contextCacheEl.createSpan(), 'database');
				this.contextCacheEl.appendText(' 缓存已命中');
				this.contextCacheEl.style.display = 'inline-flex';
			} else {
				this.contextCacheEl.style.display = 'none';
			}
		}
	}

	/** 设置渲染状态 */
	setRenderingState(isRendering: boolean): void {
		this._isRendering = isRendering;
		this.updateActionBarState();
	}

	/** 设置导出可用状态 */
	setExportEnabled(enabled: boolean): void {
		if (this.exportBtn) this.exportBtn.disabled = !enabled;
	}

	private updateActionBarState(): void {
		if (!this.aiRenderBtn || !this.cancelBtn) return;

		if (this._isRendering) {
			// 渲染中：显示取消，隐藏 AI 渲染，禁用其他
			this.aiRenderBtn.style.display = 'none';
			this.cancelBtn.style.display = 'inline-flex';
			if (this.preprocessBtn) this.preprocessBtn.disabled = true;
			if (this.exportBtn) this.exportBtn.disabled = true;
			if (this.marpSizeSelect) this.marpSizeSelect.disabled = true;
			if (this.marpCssBtn) this.marpCssBtn.disabled = true;
			if (this.skillSelect) this.skillSelect.disabled = true;
			if (this.settingsBtn) this.settingsBtn.disabled = true;
		} else {
			// 空闲：显示 AI 渲染，隐藏取消，启用所有
			this.aiRenderBtn.style.display = 'inline-flex';
			this.cancelBtn.style.display = 'none';
			if (this.preprocessBtn) this.preprocessBtn.disabled = false;
			if (this.exportBtn) this.exportBtn.disabled = !this._hasCache;
			// 尺寸选择框：有分页符时才可用
			if (this.marpSizeSelect) this.marpSizeSelect.disabled = !this._hasDividers;
			if (this.marpCssBtn) this.marpCssBtn.disabled = false;
			if (this.skillSelect) this.skillSelect.disabled = false;
			if (this.settingsBtn) this.settingsBtn.disabled = false;
		}
	}

	/** 更新状态文本 */
	setStatus(text: string): void {
		const status = this.toolbarEl?.querySelector('.lumislate-status');
		if (status) status.textContent = text;
	}

	/** 渲染 HTML 画布到 iframe */
	renderCanvas(htmlContent: string): void {
		if (!this.iframe) return;
		this.iframe.srcdoc = htmlContent;
	}

	/** 重置为欢迎页 */
	resetToWelcome(): void {
		if (!this.iframe) return;
		this.iframe.srcdoc = getWelcomeHTML();
	}

	/** 更新指标栏 */
	updateMetrics(stats: RunStats): void {
		if (!this.metricsEl) return;

		const elapsed = stats.endedAt
			? ((stats.endedAt - stats.startedAt) / 1000).toFixed(1)
			: ((Date.now() - stats.startedAt) / 1000).toFixed(1);
		const sizeKb = (stats.outputBytes / 1024).toFixed(1);
		const isRunning = !stats.endedAt;
		const statusText = isRunning ? '渲染中' : '完成';
		const statusClass = isRunning ? 'status-running' : 'status-done';

		let html = '';
		html += `<div class="lumislate-metric-status ${statusClass}"><span class="lumislate-pulse-dot"></span><span>${statusText}</span></div>`;
		html += `<div class="lumislate-metric"><span class="lumislate-metric-label">耗时</span><span class="lumislate-metric-value ${isRunning ? 'live' : ''}">${elapsed}s</span></div>`;
		html += `<div class="lumislate-metric"><span class="lumislate-metric-label">大小</span><span class="lumislate-metric-value">${sizeKb} KB</span></div>`;
		html += `<div class="lumislate-metric"><span class="lumislate-metric-label">块数</span><span class="lumislate-metric-value">${stats.deltaCount}</span></div>`;

		if (stats.model) {
			html += `<div class="lumislate-metric"><span class="lumislate-metric-label">模型</span><span class="lumislate-metric-value" title="${stats.model}">${stats.model}</span></div>`;
		}
		if (stats.inputTokens !== undefined || stats.outputTokens !== undefined) {
			const parts: string[] = [];
			if (stats.inputTokens !== undefined) parts.push(`in ${stats.inputTokens}`);
			if (stats.outputTokens !== undefined) parts.push(`out ${stats.outputTokens}`);
			html += `<div class="lumislate-metric"><span class="lumislate-metric-label">Token</span><span class="lumislate-metric-value">${parts.join(' / ')}</span></div>`;
		}

		this.metricsEl.innerHTML = html;
		this.metricsEl.style.display = 'flex';
	}

	/** 隐藏指标栏 */
	hideMetrics(): void {
		if (this.metricsEl) this.metricsEl.style.display = 'none';
	}

	/** 获取 iframe 的 window（用于 postMessage 校验） */
	getIframeWindow(): Window | null {
		return this.iframe?.contentWindow ?? null;
	}

	/** 获取 iframe 元素 */
	getIframe(): HTMLIFrameElement | null {
		return this.iframe;
	}
}

// ============================================================
// LumiSlatePlugin — 主插件类
// ============================================================

export default class LumiSlatePlugin extends Plugin {
	settings: LumiSlateSettings = DEFAULT_SETTINGS;
	private cacheManager!: CacheManager;
	private aiAbortCtl: AbortController | null = null;
	private aiCancelled = false;
	private aiAccumulated = '';
	private currentRunStats: RunStats | null = null;
	private metricsTimer: number | null = null;
	private marpRenderDebounceTimer: number | null = null;

	async onload(): Promise<void> {
		console.log('LumiSlate (流光石板) 插件已加载');

		// 加载设置
		await this.loadSettings();

		// 初始化缓存管理器
		this.cacheManager = new CacheManager(this.app, this.manifest.dir);

		// 注册自定义视图
		this.registerView(
			LUMISLATE_VIEW_TYPE,
			(leaf) => {
				const view = new LumiSlateView(leaf);
				view.onModeChange = (mode) => {
					this.settings.defaultMode = mode;
					this.saveSettings();
				};
				view.onSkillChange = (id) => {
					this.settings.defaultSkill = id;
					this.saveSettings();
				};
				view.onAiRender = () => this.aiRenderCurrentNote();
				view.onAiCancel = () => this.cancelAiRender();
				view.onOpenSettings = () => {
					// @ts-expect-error 内部 API
					this.app.setting.open();
					// @ts-expect-error 内部 API
					this.app.setting.openTabById(this.manifest.id);
				};
				view.onPreprocess = () => this.preprocessCurrentNote();
				view.onExport = () => this.showExportMenu();
				view.onMarpSizeChange = (size) => this.handleMarpSizeChange(size);
				view.onMarpCss = () => this.showMarpCssModal();
				view.onGoHome = () => view.resetToWelcome();
				// 恢复上次选中的模式和 skill
				view.setMode(this.settings.defaultMode);
				view.setSelectedSkill(this.settings.defaultSkill);
					this.refreshViewContext();
				return view;
			}
		);

		// 注册设置面板
		this.addSettingTab(new LumiSlateSettingTab(this.app, this));

		// 启动时检测本地 agent
		this.detectLocalAgents();

		// Ribbon 图标
		this.addRibbonIcon('sparkles', '打开 LumiSlate 画布', async () => {
			await this.activateView();
		});

		// 命令
		this.addCommand({
			id: 'open-lumislate-canvas',
			name: '打开 LumiSlate 画布',
			callback: async () => {
				await this.activateView();
			},
		});

		this.addCommand({
			id: 'ai-render-current-note',
			name: 'LumiSlate：AI 渲染当前笔记',
			callback: async () => {
				await this.aiRenderCurrentNote();
			},
		});

		this.addCommand({
			id: 'clear-lumislate-cache',
			name: 'LumiSlate：清除当前笔记缓存',
			callback: async () => {
				await this.clearCurrentNoteCache();
			},
		});

		// postMessage 监听
		// 监听活跃文件变化，更新视图上下文
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.refreshViewContext();
			})
		);

		// Marp 模式实时同步：监听当前文件修改，自动重新渲染
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.path !== file.path) return;
				const view = this.getLumiSlateView();
				if (!view || view.getMode() !== 'marp') return;
				// 防抖：200ms 内多次修改只渲染一次
				if (this.marpRenderDebounceTimer) {
					clearTimeout(this.marpRenderDebounceTimer);
				}
				this.marpRenderDebounceTimer = window.setTimeout(() => {
					this.marpRenderDebounceTimer = null;
					this.renderCurrentNote();
				}, 200);
			})
		);

		this.setupReverseMapping();
	}

	onunload(): void {
		console.log('LumiSlate 插件已卸载');
		this.cancelAiRender();
		if (this.marpRenderDebounceTimer) {
			clearTimeout(this.marpRenderDebounceTimer);
		}
		this.app.workspace.detachLeavesOfType(LUMISLATE_VIEW_TYPE);
	}

	// ------------------- 设置管理 -------------------

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ------------------- 本地 Agent 检测 -------------------

	/** 检测本地 CLI Agent，如果检测到可用且未手动设置，则自动选用 */
	detectLocalAgents(): void {
		const available = getAvailableAgents();
		if (available.length === 0) {
			console.log('[LumiSlate] 未检测到任何本地 CLI Agent');
			return;
		}
		console.log('[LumiSlate] 检测到本地 Agent:', available.map((a) => a.id).join(', '));
		// 如果当前没有选中本地 agent，自动选择第一个可用的
		if (!this.settings.localAgent) {
			this.settings.localAgent = available[0].id;
			this.saveSettings();
		}
	}

	/** 获取实际使用的 AI provider（local 或 http），考虑自动回退 */
	resolveAIProvider(): { provider: 'local' | 'http'; agentId?: string; reason: string } {
		if (this.settings.aiProvider === 'local') {
			const agent = this.settings.localAgent
				? detectAgent(this.settings.localAgent)
				: undefined;
			if (agent?.available) {
				return { provider: 'local', agentId: agent.id, reason: `本地 ${agent.label}` };
			}
			// 本地不可用，尝试任何可用本地 agent
			const anyAvailable = getAvailableAgents()[0];
			if (anyAvailable) {
				return { provider: 'local', agentId: anyAvailable.id, reason: `自动回退到 ${anyAvailable.label}` };
			}
			// 完全没有本地 agent，回退 HTTP
			if (this.settings.apiKey) {
				return { provider: 'http', reason: '本地 Agent 未安装，回退到 HTTP API' };
			}
			return { provider: 'http', reason: '本地 Agent 未安装，且未配置 HTTP API' };
		}
		return { provider: 'http', reason: 'HTTP API' };
	}

	// ------------------- 视图管理 -------------------

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(LUMISLATE_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: LUMISLATE_VIEW_TYPE, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	getLumiSlateView(): LumiSlateView | null {
		const leaves = this.app.workspace.getLeavesOfType(LUMISLATE_VIEW_TYPE);
		if (leaves.length === 0) return null;
		return leaves[0].view as LumiSlateView;
	}

	/** 刷新视图上下文信息（文件名、缓存状态、预处理状态） */
	private async refreshViewContext(): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) return;

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			view.setContextInfo(null, false, false, false);
			view.setExportEnabled(false);
			return;
		}

		const mode = view.getMode();
		const skillId = view.getSelectedSkill();
		const preprocessKey = mode === 'marp' ? 'marp' : skillId;

		// 检查预处理状态
		const preprocessState = await checkPreprocessedState(this.app.vault, activeFile, preprocessKey);

		const markdown = await this.app.vault.read(activeFile);
		const { frontmatter, body } = extractFrontmatter(markdown);

		// 检测是否有 Marp 分页符（用于控制尺寸选择框状态）
		const hasDividers = /^---\s*$/m.test(body);

		// 读取当前 size 设置并同步到下拉框
		const currentSize = extractFrontmatterValue(frontmatter, 'size') || '16:9';
		view.setMarpSize(currentSize);

		// Marp 模式：不检查缓存，始终实时渲染
		if (mode === 'marp') {
			view.setContextInfo(activeFile.basename, false, preprocessState.preprocessed, hasDividers);
			view.setExportEnabled(false);
			return;
		}

		// Design 模式：检查缓存状态
		const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
		const cachedHtml = await this.cacheManager.readCache(activeFile.path, markdown, prompt);

		view.setContextInfo(activeFile.basename, !!cachedHtml, preprocessState.preprocessed, hasDividers);
		view.setExportEnabled(!!cachedHtml || !!this.aiAccumulated);
	}

	// ------------------- 降级渲染（无 AI） -------------------

	async renderCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const markdown = await this.app.vault.read(activeFile);
		const notePath = activeFile.path;

		const { frontmatter } = extractFrontmatter(markdown);
		const theme = extractFrontmatterValue(frontmatter, 'lumislate_theme');
		const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');

		// 解析 Vault 内图片路径为可访问 URL
		const resolvedMarkdown = resolveImagePaths(markdown, this.app, notePath);

		await this.activateView();

		const view = this.getLumiSlateView();
		if (!view) {
			new Notice('画布视图未就绪');
			return;
		}

		const mode = view.getMode();

		// Marp 模式：实时渲染，不缓存
		if (mode === 'marp') {
			const html = await buildMarpFallbackPage(resolvedMarkdown, this.app, this.manifest.dir);
			const injected = injectInteractionScripts(html);
			view.renderCanvas(injected);
			await this.refreshViewContext();
			return;
		}

		// Design 模式：优先读取缓存（缓存键仍用原始 markdown，保证一致性）
		let html = notePath ? await this.cacheManager.readCache(notePath, markdown, prompt) : null;

		if (!html) {
			const bodyHtml = markdownToSimpleHTML(resolvedMarkdown);
			html = buildHTMLPage(bodyHtml);
			if (notePath) {
				await this.cacheManager.writeCache(notePath, html, markdown, theme, prompt);
			}
			new Notice('LumiSlate：已生成并缓存画布');
		} else {
			new Notice('LumiSlate：已从缓存恢复画布');
		}

		const injected = injectInteractionScripts(html);
		view.renderCanvas(injected);
		await this.refreshViewContext();
	}

	// ------------------- AI 渲染 -------------------

	async aiRenderCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const markdown = await this.app.vault.read(activeFile);
		const notePath = activeFile.path;

		await this.activateView();
		const view = this.getLumiSlateView();
		if (!view) {
			new Notice('画布视图未就绪');
			return;
		}

		const mode = view.getMode();
		const skillId = view.getSelectedSkill();
		const skill = mode === 'design' ? getSkillById(skillId) : null;
		if (mode === 'design' && !skill) {
			new Notice('未找到选中的 SKILL');
			return;
		}

		// 决定使用哪种 provider
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'http' && !this.settings.apiKey) {
			new Notice('未配置 AI：请在设置中选择本地 Agent 或配置 HTTP API Key');
			return;
		}

		// 内部渲染函数
		const doRender = async (renderMarkdown: string, renderNotePath: string) => {
				view.setRenderingState(true);
			// 组装 prompt
			let prompt: string;

			if (mode === 'marp') {
				// Marp 模式: 使用 MARP_BODY + frontmatter 指令
				let extraPrefix = '';
				const { frontmatter } = extractFrontmatter(renderMarkdown);
				if (frontmatter) {
					const directives = parseMarpDirectives(frontmatter);
					if (directives && directives !== '(无额外指令)') {
						extraPrefix = `【用户指定的 Marp 指令】\n${directives}`;
					}
				}
				prompt = assemblePrompt(MARP_BODY, renderMarkdown, extraPrefix || undefined);
			} else {
				// Design 模式: 使用选中的 skill
				prompt = assemblePrompt(skill!.body, renderMarkdown);
			}

			// 取消之前的请求
			this.cancelAiRender();

			const ctl = new AbortController();
			this.aiAbortCtl = ctl;
			this.aiCancelled = false;
			this.aiAccumulated = '';

			view.setStatus(`${resolved.reason} 渲染中…`);
			const modeLabel = mode === 'marp' ? 'Marp 幻灯片' : skill?.name ?? 'Design';
			new Notice(`LumiSlate：开始 AI 渲染 (${modeLabel} · ${resolved.reason})`);

			// 初始化统计
			this.currentRunStats = {
				startedAt: Date.now(),
				deltaCount: 0,
				outputBytes: 0,
			};
			this.startMetricsTimer();
			view.updateMetrics(this.currentRunStats);

			// 统一的流式回调
			const handleDelta = (text: string) => {
				this.aiAccumulated += text;
				if (this.currentRunStats) {
					if (!this.currentRunStats.firstByteAt) {
						this.currentRunStats.firstByteAt = Date.now();
					}
					this.currentRunStats.deltaCount++;
					this.currentRunStats.outputBytes += new TextEncoder().encode(text).length;
					this.updateMetricsDisplay();
				}
				const preview = previewHtml(this.aiAccumulated);
				const injected = injectInteractionScripts(preview);
				view.renderCanvas(injected);
			};

			const handleDone = () => {
				this.aiAbortCtl = null;
				view.setRenderingState(false);
				if (this.currentRunStats) {
					this.currentRunStats.endedAt = Date.now();
					this.updateMetricsDisplay();
				}
				this.stopMetricsTimer();

				if (this.aiCancelled) {
					view.setStatus('已取消');
					return;
				}

				const finalHtml = injectInteractionScripts(this.aiAccumulated);
				view.renderCanvas(finalHtml);
				view.setStatus('渲染完成');
				view.setExportEnabled(true);

				// 写入缓存
				if (renderNotePath) {
					const { frontmatter } = extractFrontmatter(renderMarkdown);
					const theme = extractFrontmatterValue(frontmatter, 'lumislate_theme');
					const promptMeta = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
					this.cacheManager.writeCache(renderNotePath, finalHtml, renderMarkdown, theme, promptMeta)
						.then(() => new Notice('LumiSlate：AI 渲染结果已缓存'))
						.catch((e) => console.error('缓存写入失败', e));
				}
			};

			try {
				await compileWithAI(
					prompt,
					{
						provider: resolved.provider,
						agentId: resolved.agentId,
						binOverride: this.settings.localAgentBinOverride,
						llmConfig: {
							apiKey: this.settings.apiKey,
							baseURL: this.settings.apiBaseUrl,
							model: this.settings.model,
						},
						model: resolved.provider === 'local' ? undefined : this.settings.model,
						signal: ctl.signal,
					},
					{
						onDelta: handleDelta,
						onHtml: (text) => {
							// Agent 通过 Write 工具输出的完整 HTML，直接替换
							this.aiAccumulated = text;
							const injected = injectInteractionScripts(text);
							view.renderCanvas(injected);
						},
						onMeta: (key, value) => {
							if (key === 'model' && typeof value === 'string') {
								if (this.currentRunStats) {
									this.currentRunStats.model = value;
									this.updateMetricsDisplay();
								}
								view.setStatus(`${resolved.reason} · ${value}`);
							}
							if (key === 'usage' && value && typeof value === 'object') {
								const u = value as Record<string, number>;
								if (this.currentRunStats) {
									this.currentRunStats.inputTokens = u.input_tokens ?? u.prompt_tokens;
									this.currentRunStats.outputTokens = u.completion_tokens ?? u.output_tokens;
									this.updateMetricsDisplay();
								}
							}
							console.log('[LumiSlate] meta:', key, value);
						},
						onStderr: (text) => {
							console.log('[LumiSlate] stderr:', text);
						},
						onError: (err) => {
							if (this.currentRunStats) {
								this.currentRunStats.endedAt = Date.now();
								this.updateMetricsDisplay();
							}
							this.stopMetricsTimer();
							view.setStatus(`错误: ${err.slice(0, 40)}`);
							new Notice(`AI 渲染失败: ${err}`);
						},
						onDone: handleDone,
					}
				);
			} catch (err) {
				this.aiAbortCtl = null;
				view.setRenderingState(false);
				if (this.currentRunStats) {
					this.currentRunStats.endedAt = Date.now();
					this.updateMetricsDisplay();
				}
				this.stopMetricsTimer();
				const msg = String((err as Error)?.message ?? err);
				view.setStatus(`错误: ${msg.slice(0, 40)}`);
				new Notice(`AI 渲染失败: ${msg}`);
			}
		};

		// 预处理绑定 key：marp 模式用 'marp'，design 模式用 skillId
		const preprocessKey = mode === 'marp' ? 'marp' : skillId;
		const preprocessLabel = mode === 'marp' ? 'Marp 幻灯片' : skill!.name;

		// 检查预处理状态
		const preprocessState = await checkPreprocessedState(this.app.vault, activeFile, preprocessKey);

		if (!preprocessState.preprocessed) {
			return new Promise((resolve) => {
				new PreprocessConfirmModal(
					this.app,
					preprocessLabel,
					`${activeFile.basename}_preprocessed.md`,
					async (choice) => {
						if (choice === 'cancel') {
							resolve(undefined);
							return;
						}

						let renderMarkdown = markdown;
						let renderNotePath = notePath;

						if (choice === 'preprocess') {
							const preprocessedFile = await createPreprocessedFile(
								this.app.vault,
								activeFile,
								preprocessKey
							);
							renderMarkdown = await this.app.vault.read(preprocessedFile);
							renderNotePath = preprocessedFile.path;
						}

						await doRender(renderMarkdown, renderNotePath);
						resolve(undefined);
					}
				).open();
			});
		}

		let renderMarkdown = markdown;
		let renderNotePath = notePath;
		if (preprocessState.file && preprocessState.file.path !== activeFile.path) {
			renderMarkdown = await this.app.vault.read(preprocessState.file);
			renderNotePath = preprocessState.file.path;
		}

		await doRender(renderMarkdown, renderNotePath);
	}

	// ------------------- 预处理 -------------------

	async preprocessCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const view = this.getLumiSlateView();
		const mode = view?.getMode() || this.settings.defaultMode;
		const skillId = view?.getSelectedSkill() || this.settings.defaultSkill;
		const preprocessKey = mode === 'marp' ? 'marp' : skillId;
		const label = mode === 'marp' ? 'Marp 幻灯片' : getSkillById(skillId)?.name ?? '当前模板';

		await createPreprocessedFile(this.app.vault, activeFile, preprocessKey);
		new Notice(`已针对 ${label} 完成预处理`);
		await this.refreshViewContext();
	}

	// ------------------- 导出 -------------------

	showExportMenu(): void {
		const view = this.getLumiSlateView();
		if (!view) return;

		new ExportMenuModal(this.app, (type) => {
			switch (type) {
				case 'html-download':
					this.exportHtmlDownload();
					break;
				case 'png-download':
					this.exportPngDownload();
					break;
				case 'html-vault':
					this.saveHtmlToVaultPath();
					break;
			}
		}).open();
	}

	exportHtmlDownload(): void {
		const html = this.aiAccumulated || '';
		if (!html) {
			new Notice('画布为空，无法导出');
			return;
		}
		const activeFile = this.app.workspace.getActiveFile();
		const basename = activeFile ? activeFile.basename : 'lumislate-export';
		downloadHtml(html, `${basename}-${Date.now()}`);
	}

	async exportPngDownload(): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) {
			new Notice('画布视图未就绪');
			return;
		}
		const iframe = view.getIframe();
		if (!iframe) {
			new Notice('画布未加载');
			return;
		}
		const activeFile = this.app.workspace.getActiveFile();
		const basename = activeFile ? activeFile.basename : 'lumislate-export';
		await downloadPngFromIframe(iframe, `${basename}-${Date.now()}`);
	}

	async saveHtmlToVaultPath(): Promise<void> {
		const html = this.aiAccumulated || '';
		if (!html) {
			new Notice('画布为空，无法保存');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('未找到当前笔记');
			return;
		}

		const folder = this.settings.defaultExportFolder || activeFile.parent?.path || '';
		const filename = `${activeFile.basename}.html`;
		const targetPath = folder ? `${folder}/${filename}` : filename;

		await saveHtmlToVault(this.app, html, targetPath);
	}

	// ------------------- Marp 模式专用工具 -------------------

	/** 处理 Marp 尺寸比例切换 */
	async handleMarpSizeChange(size: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}
		await this.updateMarpFrontmatterField('size', size);
		// 自动重新渲染使新比例生效
		await this.renderCurrentNote();
	}

	/** CSS 系统提示词 JSON 文件路径 */
	private getCssPromptFilePath(): string {
		return `${this.manifest.dir}/css-system-prompt.json`;
	}

	/** 从 JSON 文件读取自定义 CSS 系统提示词，失败则返回默认 */
	private async loadCssSystemPrompt(): Promise<string> {
		const filePath = this.getCssPromptFilePath();
		try {
			const raw = await this.app.vault.adapter.read(filePath);
			const data = JSON.parse(raw);
			if (typeof data.systemPrompt === 'string' && data.systemPrompt.trim()) {
				return data.systemPrompt.trim();
			}
		} catch {
			// 文件不存在或解析失败，使用默认
		}
		return DEFAULT_CSS_SYSTEM_PROMPT;
	}

	/** 组装完整的 CSS 系统提示词 */
	private async getCssSystemPrompt(currentCss: string): Promise<string> {
		const ruleBody = await this.loadCssSystemPrompt();

		return `你是 LumiSlate 插件的 CSS 设计专家，专门帮助用户为 Marp 幻灯片模式编写自定义 CSS。

## 当前 CSS 代码
\`\`\`css
${currentCss || '/* 当前为空 */'}
\`\`\`

${ruleBody}`;
	}

	/** 在 Obsidian 中打开 CSS 系统提示词 JSON 文件 */
	async openCssSystemPromptFile(): Promise<void> {
		const filePath = this.getCssPromptFilePath();

		// 如果文件不存在，用默认内容创建
		const exists = await this.app.vault.adapter.exists(filePath);
		if (!exists) {
			const defaultData = {
				version: 1,
				systemPrompt: DEFAULT_CSS_SYSTEM_PROMPT,
			};
			await this.app.vault.adapter.write(filePath, JSON.stringify(defaultData, null, 2));
			new Notice('已创建默认提示词文件');
		}

		// 用 Obsidian 打开文件
		const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
		if (abstractFile instanceof TFile) {
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(abstractFile);
		} else {
			// 如果 Obsidian 文件系统未识别，用系统方式打开
			new Notice('文件已创建，请手动在 .obsidian/plugins/obsidian-lumislate/ 目录中编辑 css-system-prompt.json');
		}
	}

	/** 在 AI 聊天面板中追加消息 */
	private appendAiChatMessage(chatEl: HTMLElement, role: 'user' | 'ai', text: string): void {
		const msg = chatEl.createEl('div', { cls: `lumislate-css-ai-msg lumislate-css-ai-msg-${role}` });
		msg.createEl('div', { cls: 'lumislate-css-ai-msg-role', text: role === 'user' ? '你' : 'AI' });
		const content = msg.createEl('div', { cls: 'lumislate-css-ai-msg-content' });
		content.textContent = text;
		chatEl.scrollTop = chatEl.scrollHeight;
	}

	/** 发送 AI CSS 辅助请求 */
	private async sendAiCssAssist(
		userPrompt: string,
		currentCss: string,
		chatEl: HTMLElement,
		textArea: TextAreaComponent,
		statusEl: HTMLElement,
	): Promise<void> {
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'http' && !this.settings.apiKey) {
			this.appendAiChatMessage(chatEl, 'ai', '错误：未配置 AI。请在设置中选择本地 Agent 或配置 HTTP API Key。');
			return;
		}

		this.appendAiChatMessage(chatEl, 'user', userPrompt);
		statusEl.textContent = '思考中…';
		statusEl.addClass('lumislate-css-ai-status-active');

		const systemPrompt = await this.getCssSystemPrompt(currentCss);
		const fullPrompt = `${systemPrompt}\n\n## 用户的请求\n${userPrompt}\n\n请输出修改后的完整 CSS 代码：`;

		let cssResult = '';
		const ctl = new AbortController();
		this.aiAbortCtl = ctl;

		// 创建 AI 回复消息的流式容器
		const msg = chatEl.createEl('div', { cls: 'lumislate-css-ai-msg lumislate-css-ai-msg-ai' });
		msg.createEl('div', { cls: 'lumislate-css-ai-msg-role', text: 'AI' });
		const content = msg.createEl('div', { cls: 'lumislate-css-ai-msg-content' });
		const applyBtn = msg.createEl('button', { text: '应用此 CSS', cls: 'lumislate-btn lumislate-btn-primary lumislate-btn-small' });
		applyBtn.style.marginTop = '8px';
		applyBtn.style.display = 'none';

		try {
			await compileWithAI(
				fullPrompt,
				{
					provider: resolved.provider,
					agentId: resolved.agentId,
					binOverride: this.settings.localAgentBinOverride,
					llmConfig: {
						apiKey: this.settings.apiKey,
						baseURL: this.settings.apiBaseUrl,
						model: this.settings.model,
					},
					model: resolved.provider === 'local' ? undefined : this.settings.model,
					signal: ctl.signal,
				},
				{
					onDelta: (text) => {
						cssResult += text;
						content.textContent = cssResult;
						chatEl.scrollTop = chatEl.scrollHeight;
					},
					onHtml: (text) => {
						cssResult = text;
						content.textContent = cssResult;
						chatEl.scrollTop = chatEl.scrollHeight;
					},
					onMeta: () => {},
					onStderr: () => {},
					onError: (err) => {
						content.textContent = `错误：${err}`;
						statusEl.textContent = '';
						statusEl.removeClass('lumislate-css-ai-status-active');
					},
					onDone: () => {
						this.aiAbortCtl = null;
						statusEl.textContent = '';
						statusEl.removeClass('lumislate-css-ai-status-active');
						// 清理可能的 markdown 围栏
						let cleanCss = cssResult;
						const fenceMatch = cleanCss.match(/```(?:css)?\s*([\s\S]*?)```/);
						if (fenceMatch) cleanCss = fenceMatch[1].trim();
						if (cleanCss) {
							cssResult = cleanCss;
							content.textContent = cssResult;
							applyBtn.style.display = 'inline-flex';
							applyBtn.onclick = () => {
								textArea.setValue(cssResult);
								new Notice('AI 生成的 CSS 已应用到编辑器');
							};
						}
					},
				}
			);
		} catch (err) {
			this.aiAbortCtl = null;
			content.textContent = `请求失败：${String((err as Error)?.message ?? err)}`;
			statusEl.textContent = '';
			statusEl.removeClass('lumislate-css-ai-status-active');
		}
	}

	/** 显示 Marp CSS 编辑弹窗 — 三栏：左侧文件列表，中间代码编辑，右侧 AI 助手 */
	async showMarpCssModal(): Promise<void> {
		const cssDir = `${this.manifest.dir}/css`;

		// 确保 css 目录存在
		const dirExists = await this.app.vault.adapter.exists(cssDir);
		if (!dirExists) {
			await this.app.vault.adapter.mkdir(cssDir);
		}

		const modal = new Modal(this.app);
		modal.setTitle('自定义 CSS');
		modal.modalEl.addClass('lumislate-css-modal');

		const wrap = modal.contentEl.createEl('div', { cls: 'lumislate-css-editor' });

		// ===== 左侧面板：文件列表 =====
		const leftPanel = wrap.createEl('div', { cls: 'lumislate-css-left' });
		const leftHeader = leftPanel.createEl('div', { cls: 'lumislate-css-left-header' });
		leftHeader.createEl('span', { text: '选择预设', cls: 'lumislate-css-left-title' });

		const newBtn = leftHeader.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small' });
		setIcon(newBtn, 'file-plus');
		newBtn.appendText(' 新建');

		// 新建文件输入区（默认隐藏）
		const newFileWrap = leftPanel.createEl('div', { cls: 'lumislate-css-newfile' });
		newFileWrap.style.display = 'none';
		const newFileInput = newFileWrap.createEl('input');
		newFileInput.type = 'text';
		newFileInput.placeholder = '文件名（不含扩展名）';
		newFileInput.addClass('lumislate-css-newfile-input');
		const newFileConfirm = newFileWrap.createEl('button', { text: '创建', cls: 'lumislate-btn lumislate-btn-primary lumislate-btn-small' });
		const newFileCancel = newFileWrap.createEl('button', { text: '取消', cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small' });

		const fileListEl = leftPanel.createEl('div', { cls: 'lumislate-css-file-list' });

		// ===== 中间面板：代码编辑 =====
		const centerPanel = wrap.createEl('div', { cls: 'lumislate-css-center' });

		const pathLabel = centerPanel.createEl('div', { cls: 'lumislate-css-path' });
		pathLabel.textContent = cssDir;

		const textArea = new TextAreaComponent(centerPanel)
			.setPlaceholder('/* 选择左侧预设或新建 CSS 文件 */')
			.setValue('');
		textArea.inputEl.addClass('lumislate-css-textarea');

		// 底部操作栏
		const btnWrap = centerPanel.createEl('div', { cls: 'lumislate-css-right-actions' });
		const deleteBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-danger lumislate-btn-small' });
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.appendText(' 删除');

		const saveBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-primary lumislate-btn-small' });
		setIcon(saveBtn, 'save');
		saveBtn.appendText(' 保存');

		const applyBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small' });
		setIcon(applyBtn, 'check');
		applyBtn.appendText(' 应用到笔记');

		// ===== 右侧面板：AI 助手 =====
		const rightPanel = wrap.createEl('div', { cls: 'lumislate-css-right' });

		// AI 头部
		const aiHeader = rightPanel.createEl('div', { cls: 'lumislate-css-ai-header' });
		aiHeader.createEl('span', { text: 'AI 助手', cls: 'lumislate-css-ai-title' });
		const aiStatus = aiHeader.createEl('span', { cls: 'lumislate-css-ai-status' });

		// AI 聊天区域
		const aiChat = rightPanel.createEl('div', { cls: 'lumislate-css-ai-chat' });
		// 初始提示消息
		const welcomeMsg = aiChat.createEl('div', { cls: 'lumislate-css-ai-msg lumislate-css-ai-msg-ai' });
		welcomeMsg.createEl('div', { cls: 'lumislate-css-ai-msg-role', text: 'AI' });
		welcomeMsg.createEl('div', {
			cls: 'lumislate-css-ai-msg-content',
			text: '你好！我可以帮你调整 CSS 样式。描述你想要的视觉效果，我会生成合适的 CSS 代码。',
		});

		// AI 输入区
		const aiInputWrap = rightPanel.createEl('div', { cls: 'lumislate-css-ai-input-wrap' });
		const aiInput = aiInputWrap.createEl('textarea', { cls: 'lumislate-css-ai-input' });
		aiInput.placeholder = '描述你想要的样式，例如：把背景改成浅色渐变，标题用深蓝色…';
		aiInput.rows = 2;
		const aiSendBtn = aiInputWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-primary lumislate-btn-small' });
		setIcon(aiSendBtn, 'send');
		aiSendBtn.style.marginTop = '6px';
		aiSendBtn.style.alignSelf = 'flex-end';

		// AI 发送
		const doSend = () => {
			const prompt = aiInput.value.trim();
			if (!prompt) return;
			this.sendAiCssAssist(prompt, textArea.getValue(), aiChat, textArea, aiStatus);
			aiInput.value = '';
		};
		aiSendBtn.addEventListener('click', doSend);
		aiInput.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && !ev.shiftKey) {
				ev.preventDefault();
				doSend();
			}
		});

		// 状态变量
		let cssFiles: string[] = [];
		let selectedFile: string | null = null;
		let hasUnsavedChanges = false;

		const getFilePath = (name: string) => `${cssDir}/${name}`;

		/** 开始重命名文件项 */
		const startRename = (itemEl: HTMLElement, file: string) => {
			fileListEl.querySelectorAll('.lumislate-css-rename-input').forEach((el) => el.remove());
			itemEl.empty();
			itemEl.addClass('active');
			const input = itemEl.createEl('input', {
				cls: 'lumislate-css-rename-input',
				value: file,
			});
			input.focus();
			input.select();

			const doRename = async () => {
				const newName = input.value.trim();
				input.remove();
				if (!newName || newName === file) {
					refreshFileList();
					return;
				}
				const finalName = newName.endsWith('.css') ? newName : `${newName}.css`;
				if (finalName === file) {
					refreshFileList();
					return;
				}
				const oldPath = getFilePath(file);
				const newPath = getFilePath(finalName);
				const exists = await this.app.vault.adapter.exists(newPath);
				if (exists) {
					new Notice('该文件名已存在');
					refreshFileList();
					return;
				}
				const content = await this.app.vault.adapter.read(oldPath).catch(() => '');
				await this.app.vault.adapter.write(newPath, content);
				await this.app.vault.adapter.remove(oldPath);
				if (selectedFile === file) {
					selectedFile = finalName;
				}
				new Notice(`已重命名为 ${finalName}`);
				await refreshFileList();
			};

			input.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter') { ev.preventDefault(); doRename(); }
				if (ev.key === 'Escape') { itemEl.empty(); itemEl.setText(file); }
			});
			input.addEventListener('blur', () => doRename());
		};

		/** 显示文件右键菜单 */
		const showFileContextMenu = (e: MouseEvent, file: string, itemEl: HTMLElement) => {
			// 清除已有的菜单
			document.querySelectorAll('.lumislate-context-menu').forEach((el) => el.remove());

			const menu = document.createElement('div');
			menu.addClass('lumislate-context-menu');
			menu.style.left = `${e.pageX}px`;
			menu.style.top = `${e.pageY}px`;

			const renameItem = menu.createEl('div', { cls: 'lumislate-context-menu-item', text: '重命名' });
			setIcon(renameItem.createSpan(), 'pencil');
			renameItem.addEventListener('click', () => {
				menu.remove();
				startRename(itemEl, file);
			});

			const deleteItem = menu.createEl('div', { cls: 'lumislate-context-menu-item danger', text: '删除' });
			setIcon(deleteItem.createSpan(), 'trash-2');
			deleteItem.addEventListener('click', async () => {
				menu.remove();
				if (!confirm(`确定要删除 ${file} 吗？`)) return;
				await this.app.vault.adapter.remove(getFilePath(file));
				if (selectedFile === file) {
					selectedFile = null;
					hasUnsavedChanges = false;
					textArea.setValue('');
				}
				await refreshFileList();
				new Notice('已删除');
			});

			document.body.appendChild(menu);

			// 点击外部关闭菜单
			const closeMenu = (ev: MouseEvent) => {
				if (!menu.contains(ev.target as Node)) {
					menu.remove();
					document.removeEventListener('click', closeMenu);
				}
			};
			// 延迟绑定，避免当前点击立即触发关闭
			setTimeout(() => document.addEventListener('click', closeMenu), 0);
		};

		const refreshFileList = async () => {
			fileListEl.empty();
			try {
				const listing = await this.app.vault.adapter.list(cssDir);
				cssFiles = listing.files
					.filter((f) => f.endsWith('.css'))
					.map((f) => f.split('/').pop() || f)
					.sort();
			} catch {
				cssFiles = [];
			}

			if (cssFiles.length === 0) {
				fileListEl.createEl('div', {
					text: '暂无 CSS 预设',
					cls: 'lumislate-css-file-item lumislate-css-file-empty',
				});
				return;
			}

			for (const file of cssFiles) {
				const item = fileListEl.createEl('div', {
					text: file,
					cls: 'lumislate-css-file-item',
				});
				if (file === selectedFile) {
					item.addClass('active');
				}

				// 单击选择
				item.addEventListener('click', async () => {
					if (hasUnsavedChanges) {
						newFileWrap.style.display = 'none';
						new Notice('请先保存当前修改');
						return;
					}
					selectedFile = file;
					hasUnsavedChanges = false;
					const content = await this.app.vault.adapter.read(getFilePath(file)).catch(() => '');
					textArea.setValue(content);
					refreshFileList();
				});

				// 双击重命名
				item.addEventListener('dblclick', (e) => {
					e.stopPropagation();
					if (hasUnsavedChanges) {
						new Notice('请先保存当前修改');
						return;
					}
					startRename(item, file);
				});

				// 右键弹出菜单（重命名 + 删除）
				item.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (hasUnsavedChanges) {
						new Notice('请先保存当前修改');
						return;
					}
					showFileContextMenu(e, file, item);
				});
			}
		};

		// 新建文件
		newBtn.addEventListener('click', () => {
			if (hasUnsavedChanges) {
				new Notice('请先保存当前修改');
				return;
			}
			newFileWrap.style.display = 'flex';
			newFileInput.value = '';
			newFileInput.focus();
		});

		newFileCancel.addEventListener('click', () => {
			newFileWrap.style.display = 'none';
		});

		const doCreateFile = async () => {
			const raw = newFileInput.value.trim();
			if (!raw) return;
			const fileName = raw.endsWith('.css') ? raw : `${raw}.css`;
			const filePath = getFilePath(fileName);
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				new Notice('该文件已存在');
				return;
			}
			await this.app.vault.adapter.write(filePath, '/* 新预设 */\n');
			selectedFile = fileName;
			hasUnsavedChanges = false;
			textArea.setValue('/* 新预设 */\n');
			newFileWrap.style.display = 'none';
			await refreshFileList();
			new Notice(`已创建 ${fileName}`);
		};

		newFileInput.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				doCreateFile();
			}
			if (ev.key === 'Escape') {
				newFileWrap.style.display = 'none';
			}
		});

		newFileConfirm.addEventListener('click', doCreateFile);

		// 保存
		saveBtn.addEventListener('click', async () => {
			if (!selectedFile) {
				new Notice('请先选择或新建一个预设');
				return;
			}
			await this.app.vault.adapter.write(getFilePath(selectedFile), textArea.getValue());
			hasUnsavedChanges = false;
			new Notice(`已保存 ${selectedFile}`);
		});

		// 删除
		deleteBtn.addEventListener('click', async () => {
			if (!selectedFile) {
				new Notice('请先选择一个预设');
				return;
			}
			if (!confirm(`确定要删除 ${selectedFile} 吗？`)) return;
			await this.app.vault.adapter.remove(getFilePath(selectedFile));
			selectedFile = null;
			hasUnsavedChanges = false;
			textArea.setValue('');
			await refreshFileList();
			new Notice('已删除');
		});

		// 应用到笔记 frontmatter — 写入 lumislate_css 文件名，并自动重新渲染
		applyBtn.addEventListener('click', async () => {
			if (!selectedFile) {
				new Notice('请先选择一个预设');
				return;
			}
			await this.updateMarpFrontmatterField('lumislate_css', selectedFile);
			new Notice(`已应用 CSS 预设: ${selectedFile}`);
			// 自动重新渲染画布使样式生效
			await this.renderCurrentNote();
		});

		// 监听编辑标记未保存
		textArea.onChange(() => {
			hasUnsavedChanges = true;
		});

		await refreshFileList();

		// 如果有选中文件，加载其内容
		if (selectedFile) {
			const content = await this.app.vault.adapter.read(getFilePath(selectedFile)).catch(() => '');
			textArea.setValue(content);
		}

		modal.open();
	}

	/** AI 辅助设计 Marp CSS */
	private async aiDesignMarpCss(activeFile: TFile, textArea: TextAreaComponent): Promise<void> {
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'http' && !this.settings.apiKey) {
			new Notice('未配置 AI：请在设置中选择本地 Agent 或配置 HTTP API Key');
			return;
		}

		const markdown = await this.app.vault.read(activeFile);
		const { body } = extractFrontmatter(markdown);
		const contentPreview = body.slice(0, 2000);

		const prompt = `你是专业的 CSS 设计师。请为以下 Marp 幻灯片内容设计一套精美的 CSS 样式。

要求：
- 只输出纯 CSS 代码，不要任何解释性文字
- 使用 section 选择器设置幻灯片样式
- 考虑内容类型选择合适配色（深色/浅色/渐变）
- 包含字体、间距、投影等细节

幻灯片内容摘要：
${contentPreview}

请输出 CSS：`;

		new Notice('AI 正在设计 CSS 样式…');

		let cssResult = '';
		const ctl = new AbortController();
		this.aiAbortCtl = ctl;

		try {
			await compileWithAI(
				prompt,
				{
					provider: resolved.provider,
					agentId: resolved.agentId,
					binOverride: this.settings.localAgentBinOverride,
					llmConfig: {
						apiKey: this.settings.apiKey,
						baseURL: this.settings.apiBaseUrl,
						model: this.settings.model,
					},
					model: resolved.provider === 'local' ? undefined : this.settings.model,
					signal: ctl.signal,
				},
				{
					onDelta: (text) => { cssResult += text; },
					onHtml: (text) => { cssResult = text; },
					onMeta: () => {},
					onStderr: () => {},
					onError: (err) => {
						new Notice(`AI 设计失败: ${err}`);
					},
					onDone: () => {
						this.aiAbortCtl = null;
						// 提取 CSS 代码（移除可能的 markdown 围栏）
						let cleanCss = cssResult;
						const fenceMatch = cleanCss.match(/```(?:css)?\s*([\s\S]*?)```/);
						if (fenceMatch) cleanCss = fenceMatch[1].trim();
						if (cleanCss) {
							textArea.setValue(cleanCss);
							new Notice('AI CSS 设计完成，已填入编辑区');
						} else {
							new Notice('AI 未能生成有效 CSS，请重试');
						}
					},
				}
			);
		} catch (err) {
			this.aiAbortCtl = null;
			new Notice(`AI 设计失败: ${String((err as Error)?.message ?? err)}`);
		}
	}

	/** 更新当前笔记 frontmatter 中的 Marp 字段 */
	private async updateMarpFrontmatterField(key: string, value: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const content = await this.app.vault.read(activeFile);
		const { frontmatter, body } = extractFrontmatter(content);

		let newFrontmatter: string;
		if (frontmatter) {
			// 更新或插入字段
			const regex = new RegExp(`^${key}:\\s*.*$`, 'm');
			if (regex.test(frontmatter)) {
				newFrontmatter = frontmatter.replace(regex, `${key}: ${value}`);
			} else {
				newFrontmatter = frontmatter + `\n${key}: ${value}`;
			}
		} else {
			newFrontmatter = `${key}: ${value}`;
		}

		const newContent = `---\n${newFrontmatter.trim()}\n---\n\n${body}`;
		await this.app.vault.modify(activeFile, newContent);
		new Notice(`已更新 ${key}: ${value}`);
	}

	cancelAiRender(): void {
		this.aiCancelled = true;
		if (this.aiAbortCtl) {
			this.aiAbortCtl.abort();
			this.aiAbortCtl = null;
		}
		const view = this.getLumiSlateView();
		if (view) {
			view.setRenderingState(false);
			view.setStatus('已取消');
			view.hideMetrics();
		}
		this.stopMetricsTimer();
	}

	// ------------------- 指标栏定时器 -------------------

	private startMetricsTimer(): void {
		this.stopMetricsTimer();
		this.metricsTimer = window.setInterval(() => {
			this.updateMetricsDisplay();
		}, 250);
	}

	private stopMetricsTimer(): void {
		if (this.metricsTimer !== null) {
			clearInterval(this.metricsTimer);
			this.metricsTimer = null;
		}
	}

	private updateMetricsDisplay(): void {
		const view = this.getLumiSlateView();
		if (view && this.currentRunStats) {
			view.updateMetrics(this.currentRunStats);
		}
	}

	// ------------------- 逆向回写 -------------------

	private setupReverseMapping(): void {
		window.addEventListener('message', (event) => {
			if (event.data?.type === 'lumislate-text-change') {
				const view = this.getLumiSlateView();
				if (!view || event.source !== view.getIframeWindow()) return;
				this.applyTextChange(event.data);
				return;
			}

			if (event.data?.type === 'lumislate-select-mode') {
				const mode = event.data?.mode as Mode;
				if (mode === 'marp' || mode === 'design') {
					this.handleWelcomeModeSelect(mode);
				}
				return;
			}
		});
	}

	/** 处理欢迎页模式选择 */
	private async handleWelcomeModeSelect(mode: Mode): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) return;

		// 更新设置
		this.settings.defaultMode = mode;
		await this.saveSettings();

		// 切换视图模式
		view.setMode(mode);
		await this.refreshViewContext();

		// 自定义模式：自动降级渲染当前笔记
		if (mode === 'marp') {
			await this.renderCurrentNote();
		}
		// AI模式：显示启动界面
			if (mode === 'design') {
				view.renderCanvas(getDesignLauncherHTML());
			}
	}

	private applyTextChange(data: {
		oldText: string;
		newText: string;
		tagName: string;
		path: string;
		context?: string;
	}): void {
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView) {
			new Notice('未找到 Markdown 编辑器');
			return;
		}

		const editor = mdView.editor;
		const content = editor.getValue();
		const oldText = data.oldText;
		const newText = data.newText;

		const matches: number[] = [];
		let pos = 0;
		while ((pos = content.indexOf(oldText, pos)) !== -1) {
			matches.push(pos);
			pos += oldText.length;
		}

		if (matches.length === 0) {
			new Notice('未能在源码中找到该文本，可能已被修改');
			return;
		}

		let matchIndex: number;
		if (matches.length === 1) {
			matchIndex = matches[0];
		} else if (data.context) {
			matchIndex = this.findBestMatchByContext(content, matches, oldText, data.context);
			if (matchIndex === -1) matchIndex = matches[0];
		} else {
			matchIndex = matches[0];
		}

		const from = editor.offsetToPos(matchIndex);
		const to = editor.offsetToPos(matchIndex + oldText.length);
		editor.replaceRange(newText, from, to);

		// 同步更新缓存
		const notePath = mdView.file?.path;
		if (notePath) {
			const newContent = editor.getValue();
			const { frontmatter } = extractFrontmatter(newContent);
			const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
			this.cacheManager.updateCacheText(notePath, oldText, newText, newContent, prompt);
		}

		new Notice('已同步回 Markdown 源码');
	}

	private findBestMatchByContext(
		content: string,
		matches: number[],
		oldText: string,
		context: string
	): number {
		let bestIndex = -1;
		let bestScore = -1;

		for (const idx of matches) {
			const localStart = Math.max(0, idx - 40);
			const localEnd = Math.min(content.length, idx + oldText.length + 40);
			const localContext = content.slice(localStart, localEnd);

			let score = 0;
			for (let i = 0; i < Math.min(context.length, localContext.length); i++) {
				if (context[i] === localContext[i]) score++;
			}

			if (score > bestScore) {
				bestScore = score;
				bestIndex = idx;
			}
		}

		return bestIndex;
	}

	// ------------------- 缓存管理 -------------------

	async clearCurrentNoteCache(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			await this.cacheManager.clearCache(activeFile.path);
			new Notice(`已清除缓存: ${activeFile.name}`);
		} else {
			new Notice('未找到当前笔记');
		}
	}
}
