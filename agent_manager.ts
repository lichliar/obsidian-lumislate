/**
 * Agent 管理器
 * 接收用户自然语言指令，协调 Skill 执行，并管理逆向回写
 */

import { SkillsRouter } from './skills_router';

export interface AgentContext {
	/** 当前 Markdown 源码 */
	currentMD: string;
	/** 当前渲染的 HTML */
	currentHTML: string;
	/** 当前选中的 DOM 节点路径（如有） */
	selectedNode?: string;
}

export interface AgentResult {
	success: boolean;
	/** 生成的 HTML 片段 */
	html?: string;
	/** 回写到 Markdown 的内容 */
	markdownPatch?: string;
	/** 激活的 Skill ID */
	activatedSkill?: string;
	/** 错误信息 */
	error?: string;
}

export class AgentManager {
	private router: SkillsRouter;

	constructor() {
		this.router = new SkillsRouter();
	}

	/**
	 * 执行用户指令
	 * @param userInput 用户输入的自然语言或短指令
	 * @param context 当前上下文（MD/HTML/DOM）
	 */
	async executeCommand(userInput: string, context: AgentContext): Promise<AgentResult> {
		console.log(`[Agent] 接收指令: ${userInput}`);

		// 1. 路由到对应 Skill
		const skill = this.router.route(userInput, context);

		if (!skill) {
			return {
				success: false,
				error: `未找到匹配的技能: ${userInput}`,
			};
		}

		// 2. 执行 Skill
		try {
			const result = await skill.execute(userInput, context);
			return {
				success: true,
				html: result.html,
				markdownPatch: result.markdownPatch,
				activatedSkill: skill.id,
			};
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			return { success: false, error, activatedSkill: skill.id };
		}
	}

	/**
	 * 逆向回写：将 HTML 变更同步回 Markdown 源码
	 */
	reverseMapHTMLToMarkdown(
		originalMD: string,
		htmlFragment: string,
		targetNode?: string
	): string {
		// TODO: 实现 HTML -> Markdown 的语义级逆向映射
		// 策略：将复杂 HTML 组件转化为 Custom Component 语法或短代码
		return originalMD;
	}
}
