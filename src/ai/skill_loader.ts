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

/** 尝试使用 Node.js fs 读取 skills（桌面端 Electron 环境可用） */
function tryLoadSkillsWithNodeFs(skillsDir: string): LoadedSkill[] | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require('fs') as typeof import('fs');
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const path = require('path') as typeof import('path');

		const skills: LoadedSkill[] = [];
		const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
			try {
				const content = fs.readFileSync(skillPath, 'utf-8');
				const skill = parseSkillFile(content);
				if (skill.id && skill.body) {
					skills.push(skill);
				}
			} catch (e) {
				console.warn(`[LumiSlate] Failed to load skill from ${skillPath}:`, e);
			}
		}
		return skills;
	} catch {
		return null;
	}
}

/** 使用 vault.adapter 读取 skills */
async function tryLoadSkillsWithVaultAdapter(
	vault: Vault,
	skillsDir: string
): Promise<LoadedSkill[]> {
	const skills: LoadedSkill[] = [];
	try {
		const entries = await vault.adapter.list(skillsDir);

		for (const folder of entries.folders) {
			// 防御：folder 可能是完整路径，只取最后一截
			const folderName = folder.includes('/') ? folder.split('/').pop()! : folder;
			const skillPath = `${skillsDir}/${folderName}/SKILL.md`;
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

/** 扫描目录加载所有 skill */
export async function loadSkillsFromDisk(
	vault: Vault,
	skillsDir: string
): Promise<LoadedSkill[]> {
	// 优先使用 Node fs（桌面端更可靠），失败时回退到 vault.adapter
	const nodeSkills = tryLoadSkillsWithNodeFs(skillsDir);
	if (nodeSkills && nodeSkills.length > 0) {
		console.log(`[LumiSlate] 通过 Node fs 加载了 ${nodeSkills.length} 个 skill`);
		return nodeSkills;
	}
	return tryLoadSkillsWithVaultAdapter(vault, skillsDir);
}
