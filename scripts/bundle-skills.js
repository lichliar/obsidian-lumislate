/**
 * Skills 打包脚本
 *
 * 将 skills/ 目录下所有 SKILL.md 文件在构建时编译为 TypeScript 常量数组，
 * 输出到 src/ai/skills_built_in.ts。该模块随 main.ts 一起被 tsup 打包进
 * 最终的 main.js 中，满足 Obsidian 插件只分发 3 个文件的要求。
 *
 * 使用方式:
 *   node scripts/bundle-skills.js
 *
 * 开发 workflow:
 *   1. 增删改 skills/ 目录下的 SKILL.md
 *   2. 运行 npm run build（会自动触发本脚本）
 *   3. tsup 将打包后的 skills 嵌入 dist/main.js
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve('skills');
const OUTPUT_FILE = path.resolve('src', 'ai', 'skills_built_in.ts');

// ─────────────────────────────────────────────
// 字符串转义：用于模板字符串
// ─────────────────────────────────────────────
function escapeForTemplateLiteral(str) {
	return str
		.replace(/\\/g, '\\\\') // 反斜杠
		.replace(/`/g, '\\`') // 反引号
		.replace(/\$\{/g, '\\${'); // ${
}

// ─────────────────────────────────────────────
// 解析单个 SKILL.md（与 skill_loader.ts 逻辑一致）
// ─────────────────────────────────────────────
function parseSkillFile(content) {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	const frontmatter = match ? match[1] : '';
	const body = match ? match[2] : content;

	function getValue(key) {
		const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
		const m = frontmatter.match(regex);
		if (!m) return '';
		return m[1].trim().replace(/^["']|["']$/g, '');
	}

	let tags;
	const tagsRaw = getValue('tags');
	if (tagsRaw) {
		try {
			tags = JSON.parse(tagsRaw.replace(/'/g, '"'));
		} catch {
			tags = tagsRaw
				.split(',')
				.map((t) => t.trim().replace(/^["'\[]|["'\]]$/g, ''))
				.filter(Boolean);
		}
	}

	const id = getValue('name') || 'unknown';
	const name = getValue('zh_name') || getValue('en_name') || id;

	return {
		id,
		name,
		icon: getValue('emoji') || 'file-text',
		description: getValue('description') || '',
		category: getValue('category') || 'general',
		body: body.trim(),
		enName: getValue('en_name') || undefined,
		scenario: getValue('scenario') || undefined,
		aspectHint: getValue('aspect_hint') || undefined,
		tags,
	};
}

// ─────────────────────────────────────────────
// 扫描 skills/ 目录，加载所有 skill
// ─────────────────────────────────────────────
function loadAllSkills() {
	const skills = [];
	if (!fs.existsSync(SKILLS_DIR)) {
		console.warn(`[bundle-skills] 目录不存在: ${SKILLS_DIR}`);
		return skills;
	}

	const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
		if (!fs.existsSync(skillPath)) {
			console.warn(`[bundle-skills] 跳过 ${entry.name}: 无 SKILL.md`);
			continue;
		}

		try {
			const content = fs.readFileSync(skillPath, 'utf-8');
			const skill = parseSkillFile(content);
			if (skill.id && skill.id !== 'unknown' && skill.body) {
				skills.push(skill);
			} else {
				console.warn(`[bundle-skills] 跳过 ${entry.name}: id 或 body 为空`);
			}
		} catch (e) {
			console.warn(`[bundle-skills] 解析失败 ${skillPath}:`, e.message);
		}
	}

	return skills;
}

// ─────────────────────────────────────────────
// 生成 TypeScript 模块内容
// ─────────────────────────────────────────────
function generateModule(skills) {
	const lines = [
		`// ⚠️ 本文件由 scripts/bundle-skills.js 自动生成，请勿手动编辑`,
		`// 如需增删改 skill，请直接修改 skills/ 目录下的 SKILL.md，然后运行 npm run build`,
		`// 生成时间: ${new Date().toISOString()}`,
		``,
		`import type { LoadedSkill } from './skill_loader';`,
		``,
		`export const BUILT_IN_SKILLS: LoadedSkill[] = [`,
	];

	for (const skill of skills) {
		lines.push(`\t{`);
		lines.push(`\t\tid: ${JSON.stringify(skill.id)},`);
		lines.push(`\t\tname: ${JSON.stringify(skill.name)},`);
		lines.push(`\t\ticon: ${JSON.stringify(skill.icon)},`);
		lines.push(`\t\tdescription: ${JSON.stringify(skill.description)},`);
		lines.push(`\t\tcategory: ${JSON.stringify(skill.category)},`);
		lines.push(`\t\tbody: \`${escapeForTemplateLiteral(skill.body)}\`,`);
		if (skill.enName) lines.push(`\t\tenName: ${JSON.stringify(skill.enName)},`);
		if (skill.scenario) lines.push(`\t\tscenario: ${JSON.stringify(skill.scenario)},`);
		if (skill.aspectHint) lines.push(`\t\taspectHint: ${JSON.stringify(skill.aspectHint)},`);
		if (skill.tags) lines.push(`\t\ttags: ${JSON.stringify(skill.tags)},`);
		lines.push(`\t},`);
	}

	lines.push(`];`);
	lines.push(``);
	lines.push(`/** 获取所有内置 skill 的数量（调试用） */`);
	lines.push(`export const BUILT_IN_SKILL_COUNT: number = ${skills.length};`);
	lines.push(``);

	return lines.join('\n');
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
function main() {
	console.log(`[bundle-skills] 扫描目录: ${SKILLS_DIR}`);

	const skills = loadAllSkills();
	if (skills.length === 0) {
		console.error('[bundle-skills] ❌ 未找到任何 skill，构建将失败');
		process.exit(1);
	}

	// 按 category + name 排序，保证输出稳定
	skills.sort((a, b) => {
		if (a.category !== b.category) return a.category.localeCompare(b.category);
		return a.name.localeCompare(b.name);
	});

	const moduleContent = generateModule(skills);
	fs.writeFileSync(OUTPUT_FILE, moduleContent, 'utf-8');

	console.log(`[bundle-skills] ✅ 已生成 ${OUTPUT_FILE}`);
	console.log(`[bundle-skills] 📦 共打包 ${skills.length} 个 skill:`);

	// 按 category 分组打印
	const byCategory = new Map();
	for (const s of skills) {
		const cat = s.category || 'general';
		if (!byCategory.has(cat)) byCategory.set(cat, []);
		byCategory.get(cat).push(s);
	}
	for (const [cat, list] of byCategory) {
		console.log(`[bundle-skills]    · ${cat}: ${list.length} 个`);
	}
}

main();
