import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, Notice, Modal, TextAreaComponent, ButtonComponent } from 'obsidian';
import { CacheManager } from './cache_manager';
import { extractFrontmatter, extractFrontmatterValue, compileWithAI, previewHtml } from './ai_service';
import { getAvailableAgents, detectAgent } from './local_agent';
import { SKILLS, getSkillById, assemblePrompt, parseMarpDirectives, MARP_BODY, MODES, getModeById } from './skills';
import type { Mode } from './skills';
import { LumiSlateSettingTab, DEFAULT_SETTINGS } from './settings';
import type { LumiSlateSettings } from './settings';
import { createPreprocessedFile, checkPreprocessedState } from './preprocess';
import { downloadHtml, downloadPngFromIframe, saveHtmlToVault } from './export';
import { PreprocessConfirmModal, ExportMenuModal } from './modals';

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

/**
 * Marp 降级渲染: 按 --- 分页生成简单幻灯片 HTML
 */
function buildMarpFallbackPage(markdown: string): string {
	const { frontmatter, body } = extractFrontmatter(markdown);
	const bgColor = extractFrontmatterValue(frontmatter, 'backgroundcolor') || extractFrontmatterValue(frontmatter, 'backgroundColor') || '#0f172a';
	const textColor = extractFrontmatterValue(frontmatter, 'color') || '#e2e8f0';
	const paginate = extractFrontmatterValue(frontmatter, 'paginate');
	const showPaginate = paginate === 'true';

	// 按 --- 分割 body 为 slides
	const slideTexts = body.split(/^---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 0);
	if (slideTexts.length === 0) {
		slideTexts.push(body.trim() || '(空幻灯片)');
	}

	const slidesHtml = slideTexts
		.map((text, idx) => {
			const bodyHtml = markdownToSimpleHTML(text);
			const pageNum = showPaginate ? `<div style="position:absolute;bottom:16px;right:24px;font-size:12px;opacity:0.5;">${idx + 1} / ${slideTexts.length}</div>` : '';
			return `<section class="slide" data-index="${idx}">${bodyHtml}${pageNum}</section>`;
		})
		.join('\n');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: ${bgColor}; color: ${textColor}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
#marp-deck { width: 100%; height: 100%; position: relative; }
.slide { position: absolute; inset: 0; display: none; padding: 3rem 4rem; overflow: auto; line-height: 1.75; }
.slide.active { display: block; }
.slide h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 1.5rem; }
.slide h2 { font-size: 1.75rem; font-weight: 700; margin: 1.5rem 0 1rem; }
.slide h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.slide p { margin-bottom: 0.75rem; }
.slide ul, .slide ol { margin-left: 2rem; margin-bottom: 0.75rem; }
.slide li { margin-bottom: 0.35rem; }
#marp-nav { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 100; }
#marp-nav button { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; cursor: pointer; font-size: 13px; }
#marp-nav button:hover { background: rgba(255,255,255,0.2); }
#marp-hint { position: fixed; top: 16px; right: 20px; font-size: 12px; opacity: 0.5; pointer-events: none; animation: fadeOut 3s forwards 2s; }
@keyframes fadeOut { to { opacity: 0; } }
.lumislate-hover { background: rgba(96, 165, 250, 0.12); cursor: text; border-radius: 2px; }
.lumislate-editing { outline: 2px dashed #60a5fa; outline-offset: 2px; border-radius: 4px; background: rgba(96, 165, 250, 0.06); }
</style>
</head>
<body>
<div id="marp-deck">
${slidesHtml}
</div>
<div id="marp-nav">
  <button onclick="prev()">← 上一页</button>
  <button onclick="next()">下一页 →</button>
</div>
<div id="marp-hint">按 → 或空格翻页</div>
<script>
(function(){
  var slides = document.querySelectorAll('.slide');
  var idx = 0;
  function show(i) {
    if (i < 0) i = 0; if (i >= slides.length) i = slides.length - 1;
    slides[idx].classList.remove('active');
    slides[i].classList.add('active');
    idx = i;
  }
  window.next = function() { show(idx + 1); };
  window.prev = function() { show(idx - 1); };
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(idx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(idx - 1); }
  });
  show(0);
})();
</script>
${getReverseMappingScript()}
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
}
.welcome h1 {
  font-size: 2.5rem; font-weight: 800; letter-spacing: -0.02em;
  background: linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  margin-bottom: 0.75rem;
}
.welcome p { font-size: 1rem; color: #64748b; letter-spacing: 0.05em; }
.welcome .subtitle { margin-top: 1.5rem; font-size: 0.75rem; color: #475569; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="welcome">
  <h1>LumiSlate</h1>
  <p>流光石板已就绪</p>
  <div class="subtitle">选择 Markdown 笔记，开始编译高定画布</div>
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
	private currentMode: Mode = 'design';
	onModeChange: ((mode: Mode) => void) | null = null;
	onSkillChange: ((skillId: string) => void) | null = null;
	onAiRender: (() => void) | null = null;
	onAiCancel: (() => void) | null = null;
	onOpenSettings: (() => void) | null = null;
	onPreprocess: (() => void) | null = null;
	onExport: (() => void) | null = null;
	onMarpSize: (() => void) | null = null;
	onMarpCss: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return LUMISLATE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'LumiSlate Canvas';
	}

	/** 视图初始化：创建工具栏 + 指标栏 + iframe */
	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('lumislate-canvas-container');

		// 工具栏
		this.toolbarEl = container.createEl('div', { cls: 'lumislate-toolbar' });
		this.buildToolbar(this.toolbarEl);

		// 指标栏
		this.metricsEl = container.createEl('div', { cls: 'lumislate-metrics-bar' });
		this.metricsEl.style.display = 'none';

		// iframe
		this.iframe = container.createEl('iframe', {
			cls: 'lumislate-canvas-iframe',
		});
		this.iframe.setAttribute('srcdoc', getWelcomeHTML());
		this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
	}

	async onClose(): Promise<void> {
		this.iframe = null;
		this.toolbarEl = null;
		this.metricsEl = null;
	}

	/** 构建工具栏 */
	private buildToolbar(el: HTMLElement): void {
		el.empty();

		// 模式切换标签
		const modeGroup = el.createEl('div', { cls: 'lumislate-mode-tabs' });
		for (const mode of MODES) {
			const tab = modeGroup.createEl('button', {
				cls: `lumislate-mode-tab ${mode.id === this.currentMode ? 'active' : ''}`,
				text: `${mode.emoji} ${mode.name}`,
			});
			tab.addEventListener('click', () => {
				if (this.currentMode !== mode.id) {
					this.currentMode = mode.id;
					this.onModeChange?.(mode.id);
					this.buildToolbar(el);
				}
			});
		}

		if (this.currentMode === 'marp') {
			this.buildMarpToolbar(el);
		} else {
			this.buildDesignToolbar(el);
		}

		// 状态文本
		el.createEl('span', { cls: 'lumislate-status', text: '就绪' });
	}

	/** Marp 模式工具栏 */
	private buildMarpToolbar(el: HTMLElement): void {
		const btnGroup = el.createEl('div', { cls: 'lumislate-toolbar-btns' });

		// 文本预处理按钮
		const preprocessBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '📝 文本预处理',
		});
		preprocessBtn.addEventListener('click', () => this.onPreprocess?.());

		// 尺寸比例按钮
		const sizeBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '📐 尺寸比例',
		});
		sizeBtn.addEventListener('click', () => this.onMarpSize?.());

		// CSS 按钮
		const cssBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '🎨 CSS',
		});
		cssBtn.addEventListener('click', () => this.onMarpCss?.());

		// AI 渲染按钮
		const aiBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-primary',
			text: '✨ AI 渲染',
		});
		aiBtn.addEventListener('click', () => this.onAiRender?.());

		// 取消按钮
		const cancelBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '取消',
		});
		cancelBtn.addEventListener('click', () => this.onAiCancel?.());

		// 设置按钮
		const settingsBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-icon',
			text: '⚙',
			attr: { title: '设置' },
		});
		settingsBtn.addEventListener('click', () => this.onOpenSettings?.());
	}

	/** Design 模式工具栏 */
	private buildDesignToolbar(el: HTMLElement): void {
		// SKILL 选择
		const skillSelect = el.createEl('select', { cls: 'lumislate-skill-select' });
		for (const skill of SKILLS) {
			skillSelect.createEl('option', {
				text: `${skill.emoji} ${skill.name}`,
				value: skill.id,
			});
		}
		skillSelect.addEventListener('change', () => {
			this.onSkillChange?.(skillSelect.value);
		});

		// 按钮组
		const btnGroup = el.createEl('div', { cls: 'lumislate-toolbar-btns' });

		// 预处理按钮
		const preprocessBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '📝 预处理',
		});
		preprocessBtn.addEventListener('click', () => this.onPreprocess?.());

		// AI 渲染按钮
		const aiBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-primary',
			text: '✨ AI 渲染',
		});
		aiBtn.addEventListener('click', () => this.onAiRender?.());

		// 导出按钮
		const exportBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '⬇️ 导出',
		});
		exportBtn.addEventListener('click', () => this.onExport?.());

		// 取消按钮
		const cancelBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-small',
			text: '取消',
		});
		cancelBtn.addEventListener('click', () => this.onAiCancel?.());

		// 设置按钮
		const settingsBtn = btnGroup.createEl('button', {
			cls: 'lumislate-btn lumislate-btn-ghost lumislate-btn-icon',
			text: '⚙',
			attr: { title: '设置' },
		});
		settingsBtn.addEventListener('click', () => this.onOpenSettings?.());
	}

	/** 设置当前模式 */
	setMode(mode: Mode): void {
		if (this.currentMode !== mode) {
			this.currentMode = mode;
			if (this.toolbarEl) this.buildToolbar(this.toolbarEl);
		}
	}

	/** 获取当前模式 */
	getMode(): Mode {
		return this.currentMode;
	}

	/** 设置当前选中的 SKILL */
	setSelectedSkill(skillId: string): void {
		const select = this.toolbarEl?.querySelector('.lumislate-skill-select') as HTMLSelectElement | null;
		if (select) select.value = skillId;
	}

	/** 获取当前选中的 SKILL */
	getSelectedSkill(): string {
		const select = this.toolbarEl?.querySelector('.lumislate-skill-select') as HTMLSelectElement | null;
		return select?.value || SKILLS[0]?.id || '';
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
	private aiAccumulated = '';
	private currentRunStats: RunStats | null = null;
	private metricsTimer: number | null = null;

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
				view.onMarpSize = () => this.showMarpSizeModal();
				view.onMarpCss = () => this.showMarpCssModal();
				// 恢复上次选中的模式和 skill
				view.setMode(this.settings.defaultMode);
				view.setSelectedSkill(this.settings.defaultSkill);
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
		this.setupReverseMapping();
	}

	onunload(): void {
		console.log('LumiSlate 插件已卸载');
		this.cancelAiRender();
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

		// 优先读取缓存
		let html = notePath ? await this.cacheManager.readCache(notePath, markdown, prompt) : null;

		if (!html) {
			const mode = view.getMode();
			if (mode === 'marp') {
				html = buildMarpFallbackPage(markdown);
			} else {
				const bodyHtml = markdownToSimpleHTML(markdown);
				html = buildHTMLPage(bodyHtml);
			}
			if (notePath) {
				await this.cacheManager.writeCache(notePath, html, markdown, theme, prompt);
			}
			new Notice('LumiSlate：已生成并缓存画布');
		} else {
			new Notice('LumiSlate：已从缓存恢复画布');
		}

		view.renderCanvas(html);
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
			this.aiAccumulated = '';

			view.setStatus(`🔄 ${resolved.reason} 渲染中…`);
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
				if (this.currentRunStats) {
					this.currentRunStats.endedAt = Date.now();
					this.updateMetricsDisplay();
				}
				this.stopMetricsTimer();
				const finalHtml = injectReverseMappingScript(this.aiAccumulated);
				view.renderCanvas(finalHtml);
				view.setStatus('✅ 渲染完成');

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
								view.setStatus(`🔄 ${resolved.reason} · ${value}`);
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
							view.setStatus(`❌ 错误: ${err.slice(0, 40)}`);
							new Notice(`AI 渲染失败: ${err}`);
						},
						onDone: handleDone,
					}
				);
			} catch (err) {
				this.aiAbortCtl = null;
				if (this.currentRunStats) {
					this.currentRunStats.endedAt = Date.now();
					this.updateMetricsDisplay();
				}
				this.stopMetricsTimer();
				const msg = String((err as Error)?.message ?? err);
				view.setStatus(`❌ 错误: ${msg.slice(0, 40)}`);
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

	/** 显示 Marp 尺寸比例选择弹窗 */
	async showMarpSizeModal(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const modal = new Modal(this.app);
		modal.setTitle('幻灯片尺寸比例');

		const content = modal.contentEl;
		content.createEl('p', { text: '选择幻灯片的宽高比：' });

		const btnWrap = content.createEl('div', { cls: 'lumislate-modal-buttons' });

		const sizes = [
			{ label: '16:9（宽屏）', value: '16:9' },
			{ label: '4:3（标准）', value: '4:3' },
			{ label: 'auto（自动）', value: 'auto' },
		];

		for (const s of sizes) {
			const btn = new ButtonComponent(btnWrap)
				.setButtonText(s.label)
				.onClick(async () => {
					await this.updateMarpFrontmatterField('size', s.value);
					modal.close();
				});
			btn.buttonEl.addClass('lumislate-btn', 'lumislate-btn-ghost');
		}

		modal.open();
	}

	/** 显示 Marp CSS 编辑弹窗 */
	async showMarpCssModal(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('请先打开一个 Markdown 笔记');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const { frontmatter } = extractFrontmatter(content);
		const existingStyle = extractFrontmatterValue(frontmatter, 'style') || '';

		const modal = new Modal(this.app);
		modal.setTitle('自定义 CSS');

		const wrap = modal.contentEl.createEl('div');
		wrap.createEl('p', { text: '在此输入 Marp 自定义 CSS（将保存到当前笔记的 frontmatter style 字段）：' });

		let textValue = existingStyle;
		const textArea = new TextAreaComponent(wrap)
			.setPlaceholder('例如: section { background: #f0f0f0; }')
			.setValue(existingStyle)
			.onChange((v) => { textValue = v; });
		textArea.inputEl.rows = 8;
		textArea.inputEl.style.width = '100%';
		textArea.inputEl.style.fontFamily = 'monospace';

		const btnWrap = wrap.createEl('div', { cls: 'lumislate-modal-buttons' });
		new ButtonComponent(btnWrap)
			.setButtonText('保存')
			.setCta()
			.onClick(async () => {
				await this.updateMarpFrontmatterField('style', textValue);
				modal.close();
			});
		new ButtonComponent(btnWrap)
			.setButtonText('取消')
			.onClick(() => modal.close());

		modal.open();
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
		if (this.aiAbortCtl) {
			this.aiAbortCtl.abort();
			this.aiAbortCtl = null;
			const view = this.getLumiSlateView();
			if (view) {
				view.setStatus('已取消');
				view.hideMetrics();
			}
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
			if (event.data?.type !== 'lumislate-text-change') return;

			const view = this.getLumiSlateView();
			if (!view || event.source !== view.getIframeWindow()) return;

			this.applyTextChange(event.data);
		});
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
