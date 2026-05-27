import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, Notice, Modal, TextAreaComponent, ButtonComponent, TFile, setIcon } from 'obsidian';
import { CacheManager } from '../utils/cache_manager';
import { extractFrontmatter, extractFrontmatterValue, compileWithAI, previewHtml } from '../ai/ai_service';
import { getAvailableAgents, detectAgent } from '../ai/local_agent';
import { SKILLS, getSkillById, assemblePrompt, parseMarpDirectives, MARP_BODY, MODES, getModeById } from '../ai/skills';
import type { Mode } from '../ai/skills';
import { LumiSlateSettingTab, DEFAULT_SETTINGS } from '../config/settings';
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
 * Markdown 转简单 HTML（无 AI 时的降级渲染）
 */
function markdownToSimpleHTML(markdown: string): string {
	const lines = markdown.split('\n');
	let html = '';
	let inList = false;
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
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>');
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
		} else if (trimmed.startsWith('- ')) {
			closeParagraph();
			if (!inList) {
				html += '<ul>';
				inList = true;
			}
			html += `<li>${inlineFormat(trimmed.slice(2))}</li>`;
		} else {
			closeList();
			openParagraph();
			html += inlineFormat(line);
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
</head>
<body>
${bodyContent}
${getReverseMappingScript()}
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
html, body { width: 100%; min-height: 100%; background: ${options.bgColor}; color: ${options.textColor}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
#longform-content { width: 100%; min-height: 100%; padding: 3rem 4rem; line-height: 1.75; }
#longform-content h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 1.5rem; }
#longform-content h2 { font-size: 1.75rem; font-weight: 700; margin: 1.5rem 0 1rem; }
#longform-content h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
#longform-content p { margin-bottom: 0.75rem; }
#longform-content ul, #longform-content ol { margin-left: 2rem; margin-bottom: 0.75rem; }
#longform-content li { margin-bottom: 0.35rem; }
#longform-content hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 1.5rem 0; }
#longform-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
#longform-content th, #longform-content td { border: 1px solid rgba(255,255,255,0.15); padding: 0.5rem 0.75rem; text-align: left; }
#longform-content th { background: rgba(255,255,255,0.08); font-weight: 600; }
#longform-content tr:nth-child(even) { background: rgba(255,255,255,0.03); }
${options.customCss || ''}
</style>
</head>
<body>
<div id="longform-content">
${bodyHtml}
</div>
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
			const pageNum = showPaginate ? `<div style="position:absolute;bottom:16px;right:24px;font-size:12px;opacity:0.5;">${idx + 1} / ${slideTexts.length}</div>` : '';
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
html, body { width: 100%; height: 100%; overflow-x: visible; overflow-y: auto; background: ${bgColor}; color: ${textColor}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
#marp-deck { width: 100%; min-height: 100%; overflow-x: visible; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; padding: 1rem; align-items: center; }
.slide-wrapper { display: flex; overflow: visible; flex-shrink: 0; }
.slide { position: relative; width: ${fixedWidth}px; height: ${fixedHeight}px; flex-shrink: 0; transform-origin: 0 0; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 3rem 4rem; display: flex; flex-direction: column; justify-content: center; overflow: visible; line-height: 1.75; }
.slide h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 1.5rem; }
.slide h2 { font-size: 1.75rem; font-weight: 700; margin: 1.5rem 0 1rem; }
.slide h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.slide p { margin-bottom: 0.75rem; }
.slide ul, .slide ol { margin-left: 2rem; margin-bottom: 0.75rem; }
.slide li { margin-bottom: 0.35rem; }
.slide table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.85rem; }
.slide th, .slide td { border: 1px solid rgba(255,255,255,0.15); padding: 0.35rem 0.5rem; text-align: left; }
.slide th { background: rgba(255,255,255,0.08); font-weight: 600; }
.slide tr:nth-child(even) { background: rgba(255,255,255,0.03); }
#marp-nav { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 100; }
#marp-nav button { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; cursor: pointer; font-size: 13px; }
#marp-nav button:hover { background: rgba(255,255,255,0.2); }
#marp-hint { position: fixed; top: 16px; right: 20px; font-size: 12px; opacity: 0.5; pointer-events: none; animation: fadeOut 3s forwards 2s; }
@keyframes fadeOut { to { opacity: 0; } }
${customCss}
</style>
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

/** 将反向映射脚本注入到 HTML 中（在 </body> 前插入） */
function injectReverseMappingScript(html: string): string {
	const script = getReverseMappingScript();
	const bodyClose = html.lastIndexOf('</body>');
	if (bodyClose !== -1) {
		return html.slice(0, bodyClose) + script + '\n' + html.slice(bodyClose);
	}
	// 如果没有 </body>，直接在末尾追加（流式预览时常见）
	return html + '\n' + script + '\n</body>\n</html>';
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

		await this.activateView();

		const view = this.getLumiSlateView();
		if (!view) {
			new Notice('画布视图未就绪');
			return;
		}

		const mode = view.getMode();

		// Marp 模式：实时渲染，不缓存
		if (mode === 'marp') {
			const html = await buildMarpFallbackPage(markdown, this.app, this.manifest.dir);
			view.renderCanvas(html);
			new Notice('LumiSlate：Marp 模式已渲染');
			await this.refreshViewContext();
			return;
		}

		// Design 模式：优先读取缓存
		let html = notePath ? await this.cacheManager.readCache(notePath, markdown, prompt) : null;

		if (!html) {
			const bodyHtml = markdownToSimpleHTML(markdown);
			html = buildHTMLPage(bodyHtml);
			if (notePath) {
				await this.cacheManager.writeCache(notePath, html, markdown, theme, prompt);
			}
			new Notice('LumiSlate：已生成并缓存画布');
		} else {
			new Notice('LumiSlate：已从缓存恢复画布');
		}

		view.renderCanvas(html);
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
				const injected = injectReverseMappingScript(preview);
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

				const finalHtml = injectReverseMappingScript(this.aiAccumulated);
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
							const injected = injectReverseMappingScript(text);
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

	/** 显示 Marp CSS 编辑弹窗 — 左右分栏：左侧文件列表，右侧代码编辑 */
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

		// ===== 右侧面板：代码编辑 =====
		const rightPanel = wrap.createEl('div', { cls: 'lumislate-css-right' });

		const pathLabel = rightPanel.createEl('div', { cls: 'lumislate-css-path' });
		pathLabel.textContent = cssDir;

		const textArea = new TextAreaComponent(rightPanel)
			.setPlaceholder('/* 选择左侧预设或新建 CSS 文件 */')
			.setValue('');
		textArea.inputEl.addClass('lumislate-css-textarea');

		// 底部操作栏
		const btnWrap = rightPanel.createEl('div', { cls: 'lumislate-css-right-actions' });
		const deleteBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-danger lumislate-btn-small' });
		setIcon(deleteBtn, 'trash-2');
		deleteBtn.appendText(' 删除');

		const saveBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-primary lumislate-btn-small' });
		setIcon(saveBtn, 'save');
		saveBtn.appendText(' 保存');

		const applyBtn = btnWrap.createEl('button', { cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small' });
		setIcon(applyBtn, 'check');
		applyBtn.appendText(' 应用到笔记');

		// 状态变量
		let cssFiles: string[] = [];
		let selectedFile: string | null = null;
		let hasUnsavedChanges = false;

		const getFilePath = (name: string) => `${cssDir}/${name}`;

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

				// 左键选择
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

				// 右键重命名
				item.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (hasUnsavedChanges) {
						new Notice('请先保存当前修改');
						return;
					}
					// 清除其他重命名输入框
					fileListEl.querySelectorAll('.lumislate-css-rename-input').forEach((el) => el.remove());

					item.empty();
					item.addClass('active');
					const input = item.createEl('input', {
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
						if (ev.key === 'Escape') { item.empty(); item.setText(file); }
					});
					input.addEventListener('blur', () => doRename());
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

		newFileConfirm.addEventListener('click', async () => {
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
		});

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
