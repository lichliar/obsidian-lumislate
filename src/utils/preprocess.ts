import { Vault, TFile, Notice } from 'obsidian';
import { extractFrontmatter, extractFrontmatterValue } from '../ai/ai_service';

export interface PreprocessState {
	preprocessed: boolean;
	file: TFile | null;
	skillId: string | null;
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
		case 'marp':
			// Marp 模式: 保留 --- 分页符, 不做任何删除
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
		if (isPreprocessed && preprocessedFor === modeOrSkillId) {
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
			if (isPreprocessed && preprocessedFor === modeOrSkillId) {
				return { preprocessed: true, file: preprocessedFile, skillId: modeOrSkillId };
			}
		}
	}

	return { preprocessed: false, file: null, skillId: null };
}
