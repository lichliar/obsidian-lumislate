import { Vault } from 'obsidian';
import { extractFrontmatter, extractFrontmatterValue } from './ai_service';

/** 从磁盘加载的 skill 结构 */
export interface LoadedSkill {
	id: string;
	name: string;
	icon: string;
	description: string;
	category: string;
	body: string;
	enName?: string;
	scenario?: string;
	aspectHint?: string;
	tags?: string[];
}

/** 解析单个 SKILL.md 文件内容 */
export function parseSkillFile(content: string): LoadedSkill {
	const { frontmatter, body } = extractFrontmatter(content);

	// 解析 tags（处理 ["a", "b"] 或 ['a', 'b'] 格式）
	let tags: string[] | undefined;
	const tagsRaw = extractFrontmatterValue(frontmatter, 'tags');
	if (tagsRaw) {
		try {
			tags = JSON.parse(tagsRaw.replace(/'/g, '"'));
		} catch {
			// 回退：按逗号分隔
			tags = tagsRaw
				.split(',')
				.map((t) => t.trim().replace(/^["'\[]|["'\]]$/g, ''))
				.filter(Boolean);
		}
	}

	const id = extractFrontmatterValue(frontmatter, 'name') || 'unknown';
	const name =
		extractFrontmatterValue(frontmatter, 'zh_name') ||
		extractFrontmatterValue(frontmatter, 'en_name') ||
		id;

	return {
		id,
		name,
		icon: extractFrontmatterValue(frontmatter, 'emoji') || 'file-text',
		description: extractFrontmatterValue(frontmatter, 'description') || '',
		category: extractFrontmatterValue(frontmatter, 'category') || 'general',
		body: body.trim(),
		enName: extractFrontmatterValue(frontmatter, 'en_name') || undefined,
		scenario: extractFrontmatterValue(frontmatter, 'scenario') || undefined,
		aspectHint: extractFrontmatterValue(frontmatter, 'aspect_hint') || undefined,
		tags,
	};
}

/** 扫描目录加载所有 skill */
export async function loadSkillsFromDisk(
	vault: Vault,
	skillsDir: string
): Promise<LoadedSkill[]> {
	const skills: LoadedSkill[] = [];

	try {
		const entries = await vault.adapter.list(skillsDir);

		for (const folder of entries.folders) {
			const skillPath = `${skillsDir}/${folder}/SKILL.md`;
			try {
				const content = await vault.adapter.read(skillPath);
				const skill = parseSkillFile(content);
				if (skill.id && skill.body) {
					skills.push(skill);
				}
			} catch (e) {
				console.warn(`[LumiSlate] Failed to load skill from ${skillPath}:`, e);
			}
		}
	} catch (e) {
		console.warn(`[LumiSlate] Failed to list skills directory ${skillsDir}:`, e);
	}

	return skills;
}
