/**
 * 本地 CLI Agent 检测与调用模块
 * 移植自 html-anything 的 detect.ts + invoke.ts + argv.ts
 * 在 Obsidian Electron 环境中直接通过 child_process 调用本地 AI CLI
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import nodePath, { delimiter, join } from 'path';

// ============================================================
// 类型定义
// ============================================================

export type AgentProtocol = 'stdin' | 'argv' | 'argv-message';

export type ModelOption = { id: string; label: string };

export const DEFAULT_MODEL: ModelOption = { id: 'default', label: 'Default (CLI config)' };

export type AgentDef = {
	id: string;
	label: string;
	bin: string;
	fallbackBins?: string[];
	envOverride?: string;
	vendor: string;
	protocol?: AgentProtocol;
	fallbackModels: ModelOption[];
};

export type DetectedAgent = {
	id: string;
	label: string;
	vendor: string;
	available: boolean;
	path?: string;
	resolvedBin?: string;
	protocol: AgentProtocol;
	models: ModelOption[];
};

export interface LocalAgentCallbacks {
	onDelta: (text: string) => void;
	onHtml: (text: string) => void;
	onMeta: (key: string, value: unknown) => void;
	onStderr: (text: string) => void;
	onError: (err: string) => void;
	onDone: () => void;
}

// ============================================================
// Agent 定义表
// ============================================================

export const AGENTS: AgentDef[] = [
	{
		id: 'claude',
		label: 'Claude Code',
		bin: 'claude',
		fallbackBins: ['openclaude'],
		envOverride: 'CLAUDE_BIN',
		vendor: 'Anthropic',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'sonnet', label: 'Sonnet (alias)' },
			{ id: 'opus', label: 'Opus (alias)' },
			{ id: 'haiku', label: 'Haiku (alias)' },
			{ id: 'claude-opus-4-7', label: 'claude-opus-4-7' },
			{ id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
			{ id: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
		],
	},
	{
		id: 'codex',
		label: 'OpenAI Codex',
		bin: 'codex',
		envOverride: 'CODEX_BIN',
		vendor: 'OpenAI',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'gpt-5.5', label: 'gpt-5.5' },
			{ id: 'gpt-5.4', label: 'gpt-5.4' },
			{ id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
			{ id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
			{ id: 'gpt-5-codex', label: 'gpt-5-codex' },
			{ id: 'gpt-5', label: 'gpt-5' },
			{ id: 'o3', label: 'o3' },
			{ id: 'o4-mini', label: 'o4-mini' },
		],
	},
	{
		id: 'gemini',
		label: 'Gemini CLI',
		bin: 'gemini',
		envOverride: 'GEMINI_BIN',
		vendor: 'Google',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
			{ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
		],
	},
	{
		id: 'cursor-agent',
		label: 'Cursor Agent',
		bin: 'cursor-agent',
		envOverride: 'CURSOR_AGENT_BIN',
		vendor: 'Cursor',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'auto', label: 'auto' },
			{ id: 'sonnet-4', label: 'sonnet-4' },
			{ id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
			{ id: 'gpt-5', label: 'gpt-5' },
		],
	},
	{
		id: 'deepseek',
		label: 'DeepSeek TUI',
		bin: 'deepseek',
		envOverride: 'DEEPSEEK_BIN',
		vendor: 'DeepSeek',
		protocol: 'argv',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
			{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
		],
	},
	{
		id: 'aider',
		label: 'Aider',
		bin: 'aider',
		vendor: 'Aider',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
			{ id: 'gpt-5', label: 'gpt-5' },
			{ id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
		],
	},
	{
		id: 'opencode',
		label: 'OpenCode',
		bin: 'opencode-cli',
		fallbackBins: ['opencode'],
		envOverride: 'OPENCODE_BIN',
		vendor: 'Open',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'anthropic/claude-sonnet-4-5', label: 'anthropic/claude-sonnet-4-5' },
			{ id: 'openai/gpt-5', label: 'openai/gpt-5' },
			{ id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
		],
	},
	{
		id: 'qwen',
		label: 'Qwen Coder',
		bin: 'qwen',
		envOverride: 'QWEN_BIN',
		vendor: 'Alibaba',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
			{ id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' },
		],
	},
	{
		id: 'qoder',
		label: 'Qoder CLI',
		bin: 'qodercli',
		envOverride: 'QODER_BIN',
		vendor: 'Qoder',
		fallbackModels: [
			DEFAULT_MODEL,
			{ id: 'lite', label: 'Lite' },
			{ id: 'efficient', label: 'Efficient' },
			{ id: 'auto', label: 'Auto' },
			{ id: 'performance', label: 'Performance' },
			{ id: 'ultimate', label: 'Ultimate' },
		],
	},
];

// ============================================================
// 安全访问 process（Obsidian 渲染进程中 process 可能不可用）
// ============================================================

function safeProcessEnv(): NodeJS.ProcessEnv {
	return typeof process !== 'undefined' ? process.env : {};
}

function safeProcessPlatform(): string {
	return typeof process !== 'undefined' ? process.platform : '';
}

// ============================================================
// 检测逻辑
// ============================================================

function userToolchainDirs(): string[] {
	const home = homedir();
	const env = safeProcessEnv();
	const dirs: string[] = [];
	const vp = env.VP_HOME?.trim();
	if (vp) dirs.push(join(vp, 'bin'));
	const npmPrefix = env.NPM_CONFIG_PREFIX?.trim();
	if (npmPrefix) {
		dirs.push(join(npmPrefix, 'bin'), npmPrefix);
	}
	dirs.push(
		join(home, '.local/bin'),
		join(home, '.vite-plus/bin'),
		join(home, '.opencode/bin'),
		join(home, '.bun/bin'),
		join(home, '.volta/bin'),
		join(home, '.asdf/shims'),
		join(home, 'Library/pnpm'),
		join(home, '.cargo/bin'),
		join(home, '.npm-global/bin'),
		join(home, '.npm-packages/bin'),
		join(home, '.claude/local'),
	);
	if (safeProcessPlatform() === 'win32') {
		const scoopRoot = env.SCOOP?.trim() || join(home, 'scoop');
		const globalScoopRoot = env.SCOOP_GLOBAL?.trim() || 'C:\\ProgramData\\scoop';
		const appData = env.APPDATA?.trim();
		dirs.push(
			join(scoopRoot, 'shims'),
			join(scoopRoot, 'apps', 'nodejs', 'current'),
			join(scoopRoot, 'apps', 'nodejs-lts', 'current'),
			join(globalScoopRoot, 'shims'),
			join(globalScoopRoot, 'apps', 'nodejs', 'current'),
		);
		if (appData) dirs.push(join(appData, 'npm'));
	} else {
		dirs.push('/opt/homebrew/bin', '/usr/local/bin');
	}
	return dirs;
}

export function resolveOnPath(bin: string): string | null {
	const env = safeProcessEnv();
	const exts =
		safeProcessPlatform() === 'win32'
			? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
			: [''];
	const seen = new Set<string>();
	const dirs = [
		...(env.PATH ?? '').split(delimiter),
		...userToolchainDirs(),
	].filter((d) => d && !seen.has(d) && (seen.add(d), true));
	for (const d of dirs) {
		for (const e of exts) {
			const full = nodePath.join(d, bin + e);
			try {
				if (existsSync(full)) return full;
			} catch {
				// ignore
			}
		}
	}
	return null;
}

// 模块级缓存：避免每次调用都扫描 PATH
let _cachedAgents: DetectedAgent[] | null = null;

export function detectAgents(): DetectedAgent[] {
	if (_cachedAgents) return _cachedAgents;
	return refreshAgents();
}

/** 强制重新扫描 PATH 检测 agent（设置页面调用） */
export function refreshAgents(): DetectedAgent[] {
	_cachedAgents = AGENTS.map((a): DetectedAgent => {
		const protocol = a.protocol ?? 'stdin';
		const base = {
			id: a.id,
			label: a.label,
			vendor: a.vendor,
			protocol,
			models: a.fallbackModels,
		};
		const override = a.envOverride ? safeProcessEnv()[a.envOverride] : undefined;
		if (override && existsSync(override)) {
			return { ...base, available: true, path: override, resolvedBin: a.bin };
		}
		const candidates = [a.bin, ...(a.fallbackBins ?? [])];
		for (const c of candidates) {
			const p = resolveOnPath(c);
			if (p) {
				return { ...base, available: true, path: p, resolvedBin: c };
			}
		}
		return { ...base, available: false };
	});
	return _cachedAgents;
}

/** 获取单个 agent 的检测状态 */
export function detectAgent(agentId: string): DetectedAgent | undefined {
	return detectAgents().find((a) => a.id === agentId);
}

/** 只返回可用的 agent 列表 */
export function getAvailableAgents(): DetectedAgent[] {
	return detectAgents().filter((a) => a.available);
}

// ============================================================
// 命令行参数构建
// ============================================================

export function buildArgv(agent: string, opts: { model?: string; prompt?: string }): string[] {
	const { model } = opts;
	switch (agent) {
		case 'claude':
			return [
				'-p',
				'--output-format', 'stream-json',
				'--verbose',
				'--include-partial-messages',
				'--permission-mode', 'bypassPermissions',
				...(model ? ['--model', model] : []),
			];
		case 'codex':
			return [
				'exec',
				'--json',
				'--skip-git-repo-check',
				'--sandbox', 'workspace-write',
				'-c', 'sandbox_workspace_write.network_access=true',
				...(model ? ['--model', model] : []),
			];
		case 'cursor-agent':
			return [
				'--print',
				'--output-format', 'stream-json',
				'--stream-partial-output',
				'--force',
				'--trust',
				...(model ? ['--model', model] : []),
			];
		case 'gemini':
			return [
				'--output-format', 'stream-json',
				'--yolo',
				...(model ? ['--model', model] : []),
			];
		case 'copilot':
			return [
				'--allow-all-tools',
				'--output-format', 'json',
				...(model ? ['--model', model] : []),
			];
		case 'opencode':
			return [
				'run',
				'--format', 'json',
				'--dangerously-skip-permissions',
				...(model ? ['--model', model] : []),
				'-',
			];
		case 'qwen':
			return ['--yolo', ...(model ? ['--model', model] : []), '-'];
		case 'aider':
			return [
				'--no-pretty',
				'--no-stream',
				'--yes-always',
				'--message-file', '-',
				...(model ? ['--model', model] : []),
			];
		case 'qoder':
			return [
				'-p',
				'--output-format', 'stream-json',
				'--yolo',
				...(model ? ['--model', model] : []),
			];
		case 'deepseek':
			return ['exec', '--auto', ...(model ? ['--model', model] : [])];
		default:
			throw new Error(`unknown agent: ${agent}`);
	}
}

export function envFor(agent: string): NodeJS.ProcessEnv {
	const base = { ...safeProcessEnv() };
	if (agent === 'gemini') base.GEMINI_CLI_TRUST_WORKSPACE = 'true';
	return base;
}

// ============================================================
// stdout 解析器
// ============================================================

type ParseState = { sawStreamEventText?: boolean };

export type AgentParse =
	| { kind: 'delta'; text: string }
	| { kind: 'meta'; key: string; value: unknown }
	| { kind: 'html'; text: string }
	| { kind: 'noise' };

function rescueHtmlFromToolUse(
	content: Array<{ type?: string; name?: string; input?: unknown }> | undefined,
): string {
	if (!Array.isArray(content)) return '';
	const parts: string[] = [];
	for (const block of content) {
		if (!block || block.type !== 'tool_use') continue;
		const name = (block.name ?? '').toLowerCase();
		if (
			name !== 'write' &&
			name !== 'create_file' &&
			name !== 'createfile' &&
			name !== 'writefile' &&
			name !== 'write_file' &&
			name !== 'filewrite'
		)
			continue;
		const input = block.input as Record<string, unknown> | undefined;
		if (!input || typeof input !== 'object') continue;
		const path = String(input.file_path ?? input.path ?? input.filename ?? '').toLowerCase();
		if (path && !/\.(html?|htm)$/.test(path)) continue;
		const text =
			typeof input.content === 'string'
				? input.content
				: typeof input.text === 'string'
					? input.text
					: typeof input.file_content === 'string'
						? input.file_content
						: '';
		if (text) parts.push(text);
	}
	return parts.join('');
}

function parseLineWithState(agent: string, line: string, state: ParseState): AgentParse[] {
	const trimmed = line.trim();
	if (!trimmed) return [];

	if (agent === 'aider' || agent === 'deepseek') {
		return [{ kind: 'delta', text: trimmed.endsWith('\n') ? trimmed : trimmed + '\n' }];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [{ kind: 'noise' }];
	}
	if (!parsed || typeof parsed !== 'object') return [];
	const obj = parsed as Record<string, unknown>;
	const out: AgentParse[] = [];

	// claude / qoder
	if (agent === 'claude' || agent === 'qoder') {
		if (obj.type === 'system' && obj.subtype === 'init') {
			if (obj.model) out.push({ kind: 'meta', key: 'model', value: obj.model });
			if (obj.session_id) out.push({ kind: 'meta', key: 'session', value: obj.session_id });
			if (obj.cwd) out.push({ kind: 'meta', key: 'cwd', value: obj.cwd });
		}
		if (obj.type === 'stream_event' && obj.event && typeof obj.event === 'object') {
			const ev = obj.event as { type?: string; delta?: { type?: string; text?: string; thinking?: string } };
			if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
				state.sawStreamEventText = true;
				out.push({ kind: 'delta', text: ev.delta.text });
			} else if (ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta') {
				out.push({ kind: 'meta', key: 'thinking', value: ev.delta.thinking });
			}
		}
		if (obj.type === 'assistant' && obj.message && typeof obj.message === 'object') {
			const msg = obj.message as {
				content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
				usage?: Record<string, number>;
				model?: string;
			};
			const toolHtml = rescueHtmlFromToolUse(msg.content);
			if (toolHtml) {
				out.push({ kind: 'html', text: toolHtml });
				state.sawStreamEventText = true;
			}
			if (!state.sawStreamEventText) {
				const text = (msg.content ?? [])
					.filter((c) => c?.type === 'text' && typeof c.text === 'string')
					.map((c) => c.text!)
					.join('');
				if (text) out.push({ kind: 'delta', text });
			}
			if (msg.usage) out.push({ kind: 'meta', key: 'usage_partial', value: msg.usage });
		}
		if (obj.type === 'result') {
			if (obj.usage) out.push({ kind: 'meta', key: 'usage', value: obj.usage });
			if (typeof obj.duration_ms === 'number') out.push({ kind: 'meta', key: 'duration_ms', value: obj.duration_ms });
			if (typeof obj.total_cost_usd === 'number') out.push({ kind: 'meta', key: 'cost_usd', value: obj.total_cost_usd });
			if (typeof obj.subtype === 'string') out.push({ kind: 'meta', key: 'result', value: obj.subtype });
		}
		if (obj.type === 'rate_limit_event' && obj.rate_limit_info) {
			out.push({ kind: 'meta', key: 'rate_limit', value: obj.rate_limit_info });
		}
	}

	// codex
	if (agent === 'codex') {
		if (obj.type === 'item.completed' && obj.item && typeof obj.item === 'object') {
			const item = obj.item as { item_type?: string; type?: string; text?: string };
			const itemType = item.item_type ?? item.type;
			if ((itemType === 'assistant_message' || itemType === 'agent_message') && typeof item.text === 'string') {
				out.push({ kind: 'delta', text: item.text });
			}
		}
		if (obj.type === 'item.delta' && typeof obj.text === 'string') {
			out.push({ kind: 'delta', text: obj.text });
		}
		if (obj.msg && typeof obj.msg === 'object') {
			const msg = obj.msg as { type?: string; message?: string };
			if (msg.type === 'agent_message' && typeof msg.message === 'string') {
				out.push({ kind: 'delta', text: msg.message });
			}
		}
		if ((obj.type === 'task_complete' || obj.type === 'turn.completed') && obj.usage) {
			out.push({ kind: 'meta', key: 'usage', value: obj.usage });
		}
	}

	// cursor-agent / gemini
	if (agent === 'cursor-agent' || agent === 'gemini') {
		if (obj.type === 'stream_event' && obj.event && typeof obj.event === 'object') {
			const ev = obj.event as { type?: string; delta?: { type?: string; text?: string } };
			if (ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
				state.sawStreamEventText = true;
				out.push({ kind: 'delta', text: ev.delta.text });
			}
		}
		if (obj.type === 'assistant' && obj.message && typeof obj.message === 'object') {
			const msg = obj.message as { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }> };
			const toolHtml = rescueHtmlFromToolUse(msg.content);
			if (toolHtml) {
				out.push({ kind: 'html', text: toolHtml });
				state.sawStreamEventText = true;
			}
			if (!state.sawStreamEventText) {
				const text = (msg.content ?? [])
					.filter((c) => c?.type === 'text' && typeof c.text === 'string')
					.map((c) => c.text!)
					.join('');
				if (text) out.push({ kind: 'delta', text });
			}
		}
		if (typeof obj.text === 'string' && !state.sawStreamEventText && obj.type !== 'assistant') {
			out.push({ kind: 'delta', text: obj.text });
		}
	}

	// copilot
	if (agent === 'copilot') {
		if (typeof obj.response === 'string') out.push({ kind: 'delta', text: obj.response });
		if (typeof obj.text === 'string') out.push({ kind: 'delta', text: obj.text });
	}

	// opencode / qwen
	if (agent === 'opencode' || agent === 'qwen') {
		if (typeof obj.text === 'string') out.push({ kind: 'delta', text: obj.text });
		if (typeof obj.content === 'string') out.push({ kind: 'delta', text: obj.content });
		if (typeof obj.message === 'string') out.push({ kind: 'delta', text: obj.message });
	}

	return out;
}

export function makeParser(agent: string): (line: string) => AgentParse[] {
	const state: ParseState = {};
	return (line: string) => parseLineWithState(agent, line, state);
}

// ============================================================
// 调用本地 Agent
// ============================================================

type BinResolution =
	| { kind: 'ok'; bin: string }
	| { kind: 'override-missing'; tried: string }
	| { kind: 'not-found' };

function resolveBinForAgent(
	def: AgentDef,
	binOverride: string | undefined,
): BinResolution {
	const tryPath = (p: string | undefined): string | null => {
		if (!p) return null;
		const trimmed = p.trim();
		if (!trimmed) return null;
		if (/^([a-zA-Z]:[\\/]|[\\/])/.test(trimmed)) {
			return existsSync(trimmed) ? trimmed : null;
		}
		return resolveOnPath(trimmed);
	};
	if (binOverride && binOverride.trim()) {
		const fromOverride = tryPath(binOverride);
		if (fromOverride) return { kind: 'ok', bin: fromOverride };
		return { kind: 'override-missing', tried: binOverride.trim() };
	}
	if (def.envOverride) {
		const fromEnv = tryPath(safeProcessEnv()[def.envOverride]);
		if (fromEnv) return { kind: 'ok', bin: fromEnv };
	}
	for (const c of [def.bin, ...(def.fallbackBins ?? [])]) {
		const found = resolveOnPath(c);
		if (found) return { kind: 'ok', bin: found };
	}
	return { kind: 'not-found' };
}

/**
 * 调用本地 CLI Agent，将 prompt 传入，通过回调接收流式输出
 */
export async function invokeLocalAgent(
	agentId: string,
	prompt: string,
	callbacks: LocalAgentCallbacks,
	opts?: { model?: string; binOverride?: string; signal?: AbortSignal }
): Promise<void> {
	const def = AGENTS.find((a) => a.id === agentId);
	if (!def) {
		callbacks.onError(`unknown agent: ${agentId}`);
		callbacks.onDone();
		return;
	}

	const resolved = resolveBinForAgent(def, opts?.binOverride);
	if (resolved.kind === 'override-missing') {
		callbacks.onError(`${def.label}: custom path \`${resolved.tried}\` does not exist.`);
		callbacks.onDone();
		return;
	}
	if (resolved.kind === 'not-found') {
		callbacks.onError(`${def.label} (\`${def.bin}\`) is not installed or not on PATH.`);
		callbacks.onDone();
		return;
	}

	const bin = resolved.bin;
	const promptViaArgv = def.protocol === 'argv';
	const promptViaMessageFlag = def.protocol === 'argv-message';

	let argv: string[];
	try {
		argv = buildArgv(agentId, { model: opts?.model });
	} catch (err) {
		callbacks.onError(err instanceof Error ? err.message : String(err));
		callbacks.onDone();
		return;
	}

	if (promptViaArgv) argv = [...argv, prompt];
	if (promptViaMessageFlag) argv = [...argv, '--message', prompt];

	const env = envFor(agentId);
	let child: ChildProcessWithoutNullStreams;
	try {
		child = spawn(bin, argv, {
			cwd: typeof process !== 'undefined' ? process.cwd() : '.',
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: safeProcessPlatform() === 'win32',
		});
	} catch (err) {
		callbacks.onError(err instanceof Error ? err.message : String(err));
		callbacks.onDone();
		return;
	}

	callbacks.onMeta('bin', bin);
	callbacks.onMeta('argv', argv);

	child.stdin.on('error', () => {});
	try {
		if (!promptViaArgv && !promptViaMessageFlag) {
			child.stdin.write(prompt, 'utf8');
		}
		child.stdin.end();
	} catch {}

	const parse = makeParser(agentId);
	let stdoutBuf = '';

	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (chunk: string) => {
		stdoutBuf += chunk;
		let nl: number;
		while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
			const line = stdoutBuf.slice(0, nl);
			stdoutBuf = stdoutBuf.slice(nl + 1);
			if (!line) continue;
			for (const part of parse(line)) {
				if (part.kind === 'delta') callbacks.onDelta(part.text);
				else if (part.kind === 'html') callbacks.onHtml(part.text);
				else if (part.kind === 'meta') callbacks.onMeta(part.key, part.value);
			}
		}
	});

	child.stderr.setEncoding('utf8');
	child.stderr.on('data', (chunk: string) => {
		callbacks.onStderr(chunk);
	});

	await new Promise<void>((resolve) => {
		child.on('error', (err) => {
			callbacks.onError(err.message);
			resolve();
		});

		child.on('close', () => {
			if (stdoutBuf) {
				for (const part of parse(stdoutBuf)) {
					if (part.kind === 'delta') callbacks.onDelta(part.text);
					else if (part.kind === 'html') callbacks.onHtml(part.text);
					else if (part.kind === 'meta') callbacks.onMeta(part.key, part.value);
				}
			}
			callbacks.onDone();
			resolve();
		});

		opts?.signal?.addEventListener('abort', () => {
			try { child.kill('SIGTERM'); } catch {}
			resolve();
		}, { once: true });
	});
}
