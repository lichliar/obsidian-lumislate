/**
 * Skill 技能路由系统
 * 解析用户输入，自动分发给对应的 Skill 处理
 */

export interface SkillContext {
	currentMD: string;
	currentHTML: string;
	selectedNode?: string;
}

export interface SkillResult {
	/** 生成的 HTML 片段 */
	html?: string;
	/** 需要回写到 MD 的内容 */
	markdownPatch?: string;
	/** 应用的样式变更 */
	styleChanges?: Record<string, unknown>;
}

export abstract class BaseSkill {
	abstract readonly id: string;
	abstract readonly name: string;
	abstract readonly keywords: string[];

	/**
	 * 匹配用户输入是否触发本技能
	 */
	match(input: string): boolean {
		const lower = input.toLowerCase();
		return this.keywords.some((k) => lower.includes(k));
	}

	/**
	 * 执行技能核心逻辑
	 */
	abstract execute(input: string, context: SkillContext): Promise<SkillResult>;
}

/** 智能图表生成 Skill */
class SkillDataChart extends BaseSkill {
	id = 'skill-data-chart';
	name = '智能图表生成';
	keywords = ['图表', '折线', '柱状', 'k线', 'chart', 'graph', '/chart'];

	async execute(input: string, context: SkillContext): Promise<SkillResult> {
		// TODO: 分析 Markdown 表格数据，生成 Chart.js / ECharts 图表
		// 1. 从 currentMD 中提取表格数据
		// 2. 构造 Chart.js canvas 组件（暗黑科技风）
		// 3. 返回 HTML 片段
		return {
			html: `<!-- skill-data-chart 占位 -->`,
			markdownPatch: `<!-- @skill-data-chart -->`,
		};
	}
}

/** 高定主题瞬移 Skill */
class SkillThemeSwitch extends BaseSkill {
	id = 'skill-theme-switch';
	name = '高定主题瞬移';
	keywords = ['主题', '风格', 'theme', 'space', '赛博朋克', '/theme'];

	async execute(input: string, context: SkillContext): Promise<SkillResult> {
		// TODO: 解析氛围关键词，重写 CSS 变量
		return {
			styleChanges: { theme: 'spacex-dark' },
		};
	}
}

/** 溢出智能急救 Skill */
class SkillOverflowFix extends BaseSkill {
	id = 'skill-overflow-fix';
	name = '溢出智能急救';
	keywords = ['溢出', '分页', '截断', 'overflow', 'fix'];

	async execute(input: string, context: SkillContext): Promise<SkillResult> {
		// TODO: 语义断句，自动分页或重组为紧凑网格
		return {
			html: `<!-- skill-overflow-fix 占位 -->`,
		};
	}
}

/** 交互组件注入 Skill */
class SkillComponentInjector extends BaseSkill {
	id = 'skill-component-injector';
	name = '交互组件注入';
	keywords = ['组件', '倒计时', '进度条', '看板', 'add', '/add'];

	async execute(input: string, context: SkillContext): Promise<SkillResult> {
		// TODO: 解析组件名，注入对应 Web 组件
		return {
			html: `<!-- skill-component-injector 占位 -->`,
			markdownPatch: `<!-- @skill-component-injector -->`,
		};
	}
}

export class SkillsRouter {
	private skills: BaseSkill[];

	constructor() {
		this.skills = [
			new SkillDataChart(),
			new SkillThemeSwitch(),
			new SkillOverflowFix(),
			new SkillComponentInjector(),
		];
	}

	/**
	 * 根据用户输入路由到对应 Skill
	 */
	route(input: string, _context: SkillContext): BaseSkill | null {
		for (const skill of this.skills) {
			if (skill.match(input)) {
				console.log(`[Router] 命中 Skill: ${skill.id}`);
				return skill;
			}
		}
		return null;
	}

	/**
	 * 注册自定义 Skill
	 */
	registerSkill(skill: BaseSkill): void {
		this.skills.push(skill);
	}

	/**
	 * 获取所有已注册 Skill
	 */
	listSkills(): BaseSkill[] {
		return this.skills;
	}
}
