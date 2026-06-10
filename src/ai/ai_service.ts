/**
 * AI 服务模块
 * 统一入口：支持本地 CLI Agent + HTTP API 两种调用方式
 */

import { invokeLocalAgent, type LocalAgentCallbacks } from './local_agent';

export interface LLMConfig {
	apiKey: string;
	baseURL: string;
	model: string;
}

export interface StreamCallbacks {
	/** 每次收到文本增量 */
	onDelta: (text: string) => void;
	/** Agent 通过 Write 工具输出的完整 HTML */
	onHtml?: (text: string) => void;
	/** 元数据（模型、用量等） */
	onMeta?: (key: string, value: unknown) => void;
	/** stderr 输出 */
	onStderr?: (text: string) => void;
	/** 发生错误 */
	onError: (err: string) => void;
	/** 流正常结束 */
	onDone: () => void;
}

export type AIProvider = 'local' | 'http';

export interface TestConnectionResult {
	success: boolean;
	message: string;
}

/**
 * 测试 HTTP API 连接
 * 发送一个轻量级请求验证 API 是否可用
 */
export async function testHttpConnection(config: LLMConfig): Promise<TestConnectionResult> {
	try {
		const res = await fetch(config.baseURL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: 'user', content: 'hi' }],
				max_tokens: 1,
			}),
		});
		if (res.ok) {
			return { success: true, message: '连接成功' };
		}
		const text = await res.text().catch(() => res.statusText);
		return { success: false, message: `HTTP ${res.status}: ${text}` };
	} catch (err) {
		return { success: false, message: String((err as Error)?.message ?? err) };
	}
}

export interface AICompileOptions {
	provider: AIProvider;
	/** 本地 agent ID（provider=local 时使用） */
	agentId?: string;
	/** 本地 agent 自定义二进制路径 */
	binOverride?: string;
	/** HTTP API 配置（provider=http 时使用） */
	llmConfig?: LLMConfig;
	/** 模型覆盖 */
	model?: string;
	/** 取消信号 */
	signal?: AbortSignal;
}

/**
 * 统一的 AI 编译入口
 * 根据 opts.provider 自动选择本地 CLI 或 HTTP API
 */
export async function compileWithAI(
	prompt: string,
	opts: AICompileOptions,
	callbacks: StreamCallbacks
): Promise<void> {
	if (opts.provider === 'local' && opts.agentId) {
		const localCallbacks: LocalAgentCallbacks = {
			onDelta: callbacks.onDelta,
			onHtml: callbacks.onHtml ?? (() => {}),
			onMeta: callbacks.onMeta ?? (() => {}),
			onStderr: callbacks.onStderr ?? (() => {}),
			onError: callbacks.onError,
			onDone: callbacks.onDone,
		};
		await invokeLocalAgent(opts.agentId, prompt, localCallbacks, {
			model: opts.model,
			binOverride: opts.binOverride,
			signal: opts.signal,
		});
	} else {
		if (!opts.llmConfig) {
			callbacks.onError('HTTP API 配置缺失');
			callbacks.onDone();
			return;
		}
		try {
			await streamCompileMarkdownToHTML(prompt, opts.llmConfig, callbacks, opts.signal);
		} catch (err) {
			callbacks.onError(String((err as Error)?.message ?? err));
			callbacks.onDone();
		}
	}
}

/**
 * 流式调用大模型 API，将 Markdown 转换为 HTML
 * 兼容 OpenAI 格式的 SSE 流（Kimi / DeepSeek / Claude / Ollama 等）
 */
export async function streamCompileMarkdownToHTML(
	prompt: string,
	config: LLMConfig,
	callbacks: StreamCallbacks,
	signal?: AbortSignal
): Promise<void> {
	const res = await fetch(config.baseURL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
			messages: [
				{ role: 'system', content: 'You are a world-class visual designer and senior frontend engineer.' },
				{ role: 'user', content: prompt },
			],
			stream: true,
			temperature: 0.3,
		}),
		signal,
	});

	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => res.statusText);
		throw new Error(`HTTP ${res.status}: ${text}`);
	}

	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = '';

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });

			let lineEnd: number;
			while ((lineEnd = buf.indexOf('\n')) !== -1) {
				const line = buf.slice(0, lineEnd).trim();
				buf = buf.slice(lineEnd + 1);
				if (!line || !line.startsWith('data:')) continue;

				const dataStr = line.slice(5).trim();
				if (dataStr === '[DONE]') {
					callbacks.onDone();
					return;
				}

				let data: Record<string, unknown>;
				try {
					data = JSON.parse(dataStr);
				} catch {
					continue;
				}

				const delta = (data.choices as Array<Record<string, unknown>>)?.[0]?.delta?.content;
				if (typeof delta === 'string') {
					callbacks.onDelta(delta);
				}
			}
		}
		callbacks.onDone();
	} catch (err) {
		if ((err as Error)?.name === 'AbortError') {
			callbacks.onDone();
			return;
		}
		callbacks.onError(String((err as Error)?.message ?? err));
	}
}

// ============================================================
// HTML 提取与预览（从 html-anything 移植）
// ============================================================

/**
 * 从可能包含聊天废话的流式输出中提取干净 HTML
 */
export function extractHtml(streamed: string): string {
	if (!streamed) return '';

	// 1. Strip ```html fence
	const fence = streamed.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
	if (fence) {
		const inner = fence[1].trim();
		if (inner.startsWith('<')) return inner;
	}

	// 2. Find <!DOCTYPE html ... </html>
	const doctypeStart = streamed.search(/<!DOCTYPE\s+html/i);
	if (doctypeStart !== -1) {
		const closeIdx = streamed.lastIndexOf('</html>');
		if (closeIdx !== -1) {
			return streamed.slice(doctypeStart, closeIdx + '</html>'.length);
		}
		return streamed.slice(doctypeStart);
	}

	// 3. Find <html> ... </html>
	const htmlStart = streamed.search(/<html[\s>]/i);
	if (htmlStart !== -1) {
		const closeIdx = streamed.lastIndexOf('</html>');
		if (closeIdx !== -1) {
			return streamed.slice(htmlStart, closeIdx + '</html>'.length);
		}
		return streamed.slice(htmlStart);
	}

	// 4. Trust if starts with <
	if (streamed.trimStart().startsWith('<')) {
		return streamed;
	}

	// 5. Fallback: wrap in scaffold
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body class="p-8 font-sans"><pre class="whitespace-pre-wrap">${escapeHtml(streamed)}</pre></body></html>`;
}

/**
 * 流式预览用：确保 HTML 有可闭合标签，iframe 能增量渲染
 */
export function previewHtml(streamed: string): string {
	const html = extractHtml(streamed);
	if (!html) return '';
	if (/<\/html>/i.test(html)) return html;
	return html + '\n</body>\n</html>';
}

/**
 * 从完整 HTML 中提取 body 内的内容（用于宿主页增量更新）
 */
export function extractBodyContent(html: string): string {
	if (!html) return '';

	// 找 <body> 标签
	const bodyStartMatch = html.match(/<body[^>]*>/i);
	if (!bodyStartMatch) {
		// 没有 body 标签，返回整个 HTML（可能是纯内容片段）
		return html;
	}

	const bodyStart = bodyStartMatch.index! + bodyStartMatch[0].length;

	// 找 </body> 或 </html> 或文档结尾
	const bodyEndMatch = html.match(/<\/body>/i);
	const htmlEndMatch = html.match(/<\/html>/i);

	let bodyEnd: number;
	if (bodyEndMatch) {
		bodyEnd = bodyEndMatch.index!;
	} else if (htmlEndMatch) {
		bodyEnd = htmlEndMatch.index!;
	} else {
		bodyEnd = html.length;
	}

	return html.slice(bodyStart, bodyEnd).trim();
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

// ============================================================
// Frontmatter 工具（保留）
// ============================================================

/** 提取 Markdown 顶部的 YAML Frontmatter */
export function extractFrontmatter(markdown: string): { frontmatter: string; body: string } {
	const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (match) {
		return { frontmatter: match[1], body: match[2] };
	}
	return { frontmatter: '', body: markdown };
}

/** 从 frontmatter 原始文本中提取单个字段值 */
export function extractFrontmatterValue(frontmatter: string, key: string): string {
	const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
	const match = frontmatter.match(regex);
	if (!match) return '';
	return match[1].trim().replace(/^["']|["']$/g, '');
}
