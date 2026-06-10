import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, Notice, Modal, TextAreaComponent, ButtonComponent, TFile, setIcon, Menu } from 'obsidian';
import { CacheManager } from '../utils/cache_manager';
import { extractFrontmatter, extractFrontmatterValue, compileWithAI, previewHtml, extractHtml } from '../ai/ai_service';
import { getAvailableAgents, detectAgent } from '../ai/local_agent';
import { SKILLS, getSkillById, assemblePrompt, parseCustomDirectives, CUSTOM_BODY, MODES, getModeById, LONGFORM_PREPROCESS_PROMPT, SLIDE_PREPROCESS_PROMPT, setSkills } from '../ai/skills';
import type { Mode, Skill } from '../ai/skills';
import { loadSkillsFromDisk } from '../ai/skill_loader';
import { LumiSlateSettingTab, DEFAULT_SETTINGS, DEFAULT_CSS_SYSTEM_PROMPT } from '../config/settings';
import type { LumiSlateSettings } from '../config/settings';
import { checkPreprocessedState, detectSpecialSyntax } from '../utils/preprocess';
import { downloadHtml, downloadPngFromIframe, saveHtmlToVault } from '../utils/export';
import { ExportMenuModal, SkillGalleryModal, SkillConfirmModal } from '../ui/modals';

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
  outline: none;
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: text;
  caret-color: currentColor;
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

// ============================================================
// 幻灯片版式系统 — 每页独立 frontmatter + layout 模板
// ============================================================

/** 已知的局部 frontmatter key，用于判断 chunk 是否为 frontmatter */
const KNOWN_SLIDE_FM_KEYS = new Set([
	'layout', 'class', 'backgroundcolor', 'backgroundimage', 'backgroundsize',
	'backgroundposition', 'backgroundrepeat', 'color', 'header', 'footer',
	'theme', 'paginate', 'size', 'headingdivider', 'math', 'lang', 'style',
]);

/** 检测一段文本是否"看起来像 frontmatter"（所有非空行都是 key: value 且包含已知 key） */
function looksLikeFrontmatter(text: string): boolean {
	const lines = text.split('\n').filter((l) => l.trim() !== '');
	if (lines.length === 0) return false;
	const allKeyValue = lines.every((l) => l.match(/^[a-zA-Z_]\w*:\s*.+$/));
	if (!allKeyValue) return false;
	return lines.some((l) => {
		const key = l.match(/^([a-zA-Z_]\w*):/)?.[1].toLowerCase();
		return key && KNOWN_SLIDE_FM_KEYS.has(key);
	});
}

/** 从单页 frontmatter 中提取字段值（不区分大小写 key） */
function extractSlideFmValue(frontmatter: string, key: string): string {
	const regex = new RegExp(`^${key}:\\s*(.*)$`, 'im');
	const match = frontmatter.match(regex);
	if (!match) return '';
	return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * 智能切分 body 为 slide 数组，识别每页独立的 frontmatter。
 * 原理：按 --- 切分后，对每个 chunk 判断是否是 frontmatter（key: value 格式），
 * 如果是则暂存，与下一个 content chunk 配对。
 */
function parseSlides(body: string): Array<{ frontmatter: string; content: string }> {
	const chunks = body.split(/^---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 0);
	const slides: Array<{ frontmatter: string; content: string }> = [];
	let pendingFm = '';

	for (const chunk of chunks) {
		if (looksLikeFrontmatter(chunk)) {
			// 暂存 frontmatter，等待下一个 content chunk
			pendingFm = chunk;
		} else {
			slides.push({ frontmatter: pendingFm, content: chunk });
			pendingFm = '';
		}
	}

	// 最后如果还有一个未配对的 frontmatter
	if (pendingFm) {
		slides.push({ frontmatter: pendingFm, content: '' });
	}

	return slides.filter((s) => s.content.trim() || s.frontmatter.trim());
}

/** 处理单页内容：支持 ::right:: 分栏，返回 HTML */
function processSlideContent(content: string, layout: string): string {
	const rightMarker = '\n::right::\n';

	// two-cols 布局：按 ::right:: 分栏
	if (layout === 'two-cols' && content.includes(rightMarker)) {
		const parts = content.split(rightMarker);
		const leftHtml = markdownToSimpleHTML(parts[0].trim());
		const rightHtml = markdownToSimpleHTML(parts[1]?.trim() || '');
		return `<div class="col-left">${leftHtml}</div><div class="col-right">${rightHtml}</div>`;
	}

	return markdownToSimpleHTML(content);
}

/** 长文模式：无分页符时的连续滚动页面 */
function buildLongFormPage(body: string, options: { bgColor: string; textColor: string; customCss?: string; baseFontSize?: number; fontFamily?: string }): string {
	const bodyHtml = markdownToSimpleHTML(body);
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  font-size: ${options.baseFontSize || 16}px;
  --ls-body-bg: ${options.bgColor};
  --ls-body-color: ${options.textColor};
  --ls-font-family: ${options.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
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
.lumislate-hover { background: rgba(96, 165, 250, 0.12); cursor: text; border-radius: 2px; transition: background 0.15s ease; }
.lumislate-editing { outline: none; border: none; border-radius: 0; background: transparent; cursor: text; caret-color: currentColor; }
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
 * 自定义模式降级渲染: 按 --- 分页生成简单幻灯片 HTML
 * - 有分页符：固定比例 slide 模式，纵向滚动浏览
 * - 无分页符：长文模式，不设高度限制，宽度自适应
 */
async function buildCustomFallbackPage(
	markdown: string,
	app: App,
	pluginDir: string,
	getLayout: (slideIndex: number) => string,
	settings?: { baseFontSize?: number; textColor?: string; fontFamily?: string },
): Promise<string> {
	const { frontmatter, body } = extractFrontmatter(markdown);
	const bgColor = extractFrontmatterValue(frontmatter, 'backgroundcolor') || extractFrontmatterValue(frontmatter, 'backgroundColor') || '#0f172a';
	const textColor = extractFrontmatterValue(frontmatter, 'color') || settings?.textColor || '#e2e8f0';
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
		return buildLongFormPage(body, { bgColor, textColor, customCss, baseFontSize: settings?.baseFontSize, fontFamily: settings?.fontFamily });
	}

	// 有分页符 → 幻灯片模式（智能切分，识别每页独立 frontmatter）
	const slides = parseSlides(body);
	if (slides.length === 0) {
		slides.push({ frontmatter: '', content: body.trim() || '(空幻灯片)' });
	}

	const { width: fixedWidth, height: fixedHeight } = getSlideFixedSize(size);

	const slidesHtml = slides
		.map((slide, idx) => {
			const globalLayout = extractFrontmatterValue(frontmatter, 'layout') || 'default';
			const slideLayout = getLayout(idx) || globalLayout;
			const slideClass = extractSlideFmValue(slide.frontmatter, 'class') || '';
			const slideBgColor = extractSlideFmValue(slide.frontmatter, 'backgroundColor')
				|| extractSlideFmValue(slide.frontmatter, 'backgroundcolor') || '';

			const bodyHtml = processSlideContent(slide.content, slideLayout);
			const pageNum = showPaginate ? `<div class="slide-paginate">${idx + 1} / ${slides.length}</div>` : '';

			const attrs: string[] = [
				`class="slide ${slideClass}"`,
				`data-index="${idx}"`,
				`data-layout="${slideLayout}"`,
			];
			if (slideBgColor) {
				attrs.push(`style="background: ${slideBgColor};"`);
			}

			return `<div class="slide-wrapper"><section ${attrs.join(' ')}>${bodyHtml}${pageNum}</section></div>`;
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
  font-size: ${settings?.baseFontSize || 16}px;
  --ls-body-bg: ${bgColor};
  --ls-body-color: ${textColor};
  --ls-font-family: ${settings?.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
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
#custom-deck { width: 100%; min-height: 100%; overflow-x: visible; overflow-y: auto; display: flex; flex-direction: column; gap: var(--ls-deck-gap); padding: var(--ls-deck-padding); align-items: center; }
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
/* ===== 版式模板系统（Layout System）===== */
section[data-layout="cover"] { text-align: center; justify-content: center; align-items: center; }
section[data-layout="cover"] h1 { margin-bottom: 0.75rem; }
section[data-layout="cover"] h2 { opacity: 0.75; font-weight: 400; margin-top: 0; }
section[data-layout="cover"] p { opacity: 0.7; }

section[data-layout="center"] { text-align: center; justify-content: center; align-items: center; }
section[data-layout="center"] * { text-align: center; }

section[data-layout="two-cols"] { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start; align-content: center; }
section[data-layout="two-cols"] .col-left, section[data-layout="two-cols"] .col-right { overflow: hidden; min-width: 0; }
section[data-layout="two-cols"] h1, section[data-layout="two-cols"] h2 { grid-column: 1 / -1; margin-bottom: 0.5rem; }

section[data-layout="statement"] { text-align: center; justify-content: center; align-items: center; }
section[data-layout="statement"] blockquote { border: none; font-style: italic; padding: 0; margin: 0; }
section[data-layout="statement"] blockquote::before { content: '\\201C'; font-size: 3rem; opacity: 0.3; line-height: 1; display: block; margin-bottom: 0.5rem; }
section[data-layout="statement"] p { opacity: 0.6; margin-top: 1.5rem; }

section[data-layout="section"] { text-align: center; justify-content: center; align-items: center; }
section[data-layout="section"] h1 { letter-spacing: -0.02em; }
section[data-layout="section"] h1::after { content: ''; display: block; width: 80px; height: 4px; background: linear-gradient(90deg, #6366f1, #a78bfa); margin: 1.5rem auto 0; border-radius: 2px; }
section[data-layout="section"] h2 { opacity: 0.6; font-weight: 400; margin-top: 1rem; }
section[data-layout="section"] *:not(h1):not(h2) { display: none; }
${customCss}
.lumislate-hover { background: rgba(96, 165, 250, 0.12); cursor: text; border-radius: 2px; transition: background 0.15s ease; }
.lumislate-editing { outline: none; border: none; border-radius: 0; background: transparent; cursor: text; caret-color: currentColor; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
</head>
<body>
<div id="custom-deck">
${slidesHtml}
</div>
<script>
(function() {
  function fitSlides() {
    var deck = document.getElementById('custom-deck');
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

/** 生成 AI 渲染加载/思考中的过渡页面 */
function getLoadingHTML(provider: string, modeLabel: string): string {
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
.loading-wrap {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  animation: fadeIn 0.4s ease-out;
}
.spinner-ring {
  position: relative;
  width: 56px;
  height: 56px;
}
.spinner-ring svg {
  width: 100%; height: 100%;
  animation: spin 1.2s linear infinite;
}
.spinner-ring circle {
  fill: none;
  stroke: url(#spinnerGrad);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 120;
  stroke-dashoffset: 30;
}
.loading-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #e2e8f0;
  letter-spacing: 0.02em;
}
.loading-meta {
  font-size: 0.8rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.loading-meta .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 1.5s ease-in-out infinite;
}
.loading-hint {
  font-size: 0.75rem;
  color: #475569;
  max-width: 260px;
  line-height: 1.5;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="loading-wrap">
  <div class="spinner-ring">
    <svg viewBox="0 0 56 56">
      <defs>
        <linearGradient id="spinnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="24" />
    </svg>
  </div>
  <div class="loading-title">AI 正在思考中…</div>
  <div class="loading-meta"><span class="dot"></span><span>${escapeHtml(modeLabel)} · ${escapeHtml(provider)}</span></div>
  <div class="loading-hint">设计生成可能需要几秒到几十秒，取决于内容长度和模型响应速度</div>
</div>
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
}
.logo-area .subtitle {
  font-size: 0.85rem; color: #64748b; letter-spacing: 0.02em;
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
  position: relative;
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
/* Tooltip */
.mode-btn .tooltip {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 10;
}
.mode-btn:hover .tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
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
    <div class="subtitle">选择 Markdown 笔记，开始编译高定画布</div>
  </div>
  <div class="mode-buttons">
    <div class="mode-btn" data-mode="custom" onclick="selectMode('custom')">
      <div class="tooltip">将 Markdown 转换为幻灯片 / 长文画布<br>支持自定义 CSS 与实时预览</div>
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></div>
      <div class="label">自定义模式</div>
    </div>
    <div class="mode-btn" data-mode="design" onclick="selectMode('design')">
      <div class="tooltip">选择设计风格，由 AI 自动生成精美 HTML 页面<br>支持多种排版模板与实时编辑<br><span style="color:#f59e0b">首次使用需要进入设置配置AI功能</span></div>
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg></div>
      <div class="label">AI模式</div>
    </div>
  </div>
</div>
<script>
function selectMode(mode) {
  window.parent.postMessage({ type: 'lumislate-select-mode', mode: mode }, '*');
}
</script>
</body>
</html>`;
}

/** 获取 Lucide 图标的 SVG 字符串（用于 iframe 内联） */
function getSkillIconSvg(iconName: string): string {
	const el = document.createElement('div');
	setIcon(el, iconName);
	return el.innerHTML || '';
}

/** AI模式启动界面 — 分类折叠 + 搜索 */
function getDesignLauncherHTML(skills: Skill[], currentSkillId: string): string {
	const categoryMap: Record<string, string> = {
		article: '文章',
		prototype: '原型',
		doc: '文档',
		email: '邮件',
		data: '数据',
		finance: '财务',
		dashboard: '看板',
		video: '视频',
		poster: '海报',
		card: '卡片',
		mobile: '移动端',
		general: '通用',
	};

	// 按 category 分组
	const grouped = new Map<string, Skill[]>();
	for (const skill of skills) {
		const cat = skill.category || 'general';
		if (!grouped.has(cat)) grouped.set(cat, []);
		grouped.get(cat)!.push(skill);
	}

	const categories = Array.from(grouped.keys()).sort();

	// 生成分类标签
	const tabsHtml = categories.map((cat) => {
		const label = categoryMap[cat] || cat;
		const count = grouped.get(cat)!.length;
		return `<button class="skill-category-tab" data-category="${cat}">${label}<span class="skill-tab-count">${count}</span></button>`;
	}).join('');

	// 为每个分类生成 section
	const sectionsHtml = categories.map((cat) => {
		const catSkills = grouped.get(cat)!;
		const label = categoryMap[cat] || cat;
		const cards = catSkills.map((skill, idx) => {
			const isActive = skill.id === currentSkillId;
			const iconSvg = getSkillIconSvg(skill.icon);
			const hiddenClass = idx >= 3 ? 'skill-card-hidden' : '';
			return `
				<div class="skill-card ${isActive ? 'active' : ''} ${hiddenClass}" data-skill-id="${skill.id}" data-category="${cat}">
					<div class="skill-card-icon">${iconSvg}</div>
					<div class="skill-card-name">${skill.name}</div>
					<div class="skill-card-desc">${skill.description}</div>
					<div class="skill-card-badge">${label}</div>
				</div>
			`;
		}).join('');

		const hasMore = catSkills.length > 3;
		const expandBtn = hasMore
			? `<button class="skill-expand-btn" data-category="${cat}">展开更多 (${catSkills.length - 3})</button>`
			: '';

		return `
			<div class="skill-category-section" data-category="${cat}">
				<div class="skill-category-header">
					<div class="skill-category-header-left">
						<span class="skill-category-title">${label}</span>
						<span class="skill-category-count">${catSkills.length}</span>
					</div>
					<button class="skill-category-toggle" data-category="${cat}" aria-label="折叠/展开">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
					</button>
				</div>
				<div class="skill-grid skill-grid-collapsible">
					${cards}
				</div>
				${expandBtn}
			</div>
		`;
	}).join('');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 24px;
  min-height: 100vh;
}
.launcher {
  width: 100%;
  max-width: 720px;
  animation: fadeIn 0.5s ease-out;
}
.launcher-header {
  text-align: center;
  margin-bottom: 20px;
}
.launcher-header h1 {
  font-size: 1.6rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 6px;
}
.launcher-header p {
  font-size: 0.9rem;
  color: #94a3b8;
}
.skill-search-wrap {
  margin-bottom: 14px;
}
.skill-search-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}
.skill-search-input::placeholder {
  color: #64748b;
}
.skill-search-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}
.skill-category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.3) transparent;
}
.skill-category-tabs::-webkit-scrollbar {
  height: 4px;
}
.skill-category-tabs::-webkit-scrollbar-thumb {
  background: rgba(148,163,184,0.3);
  border-radius: 2px;
}
.skill-category-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.5);
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}
.skill-category-tab:hover {
  border-color: rgba(99, 102, 241, 0.4);
  color: #c7d2fe;
}
.skill-category-tab.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  color: #c7d2fe;
}
.skill-tab-count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.15);
  color: #64748b;
}
.skill-category-tab.active .skill-tab-count {
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
}
.skill-content {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.3) transparent;
}
.skill-content::-webkit-scrollbar {
  width: 4px;
}
.skill-content::-webkit-scrollbar-thumb {
  background: rgba(148,163,184,0.3);
  border-radius: 2px;
}
.skill-category-section {
  margin-bottom: 16px;
}
.skill-category-section.collapsed .skill-grid-collapsible,
.skill-category-section.collapsed .skill-expand-btn {
  display: none;
}
.skill-category-section.collapsed .skill-category-toggle svg {
  transform: rotate(180deg);
}
.skill-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-bottom: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
}
.skill-category-header:hover {
  background: rgba(148, 163, 184, 0.08);
}
.skill-category-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.skill-category-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.skill-category-count {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.12);
  color: #64748b;
}
.skill-category-toggle {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.skill-category-toggle:hover {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}
.skill-category-toggle svg {
  transition: transform 0.2s ease;
}
.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.skill-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.skill-card:hover {
  border-color: #6366f1;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.2);
  transform: translateY(-2px);
}
.skill-card.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  box-shadow: 0 0 0 1px #6366f1, 0 2px 12px rgba(99, 102, 241, 0.15);
}
.skill-card.skill-card-hidden {
  display: none;
}
.skill-card-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.8);
  color: #818cf8;
  margin-bottom: 4px;
}
.skill-card-icon svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}
.skill-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.skill-card-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.45;
  flex: 1;
}
.skill-card-badge {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(30, 41, 59, 0.8);
  color: #64748b;
}
.skill-expand-btn {
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  border-radius: 8px;
  border: 1px dashed rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.3);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.skill-expand-btn:hover {
  border-color: #6366f1;
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.08);
}
.skill-empty-state {
  text-align: center;
  padding: 48px 24px;
}
.skill-empty-icon {
  margin-bottom: 12px;
  opacity: 0.6;
}
.skill-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 6px;
}
.skill-empty-desc {
  font-size: 13px;
  color: #64748b;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="launcher">
  <div class="launcher-header">
    <h1>选择设计样式</h1>
    <p>点击卡片选择模板，AI 将立即开始渲染</p>
  </div>
  <div class="skill-search-wrap">
    <input type="text" class="skill-search-input" placeholder="搜索样式名称或描述..." />
  </div>
  <div class="skill-category-tabs">
    <button class="skill-category-tab active" data-category="all">全部<span class="skill-tab-count">${skills.length}</span></button>
    ${tabsHtml}
  </div>
  <div class="skill-content">
    ${sectionsHtml}
    <div class="skill-empty-state" style="display:none;">
      <div class="skill-empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:#475569;"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path><line x1="11" y1="8" x2="11" y2="11"></line><line x1="11" y1="11" x2="14" y2="11"></line></svg>
      </div>
      <div class="skill-empty-title">未找到匹配的样式</div>
      <div class="skill-empty-desc">尝试使用其他关键词搜索</div>
    </div>
  </div>
</div>
<script>
(function() {
  var searchInput = document.querySelector('.skill-search-input');
  var tabs = document.querySelectorAll('.skill-category-tab');
  var sections = document.querySelectorAll('.skill-category-section');
  var emptyState = document.querySelector('.skill-empty-state');

  function resetToDefault() {
    emptyState.style.display = 'none';
    sections.forEach(function(sec) {
      sec.style.display = '';
      sec.classList.remove('collapsed');
      var cards = sec.querySelectorAll('.skill-card');
      cards.forEach(function(card, idx) {
        card.style.display = '';
        if (idx >= 3) {
          card.classList.add('skill-card-hidden');
        } else {
          card.classList.remove('skill-card-hidden');
        }
      });
      var expandBtn = sec.querySelector('.skill-expand-btn');
      if (expandBtn) {
        var total = cards.length;
        expandBtn.style.display = total > 3 ? '' : 'none';
        expandBtn.textContent = '展开更多 (' + (total - 3) + ')';
      }
    });
  }

  function updateEmptyState() {
    var anyVisible = false;
    sections.forEach(function(sec) {
      if (sec.style.display !== 'none') anyVisible = true;
    });
    emptyState.style.display = anyVisible ? 'none' : '';
  }

  // 搜索过滤
  searchInput.addEventListener('input', function() {
    var query = this.value.trim().toLowerCase();
    if (!query) {
      resetToDefault();
      return;
    }

    sections.forEach(function(sec) {
      var cards = sec.querySelectorAll('.skill-card');
      var sectionVisible = false;
      cards.forEach(function(card) {
        var name = card.querySelector('.skill-card-name').textContent.toLowerCase();
        var desc = card.querySelector('.skill-card-desc').textContent.toLowerCase();
        var match = name.indexOf(query) !== -1 || desc.indexOf(query) !== -1;
        card.style.display = match ? '' : 'none';
        if (match) {
          card.classList.remove('skill-card-hidden');
          sectionVisible = true;
        }
      });
      sec.style.display = sectionVisible ? '' : 'none';
      var expandBtn = sec.querySelector('.skill-expand-btn');
      if (expandBtn) expandBtn.style.display = 'none';
      sec.classList.remove('collapsed');
    });
    updateEmptyState();
  });

  // 分类标签切换
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var cat = this.dataset.category;
      tabs.forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');

      searchInput.value = '';
      resetToDefault();

      if (cat !== 'all') {
        sections.forEach(function(sec) {
          sec.style.display = sec.dataset.category === cat ? '' : 'none';
        });
      }
    });
  });

  // 分类折叠/展开
  document.querySelectorAll('.skill-category-header').forEach(function(header) {
    header.addEventListener('click', function() {
      var section = this.closest('.skill-category-section');
      section.classList.toggle('collapsed');
    });
  });

  document.querySelectorAll('.skill-category-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var section = this.closest('.skill-category-section');
      section.classList.toggle('collapsed');
    });
  });

  // 展开更多
  document.querySelectorAll('.skill-expand-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var cat = this.dataset.category;
      var section = document.querySelector('.skill-category-section[data-category="' + cat + '"]');
      if (!section) return;
      var hiddenCards = section.querySelectorAll('.skill-card-hidden');
      hiddenCards.forEach(function(card) {
        card.classList.remove('skill-card-hidden');
      });
      this.style.display = 'none';
    });
  });

  // 卡片点击
  document.querySelectorAll('.skill-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var skillId = this.dataset.skillId;
      if (skillId && window.parent !== window) {
        window.parent.postMessage({ type: 'lumislate-skill-select', skillId: skillId }, '*');
      }
    });
  });
})();
</script>
</body>
</html>`;
}

/** 生成 AI 接入引导页 HTML */
function getAiGuideHTML(): string {
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
.guide {
  text-align: center;
  animation: fadeIn 0.6s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  max-width: 480px;
  padding: 2rem;
}
.guide h1 {
  font-size: 1.5rem; font-weight: 700; color: #e2e8f0;
}
.guide p {
  font-size: 0.85rem; color: #94a3b8; line-height: 1.6;
}
.guide-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  text-align: left;
}
.step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
}
.step-num {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  font-size: 12px; font-weight: 700;
  flex-shrink: 0;
}
.step-body {
  font-size: 13px; color: #cbd5e1; line-height: 1.5;
}
.step-body strong {
  color: #e2e8f0; font-weight: 600;
}
.guide-btn {
  margin-top: 0.5rem;
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.12);
  color: #c7d2fe;
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.guide-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.6);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="guide">
  <h1>🤖 请先接入 AI</h1>
  <p>AI 模式需要配置本地 CLI Agent 或在线 API 才能生成精美排版。请按以下步骤完成配置：</p>
  <div class="guide-steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body"><strong>本地接入</strong>：安装 claude / codex / gemini 等 CLI 工具并确保在 PATH 中可用</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body"><strong>在线 API</strong>：在设置中填入 API Key 和 Base URL（支持 Kimi、DeepSeek、OpenRouter 等）</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body"><strong>测试连接</strong>：配置完成后点击「AI 接入」按钮检查状态</div>
    </div>
  </div>
  <button class="guide-btn" onclick="openSettings()">打开设置</button>
</div>
<script>
function openSettings() {
  window.parent.postMessage({ type: 'lumislate-open-settings' }, '*');
}
</script>
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

  // 注入 I 型闪烁光标样式
  var cursorStyle = document.createElement('style');
  cursorStyle.textContent =
    '.lumislate-cursor{' +
    'display:inline-block;width:2px;height:1.1em;' +
    'background-color:currentColor;vertical-align:text-bottom;margin-left:1px;' +
    'animation:lumislate-blink 1.1s step-end infinite' +
    '}' +
    '@keyframes lumislate-blink{' +
    '0%,100%{opacity:1}' +
    '50%{opacity:0}' +
    '}';
  document.head.appendChild(cursorStyle);

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

  // Slide tracking — 点击 slide 通知父窗口选中该页，同时接收父窗口滚动指令
  var slides = document.querySelectorAll('section.slide, section[data-layout]');
  var selectedIdx = 0;

  function updateSelection(idx) {
    selectedIdx = idx;
    if (slides.length === 0) return;
    slides.forEach(function(s, i) {
      s.style.outline = (i === idx) ? '2px solid #3b82f6' : 'none';
      s.style.outlineOffset = (i === idx) ? '-2px' : '0';
    });
  }

  function scrollToSlide(idx) {
    if (slides.length === 0) return;
    var target = slides[idx];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateSelection(idx);
    placeCursorInSlide(target);
  }

  function placeCursorInSlide(slide) {
    // 移除之前的光标
    var oldCursor = document.querySelector('.lumislate-cursor');
    if (oldCursor) oldCursor.remove();

    // 找到 slide 内第一个有文本内容的可编辑元素
    var editableTags = ['P','H1','H2','H3','H4','H5','H6','LI','SPAN','STRONG','EM','TD','TH','BLOCKQUOTE'];
    var elements = slide.querySelectorAll(editableTags.join(','));
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.textContent.trim()) {
        var cursor = document.createElement('span');
        cursor.className = 'lumislate-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        el.appendChild(cursor);
        return;
      }
    }
  }

  if (slides.length > 0) {
    slides.forEach(function(s, i) {
      s.style.cursor = 'pointer';
      s.addEventListener('click', function(e) {
        // 如果点击的是可编辑元素或交互元素，不触发选页
        var tag = e.target.tagName;
        if (['INPUT','TEXTAREA','SELECT','A','BUTTON'].indexOf(tag) !== -1) return;
        updateSelection(i);
        window.parent.postMessage({
          type: 'lumislate-slide-click',
          index: i
        }, '*');
      });
    });
    // 默认选中第一页
    updateSelection(0);
  }

  // 接收父窗口滚动指令
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'lumislate-scroll-to-slide') {
      var idx = event.data.index;
      if (typeof idx === 'number' && idx >= 0) {
        scrollToSlide(idx);
      }
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
		var img = activeImage;
		if (img && !img.complete) {
			img.addEventListener('load', function onLoad() {
				img.removeEventListener('load', onLoad);
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
	/** AI 模式当前使用的 skill 名称 */
	skillName?: string;
}

/** 自定义模式可用的幻灯片版式 */
export const SLIDE_LAYOUTS = [
	{ id: 'default', name: '标准页', icon: 'file-text' },
	{ id: 'cover', name: '封面', icon: 'image' },
	{ id: 'center', name: '居中', icon: 'align-center' },
	{ id: 'two-cols', name: '双栏', icon: 'columns-2' },
	{ id: 'statement', name: '金句', icon: 'quote' },
	{ id: 'section', name: '章节', icon: 'heading-1' },
];

export class LumiSlateView extends ItemView {
	private iframe: HTMLIFrameElement | null = null;
	private toolbarEl: HTMLElement | null = null;
	private metricsEl: HTMLElement | null = null;

	private currentMode: Mode = 'design';
	private _isHomePage = true;
	// 操作按钮引用（用于动态状态更新）
	private exportBtn: HTMLButtonElement | null = null;
	private settingsBtn: HTMLButtonElement | null = null;
	private customSizeSelect: HTMLSelectElement | null = null;
	private customCssBtn: HTMLButtonElement | null = null;
	private customCssNameEl: HTMLElement | null = null;
	private customPreprocessBtn: HTMLButtonElement | null = null;
	private layoutBtn: HTMLButtonElement | null = null;
	private saveBtn: HTMLButtonElement | null = null;
	private clearCacheBtn: HTMLButtonElement | null = null;

	// 工具栏固定元素
	private toolbarActionsEl: HTMLElement | null = null;
	private homeBtn: HTMLButtonElement | null = null;

	// 底部状态栏
	private statusBarEl: HTMLElement | null = null;
	private statusFileEl: HTMLElement | null = null;
	private statusAgentEl: HTMLElement | null = null;

	// 内部状态
	private _isRendering = false;
	private _hasCache = false;
	private _isPreprocessed = false;
	private _hasDividers = false;
	private _hasAccumulated = false;
	private _currentFileName: string | null = null;
	private _selectedSkillId: string = SKILLS[0]?.id || '';
	private _currentSlideIndex: number = 0;

	onModeChange: ((mode: Mode) => void) | null = null;
	onSkillChange: ((skillId: string) => void) | null = null;
	onAiRender: (() => void) | null = null;
	onAiCancel: (() => void) | null = null;
	onOpenSettings: (() => void) | null = null;
	onExport: (() => void) | null = null;
	onCustomSizeChange: ((size: string) => void) | null = null;
	onCustomCss: (() => void) | null = null;
	onCustomPreprocessLongform: (() => void) | null = null;
	onCustomPreprocessSlide: (() => void) | null = null;
	onSlideLayoutChange: ((layout: string) => void) | null = null;
	onSaveHtml: (() => void) | null = null;
	onGoHome: (() => void) | null = null;
	onClearCache: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return LUMISLATE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'LumiSlate Canvas';
	}

	/** 视图初始化 — 固定元素只创建一次，动态元素通过 rebuildToolbarActions 重建 */
	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('lumislate-canvas-container');

		// ========== 顶部工具栏 ==========
		this.toolbarEl = container.createEl('div', { cls: 'lumislate-toolbar' });

		// 左侧：主页 + 设置 + AI接入（固定）+ 模式切换标签
		const leftGroup = this.toolbarEl.createEl('div', { cls: 'lumislate-context-group' });

		// 主页按钮
		this.homeBtn = leftGroup.createEl('button', {
			cls: `lumislate-btn lumislate-btn-ghost lumislate-btn-icon ${this._isHomePage ? 'active' : ''}`,
			attr: { 'aria-label': '返回主页' },
		});
		setIcon(this.homeBtn, 'home');
		this.homeBtn.addEventListener('click', () => this.onGoHome?.());

		// 设置按钮
		this.settingsBtn = leftGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-icon',
			attr: { 'aria-label': '设置' },
		});
		setIcon(this.settingsBtn, 'settings');
		this.settingsBtn.addEventListener('click', () => this.onOpenSettings?.());

		// 模式切换标签
		const modeGroup = leftGroup.createEl('div', { cls: 'lumislate-mode-tabs' });
		for (const mode of MODES) {
			const tab = modeGroup.createEl('button', {
				cls: `lumislate-mode-tab ${mode.id === this.currentMode ? 'active' : ''}`,
				attr: { 'data-mode-id': mode.id },
			});
			setIcon(tab.createSpan(), mode.icon);
			tab.appendText(' ' + mode.name);
			tab.addEventListener('click', () => {
				if (this.currentMode !== mode.id) {
					this.currentMode = mode.id;
					this.onModeChange?.(mode.id);
					// 更新标签 active 状态（不重建 DOM）
					modeGroup.querySelectorAll('.lumislate-mode-tab').forEach((t) => {
						t.toggleClass('active', t.getAttribute('data-mode-id') === mode.id);
					});
					this.rebuildToolbarActions();
				}
			});
		}

		// 右侧：操作按钮容器（动态）
		const rightGroup = this.toolbarEl.createEl('div', { cls: 'lumislate-context-group' });

		this.toolbarActionsEl = rightGroup.createEl('div', { cls: 'lumislate-toolbar-actions' });
		this.rebuildToolbarActions();

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

		// 底部状态栏
		this.statusBarEl = container.createEl('div', { cls: 'lumislate-status-bar' });
		this.buildStatusBar(this.statusBarEl);
	}

	async onClose(): Promise<void> {
		this.iframe = null;
		this.toolbarEl = null;
		this.toolbarActionsEl = null;
		this.homeBtn = null;
		this.metricsEl = null;
		this.statusBarEl = null;
		this.statusFileEl = null;
		this.statusAgentEl = null;
	}

	// ============ 工具栏 ============

	/** 重建工具栏中的操作按钮容器（模式切换时调用，固定元素不受影响） */
	private rebuildToolbarActions(): void {
		if (!this.toolbarActionsEl) return;
		this.toolbarActionsEl.empty();

		if (this.currentMode === 'custom') {
			this.buildCustomActions(this.toolbarActionsEl);
		} else {
			this.buildDesignActions(this.toolbarActionsEl);
		}

		this.toolbarActionsEl.style.display = this._isHomePage ? 'none' : 'flex';
		this.updateActionBarState();
	}

	/** 构建底部状态栏 */
	private buildStatusBar(el: HTMLElement): void {
		el.empty();

		const left = el.createEl('div', { cls: 'lumislate-status-left' });
		this.statusFileEl = left.createEl('span', { cls: 'lumislate-status-item lumislate-status-file' });
		this.statusFileEl.textContent = '当前文件：未打开';

		const right = el.createEl('div', { cls: 'lumislate-status-right' });
		this.statusAgentEl = right.createEl('span', { cls: 'lumislate-status-item lumislate-status-agent' });
		this.statusAgentEl.textContent = 'Agent：未配置';
	}

	/** 更新底部状态栏信息 */
	setStatusBarInfo(fileName: string | null, agentStatus: string, isError?: boolean): void {
		if (this.statusFileEl) {
			this.statusFileEl.textContent = fileName ? `当前文件：${fileName}` : '当前文件：未打开';
		}
		if (this.statusAgentEl) {
			this.statusAgentEl.textContent = `Agent：${agentStatus}`;
			this.statusAgentEl.toggleClass('status-error', !!isError);
		}
	}

	// ============ 操作按钮（已合并到顶部工具栏） ============

	private buildCustomActions(container: HTMLElement): void {
		// 文本预处理：下拉菜单（长文模式 / 幻灯片模式）
		this.customPreprocessBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.customPreprocessBtn.createSpan(), 'file-text');
		this.customPreprocessBtn.appendText(' 文本预处理');
		this.customPreprocessBtn.addEventListener('click', (evt) => this.showPreprocessMenu(evt));

		// 尺寸选择下拉框
		this.customSizeSelect = container.createEl('select', { cls: 'lumislate-skill-select' });
		const sizes = [
			{ label: '16:9', value: '16:9' },
			{ label: '4:3', value: '4:3' },
			{ label: '1:1', value: '1:1' },
		];
		for (const s of sizes) {
			this.customSizeSelect.createEl('option', { text: s.label, value: s.value });
		}
		this.customSizeSelect.addEventListener('change', () => {
			this.onCustomSizeChange?.(this.customSizeSelect!.value);
		});

		// 版式选择按钮（点击弹出菜单）
		this.layoutBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.layoutBtn.createSpan(), 'layout');
		this.layoutBtn.appendText(' 版式');
		this.layoutBtn.addEventListener('click', (evt) => this.showLayoutMenu(evt));

		// 保存 HTML 按钮
		this.saveBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.saveBtn.createSpan(), 'save');
		this.saveBtn.appendText(' 保存');
		this.saveBtn.addEventListener('click', () => this.onSaveHtml?.());

		this.customCssBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.customCssBtn.createSpan(), 'palette');
		this.customCssBtn.appendText(' CSS');
		this.customCssBtn.addEventListener('click', () => this.onCustomCss?.());

		// CSS 预设名称显示
		this.customCssNameEl = container.createEl('span', { cls: 'lumislate-context-item' });
		this.customCssNameEl.style.display = 'none';

		// 导出
		this.exportBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.exportBtn.createSpan(), 'download');
		this.exportBtn.appendText(' 导出');
		this.exportBtn.addEventListener('click', () => this.onExport?.());
	}

	private buildDesignActions(container: HTMLElement): void {
		// 导出
		this.exportBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.exportBtn.createSpan(), 'download');
		this.exportBtn.appendText(' 导出');
		this.exportBtn.addEventListener('click', () => this.onExport?.());

		// 清除排版
		this.clearCacheBtn = container.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost' });
		setIcon(this.clearCacheBtn.createSpan(), 'eraser');
		this.clearCacheBtn.appendText(' 清除排版');
		this.clearCacheBtn.addEventListener('click', () => this.onClearCache?.());
	}

	// ============ 状态管理 ============

	setMode(mode: Mode): void {
		if (this.currentMode !== mode) {
			this.currentMode = mode;
			// 更新模式标签 active 状态
			this.toolbarEl?.querySelectorAll('.lumislate-mode-tab').forEach((tab) => {
				tab.toggleClass('active', tab.getAttribute('data-mode-id') === mode);
			});
			this.rebuildToolbarActions();
		}
	}

	setHomePage(isHome: boolean): void {
		if (this._isHomePage !== isHome) {
			this._isHomePage = isHome;
			// 更新操作按钮容器显隐
			if (this.toolbarActionsEl) {
				this.toolbarActionsEl.style.display = isHome ? 'none' : 'flex';
			}
			// 更新主页按钮高亮
			if (this.homeBtn) {
				this.homeBtn.toggleClass('active', isHome);
			}
		}
	}

	getMode(): Mode {
		return this.currentMode;
	}

	isHomePage(): boolean {
		return this._isHomePage;
	}

	setSelectedSkill(skillId: string): void {
		this._selectedSkillId = skillId;
	}

	getSelectedSkill(): string {
		return this._selectedSkillId || SKILLS[0]?.id || '';
	}

	setCurrentSlideIndex(index: number): void {
		this._currentSlideIndex = index;
	}

	getCurrentSlideIndex(): number {
		return this._currentSlideIndex;
	}

	/** 同步版式按钮的显示文本 */
	setLayoutSelectValue(value: string): void {
		if (!this.layoutBtn) return;
		const layout = SLIDE_LAYOUTS.find(l => l.id === value);
		this.layoutBtn.empty();
		setIcon(this.layoutBtn.createSpan(), layout?.icon || 'layout');
		this.layoutBtn.appendText(` ${layout?.name || '版式'}`);
	}

	/** 显示版式选择菜单 */
	showLayoutMenu(evt: MouseEvent): void {
		const menu = new Menu();
		for (const layout of SLIDE_LAYOUTS) {
			menu.addItem((item) => {
				item.setTitle(layout.name)
					.setIcon(layout.icon)
					.onClick(() => this.onSlideLayoutChange?.(layout.id));
			});
		}
		menu.showAtMouseEvent(evt);
	}

	/** 更新 Skill 选择按钮的显示文本和图标 */
	setCustomSize(size: string): void {
		if (this.customSizeSelect) this.customSizeSelect.value = size;
	}

	/** 设置自定义模式 CSS 预设名称显示 */
	setCustomCssName(name: string | null): void {
		if (!this.customCssNameEl) return;
		if (name) {
			this.customCssNameEl.empty();
			setIcon(this.customCssNameEl.createSpan(), 'palette');
			this.customCssNameEl.appendText(' ' + name);
			this.customCssNameEl.style.display = 'inline-flex';
		} else {
			this.customCssNameEl.style.display = 'none';
		}
	}

	/** 设置上下文信息 */
	setContextInfo(fileName: string | null, hasCache: boolean, isPreprocessed: boolean, hasDividers?: boolean): void {
		this._currentFileName = fileName;
		this._hasCache = hasCache;
		this._isPreprocessed = isPreprocessed;
		if (hasDividers !== undefined) this._hasDividers = hasDividers;
		this.updateActionBarState();
	}

	/** 设置 AI 是否有累积输出（用于控制清除排版按钮可用状态） */
	setHasAccumulated(hasAccumulated: boolean): void {
		this._hasAccumulated = hasAccumulated;
		this.updateActionBarState();
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
		if (this._isRendering) {
			// 渲染中：禁用操作按钮
			if (this.customPreprocessBtn) this.customPreprocessBtn.disabled = true;
			if (this.exportBtn) this.exportBtn.disabled = true;
			if (this.customSizeSelect) this.customSizeSelect.disabled = true;
			if (this.layoutBtn) this.layoutBtn.disabled = true;
			if (this.customCssBtn) this.customCssBtn.disabled = true;
			if (this.saveBtn) this.saveBtn.disabled = true;
			if (this.settingsBtn) this.settingsBtn.disabled = true;
			if (this.clearCacheBtn) this.clearCacheBtn.disabled = true;
		} else {
			// 空闲：启用操作按钮
			if (this.customPreprocessBtn) this.customPreprocessBtn.disabled = false;
			// 自定义模式下导出始终可用（实时渲染，iframe 始终有内容）
			// Design 模式下需要等有缓存或累积输出
			if (this.exportBtn) {
				this.exportBtn.disabled = this.currentMode === 'design' ? !this._hasCache && !this._hasAccumulated : false;
			}
			// 尺寸选择框 + 版式按钮：有分页符时才可用
			if (this.customSizeSelect) this.customSizeSelect.disabled = !this._hasDividers;
			if (this.layoutBtn) this.layoutBtn.disabled = !this._hasDividers;
			if (this.customCssBtn) this.customCssBtn.disabled = false;
			if (this.saveBtn) this.saveBtn.disabled = false;
			if (this.settingsBtn) this.settingsBtn.disabled = false;
			if (this.clearCacheBtn) this.clearCacheBtn.disabled = !(this._hasCache || this._hasAccumulated);
		}
	}

	/** 显示自定义模式预处理下拉菜单 */
	showPreprocessMenu(evt: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle('长文模式')
				.setIcon('file-text')
				.onClick(() => this.onCustomPreprocessLongform?.());
		});
		menu.addItem((item) => {
			item.setTitle('幻灯片模式')
				.setIcon('presentation')
				.onClick(() => this.onCustomPreprocessSlide?.());
		});
		menu.showAtMouseEvent(evt);
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
		this.setHomePage(false);
	}

	/** AI 流式渲染：直接设置 srcdoc */
	renderStream(htmlContent: string): void {
		if (!this.iframe) return;
		this.iframe.srcdoc = htmlContent;
		this.setHomePage(false);
	}

	/** 重置为欢迎页 */
	resetToWelcome(): void {
		if (!this.iframe) return;
		this.iframe.srcdoc = getWelcomeHTML();
		this.setHomePage(true);
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
		if (stats.skillName) {
			html += `<div class="lumislate-metric"><span class="lumislate-metric-label">样式</span><span class="lumislate-metric-value">${escapeHtml(stats.skillName)}</span></div>`;
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

	/** 滚动到指定幻灯片（通过 postMessage 通知 iframe） */
	scrollToSlide(index: number): void {
		const win = this.getIframeWindow();
		if (win) {
			win.postMessage({ type: 'lumislate-scroll-to-slide', index }, '*');
		}
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
	private customRenderDebounceTimer: number | null = null;
	private cursorSyncInterval: number | null = null;
	private lastCursorSlideIndex = -1;

	async onload(): Promise<void> {
		console.log('LumiSlate (流光石板) 插件已加载');

		// 加载设置
		await this.loadSettings();

		// 初始化缓存管理器
		this.cacheManager = new CacheManager(this.app, this.manifest.dir);

		// 从磁盘加载 skills（插件目录下的 skills/ 文件夹）
		const skillsDir = `${this.manifest.dir}/skills`;
		const loadedSkills = await loadSkillsFromDisk(this.app.vault, skillsDir);
		if (loadedSkills.length > 0) {
			setSkills(loadedSkills);
			console.log(`[LumiSlate] 已加载 ${loadedSkills.length} 个 skill`);
			// 验证 defaultSkill 是否有效，无效则回退到第一个 skill
			if (!getSkillById(this.settings.defaultSkill)) {
				this.settings.defaultSkill = loadedSkills[0].id;
				await this.saveSettings();
			}
		} else {
			console.warn('[LumiSlate] 未从磁盘加载到任何 skill，skills 列表为空');
		}

		// 注册自定义视图
		this.registerView(
			LUMISLATE_VIEW_TYPE,
			(leaf) => {
				const view = new LumiSlateView(leaf);
				view.onModeChange = async (mode) => {
					this.settings.defaultMode = mode;
					this.saveSettings();
					// 模式切换后重新加载对应内容
					if (mode === "custom") {
						await this.renderCurrentNote();
					} else {
						// design 模式：优先检查缓存，有缓存则恢复，否则显示启动界面
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile && activeFile.extension === 'md') {
							const markdown = await this.app.vault.read(activeFile);
							const { frontmatter } = extractFrontmatter(markdown);
							const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
							const cachedHtml = await this.cacheManager.readCache(activeFile.path, markdown, prompt);
							if (cachedHtml) {
								view.renderCanvas(injectInteractionScripts(cachedHtml));
							} else {
								view.renderCanvas(getDesignLauncherHTML(SKILLS, this.settings.defaultSkill));
							}
						} else {
							view.renderCanvas(getDesignLauncherHTML(SKILLS, this.settings.defaultSkill));
						}
					}
					await this.refreshViewContext();
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
				view.onCustomPreprocessLongform = () => this.preprocessCustomCurrentNote('longform');
				view.onCustomPreprocessSlide = () => this.preprocessCustomCurrentNote('slide');
				view.onExport = () => this.showExportMenu();
					view.onSaveHtml = () => this.saveCustomHtml();
				view.onCustomSizeChange = (size) => this.handleCustomSizeChange(size);
				view.onCustomCss = () => this.showCustomCssModal();
				view.onSlideLayoutChange = (layout) => this.applySlideLayout(layout);
				view.onGoHome = () => view.resetToWelcome();
				view.onClearCache = () => this.handleClearLayout();
				// 恢复上次选中的模式和 skill
				view.setMode(this.settings.defaultMode);
				view.setSelectedSkill(this.settings.defaultSkill);
				// 初始化状态栏
				const agent = this.getAgentDisplayText();
				view.setStatusBarInfo(null, agent.text, agent.isError);
				this.refreshViewContext().catch(() => {});
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
				this.refreshViewContext().catch(() => {});
				// 切换文件时重置光标同步状态，确保新文件的光标位置能被正确追踪
				this.lastCursorSlideIndex = -1;
				// 自定义模式下：切换文件时自动重新渲染
				const view = this.getLumiSlateView();
				if (view && view.getMode() === 'custom' && !view.isHomePage()) {
					this.renderCurrentNote().catch(() => {});
				}
			})
		);

		// 自定义模式实时同步：监听当前文件修改，自动重新渲染
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.path !== file.path) return;
				const view = this.getLumiSlateView();
				if (!view || view.getMode() !== 'custom') return;
				// 防抖：200ms 内多次修改只渲染一次
				if (this.customRenderDebounceTimer) {
					clearTimeout(this.customRenderDebounceTimer);
				}
				this.customRenderDebounceTimer = window.setTimeout(() => {
					this.customRenderDebounceTimer = null;
					this.renderCurrentNote();
				}, 200);
			})
		);

		this.setupReverseMapping();

		// 启动编辑器光标位置同步轮询（自定义模式下，左侧光标变化时右侧自动跟随）
		this.cursorSyncInterval = window.setInterval(() => {
			const slideIndex = this.getSlideIndexAtCursor();
			if (slideIndex !== this.lastCursorSlideIndex) {
				this.lastCursorSlideIndex = slideIndex;
				this.syncCursorToSlide();
			}
		}, 200);
	}

	onunload(): void {
		console.log('LumiSlate 插件已卸载');
		// 彻底停止所有 AI 渲染和后台活动
		this.cancelAiRender();
		// 清理所有定时器
		if (this.customRenderDebounceTimer) {
			clearTimeout(this.customRenderDebounceTimer);
			this.customRenderDebounceTimer = null;
		}
		if (this.cursorSyncInterval) {
			clearInterval(this.cursorSyncInterval);
			this.cursorSyncInterval = null;
		}
		this.stopMetricsTimer();
		// 重置所有累积状态
		this.aiAccumulated = '';
		this.aiCancelled = false;
		this.currentRunStats = null;
		// 关闭所有视图
		this.app.workspace.detachLeavesOfType(LUMISLATE_VIEW_TYPE);
	}

	// ------------------- 设置管理 -------------------

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 迁移旧版 mode ID: 'marp' → 'custom'
		if (this.settings.defaultMode === ('marp' as Mode)) {
			this.settings.defaultMode = 'custom';
		}
		// 确保系统提示词字段有默认值（用户 data.json 可能残留空字符串）
		if (!this.settings.cssSystemPrompt?.trim()) {
			this.settings.cssSystemPrompt = DEFAULT_CSS_SYSTEM_PROMPT;
		}
		if (!this.settings.preprocessLongformPrompt?.trim()) {
			this.settings.preprocessLongformPrompt = LONGFORM_PREPROCESS_PROMPT;
		}
		if (!this.settings.preprocessSlidePrompt?.trim()) {
			this.settings.preprocessSlidePrompt = SLIDE_PREPROCESS_PROMPT;
		}
		await this.saveSettings();
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

	/** 获取当前 Agent 状态的简短显示文本 */
	private getAgentDisplayText(): { text: string; isError: boolean } {
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'local' && resolved.agentId) {
			const agent = detectAgent(resolved.agentId);
			return { text: agent?.label || resolved.agentId, isError: false };
		}
		if (resolved.provider === 'http') {
			if (this.settings.apiKey) {
				return { text: this.settings.model || 'HTTP API', isError: false };
			}
			return { text: '未配置', isError: true };
		}
		return { text: '未配置', isError: true };
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
		const view = leaves[0].view;
		if (!view || !(view instanceof LumiSlateView)) return null;
		return view;
	}

	/** 刷新视图上下文信息（文件名、缓存状态、预处理状态） */
	private async refreshViewContext(): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) return;

		const agent = this.getAgentDisplayText();
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			view.setContextInfo(null, false, false, false);
			view.setExportEnabled(false);
			view.setStatusBarInfo(null, agent.text, agent.isError);
			return;
		}

		const mode = view.getMode();

		const markdown = await this.app.vault.read(activeFile);
		const { frontmatter, body } = extractFrontmatter(markdown);

		// 检测是否有自定义模式分页符（用于控制尺寸选择框状态）
		const hasDividers = /^---\s*$/m.test(body);

		// 读取当前 size 设置并同步到下拉框
		const currentSize = extractFrontmatterValue(frontmatter, 'size') || '16:9';
		view.setCustomSize(currentSize);

		// 自定义模式：检查预处理状态，始终实时渲染
		if (mode === "custom") {
			const preprocessState = await checkPreprocessedState(this.app.vault, activeFile, 'custom');
			view.setContextInfo(activeFile.basename, false, preprocessState.preprocessed, hasDividers);
			view.setCustomCssName(extractFrontmatterValue(frontmatter, 'lumislate_css'));
			view.setExportEnabled(true);
				view.setHasAccumulated(true);
			view.setStatusBarInfo(activeFile.basename, agent.text, agent.isError);
			return;
		}

		// Design 模式：检查缓存状态，预处理始终为 false（AI 模式已取消预处理）
		const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
		const cachedHtml = await this.cacheManager.readCache(activeFile.path, markdown, prompt);

		view.setContextInfo(activeFile.basename, !!cachedHtml, false, hasDividers);
		view.setExportEnabled(!!cachedHtml || !!this.aiAccumulated);
		view.setStatusBarInfo(activeFile.basename, agent.text, agent.isError);
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

		// 自定义模式：优先检查已保存的 HTML，再实时渲染
		if (mode === "custom") {
			// 渲染前记录当前光标所在的幻灯片索引（用于渲染后恢复位置）
			const targetSlideIndex = this.getSlideIndexAtCursor();

			const { savedHtmlPath, hasConflict } = await this.checkSavedHtmlConflict(notePath);

			if (savedHtmlPath && !hasConflict) {
				// 有保存的 HTML 且无冲突，直接加载
				const savedHtml = await this.app.vault.adapter.read(savedHtmlPath).catch(() => null);
				if (savedHtml) {
					view.renderCanvas(savedHtml);
					await this.refreshViewContext();
					new Notice('已从保存的 HTML 恢复');
					return;
				}
			}

			if (savedHtmlPath && hasConflict) {
				// 有冲突，弹窗询问
				const shouldReRender = confirm(
					`检测到 Markdown 文件已更新（${activeFile.basename}.md）。\n\n` +
					`已保存的 HTML 可能已过期，是否重新渲染？\n\n` +
					`【确定】重新渲染 HTML（基于最新 Markdown）\n` +
					`【取消】仍加载已保存的 HTML`
				);
				if (!shouldReRender) {
					const savedHtml = await this.app.vault.adapter.read(savedHtmlPath).catch(() => null);
					if (savedHtml) {
						view.renderCanvas(savedHtml);
						await this.refreshViewContext();
						return;
					}
				}
				// 用户选择重新渲染，继续执行下面的渲染逻辑
			}

			const html = await buildCustomFallbackPage(
				resolvedMarkdown,
				this.app,
				this.manifest.dir,
				(idx) => this.getSlideLayout(notePath, idx),
				{
					baseFontSize: this.settings.customBaseFontSize,
					textColor: this.settings.customTextColor,
					fontFamily: this.settings.customFontFamily,
				},
			);
			const injected = injectInteractionScripts(html);
			view.renderCanvas(injected);

			// 渲染完成后恢复幻灯片位置（延迟确保 iframe 已加载）
			if (targetSlideIndex > 0) {
				window.setTimeout(() => {
					view.scrollToSlide(targetSlideIndex);
					view.setCurrentSlideIndex(targetSlideIndex);
					const layout = this.getSlideLayout(notePath, targetSlideIndex);
					view.setLayoutSelectValue(layout);
				}, 80);
			}

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

			// 检测特殊语法 (Mermaid / KaTeX)，用于向 AI 注入精准渲染指令
			const { body: rawBody } = extractFrontmatter(renderMarkdown);
			const { hasMermaid, hasLatex, mermaidBlocks } = detectSpecialSyntax(rawBody || renderMarkdown);
			let syntaxPrefix = '';
			if (hasMermaid || hasLatex) {
				const parts: string[] = [];
				if (hasMermaid) {
					parts.push('【Mermaid 图表渲染要求】\n本文档包含 Mermaid 图表代码块，你必须在生成的 HTML 中：\n1. 引入 Mermaid CDN (https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js)\n2. 将每个 mermaid 代码块的内容原样包裹在 <div class="mermaid">...</div> 中（不要对内容进行 HTML 转义）\n3. 在页面底部添加 <script>mermaid.initialize({startOnLoad:true});</script>\n检测到的图表内容预览：');
					mermaidBlocks.forEach((block, i) => {
						const preview = block.split('\n')[0].trim();
						parts.push(`  [图表${i + 1}] ${preview}${block.includes('\n') ? ' ...' : ''}`);
					});
				}
				if (hasLatex) {
					parts.push('【LaTeX 数学公式渲染要求】\n本文档包含 LaTeX 数学公式，你必须在生成的 HTML 中确保：\n1. 已在 <head> 中引入 KaTeX CSS 和 JS CDN\n2. 页面加载后正确渲染所有 $...$ 和 $$...$$ 公式（使用 KaTeX 的 renderMathInElement 或等效方法）');
				}
				syntaxPrefix = parts.join('\n\n');
			}

			if (mode === "custom") {
				// 自定义模式: 使用 CUSTOM_BODY + frontmatter 指令
				let extraPrefix = '';
				const { frontmatter } = extractFrontmatter(renderMarkdown);
				if (frontmatter) {
					const directives = parseCustomDirectives(frontmatter);
					if (directives && directives !== '(无额外指令)') {
						extraPrefix = `【用户指定的自定义模式指令】\n${directives}`;
					}
				}
				// 注入版式映射（从插件设置中读取，不污染 Markdown）
				const layoutMap = this.settings.slideLayouts[renderNotePath];
				if (layoutMap && Object.keys(layoutMap).length > 0) {
					const layoutLines = Object.entries(layoutMap)
						.sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
						.map(([idx, layout]) => `  第 ${parseInt(idx) + 1} 页 → layout: ${layout}`)
						.join('\n');
					const layoutPrefix = `【每页版式映射 — 由用户在 LumiSlate 中指定】\n${layoutLines}\n\n请严格按照上述映射为每一页 <section> 设置对应的 layout 属性。未指定的页使用默认版式（default）。`;
					extraPrefix = extraPrefix ? `${extraPrefix}\n\n${layoutPrefix}` : layoutPrefix;
				}
				if (syntaxPrefix) {
					extraPrefix = extraPrefix ? `${extraPrefix}\n\n${syntaxPrefix}` : syntaxPrefix;
				}
				prompt = assemblePrompt(CUSTOM_BODY, renderMarkdown, extraPrefix || undefined);
			} else {
				// Design 模式: 使用选中的 skill，不额外注入 Mermaid/KaTeX 专项指令
				// （Design 模式的 skill body 自行决定是否支持这些语法）
				prompt = assemblePrompt(skill!.body, renderMarkdown);
			}

			// 取消之前的请求
			this.cancelAiRender();

			const ctl = new AbortController();
			this.aiAbortCtl = ctl;
			this.aiCancelled = false;
			this.aiAccumulated = '';
		view.setHasAccumulated(false);

			const modeLabel = mode === "custom" ? '自定义模式幻灯片' : skill?.name ?? 'Design';
			// 先展示过渡加载页，避免用户在模型思考期间看到空白
			const loadingHtml = getLoadingHTML(resolved.reason, modeLabel);
			view.renderStream(loadingHtml);

			view.setStatus(`${resolved.reason} 渲染中…`);
			new Notice(`LumiSlate：开始 AI 渲染 (${modeLabel} · ${resolved.reason})`);

			// 初始化统计
			this.currentRunStats = {
				startedAt: Date.now(),
				deltaCount: 0,
				outputBytes: 0,
				skillName: skill?.name,
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
				// 流式预览阶段不注入交互脚本：避免在不完整 DOM 上执行导致报错
				view.renderStream(preview);
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

				const extractedHtml = extractHtml(this.aiAccumulated);
				const finalHtml = injectInteractionScripts(extractedHtml);
				// 最终渲染：立即刷新，不等待 debounce
				view.renderCanvas(finalHtml);
				view.setStatus('渲染完成');
				view.setExportEnabled(true);
				view.setHasAccumulated(true);

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
							const injected = injectInteractionScripts(extractHtml(text));
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

		// AI 模式取消预处理，全权交给 agent 处理
		await doRender(markdown, notePath);
	}

	// ------------------- 预处理 -------------------

	/**
	 * 自定义模式 — AI 驱动的预处理
	 * @param type 'longform' 长文模式 | 'slide' 幻灯片模式
	 */
	async preprocessCustomCurrentNote(type: 'longform' | 'slide'): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		// 检查 AI 配置
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'http' && !this.settings.apiKey) {
			new Notice('未配置 AI：请在设置中选择本地 Agent 或配置 HTTP API Key');
			return;
		}

		const view = this.getLumiSlateView();
		if (view) {
			view.setRenderingState(true);
			view.setStatus('AI 预处理中…');
		}

		const markdown = await this.app.vault.read(activeFile);
		const { body } = extractFrontmatter(markdown);
		const prompt = type === 'longform'
			? (this.settings.preprocessLongformPrompt?.trim() || LONGFORM_PREPROCESS_PROMPT)
			: (this.settings.preprocessSlidePrompt?.trim() || SLIDE_PREPROCESS_PROMPT);

		new Notice(`正在使用 AI 进行${type === 'longform' ? '长文' : '幻灯片'}预处理…`);

		// 初始化 metrics（与 AI 渲染共用同一套统计）
		this.currentRunStats = {
			startedAt: Date.now(),
			deltaCount: 0,
			outputBytes: 0,
		};
		this.startMetricsTimer();
		if (view) view.updateMetrics(this.currentRunStats);

		try {
			const preprocessedBody = await this.runPreprocessWithAI(body, prompt, {
				onDelta: (text) => {
					if (this.currentRunStats) {
						if (!this.currentRunStats.firstByteAt) {
							this.currentRunStats.firstByteAt = Date.now();
						}
						this.currentRunStats.deltaCount++;
						this.currentRunStats.outputBytes += new TextEncoder().encode(text).length;
						this.updateMetricsDisplay();
					}
				},
				onMeta: (key, value) => {
					if (key === 'model' && typeof value === 'string') {
						if (this.currentRunStats) this.currentRunStats.model = value;
					}
					if (key === 'usage' && value && typeof value === 'object') {
						const u = value as Record<string, number>;
						if (this.currentRunStats) {
							this.currentRunStats.inputTokens = u.input_tokens ?? u.prompt_tokens;
							this.currentRunStats.outputTokens = u.completion_tokens ?? u.output_tokens;
						}
					}
					this.updateMetricsDisplay();
				},
			});

			// 结束 metrics
			if (this.currentRunStats) {
				this.currentRunStats.endedAt = Date.now();
				this.updateMetricsDisplay();
			}
			this.stopMetricsTimer();
			if (view) view.hideMetrics();

			// 组装完整内容（保留原始 frontmatter）
			const { frontmatter } = extractFrontmatter(markdown);
			let newFrontmatter = frontmatter || '';
			if (newFrontmatter) {
				// 移除旧的预处理标记（如果存在）
				newFrontmatter = newFrontmatter
					.replace(/^lumislate_preprocessed:.*$/m, '')
					.replace(/^lumislate_preprocessed_for:.*$/m, '')
					.replace(/^lumislate_preprocess_type:.*$/m, '')
					.replace(/^lumislate_preprocessed_at:.*$/m, '')
					.replace(/\n{3,}/g, '\n');
				newFrontmatter += `\nlumislate_preprocessed: true\nlumislate_preprocessed_for: custom\nlumislate_preprocess_type: ${type}\nlumislate_preprocessed_at: ${new Date().toISOString()}`;
			} else {
				newFrontmatter = `lumislate_preprocessed: true\nlumislate_preprocessed_for: custom\nlumislate_preprocess_type: ${type}\nlumislate_preprocessed_at: ${new Date().toISOString()}`;
			}

			const finalContent = `---\n${newFrontmatter.trim()}\n---\n\n${preprocessedBody}`;

			// 保存到 _preprocessed.md（不改动原始文件）
			const newPath = activeFile.path.replace(/\.md$/i, '_preprocessed.md');
			const existing = this.app.vault.getAbstractFileByPath(newPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, finalContent);
				new Notice(`已更新预处理文件: ${existing.name}`);
			} else {
				const newFile = await this.app.vault.create(newPath, finalContent);
				new Notice(`已创建预处理文件: ${newFile.name}`);
			}

			// 自动渲染预处理后的文件
			await this.renderCurrentNote();
		} catch (err) {
			const msg = String((err as Error)?.message ?? err);
			new Notice(`预处理失败: ${msg}`);
			if (view) view.setStatus(`预处理失败: ${msg.slice(0, 40)}`);
		} finally {
			this.stopMetricsTimer();
			if (view) {
				view.setRenderingState(false);
				view.setStatus('');
			}
		}
	}

	/**
	 * 调用 AI agent 进行语义级预处理
	 */
	private async runPreprocessWithAI(
		body: string,
		prompt: string,
		callbacks?: {
			onDelta?: (text: string) => void;
			onMeta?: (key: string, value: unknown) => void;
		}
	): Promise<string> {
		const resolved = this.resolveAIProvider();
		const fullPrompt = `${prompt}\n\n【用户内容】:\n${body}`;

		return new Promise((resolve, reject) => {
			let result = '';
			const ctl = new AbortController();
			this.aiAbortCtl = ctl;

			compileWithAI(
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
						result += text;
						callbacks?.onDelta?.(text);
					},
					onHtml: (text) => { result = text; },
					onMeta: (key, value) => {
						callbacks?.onMeta?.(key, value);
					},
					onStderr: () => {},
					onError: (err) => {
						this.aiAbortCtl = null;
						reject(new Error(err));
					},
					onDone: () => {
						this.aiAbortCtl = null;
						// 清理可能的代码块包裹
						const fenceMatch = result.match(/```(?:markdown)?\s*([\s\S]*?)```/);
						if (fenceMatch) {
							result = fenceMatch[1].trim();
						}
						resolve(result);
					},
				}
			).catch((err) => {
				this.aiAbortCtl = null;
				reject(err);
			});
		});
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

	private getCurrentHtml(): string {
		if (this.aiAccumulated) return this.aiAccumulated;
		const view = this.getLumiSlateView();
		if (view) {
			const iframe = view.getIframe();
			if (iframe && iframe.srcdoc) {
				return iframe.srcdoc;
			}
		}
		return '';
	}

	exportHtmlDownload(): void {
		const html = this.getCurrentHtml();
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
		const html = this.getCurrentHtml();
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

	/** 获取自定义模式下保存的 HTML 文件路径 */
	private getCustomHtmlSavePath(mdPath: string): string {
		const folder = this.settings.htmlDefaultSaveFolder;
		const basename = mdPath.split('/').pop()?.replace(/\.md$/i, '') || 'untitled';
		const filename = `${basename}.html`;
		if (folder) {
			return `${folder}/${filename}`;
		}
		// 使用 markdown 所在目录
		const parentDir = mdPath.split('/').slice(0, -1).join('/');
		return parentDir ? `${parentDir}/${filename}` : filename;
	}

	/** 保存自定义模式当前 HTML 到 Vault */
	async saveCustomHtml(): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) {
			new Notice('画布视图未就绪');
			return;
		}

		const iframe = view.getIframe();
		if (!iframe || !iframe.srcdoc) {
			new Notice('画布为空，无法保存');
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const targetPath = this.getCustomHtmlSavePath(activeFile.path);
		let html = iframe.srcdoc;

		// 注入 markdown 文件 mtime 标记，用于后续冲突检测
		const mtime = activeFile.stat?.mtime || Date.now();
		const metaTag = `<meta name="lumislate-source-mtime" content="${mtime}">`;
		if (html.includes('<head>')) {
			html = html.replace('<head>', `<head>\n${metaTag}`);
		} else {
			html = html + '\n' + metaTag;
		}

		try {
			// 确保目录存在
			const dir = targetPath.split('/').slice(0, -1).join('/');
			if (dir && !(await this.app.vault.adapter.exists(dir))) {
				await this.app.vault.adapter.mkdir(dir);
			}

			await this.app.vault.adapter.write(targetPath, html);
			new Notice(`HTML 已保存: ${targetPath}`);
		} catch (err) {
			const msg = String((err as Error)?.message ?? err);
			new Notice(`保存失败: ${msg}`);
		}
	}

	/** 检查是否存在保存的 HTML 及其与当前 Markdown 的冲突状态 */
	private async checkSavedHtmlConflict(mdPath: string): Promise<{ savedHtmlPath: string | null; hasConflict: boolean }> {
		const savedPath = this.getCustomHtmlSavePath(mdPath);
		const exists = await this.app.vault.adapter.exists(savedPath);
		if (!exists) {
			return { savedHtmlPath: null, hasConflict: false };
		}

		// 读取保存的 HTML，提取其中嵌入的原始 markdown 时间戳（用于冲突检测）
		// 我们在保存时会在 HTML 中注入一个 meta 标记来记录 markdown 文件的 mtime
		const html = await this.app.vault.adapter.read(savedPath).catch(() => null);
		if (!html) {
			return { savedHtmlPath: savedPath, hasConflict: false };
		}

		// 提取保存时记录的 markdown mtime
		const metaMatch = html.match(/<meta name="lumislate-source-mtime" content="(\d+)">/);
		const savedMtime = metaMatch ? parseInt(metaMatch[1], 10) : 0;

		// 获取当前 markdown 文件的 mtime
		const file = this.app.vault.getAbstractFileByPath(mdPath);
		let currentMtime = 0;
		if (file instanceof TFile && file.stat) {
			currentMtime = file.stat.mtime;
		}

		// 如果当前 mtime 大于保存时的 mtime，说明 markdown 已更新
		const hasConflict = currentMtime > savedMtime;
		return { savedHtmlPath: savedPath, hasConflict };
	}

	// ------------------- 自定义模式专用工具 -------------------

	/** 处理自定义模式尺寸比例切换 */
	async handleCustomSizeChange(size: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}
		await this.updateCustomFrontmatterField('size', size);
		// 自动重新渲染使新比例生效
		await this.renderCurrentNote();
	}

	/**
	 * 应用版式到当前可见的 slide
	 * 版式信息存储在插件设置中（slideLayouts），不修改 Markdown 源码。
	 */
	async applySlideLayout(layout: string): Promise<void> {
		const view = this.getLumiSlateView();
		const slideIndex = view?.getCurrentSlideIndex() ?? 0;

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('未找到当前 Markdown 文件');
			return;
		}

		// 更新设置中的版式映射
		if (!this.settings.slideLayouts[activeFile.path]) {
			this.settings.slideLayouts[activeFile.path] = {};
		}
		this.settings.slideLayouts[activeFile.path][slideIndex] = layout;
		await this.saveSettings();

		new Notice(`已应用版式: ${SLIDE_LAYOUTS.find(l => l.id === layout)?.name || layout} (第 ${slideIndex + 1} 页)`);

		// 触发重新渲染使新版式生效
		await this.renderCurrentNote();
	}

	/** 获取指定文件某页的版式（从设置中读取） */
	getSlideLayout(filePath: string, slideIndex: number): string {
		return this.settings.slideLayouts[filePath]?.[slideIndex] || 'default';
	}

	/** 从设置中读取自定义 CSS 系统提示词 */
	private loadCssSystemPrompt(): string {
		const prompt = this.settings.cssSystemPrompt?.trim();
		return prompt || DEFAULT_CSS_SYSTEM_PROMPT;
	}

	/** 组装完整的 CSS 系统提示词 */
	private getCssSystemPrompt(currentCss: string): string {
		const ruleBody = this.loadCssSystemPrompt();

		return `你是 LumiSlate 插件的 CSS 设计专家，专门帮助用户为 自定义模式编写自定义 CSS。

## 当前 CSS 代码
\`\`\`css
${currentCss || '/* 当前为空 */'}
\`\`\`

${ruleBody}`;
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

		const systemPrompt = this.getCssSystemPrompt(currentCss);
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

	/** 显示自定义模式 CSS 编辑弹窗 — 三栏：左侧文件列表，中间代码编辑，右侧 AI 助手 */
	async showCustomCssModal(): Promise<void> {
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
			await this.updateCustomFrontmatterField('lumislate_css', selectedFile);
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

	/** AI 辅助设计自定义模式 CSS */
	private async aiDesignCustomCss(activeFile: TFile, textArea: TextAreaComponent): Promise<void> {
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'http' && !this.settings.apiKey) {
			new Notice('未配置 AI：请在设置中选择本地 Agent 或配置 HTTP API Key');
			return;
		}

		const markdown = await this.app.vault.read(activeFile);
		const { body } = extractFrontmatter(markdown);
		const contentPreview = body.slice(0, 2000);

		const prompt = `你是专业的 CSS 设计师。请为以下 自定义模式内容设计一套精美的 CSS 样式。

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

	/** 更新当前笔记 frontmatter 中的自定义模式字段 */
	private async updateCustomFrontmatterField(key: string, value: string): Promise<void> {
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

	// ------------------- 编辑器 ↔ 幻灯片位置同步 -------------------

	/** 根据编辑器光标位置计算当前所在的幻灯片索引（仅自定义模式有分页符时有效） */
	private getSlideIndexAtCursor(): number {
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView) return 0;

		const editor = mdView.editor;
		const cursor = editor.getCursor();
		const content = editor.getValue();

		// 提取 frontmatter，获取 body 起始偏移量
		const { frontmatter, body } = extractFrontmatter(content);
		const frontmatterEndOffset = frontmatter
			? content.indexOf(body)
				: 0;

		// 获取光标在全文中的偏移量
		const cursorOffset = editor.posToOffset(cursor);

		// 只统计 body 区域中的分页符数量（光标前的 --- 数量 = 幻灯片索引）
		const bodyPrefix = content.slice(frontmatterEndOffset, cursorOffset);
		const dividerMatches = bodyPrefix.match(/^---\s*$/gm);

		return dividerMatches ? dividerMatches.length : 0;
	}

	/** 将右侧预览滚动到与左侧编辑器光标对应的幻灯片 */
	private syncCursorToSlide(): void {
		const view = this.getLumiSlateView();
		if (!view || view.getMode() !== 'custom') return;
		const slideIndex = this.getSlideIndexAtCursor();
		if (slideIndex >= 0) {
			view.scrollToSlide(slideIndex);
			view.setCurrentSlideIndex(slideIndex);
			// 同步版式按钮显示
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				const layout = this.getSlideLayout(activeFile.path, slideIndex);
				view.setLayoutSelectValue(layout);
			}
		}
	}

	// ------------------- 逆向回写 -------------------

	private setupReverseMapping(): void {
		window.addEventListener('message', (event) => {
			if (event.data?.type === 'lumislate-text-change') {
				const view = this.getLumiSlateView();
				if (!view || event.source !== view.getIframeWindow()) return;
				// 不再同步回 Markdown，仅提示用户
				new Notice('HTML 内文字已修改（不会同步回 Markdown 源码）');
				return;
			}

			if (event.data?.type === 'lumislate-skill-select') {
				const skillId = event.data?.skillId as string;
				const view = this.getLumiSlateView();
				if (!view || event.source !== view.getIframeWindow()) return;
				this.handleSkillSelect(skillId);
				return;
			}

			if (event.data?.type === 'lumislate-select-mode') {
				const mode = event.data?.mode as Mode;
				if (mode === "custom" || mode === 'design') {
					this.handleWelcomeModeSelect(mode);
				}
				return;
			}

			if (event.data?.type === 'lumislate-open-settings') {
				this.openSettingsTab();
				return;
			}

			if (event.data?.type === 'lumislate-slide-click') {
				const view = this.getLumiSlateView();
				if (!view || event.source !== view.getIframeWindow()) return;
				const idx = event.data.index as number;
				view.setCurrentSlideIndex(idx);
				// 同步下拉框显示当前页版式
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					const layout = this.getSlideLayout(activeFile.path, idx);
					view.setLayoutSelectValue(layout);
				}
				return;
			}
		});
	}

	/** 打开设置面板并切换到 AI 标签 */
	private openSettingsTab(): void {
		// @ts-expect-error 内部 API
		this.app.setting.open();
		// @ts-expect-error 内部 API
		this.app.setting.openTabById(this.manifest.id);
	}

	/** 检查 AI 是否已配置 */
	private isAiConfigured(): boolean {
		const resolved = this.resolveAIProvider();
		if (resolved.provider === 'local') {
			return !!resolved.agentId;
		}
		return !!this.settings.apiKey;
	}

	/** 处理欢迎页模式选择 */
	private async handleWelcomeModeSelect(mode: Mode): Promise<void> {
		const view = this.getLumiSlateView();
		if (!view) return;

		// 更新设置
		this.settings.defaultMode = mode;
		await this.saveSettings();

		// 离开主页状态
		view.setHomePage(false);

		// 切换视图模式
		view.setMode(mode);
		await this.refreshViewContext();

		// 自定义模式：自动降级渲染当前笔记
		if (mode === "custom") {
			await this.renderCurrentNote();
		}
		// AI模式：检查AI配置，未配置则显示引导页
		if (mode === 'design') {
			if (!this.isAiConfigured()) {
				view.renderCanvas(getAiGuideHTML());
			} else {
				view.renderCanvas(getDesignLauncherHTML(SKILLS, this.settings.defaultSkill));
			}
		}
	}

	/** 处理 iframe 内 skill 选择，弹出确认弹窗 */
	private handleSkillSelect(skillId: string): void {
		const skill = getSkillById(skillId);
		if (!skill) return;

		const view = this.getLumiSlateView();
		if (view) {
			view.setSelectedSkill(skillId);
			this.saveSettings();
		}

		new SkillConfirmModal(
			this.app,
			skill,
			() => {
				// 确认：开始 AI 渲染
				this.aiRenderCurrentNote();
			},
			() => {
				// 取消：无操作
			}
		).open();
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

	/** 清除 Design 模式缓存并重置到启动界面 */
	/** 处理清除排版：有缓存直接清除，无缓存询问是否保存 */
	async handleClearLayout(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const view = this.getLumiSlateView();
		if (!view) return;

		// 检查是否有缓存内容
		const markdown = await this.app.vault.read(activeFile);
		const { frontmatter } = extractFrontmatter(markdown);
		const prompt = extractFrontmatterValue(frontmatter, 'lumislate_prompt');
		const cachedHtml = await this.cacheManager.readCache(activeFile.path, markdown, prompt);

		// 有缓存 = 已保存过，直接清除
		// 无缓存但有 aiAccumulated = 尚未保存，询问
		if (!cachedHtml && this.aiAccumulated) {
			const shouldSave = confirm('当前排版尚未保存，是否导出为 HTML 后再清除？');
			if (shouldSave) {
				this.exportHtmlDownload();
			}
		}

		await this.cacheManager.clearCache(activeFile.path);
		this.aiAccumulated = '';
		view.setHasAccumulated(false);

		view.renderCanvas(getDesignLauncherHTML(SKILLS, this.settings.defaultSkill));
		view.setExportEnabled(false);
		view.setContextInfo(activeFile.basename, false, false, false);

		new Notice('已清除排版');
	}
}
