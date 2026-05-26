/**
 * SKILL 注册表
 * 从 html-anything 移植的模板系统
 * 每个 SKILL 包含：id、名称、emoji、描述、分类、prompt body
 */

/** 工作模式 */
export type Mode = 'marp' | 'design';

/** 各模式在 UI 中的显示信息 */
export interface ModeInfo {
	id: Mode;
	name: string;
	emoji: string;
}

export const MODES: ModeInfo[] = [
	{ id: 'marp', name: 'Marp 幻灯片', emoji: '📊' },
	{ id: 'design', name: 'Design 设计', emoji: '🎨' },
];

export interface Skill {
	id: string;
	name: string;
	emoji: string;
	description: string;
	category: string;
	body: string;
}

/** 共享设计指令 — 每次调用都前置 */
export const SHARED_DESIGN_DIRECTIVES = `
你是世界级的视觉设计师 + 资深前端工程师。请输出一份**自包含的单文件 HTML**，要求：

【内容驱动数量 — 最高优先级, 覆盖模板里的任何数字】
- 模板只定义"可用版面 / 风格 / 配色 / 字体 / 组件库", **不定义** slide / 帧 / 卡片 / section 的数量。
- 输出的 slide / frame / card / section 数量**完全由【用户内容】的实际长度和信息结构决定**。必须**完整覆盖**用户内容的每一个要点、章节、数据组, **不许总结、压缩、丢弃信息**。
- 如果模板正文里写了类似"挑 6-10 张组成 deck / 输出 6-10 帧 / 3-6 张卡片"的数字, **一律视为短示例下的参考下限, 不是上限**。短内容可以低于该范围, 长内容应远超该范围。
- 推荐做法: 先把【用户内容】按语义切成若干段 (章节标题 / 论点 / 数据组 / 列表项 / 步骤), 每一段 → 至少一个独立的 slide / section / card, 然后再从模板的版式池里给每一段挑最合适的版面。宁可多页也不要把多个独立要点硬塞进一页。

【硬性技术要求】
- **禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具**。不要把 HTML 写到任何 \`.html\` 文件里。
- 直接把完整的 HTML 文档作为助手回复的正文流式输出。不要先说"我来生成"、"已输出至 …"之类的话。
- 文档以 \`<!DOCTYPE html>\` 开头, 末尾以 \`</html>\` 结束。
- 在 \`<head>\` 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 不要引用任何外部图片 URL（除非你能保证 URL 长期有效；优先使用 CSS / SVG 内联绘制）。
- 必要的脚本（图表、动画）通过 jsdelivr CDN 引入；保持单文件可双击打开即用。
- 输出**纯 HTML**, 不要用 markdown 代码围栏包裹, 不要任何解释性文字。第一个字符必须是 \`<\`。

【设计准则 — 世界级标准】
- 排版: 中文优先 \`Noto Sans SC\` / \`Noto Serif SC\`, 英文 \`Inter\` / \`Manrope\` / \`SF Pro\` 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白 (#000/#fff), 改用 \`#0a0a0a\` / \`#fafafa\`。
- 网格: 8 px 基线; 段落最大宽度 65 ch; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg), 边框 1px \`#e5e7eb\` / \`#262626\`。
- 动效: 仅在必要处使用 \`transition-all\` 或入场 fade-in; 不要喧宾夺主。
- 无障碍: 颜色对比度 ≥ 4.5; 重要交互有 focus 态。

【内容真实性】
- **必须使用用户提供的真实数据**, 不要编造、不要 lorem ipsum、不要 "Your text here"。
- 如果用户数据是结构化数据 (CSV/JSON), 请提取关键洞察并以图表/表格呈现。
- 中文与英文混排时, 中英文之间留半角空格 (盘古之白)。
`;

/** Marp 模式专用的 prompt body */
export const MARP_BODY = `【模板: Marp 幻灯片 / Presentation Deck】
【意图】将 Markdown 内容转换为横向幻灯片, 每页一个 <section>, 支持键盘/触摸翻页。
【核心规则 — 必须严格遵守】
1. 分页: Markdown 中的 \`---\` (单独一行的水平分割线) 是**幻灯片分页符**。按 \`---\` 将内容切分为若干页, 每一页生成一个 <section class="slide">。
2. YAML 指令解析: 用户的 frontmatter 中可能包含 Marp 指令, 你必须识别并应用:
   - theme: 主题名称 (你根据名称选择合适的配色方案)
   - paginate: true/false — 是否在右下角显示页码
   - size: 16:9 (默认) 或 4:3 — 决定幻灯片宽高比
   - class: 全局 CSS 类名, 加到每个 <section> 上
   - backgroundColor / backgroundImage / backgroundSize / backgroundPosition / backgroundRepeat: 全局背景设置
   - color: 全局文字颜色
   - header / footer: 全局页眉页脚文本
   - headingDivider: 如设为 2, 表示每个 ## 标题自动开启新幻灯片
   - style: 额外原始 CSS, 直接注入 <style>
   局部指令(以 _ 前缀, 如 _backgroundColor: red): 只作用于**紧跟其后的那一页**。
3. 幻灯片尺寸: 默认 16:9 (width: 1280px, height: 720px)。幻灯片容器使用固定比例, 在浏览器中居中显示, 保持比例缩放。
4. 内容映射: 不要把多页内容塞进一页。每一页只放对应 \`---\` 区间内的内容。如果某页内容太长, 可以适当缩小字号或调整布局, 但不要拆分到其他页。
5. 排版: 每页标题用 <h1> 或 <h2>, 正文用 <p> / <ul> / <ol> / <table> / <blockquote>。列表项要清晰, 不要拥挤。
6. 设计细节:
   - 默认使用深色渐变背景 (#0f172a → #1e1b4b), 文字白色/浅灰, 营造专业演示氛围
   - 支持 theme 指令切换配色: default(深蓝), gaia(白底黑字), uncover(黑底白字)
   - 代码块使用深色背景 + 语法高亮风格
   - 表格使用半透明卡片风格
   - 引用块使用左侧色条
7. 交互: 在 <script> 中实现键盘翻页 (左右箭头、空格、PgUp/PgDown) 和点击翻页。显示当前页码 / 总页数。首屏显示 "按 → 或空格翻页" 提示, 2 秒后淡出。
8. 输出结构:
   <div id="marp-deck">
     <section class="slide" ...>第1页内容</section>
     <section class="slide" ...>第2页内容</section>
     ...
   </div>
   加上翻页控制 UI 和键盘事件脚本。`;

/** 解析 Marp YAML 指令，返回可用于 prompt 的指令摘要 */
export function parseMarpDirectives(frontmatter: string): string {
	const lines = frontmatter.split('\n');
	const directives: string[] = [];
	for (const line of lines) {
		const m = line.match(/^([a-zA-Z_]\w*):\s*(.+)$/);
		if (m) {
			const key = m[1];
			const val = m[2].trim();
			if (
				[
					'theme',
					'paginate',
					'class',
					'backgroundColor',
					'backgroundImage',
					'backgroundSize',
					'backgroundPosition',
					'backgroundRepeat',
					'color',
					'header',
					'footer',
					'size',
					'headingDivider',
					'math',
					'lang',
					'style',
				].includes(key)
			) {
				directives.push(`${key}: ${val}`);
			}
		}
	}
	return directives.length > 0 ? directives.join('\n') : '(无额外指令)';
}

/** Design 模式可用的 SKILL 列表（不含 Marp） */
export const SKILLS: Skill[] = [
	{
		id: 'blog-post',
		name: '博客长文',
		emoji: '📰',
		description: '杂志感长文, 含 masthead、hero、figures、pull quote、作者署名',
		category: 'article',
		body: `【模板: 博客长文 / Blog Post】
【意图】≥ 600 字的真正的长文章, 排版以 typography 为主, 70% 文字 20% 图 10% chrome。
【布局】
- Masthead (publication name + date)
- Hero (大标题 + 副标 + 作者署名 + 阅读时间)
- 正文 (单栏 65ch, 含 figures, pull quotes, 行内引用)
- Author bio 卡片
- Related posts (3 张卡)
【设计细节】
- Pull quote 用大号 serif 斜体 + 左侧色条
- Figures 自带 caption (italic, smaller)
- 代码块: 圆角 + 深色 + 语言标签`,
	},
	{
		id: 'saas-landing',
		name: 'SaaS Landing',
		emoji: '🚀',
		description: '单页 SaaS 落地页, 含 hero/features/social-proof/pricing/CTA',
		category: 'prototype',
		body: `【模板: SaaS Landing】
【意图】完整的 SaaS 产品落地页, 把用户内容映射到标准 sections。
【布局】
- Top nav (logo + 导航 + sign-in + 主 CTA)
- Hero (大标题 + 副标 + 双 CTA + 可视化占位)
- Logo wall (社会认证)
- Features (3-6 个特性卡, icon + 标题 + 描述)
- How it works (3 步流程, 数字 + 标题 + 描述)
- Pricing (2-3 档, 推荐档高亮)
- FAQ (details/summary 手风琴)
- Footer
【设计细节】
- 现代 SaaS 风: 大字号, 柔和渐变, glassmorphism 卡片, 滚动入场动画
- 至少处理 md: 断点, 移动端单栏`,
	},
];

/** 按 ID 查找 Mode */
export function getModeById(id: string): ModeInfo | undefined {
	return MODES.find((m) => m.id === id);
}

/** 按 ID 查找 SKILL */
export function getSkillById(id: string): Skill | undefined {
	return SKILLS.find((s) => s.id === id);
}

/** 组装完整 prompt = 共享指令 + body + (可选前缀) + 用户内容 */
export function assemblePrompt(body: string, content: string, extraPrefix?: string): string {
	const parts = [SHARED_DESIGN_DIRECTIVES.trim()];
	if (extraPrefix) parts.push(extraPrefix);
	parts.push(body.trim());
	parts.push('【输入格式】: markdown');
	parts.push('【用户内容】:');
	parts.push(content);
	return parts.join('\n\n') + '\n';
}
