import { Vault, TFile, Notice } from 'obsidian';
import { extractFrontmatter, extractFrontmatterValue } from '../ai/ai_service';

export interface PreprocessState {
	preprocessed: boolean;
	file: TFile | null;
	skillId: string | null;
}

/** 特殊语法检测结果 */
export interface SpecialSyntaxInfo {
	hasMermaid: boolean;
	hasLatex: boolean;
	/** 提取到的 mermaid 代码块内容（去首尾空） */
	mermaidBlocks: string[];
	/** 提取到的行间 LaTeX 公式内容（去首尾空，不含 $$） */
	latexBlocks: string[];
}

/** 检测 Markdown 正文中是否包含 Mermaid 图表和 LaTeX 数学公式 */
export function detectSpecialSyntax(body: string): SpecialSyntaxInfo {
	const result: SpecialSyntaxInfo = {
		hasMermaid: false,
		hasLatex: false,
		mermaidBlocks: [],
		latexBlocks: [],
	};

	// 1. 检测 Mermaid 代码块
	const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = mermaidRegex.exec(body)) !== null) {
		result.hasMermaid = true;
		result.mermaidBlocks.push(match[1].trim());
	}

	// 2. 检测行间 LaTeX 公式 $$...$$
	const blockLatexRegex = /\$\$([\s\S]*?)\$\$/g;
	while ((match = blockLatexRegex.exec(body)) !== null) {
		result.hasLatex = true;
		result.latexBlocks.push(match[1].trim());
	}

	// 3. 检测行内 LaTeX 公式 $...$（排除已被 $$ 匹配的部分）
	// 先将 $$...$$ 块替换为占位符，避免误匹配
	const bodyWithoutBlockLatex = body.replace(/\$\$[\s\S]*?\$\$/g, '');
	const inlineLatexRegex = /\$([^\$\n]+?)\$/g;
	while ((match = inlineLatexRegex.exec(bodyWithoutBlockLatex)) !== null) {
		result.hasLatex = true;
		break; // 只要检测到至少一个行内公式即可
	}

	return result;
}

/** 通用预处理：不改变语义，只优化 Markdown 格式 */
function commonPreprocess(body: string): string {
	let result = body;

	// 1. 清理多余空行（4+ 连续空行压缩为 2 个）
	result = result.replace(/\n{4,}/g, '\n\n');

	// 2. 规范化标题层级：确保只有一个 H1，后续连续 H1 降级为 H2
	const lines = result.split('\n');
	let h1Count = 0;
	result = lines
		.map((line) => {
			const trimmed = line.trim();
			if (/^# [^#]/.test(trimmed)) {
				h1Count++;
				if (h1Count > 1) {
					return '##' + trimmed.slice(1);
				}
			}
			return line;
		})
		.join('\n');

	// 3. 标准化列表缩进（移除列表符号前的不一致空格）
	result = result.replace(/^[ \t]+([-+*]|\d+\.) /gm, '$1 ');

	return result;
}

/** 按 mode / skill 类型对 Markdown 进行预处理 */
export function preprocessMarkdown(markdown: string, modeOrSkillId: string): string {
	const { frontmatter, body } = extractFrontmatter(markdown);

	let processedBody = commonPreprocess(body);

	// mode / skill 特定处理
	switch (modeOrSkillId) {
		case 'custom':
			// 自定义模式: 保留 --- 分页符, 不做任何删除
			// headingDivider 支持由 AI 在渲染时处理
			break;
		case 'blog-post':
		case 'saas-landing':
		default:
			// Design 模式: 通用预处理即可
			break;
	}

	// 重建 frontmatter，添加/更新预处理标记
	let newFrontmatter = frontmatter;
	if (newFrontmatter) {
		// 移除旧的预处理标记（如果存在）
		newFrontmatter = newFrontmatter
			.replace(/^lumislate_preprocessed:.*$/m, '')
			.replace(/^lumislate_preprocessed_for:.*$/m, '')
			.replace(/^lumislate_preprocessed_at:.*$/m, '')
			.replace(/\n{3,}/g, '\n');
		newFrontmatter += `\nlumislate_preprocessed: true\nlumislate_preprocessed_for: ${modeOrSkillId}\nlumislate_preprocessed_at: ${new Date().toISOString()}`;
	} else {
		newFrontmatter = `lumislate_preprocessed: true\nlumislate_preprocessed_for: ${modeOrSkillId}\nlumislate_preprocessed_at: ${new Date().toISOString()}`;
	}

	return `---\n${newFrontmatter.trim()}\n---\n\n${processedBody}`;
}

/** 根据原文件路径生成预处理文件路径 */
export function getPreprocessedFilePath(originalPath: string): string {
	return originalPath.replace(/\.md$/i, '_preprocessed.md');
}

/** 创建预处理文件（如已存在则覆盖） */
export async function createPreprocessedFile(
	vault: Vault,
	originalFile: TFile,
	modeOrSkillId: string
): Promise<TFile> {
	const content = await vault.read(originalFile);
	const finalContent = preprocessMarkdown(content, modeOrSkillId);
	const newPath = getPreprocessedFilePath(originalFile.path);

	const existing = vault.getAbstractFileByPath(newPath);
	if (existing instanceof TFile) {
		await vault.modify(existing, finalContent);
		new Notice(`已更新预处理文件: ${existing.name}`);
		return existing;
	} else {
		const newFile = await vault.create(newPath, finalContent);
		new Notice(`已创建预处理文件: ${newFile.name}`);
		return newFile;
	}
}

/** 查找已存在的预处理文件 */
export async function findPreprocessedFile(
	vault: Vault,
	originalFile: TFile
): Promise<TFile | null> {
	const path = getPreprocessedFilePath(originalFile.path);
	const file = vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

/** 兼容旧版 'marp' mode ID */
function isModeMatch(preprocessedFor: string, modeOrSkillId: string): boolean {
	if (preprocessedFor === modeOrSkillId) return true;
	if (modeOrSkillId === 'custom' && preprocessedFor === 'marp') return true;
	return false;
}

/**
 * 检查预处理状态
 * 1. 先检查当前文件自身的 frontmatter 标记
 * 2. 再检查同目录下的 {文件名}_preprocessed.md
 */
export async function checkPreprocessedState(
	vault: Vault,
	file: TFile,
	modeOrSkillId: string
): Promise<PreprocessState> {
	const content = await vault.read(file);
	const { frontmatter } = extractFrontmatter(content);

	if (frontmatter) {
		const isPreprocessed = extractFrontmatterValue(frontmatter, 'lumislate_preprocessed') === 'true';
		const preprocessedFor = extractFrontmatterValue(frontmatter, 'lumislate_preprocessed_for');
		if (isPreprocessed && isModeMatch(preprocessedFor, modeOrSkillId)) {
			return { preprocessed: true, file, skillId: modeOrSkillId };
		}
	}

	// 检查同名的预处理文件
	const preprocessedFile = await findPreprocessedFile(vault, file);
	if (preprocessedFile) {
		const pc = await vault.read(preprocessedFile);
		const { frontmatter: pf } = extractFrontmatter(pc);
		if (pf) {
			const isPreprocessed = extractFrontmatterValue(pf, 'lumislate_preprocessed') === 'true';
			const preprocessedFor = extractFrontmatterValue(pf, 'lumislate_preprocessed_for');
			if (isPreprocessed && isModeMatch(preprocessedFor, modeOrSkillId)) {
				return { preprocessed: true, file: preprocessedFile, skillId: modeOrSkillId };
			}
		}
	}

	return { preprocessed: false, file: null, skillId: null };
}
