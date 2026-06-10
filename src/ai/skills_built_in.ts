// ⚠️ 本文件由 scripts/bundle-skills.js 自动生成，请勿手动编辑
// 如需增删改 skill，请直接修改 skills/ 目录下的 SKILL.md，然后运行 npm run build
// 生成时间: 2026-06-10T06:30:05.756Z

import type { LoadedSkill } from './skill_loader';

export const BUILT_IN_SKILLS: LoadedSkill[] = [
	{
		id: "blog-post",
		name: "博客长文",
		icon: "📰",
		description: "杂志感长文, 含 masthead、hero、figures、pull quote、作者署名",
		category: "article",
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
		enName: "Blog Post",
		scenario: "marketing",
		aspectHint: "长页面",
		tags: ["blog","essay","case study","长文"],
	},
	{
		id: "digital-eguide",
		name: "电子指南",
		icon: "📚",
		description: "两页跨页电子指南, 封面 + 课程页 + pull-quote + 步骤列表",
		category: "article",
		body: `【模板: 电子指南双页预览】
【意图】creator brand 的 lead-magnet 风格, 一封面一内页跨页排列。
【布局】
- Page 1 封面: display title + 作者 + 'What's inside' 数据 + TOC teaser
- Page 2 内页: lesson body + pull-quote + step list
【设计细节】
- lifestyle / creator brand 调子, 柔和米色
- 两页 side-by-side 横向, 像翻开的书`,
		enName: "Digital E-Guide",
		scenario: "marketing",
		aspectHint: "双页预览",
		tags: ["eguide","lookbook","lead magnet","playbook"],
	},
	{
		id: "article-magazine",
		name: "杂志文章",
		icon: "📖",
		description: "Substack / Medium 高级感长文排版, 适合公众号、博客发布",
		category: "article",
		body: `【模板: 杂志文章】
- 顶部 hero: 大标题 (text-5xl/6xl) + 可选副标题 + 作者 / 阅读时间 / 日期元数据。
- 正文: 单栏, 最大宽度约 700px, 居中。段落 \`text-lg leading-relaxed text-neutral-700 dark:text-neutral-300\`。
- H2 / H3 标题用 serif 字体, 让正文与标题有视觉对比。
- 引用块使用左侧粗 accent 色边线 + 斜体。
- 代码块: 圆角 + 深色背景 + 浅色文字, 显示语言标签。
- 列表项使用自定义 bullet（小方块 / accent 圆点）。
- 章节之间用 \`<hr>\` 分隔, 但样式做成中央居中的小 ornament。
- 文末加一个简单的 "如果觉得有用，欢迎转发" 行动卡片。`,
		enName: "Magazine Article",
		scenario: "marketing",
		aspectHint: "A4 / 长页面",
		tags: ["blog","essay","newsletter","公众号","博客","文章"],
	},
	{
		id: "social-carousel",
		name: "社交媒体三联",
		icon: "🎠",
		description: "三张方形卡片轮播, 标题串联, 品牌 mark + 编号",
		category: "card",
		body: `【模板: 三联社交轮播 / Social Carousel】
【意图】3 张 1080×1080 方形卡片, headline 跨张串联。
【布局】
- Card 1: display headline (开头) + 品牌 mark + 1/3
- Card 2: display headline (中段) + 视觉重点 + 2/3
- Card 3: display headline (结尾) + CTA + loop icon + 3/3
【设计细节】
- 颜色统一一套调色板, 卡片之间渐进切换
- 三个 headline 拼起来是完整一句话`,
		enName: "Social Carousel",
		scenario: "marketing",
		aspectHint: "1080×1080 ×3",
		tags: ["instagram","linkedin","thread","carousel","三联"],
	},
	{
		id: "card-xiaohongshu",
		name: "小红书图文卡片",
		icon: "📱",
		description: "小红书风格知识卡片, 多张联排可滑动浏览",
		category: "card",
		body: `【模板: 小红书图文卡片】
- 输出 N 张连续卡片, 每张 \`w-[1080px] h-[1440px]\`, 用 flex 纵向排列方便整体截图也方便单张截图。N 由【用户内容】信息量决定: 短内容 3-6 张起步, 长内容应更多 (小红书平台单帖最多 18 图, 通常 9 张以内最佳); 一张卡只承载一个核心观点。
- 第一张是封面: 巨大的标题 + 1 行副标题 + 一个吸引人的标签 (类似 "干货预警" / "建议收藏")。
- 中间几张展开正文, 每张一个核心观点, 配 emoji + 短句 + 1-2 个例子。
- 最后一张是总结 + 行动号召 (关注 / 收藏 / 评论)。
- 配色: 选择柔和的莫兰迪色或粉色系; 元素圆润, 大量留白。
- 字号大、行距宽、对比强（小红书在手机上看, 小字根本看不清）。
- 每张卡片右下角小水印 (作者名 / 日期)。`,
		enName: "Xiaohongshu Card",
		scenario: "marketing",
		aspectHint: "1080×1440 (3:4)",
		tags: ["xhs","小红书","carousel","图文"],
	},
	{
		id: "frame-macos-notification",
		name: "macOS 通知横幅",
		icon: "🔔",
		description: "拟真 macOS 通知 banner + app icon + 标题正文, 适合 video overlay / 产品发布预告",
		category: "card",
		body: `【模板: macOS 通知横幅】
【意图】把一段公告 / 消息 / 提示渲染成 macOS Big Sur+ 风格的通知横幅, 适合视频角落叠加、产品发布预告、社媒图。Inspired by hyperframes macos-notification。

【画布】两种用法:
- 视频叠加 1920×1080, 通知放右上角, 周围透明。
- 单独 banner 480×120, 居中输出。

【横幅结构】
- 外框: 圆角 14px (macOS Big Sur 标准), 480×120 (或更长 480×180 含正文), 12-16px 内边距。
- 背景: **frosted glass** 效果 — \`background: rgba(245,245,247,0.78)\` + \`backdrop-filter: blur(40px) saturate(180%)\`; 暗色版 \`rgba(28,28,30,0.78)\`。
- 边框: 1px \`rgba(0,0,0,0.06)\` (light) / \`rgba(255,255,255,0.08)\` (dark); 顶部加 1px 亮 highlight \`rgba(255,255,255,0.5)\`。
- 阴影: \`0 10px 40px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)\`。

【内容】
- 左侧: **App icon** (44×44, 圆角 10px, CSS gradient + 1 个 emoji 或 monogram 字母, **不用外链图片**)。
- 中间:
  - 顶部 row: App 名 (SF Pro 13px, weight 600) + \`now\` 或具体时间 (12px, opacity 0.6) — 两端对齐。
  - 标题 (15px, weight 600, 1 行截断)。
  - 正文 (13px, weight 400, 1-2 行截断, line-height 1.35)。
- 右侧 (可选): action button "Open" 或 "Reply" (capsule, 浅灰底)。

【字体】
- 主: \`SF Pro Text\` → fallback \`Inter\` / \`system-ui\`; 中文用 \`PingFang SC\` / \`Noto Sans SC\`。

【可选附加】
- 多条通知堆叠: 第一条在前, 后面 2 条向后向下递缩 (scale 0.96 + opacity 0.6 + translateY)。
- 入场动效: 从屏幕外右侧滑入 \`transform: translateX(110%)→0\`, 200ms ease-out; 可被 \`prefers-reduced-motion\` 关闭。
- 右上角控制 chip "Clear" (hover 显示, opacity 默认 0)。

【设计细节】
- light mode 背景白磨砂, dark mode (推荐 video) 几乎黑磨砂。
- icon 不能用外链 emoji 图片, 用 unicode emoji 或 CSS 绘制几何。
- 必须用用户提供的内容; 标题 + 正文清晰来自用户输入。
- 单文件 HTML, 注意 \`backdrop-filter\` Safari 需要 \`-webkit-\` 前缀。`,
		enName: "macOS Notification Banner",
		scenario: "video",
		aspectHint: "1920×1080 视频或 480×120 横幅",
		tags: ["macos","notification","banner","overlay","frame"],
	},
	{
		id: "social-reddit-card",
		name: "Reddit 帖子卡",
		icon: "🔺",
		description: "拟真 Reddit 帖子卡 + 上下投票 + 评论数, 适合视频叠加 / 故事分享",
		category: "card",
		body: `【模板: Reddit 帖子卡】
【意图】把一段故事 / 提问 / 段子, 渲染成 Reddit 帖子卡片, 用于视频叠加、社媒故事分享。Inspired by hyperframes reddit-post。

【画布】1280×720 (视频叠加) 或 800×600 (单卡分享); 背景透明或暗色 \`#0b1416\`。

【卡片结构】
- 外框: 圆角 16px, bg 白 \`#ffffff\` (light) 或 \`#1a1a1b\` (dark, 推荐 video overlay), border 1px \`#edeff1\` / \`#343536\`。
- 左侧 **vote rail** (40-56px 宽):
  - 上箭头 ▲ (16px, \`#878a8c\`, hover 变橙 \`#ff4500\`)。
  - 票数 (Inter, 17px, weight 700, 居中, 颜色: 0 灰 / 正橙 / 负蓝); 大数字用 \`12.3k\` 格式。
  - 下箭头 ▼ (hover 变蓝 \`#7193ff\`)。
- 主体区:
  - 顶部 meta row: 子版块图标 (CSS 圆形 + 字母) + \`r/subreddit\` (粗) + \`· Posted by u/username · 3h\` (小字灰)。
  - **标题** (Inter / IBM Plex Sans, 22-28px, weight 500, dark text)。
  - 内容: 16px body 或 引用块或 1 张图 (CSS 渐变占位)。
  - 底部 action row: 💬 \`1.2k Comments\` · 🏆 Awards · ⤴️ Share · ⋯ icon。
- 顶部右上角 Reddit Snoo logo (内联 SVG, 橙色 \`#ff4500\`)。

【字体】
- 主: \`IBM Plex Sans\` → fallback \`Inter\`, weight 400/500/700。
- 数字: 同主字体。
- 中文: \`Noto Sans SC\`。

【设计细节】
- Light mode: bg \`#fff\`, text \`#1c1c1c\`, secondary \`#7c7c7c\`。
- Dark mode (推荐): bg \`#1a1a1b\`, text \`#d7dadc\`, secondary \`#818384\`, border \`#343536\`。
- 票数颜色: 正 = \`#ff4500\`, 负 = \`#7193ff\`, 0 = \`#878a8c\`。
- 标题点击区可加微妙背景 hover。
- 严禁外链图片; 图片占位用 CSS 渐变 + 描述。
- 必须用用户提供的内容; 自动生成合理的 subreddit / username / 票数。
- 单文件 HTML; icon 内联 SVG (上下箭头、评论气泡、奖杯)。`,
		enName: "Reddit Post Card",
		scenario: "marketing",
		aspectHint: "1280×720 或 800×600",
		tags: ["reddit","social","card","overlay","story"],
	},
	{
		id: "social-spotify-card",
		name: "Spotify 正在播放卡",
		icon: "🎵",
		description: "Spotify Now Playing 风格卡: 专辑封面 + 进度条 + 播放控制, 适配视频叠加 / 个人主页",
		category: "card",
		body: `【模板: Spotify Now-Playing 卡】
【意图】把一首歌、一段播客、或一段个人介绍渲染成 Spotify 正在播放卡, 适合 video overlay / 个人 about page / 创作者 hero。Inspired by hyperframes spotify-card。

【画布】两个尺寸:
- 横版视频叠加: 1280×720, 卡片居中或左下角浮动。
- 紧凑横条 widget: 600×200, 可嵌入到任何 hero。

【卡片结构】
- 外框: 圆角 12-16px; bg 用专辑封面色提取的暗渐变 (e.g. \`linear-gradient(135deg, #1e3264 0%, #0d1f3d 100%)\`) 或 Spotify 经典 \`#121212\`; 边缘有 1px subtle border。
- 左侧: **专辑封面** (CSS 渐变 + 大字 monogram 或抽象几何描绘, 不能外链图片), 圆角 6px, 60-200px 方形。
- 右侧:
  - 顶部 \`NOW PLAYING\` (uppercase letterspace 0.14em, 11px, 绿色 \`#1DB954\`)。
  - **歌名 / 标题** (Inter / Spotify Circular, 22-28px, weight 700, 白色)。
  - **艺人 / 副标** (16px, weight 400, opacity 0.7)。
  - 进度条: 4px 高, 圆角, 灰色背景 + 白色 fill (\`width: 38%\`); 两端时间戳 \`1:24 / 3:42\` (mono, 11px, 灰)。
  - 控制行: ⏮ ⏯ ⏭ icon (inline SVG, 24px, 白色 fill), shuffle / repeat icon 较小。
- 右上角: Spotify logo (内联 SVG, 绿色 \`#1DB954\` 圆 + 三道白色波纹)。
- 可选: 右下角小型音波动效 (3 个 bar \`@keyframes\`)。

【字体】
- 主: \`Spotify Circular\` → fallback \`Inter\` / \`Inter Tight\`, weight 400 / 700。
- 数字: 同主字体, 不用 mono 太多。

【设计细节】
- Spotify 经典 dark mode: \`#121212\` bg, \`#1DB954\` accent, \`#b3b3b3\` secondary text。
- 若用户输入是文本/标题 → 把 "标题" 当歌名, "副标/作者" 当艺人, 估算"时长" 3:42 默认。
- 若用户输入是音乐相关 → 直接对应。
- 严禁外链图片; 封面用 CSS 渐变 + 文字 logo / 几何描绘。
- 微动效: 音波动效用 \`@keyframes\`, 可被 \`prefers-reduced-motion\` 关闭。
- 单文件 HTML。`,
		enName: "Spotify Now-Playing Card",
		scenario: "personal",
		aspectHint: "1280×720 或 600×200",
		tags: ["spotify","music","now-playing","card","overlay"],
	},
	{
		id: "card-twitter",
		name: "Twitter 分享卡",
		icon: "🐦",
		description: "推特金句 / 数据卡, 适合配推文",
		category: "card",
		body: `【模板: Twitter 分享卡】
- 容器 \`w-[1600px] h-[900px]\`, 暗色 / 亮色二选一根据内容情绪。
- 中央一句 hero 金句 (text-6xl, font-semibold, 限 2-3 行)。
- 下方作者署名 + 头像占位 + handle。
- 左上角小标签 (类型: "Insight" / "Data" / "Quote")。
- 右下角品牌水印。
- 整张卡片有微妙的纹理 (grid 网格 / noise / dot pattern)。
- 截图后可直接配推文发出, 视觉简洁有力。`,
		enName: "Twitter Share Card",
		scenario: "marketing",
		aspectHint: "1600×900 (16:9)",
		tags: ["twitter","x","quote","金句"],
	},
	{
		id: "social-x-post-card",
		name: "X (Twitter) 帖子卡",
		icon: "𝕏",
		description: "拟真 X 推文卡片 + 互动数据 (likes/reposts/views), 适配视频叠加或图卡分享",
		category: "card",
		body: `【模板: X (Twitter) 帖子卡】
【意图】把一段推文内容 (或用户的金句) 渲染成一张拟真度极高的 X 帖子卡片, 用于视频叠加、推特发图、知识沉淀。Inspired by hyperframes x-post。

【画布】1280×720 或 1080×1080, 暗背景 \`#0f1419\` 或亮背景 \`#ffffff\` (按 X 主题); 卡片居中, 阴影柔和。

【卡片结构】
- 外框: 圆角 16px, 1px border \`#2f3336\` (dark) / \`#eff3f4\` (light), 内边距 16px。
- 顶部 row: 头像 (48×48 圆形, 用 CSS gradient 占位) + 用户名 + handle \`@username\` + verified 蓝勾 + 时间 (mono, 12px, 灰)。
- 正文: 17-22px, 字重 400; 链接用 X 蓝 \`#1d9bf0\`; hashtag 同色; mention 同色; 段落间空 0.6em。
- 可选: 引用卡 (小卡内嵌, 灰底, 圆角 12px)。
- 可选: 1 张图 (CSS 渐变 + 描述占位, 不能外链图片), 比例 16:9, 圆角 12px。
- 互动 row: 4 个 icon + 数字 (回复 / 转推 / 引用 / 点赞), icon 用 inline SVG (X 官方风格), 灰色, hover 时变色。
- 顶部右上 X logo 单线 SVG。
- 浏览量 row: 👁️ + 数字 (小字)。

【字体】
- 西文: \`Chirp\` (X 的字体) → fallback \`Inter\` 或 \`Segoe UI\`。
- 中文: \`Noto Sans SC\` / \`PingFang SC\`。
- 数字: 同主字体, 不用 mono。

【设计细节】
- 配色 light: bg \`#fff\`, text \`#0f1419\`, secondary \`#536471\`, border \`#eff3f4\`, accent \`#1d9bf0\`。
- 配色 dark (推荐, 视频叠加用): bg \`#000\`, text \`#e7e9ea\`, secondary \`#71767b\`, border \`#2f3336\`, accent \`#1d9bf0\`。
- 数字格式化: 1.2K / 4.5M (不要原始 1234)。
- 内容必须来自用户输入, 不能编造推文。
- 若用户输入是数据 → 自动总结成一句"金句"推文 (≤ 280 字符)。
- 单文件 HTML; icon 内联 SVG; 不要任何外部图片 URL。
- 可选: 卡片背后加微妙径向高光 \`radial-gradient(...)\` 增加视频叠加的可读性。`,
		enName: "X / Twitter Post Card",
		scenario: "marketing",
		aspectHint: "1280×720 或 1080×1080",
		tags: ["twitter","x","social","card","overlay"],
	},
	{
		id: "dashboard",
		name: "管理后台仪表板",
		icon: "🎛️",
		description: "固定侧栏 + 顶栏 + KPI 网格 + 1-2 张图",
		category: "dashboard",
		body: `【模板: 管理后台 Dashboard】
【意图】标准 admin/analytics 仪表板单页。
【布局】
- Fixed left sidebar (logo + 导航 + 用户 footer)
- Top bar (search + 通知 + avatar)
- Main: KPI cards 网格 (3-5 个)
- 1-2 张主图表 (折线 / 柱 / 区域)
- 底部 recent activity 列表`,
		enName: "Admin Dashboard",
		scenario: "operations",
		aspectHint: "桌面 1440",
		tags: ["dashboard","admin","analytics"],
	},
	{
		id: "kanban-board",
		name: "看板 / Kanban",
		icon: "📌",
		description: "To do / In progress / In review / Done 四列, 卡片 + 头像 + 泳道",
		category: "dashboard",
		body: `【模板: Kanban 看板】
【意图】类 Trello 的 Kanban 单页。
【布局】
- 顶部 filter bar (assignee / label / search)
- 4 列: To do / In progress / In review / Done
- 卡片含: 标题 / labels / due / avatar / 评论数
- 可选 swimlanes (按 epic / assignee 分组)
【设计细节】
- 不需要真 drag, 但视觉上要像可拖`,
		enName: "Kanban Board",
		scenario: "operations",
		aspectHint: "桌面 1440",
		tags: ["kanban","trello","sprint","看板"],
	},
	{
		id: "social-media-dashboard",
		name: "社媒创作者仪表板",
		icon: "📡",
		description: "平台切换 + 粉丝/互动 KPI + 增长曲线 + Top post + 热门话题",
		category: "dashboard",
		body: `【模板: 社媒创作者仪表板】
【意图】面向博主 / 创作者的社媒数据看板。
【布局】
- 顶部平台 switcher (X / LinkedIn / YouTube / Instagram / TikTok)
- KPI 卡片 (followers / engagement / likes / reposts)
- Follower-growth chart
- Top post this week 预览
- Side: trending topics / top comments`,
		enName: "Social Media Dashboard",
		scenario: "creator",
		aspectHint: "桌面 1440",
		tags: ["social","creator","analytics","x","linkedin","tiktok"],
	},
	{
		id: "social-media-matrix",
		name: "社媒矩阵追踪面板",
		icon: "🛰️",
		description: "电影感多平台社媒分析: 互动图、悬浮洞察、区间对比、明暗主题",
		category: "dashboard",
		body: `【模板: 社媒矩阵追踪 (Social Matrix Tracker)】
【意图】电影感、数据密集的多平台社媒看板。
【布局】
- Hero header (统一品牌 + 时间窗 + 主题切换)
- Multi-platform KPI matrix (横 platform × 纵 metric)
- 交互式 charts (hover tooltip + range compare)
- Insights drawer (右抽屉, 文字洞察)
- Top posts grid
【设计细节】
- dark / light 切换; 数据用 seed 兜底`,
		enName: "Social Media Matrix Tracker",
		scenario: "creator",
		aspectHint: "桌面长页",
		tags: ["matrix","tracker","multi-platform"],
	},
	{
		id: "dating-web",
		name: "社区 / 配对数据墙",
		icon: "💞",
		description: "消费感配对仪表板: 信号 ticker + KPI + 30 天柱状 + 趋势",
		category: "dashboard",
		body: `【模板: 社区 / 配对 Dashboard】
【意图】消费产品感的数据墙, editorial typography + 克制的高亮色。
【布局】
- Left rail 导航
- Ticker bar 实时信号
- Headline KPIs
- 30-day mutual-matches 柱状图
- Match-rate 趋势 block`,
		enName: "Dating / Community Dashboard",
		scenario: "personal",
		aspectHint: "桌面 1440",
		tags: ["dating","community","consumer"],
	},
	{
		id: "team-okrs",
		name: "团队 OKR 追踪",
		icon: "🎯",
		description: "季度 banner + 3 个目标 + KR 进度条 + owner + 状态 pill",
		category: "dashboard",
		body: `【模板: Team OKRs】
【意图】OKR 追踪页, 一眼看出进度。
【布局】
- Quarter banner (Q? + 主题)
- 3 个 objectives 列, 每个含一组 KR
- 每个 KR 一条进度条 + 数值 + owner avatar + 状态 pill
- 右侧 'this quarter at a glance' 摘要`,
		enName: "Team OKRs",
		scenario: "product",
		aspectHint: "桌面 1440",
		tags: ["okr","objectives","key results","目标"],
	},
	{
		id: "flowai-team-dashboard",
		name: "FlowAI 团队管理",
		icon: "🌊",
		description: "三个 tab 的团队管理后台: 成员、详情、活动日志, 含图表 + CSV 导出",
		category: "dashboard",
		body: `【模板: FlowAI 团队管理 Dashboard】
【意图】FlowAI 美学的团队管理 admin 单页。
【布局】
- Tabs: Team Members / Team Details / Activity Log
- KPI stat row
- Member table (avatar + 角色 + 状态)
- Role distribution bar chart
- Online presence + activity sparklines
- Top contributors panel
【设计细节】
- light/dark 切换, hover tooltip, click-to-zoom panels
- CSV export 按钮 (前端实现)`,
		enName: "FlowAI Team Dashboard",
		scenario: "operations",
		aspectHint: "桌面 1440",
		tags: ["flowai","team","members"],
	},
	{
		id: "live-dashboard",
		name: "Notion 风团队仪表板",
		icon: "📈",
		description: "Notion 风团队仪表板, KPI + 7 日 sparkline + activity feed + 任务表",
		category: "dashboard",
		body: `【模板: Live Team Dashboard】
【意图】Notion 风的团队动态总览, 即使没有数据源也用 seed 数据兜底。
【布局】
- Header (团队 + 时间窗)
- KPI 卡片网格
- 7 天 sparkline 趋势
- Real-time activity feed (avatar + 动作 + 时间)
- Linked database task table (zebra + 状态 pill)
【设计细节】
- Notion-callout / toggle / 数据库表配色风格`,
		enName: "Live Team Dashboard",
		scenario: "operations",
		aspectHint: "桌面长页",
		tags: ["notion","team","live","dashboard"],
	},
	{
		id: "experiment-readout",
		name: "实验复盘",
		icon: "🧪",
		description: "假设 + 指标 + 结果 + 解释 + 决策, 把 A/B 或产品实验转成行动建议",
		category: "data",
		body: `【模板: 实验复盘 / Experiment Readout】
【意图】这不是普通数据报告、不是 dashboard。目标是回答: "这个实验说明了什么, 我们下一步应该上线、停止、继续跑, 还是重新设计?"

【适合输入】
- A/B test、增长实验、定价实验、onboarding 改版、功能灰度、邮件实验
- 可以是 markdown、CSV、表格粘贴或混合记录

【必须输出的结构】
1. Header: 实验名称、owner、日期、实验状态、decision。
2. Hypothesis: 原始假设, 必须改写成可验证句式。
3. Setup: audience、variant、duration、sample size、primary metric、guardrail metrics。
4. Result snapshot: primary metric lift、absolute delta、sample、confidence / caveat。
5. Metric table: Control vs Variant, primary + secondary + guardrail。
6. Interpretation: 解释结果为什么发生, 区分 signal、noise、unknown。
7. Decision: Ship / iterate / extend / stop 四选一, 并给理由。
8. Follow-up experiments: 2-4 个下一步实验, 每个包含 hypothesis、expected impact、effort。
9. Instrumentation notes: 数据缺口、埋点问题、样本偏差。

【设计要求】
- 产品数据团队风格: 清楚、可信、行动导向。
- 首屏必须有大号 decision badge 和 primary metric delta。
- 图表可以用 CSS/SVG/Chart.js; 如果用 Chart.js, canvas 外层必须固定高度。
- 不要把结果包装得过度确定; 小样本或缺少显著性时必须明确 caveat。

【可选风格模板 — 参考 assets/】
根据实验语境选择一种, 不要三种混用:
- \`assets/product-readout.html\`: 默认风格。浅色产品实验复盘, 适合 PM / growth / leadership readout。
- \`assets/lab-notebook.html\`: 研究实验室 notebook, 适合 early-stage experiment、定性 + 定量混合、需要保留 caveat 的探索实验。
- \`assets/growth-console.html\`: 深色 growth analytics console, 适合增长团队、实时指标、漏斗 / activation / conversion readout。

如果用户没有指定风格, 优先使用 \`product-readout\`; 如果材料强调研究过程和不确定性, 使用 \`lab-notebook\`; 如果材料强调增长指标、漏斗、实时监控或运营节奏, 使用 \`growth-console\`。

【内容真实性】
- 只使用用户提供的数据。不要捏造 p-value、confidence、样本量。
- 如果没有统计显著性信息, 用 "directional" / "inconclusive" / "needs more data" 表达。`,
		enName: "Experiment Readout",
		scenario: "product",
		aspectHint: "产品实验报告",
		tags: ["experiment","ab-test","growth","product","data","实验","复盘"],
	},
	{
		id: "data-report",
		name: "数据可视化报告",
		icon: "📊",
		description: "把 CSV/Excel/JSON 数据转成漂亮的可视化报告页",
		category: "data",
		body: `【模板: 数据可视化报告】
- 头部: 报告标题 + 时间区间 + 数据来源说明。
- KPI 卡片网格: 3-5 个最重要指标, 每个卡片显示数值 + 同比变化 + 微型趋势线。
- 主图表区: 至少 2 个图表 (柱状 / 折线 / 饼 / 散点), 使用 Chart.js 或 ECharts (jsdelivr CDN 引入), 数据从用户输入解析得到。
- **图表容器必须有固定高度**: 每个 \`<canvas>\` 外层包一个 \`<div style="position:relative;height:NNNpx">\` (KPI 迷你图 ~40px, 主图表 ~240–280px)。Chart.js 用 \`responsive:true, maintainAspectRatio:false\` 时若父容器没有显式高度, 会陷入 ResizeObserver 死循环, 图表无限增高直至卡死浏览器。**绝对不要**直接给 canvas 写 \`height=\` 属性当布局, 那个只是初始值。
- 数据表格: 用户原始数据节选, 使用 \`<table>\` + 现代化样式 (zebra stripe, hover, sticky header)。
- 洞察块: 3-5 条文字洞察, 用 emoji 开头, 像产品周报。
- 底部"方法论"折叠区。
- 配色克制专业: 主色 1 + 中性色阶, 图表用调色板。
- **必须解析用户提供的实际数据**, 不要捏造。`,
		enName: "Data Visualization Report",
		scenario: "finance",
		aspectHint: "桌面长页面",
		tags: ["data","report","chart","数据","报告"],
	},
	{
		id: "exec-briefing-memo",
		name: "高管决策简报",
		icon: "⚖️",
		description: "Decision needed + recommendation + evidence + tradeoffs, 把复杂材料压成可拍板的一页",
		category: "doc",
		body: `【模板: 高管决策简报 / Executive Briefing Memo】
【意图】这不是会议纪要、不是周报、不是 PRD。它的唯一目标是帮助决策者在 3 分钟内理解问题并拍板。

【适合输入】
- 长会议记录、调研材料、战略讨论、销售反馈、产品数据、投资备忘
- 用户可能给很多碎片信息; 你要提炼成一个明确 decision frame

【必须输出的结构】
1. Memo header: 主题、owner、audience、date、decision deadline。
2. Decision needed: 用一句话写清楚需要拍板的问题。
3. Recommendation: 明确建议, 不要写 "可以考虑"。必须包含 confidence level。
4. Why now: 为什么现在需要决定, 不决定的代价是什么。
5. Key facts: 5-7 个事实证据, 每条标注来源类型 (sales / product / finance / customer / ops)。
6. Tradeoff table: Option A / Option B / Option C, 对比 upside、cost、risk、reversibility。
7. Risks & mitigations: 3-5 个风险, 每个给缓解动作。
8. Decision path: approve / reject / ask for more evidence 三种路径各自下一步。
9. Next actions: owner、due date、expected artifact。

【设计要求】
- 像顶级咨询公司的 one-page decision memo: 克制、清楚、密度高。
- 首屏必须直接呈现 decision + recommendation, 不要先铺陈背景。
- 使用强层级: 大号结论、紧凑证据卡、对比表、状态 pill。
- 不要做成长文章; 不要做成 deck; 不要写空泛商业黑话。

【可选风格模板 — 参考 assets/】
根据决策场景选择一种, 不要三种混用:
- \`assets/board-memo.html\`: 默认风格。浅色高管 memo, 适合 CEO/CFO/CRO、运营、产品决策。
- \`assets/decision-command.html\`: 深色 command center, 适合紧急决策、风险处置、incident、go/no-go、launch gate。
- \`assets/board-paper.html\`: 正式 board paper / 董事会纸质议案, 适合董事会、投资人、合规、预算审批。

如果用户没有指定风格, 优先使用 \`board-memo\`; 如果材料强调紧急、风险、行动指挥, 使用 \`decision-command\`; 如果材料面向董事会或正式审批, 使用 \`board-paper\`。

【内容真实性】
- 不要捏造数字、客户、预算、日期。
- 如果缺少关键信息, 在 Evidence gaps 中列出, 但仍给出基于现有证据的 provisional recommendation。`,
		enName: "Executive Briefing Memo",
		scenario: "operations",
		aspectHint: "一页决策 memo",
		tags: ["executive","briefing","memo","decision","strategy","简报","决策"],
	},
	{
		id: "eng-runbook",
		name: "工程 Runbook",
		icon: "📕",
		description: "服务概述 + alerts 表 + dashboards + 操作命令 + on-call + 事故清单",
		category: "doc",
		body: `【模板: Engineering Runbook】
【意图】工程 oncall 用的可拷贝命令的 runbook 单页。
【布局】
- Service overview (拓扑 + 依赖)
- Alerts table (severity / threshold / runbook link)
- Dashboards links 卡片
- Common procedures (mono 代码块, 一键复制)
- On-call rotation (本周 + 下周)
- Incident response checklist`,
		enName: "Engineering Runbook",
		scenario: "engineering",
		aspectHint: "长页面",
		tags: ["runbook","ops","oncall","sre"],
	},
	{
		id: "meeting-notes",
		name: "会议纪要",
		icon: "🗒️",
		description: "标题 + 出席 + 议程 + 决议 + action items + 下次",
		category: "doc",
		body: `【模板: 会议纪要】
【意图】现代会议纪要, 强 action items。
【布局】
- Title bar (会议名 + 时间 + 出席 avatars)
- Agenda checklist
- Decisions block (圆角卡片)
- Action items table (Owner / Due / Status)
- Next meeting footer`,
		enName: "Meeting Notes",
		scenario: "operations",
		aspectHint: "长页面",
		tags: ["minutes","meeting","1:1","纪要"],
	},
	{
		id: "docs-page",
		name: "技术文档页",
		icon: "📘",
		description: "三栏文档页: 侧导航 + 正文 + 右 TOC",
		category: "doc",
		body: `【模板: 技术文档页】
【意图】API / 教程文档单页, 长读体验优先。
【布局】
- Inline-start nav (sections + sticky)
- Article body (含代码块, callouts, 表格)
- Inline-end TOC (sticky, scroll-spy)
- 顶栏 search + version + 主题切换
【设计细节】
- 代码块: 圆角 + dark + 语言标签 + 复制按钮
- callout: info / warn / danger 三色`,
		enName: "Docs Page",
		scenario: "engineering",
		aspectHint: "桌面 1440",
		tags: ["docs","api","tutorial","guide"],
	},
	{
		id: "competitive-teardown",
		name: "竞品拆解",
		icon: "🧩",
		description: "定位图 + 功能矩阵 + 价格对比 + 机会窗口, 把竞品资料转成产品决策报告",
		category: "doc",
		body: `【模板: 竞品拆解 / Competitive Teardown】
【意图】这不是文章、不是 PRD、不是 pitch deck。目标是把多个竞品的杂乱资料转成一份可决策的产品战略报告, 帮团队回答: "我们和它们到底差在哪里, 下一步该怎么打?"

【适合输入】
- 竞品官网 / 定价页 / changelog / 用户评论 / 销售反馈 / 内部调研笔记
- 2-6 个竞品最合适; 如果用户只给一个竞品, 输出单竞品 deep dive
- 可以包含表格、bullet、链接摘录、访谈记录、截图说明

【必须输出的结构】
1. Header: 市场 / 产品类别 / 报告日期 / 结论一句话。
2. Executive takeaway: 3 条最重要判断, 每条必须包含 "so what"。
3. Positioning map: 用 2×2 象限或坐标图表现竞品定位。坐标轴必须来自用户内容, 不要套模板词。
4. Competitor cards: 每个竞品一张卡, 包含 target user、core promise、pricing signal、primary strength、visible weakness。
5. Feature matrix: 行是关键能力, 列是竞品 + "Us / Opportunity"; 用 ✓ / △ / — 表达覆盖度, 并用短注释说明。
6. Pricing / packaging read: 价格层级、免费试用、限制项、企业销售动作。
7. UX / messaging notes: 从用户材料中抽取 4-6 条可观察细节, 不要泛泛而谈。
8. Opportunity windows: 3 个机会窗口, 每个包含 why now、target segment、first move、risk。
9. Recommended moves: 近期 30 天 / 90 天 / 180 天行动建议。

【设计要求】
- 战略咨询 + 产品战情室风格: 信息密度高、扫描快、图表清楚。
- 使用 restrained palette: ink / paper / muted blue / signal amber 或类似专业色。
- Feature matrix 必须横向可读; 小屏可变成 stacked cards。
- 不要做成营销落地页, 不要做成普通文章。

【可选风格模板 — 参考 assets/】
根据用户内容选择最贴合的一种, 不要三种混用:
- \`assets/war-room-grid.html\`: 默认风格。浅色战情室 / 咨询报告, 适合产品团队、PM、普通商业读者。
- \`assets/radar-map.html\`: 深色雷达图 / market intelligence console, 适合安全、AI、开发者工具、平台型竞品。
- \`assets/analyst-dossier.html\`: 纸质分析档案 / investment research dossier, 适合投研、行业分析、正式战略备忘。

如果用户没有指定风格, 优先使用 \`war-room-grid\`; 如果输入强调市场格局、技术雷达、攻防态势, 使用 \`radar-map\`; 如果输入像研究笔记、投资备忘或行业报告, 使用 \`analyst-dossier\`。

【内容真实性】
- 只使用用户提供的竞品、价格、功能、评论。缺失信息用 "not found in source" 或 "unknown" 标注。
- 不要发明市场份额、ARR、客户名、定价数字。
- 如果用户资料明显不足, 仍然输出报告, 但在 "Evidence gaps" 中列出缺口。`,
		enName: "Competitive Teardown",
		scenario: "product",
		aspectHint: "战略长页面",
		tags: ["competitive","teardown","strategy","product","竞品","拆解"],
	},
	{
		id: "hr-onboarding",
		name: "新员工入职页",
		icon: "👋",
		description: "首周日程 + buddy + 学习路径 + 设备 + 完成标准",
		category: "doc",
		body: `【模板: 新员工入职】
【意图】新员工首周看一眼就知道怎么过的单页。
【布局】
- Welcome hero (姓名 + 入职日 + 团队)
- First-week schedule (5 天 timeline)
- Manager + Buddy 卡片
- Learning track 列表
- Equipment checklist
- “你设置好了当且仅当…” outcomes 区`,
		enName: "HR Onboarding",
		scenario: "hr",
		aspectHint: "长页面",
		tags: ["onboarding","入职","first week"],
	},
	{
		id: "doc-kami-parchment",
		name: "Kami 羊皮纸文档",
		icon: "📜",
		description: "暖羊皮纸底 (#f5f4ed) + 墨蓝单色 accent (#1B365D) + 单一衬线字体, 编辑级排印",
		category: "doc",
		body: `【模板: Kami 羊皮纸文档】
【意图】严肃排版文档: one-pager / 长报告 / 信函 / 简历 / 财报 / changelog / portfolio。Inspired by tw93/kami。强调"写得像被排过版的纸", 不是 dashboard, 不是网页。

【硬性视觉签名 — 不许改】
- **画布**: 暖羊皮纸 \`#f5f4ed\` (永远不用纯白 \`#fff\`)。次级背景 \`#efeee5\`。
- **墨色**: 主文字 \`#1f1d18\` (近黑暖灰, 不用纯黑 \`#000\`)。次文字 \`#6b665b\`。
- **唯一色彩**: 墨蓝 \`#1B365D\` ——所有 accent (链接、tag 描边、重点数字、引用左 rule) 只能用这一个色, 严禁多色。
- **字体**: 一种语言一种衬线, 全文不混用:
  - 英文: \`Charter\` (fallback: \`Source Serif Pro\`, \`Iowan Old Style\`)
  - 中文: \`TsangerJinKai02 W04\` (fallback: \`Noto Serif SC\`)
  - 日文: \`YuMincho\` (fallback: \`Noto Serif JP\`)
  - Body 400, Heading 500 (不要 700/800/900)。
- **行高**: 标题 1.1–1.3, 紧凑正文 1.4–1.45, 阅读型正文 1.5–1.55。
- **绝不**: drop-shadow / blur / 圆角 ≥ 8px / 渐变 / 霓虹色 / rgba (用 solid hex)。
- **细节**: tag 用 solid hex 背景方块 (因为 WeasyPrint 不渲染 rgba 好); 单线几何 icon; 边缘 1px hairline \`#d4d1c5\` rule, 长度受控不到边。

【可选文档类型 — 按用户内容判断】
- **One-Pager** — 顶 logotype (Charter italic) + 标题 + lede + 3 列要点 + 底脚 metadata。
- **Long Doc** — 封面页 (大标题 + 副标 + 作者 + 日期) → 目录 (kicker + page no.) → 章节 (folio 顶角 + section rule + body) → 注释脚注 + 文末 colophon。
- **Letter** — 抬头地址 + 日期 + 收件人 + 正文 (左对齐, 段间空 1.5em) + 署名 + 签名占位线。
- **Portfolio** — 项目 hero (大标题 + sub) + 1 张全幅图 (用 CSS 块绘制占位) + 项目描述 + 角色 / 时间 / stack 元数据 row。
- **Resume** — 顶部姓名 (大字) + tagline 一行 + contact row + 主要 section: experience (公司 / 时间 / 职位 / bullets) + skills + education。
- **Slides** — keynote 风, 页数由【用户内容】决定 (短内容 6 页起步, 长内容应更多), 每页满铺羊皮纸, 大标题 + lede + 角标 page no., 简洁到只有"被印出来"的感觉。
- **Equity Report** — 公司名 + ticker + Q × 年份 + key metrics row (revenue / margin / yoy) + body 分析 + 图表 (SVG 单色折线)。
- **Changelog** — 版本号 (Charter italic 大字) + 日期 + 改动列表 (Added / Changed / Fixed), 单 rule 分隔。

【设计准则】
- "Composed pages, not dashboards." 不要堆 KPI 卡, 不要堆 emoji 图标, 不要 hero gradient。
- "Ring or whisper only, no hard drop shadows." 阴影只能是 \`0 0 0 1px #d4d1c5\` 这种 hairline 描边。
- 文字层级靠**衬线对比 + 字号 + 留白**, 不靠颜色。
- 单文件 HTML, 用 Tailwind CDN; 全文中英混排时加盘古之白; 不要外链图片, 占位用 paper-tint 色块 + 1px ink 描边。`,
		enName: "Kami Parchment Document",
		scenario: "personal",
		aspectHint: "A4 / Letter 长页",
		tags: ["kami","parchment","serif","editorial","report","letter","one-pager"],
	},
	{
		id: "pm-spec",
		name: "PRD / 产品 Spec",
		icon: "🧭",
		description: "问题 + 成功指标 + 范围 + user stories + 设计 + 发布 + 待解决",
		category: "doc",
		body: `【模板: PRD / Product Spec】
【意图】产品需求文档单页, 结构清晰。
【布局】
- Title bar + 状态 pill (draft/approved/shipped)
- Problem & Why now
- Success metrics (3-5 个 KPI)
- Scope (in / out)
- User stories (Given/When/Then)
- Design notes (含占位 mockup)
- Rollout plan + Open questions`,
		enName: "Product Spec / PRD",
		scenario: "product",
		aspectHint: "长页面",
		tags: ["prd","spec","需求","product"],
	},
	{
		id: "email-marketing",
		name: "营销邮件",
		icon: "📧",
		description: "产品发布邮件, 含 masthead、hero、CTA、规格表, table-fallback",
		category: "email",
		body: `【模板: 品牌产品发布邮件】
【意图】纯 HTML 邮件, 600px 单栏, 兼容邮件客户端。
【布局】
- Masthead (wordmark 居中)
- Hero 图块 (SVG 占位)
- Headline lockup (含 skewed-italic accent)
- Body copy + primary CTA 按钮
- Specifications grid (3 列)
- Footer (社交 + 退订)
【设计细节】
- 使用 \`<table role='presentation'>\` 做布局兜底
- 颜色用 inline style (不要依赖 class)`,
		enName: "Marketing Email",
		scenario: "marketing",
		aspectHint: "600 邮件宽",
		tags: ["email","newsletter","mjml"],
	},
	{
		id: "finance-report",
		name: "季度财报",
		icon: "💼",
		description: "Masthead + KPI + 收入/烧钱图 + P&L 表 + 重点 + 展望",
		category: "finance",
		body: `【模板: 季度财报 / Finance Report】
【意图】财务向单页报告, 数字 + 图表 + 文字洞察。
【布局】
- Masthead (公司 + Q + 报告标题) + 4 个 hero KPI
- Revenue chart + Burn chart (Chart.js / ECharts)
- P&L 概要表 (zebra + sticky header)
- Top-line highlights (5 条 bullet)
- Outlook 段落
- Methodology 折叠区`,
		enName: "Finance Report",
		scenario: "finance",
		aspectHint: "长页面",
		tags: ["financial","p&l","mrr","财报"],
	},
	{
		id: "invoice",
		name: "可打印发票",
		icon: "🧾",
		description: "标准发票: 寄件/收件 + 明细 + 税 + 总额 + 付款指引",
		category: "finance",
		body: `【模板: 可打印发票】
【意图】A4 可打印的发票单页。
【布局】
- Header: 发票号 / 日期 / 截止日
- From / Bill to 两块
- Line items table (描述 / 数量 / 单价 / 金额)
- Tax breakdown + Totals (右对齐)
- Payment instructions 区
【设计细节】
- @media print 样式; 颜色对比保留`,
		enName: "Printable Invoice",
		scenario: "finance",
		aspectHint: "A4",
		tags: ["invoice","bill","发票"],
	},
	{
		id: "gamified-app",
		name: "游戏化 App 多屏",
		icon: "🕹️",
		description: "三屏: 封面 / 今日任务带 XP / 任务详情, 暗色舞台",
		category: "mobile",
		body: `【模板: 游戏化 App / Quest UI】
【意图】类 RPG 习惯养成 app, dark showcase stage 上三个 phone frame。
【布局】
- Frame 1: Cover / Poster
- Frame 2: Today's quests + XP ribbon + level bar
- Frame 3: Quest detail (子任务 + 奖励)
【设计细节】
- 醒目的 quest tile 渐变 + 等级 ribbon + 底部 tab bar`,
		enName: "Gamified App",
		scenario: "personal",
		aspectHint: "3 × iPhone",
		tags: ["gamified","habit","rpg","quest","xp"],
	},
	{
		id: "mobile-onboarding",
		name: "App 引导多屏",
		icon: "🪂",
		description: "三个手机框并排: splash / value-prop / sign-in",
		category: "mobile",
		body: `【模板: App 引导三屏】
【意图】并排展示三个 mobile onboarding 关键屏。
【布局】
- Phone 1: Splash (logo + tagline)
- Phone 2: Value-prop (illustration + 1 句 + dot indicators)
- Phone 3: Sign-in (email / Apple / Google + 主 CTA)`,
		enName: "Mobile Onboarding",
		scenario: "design",
		aspectHint: "3 × iPhone",
		tags: ["onboarding","ios","signup","引导"],
	},
	{
		id: "mobile-app",
		name: "iPhone App 单屏",
		icon: "📲",
		description: "像素级 iPhone 15 Pro 边框, 一屏 app 截图",
		category: "mobile",
		body: `【模板: iPhone 单屏 App】
【意图】一个屏幕的 mobile app 设计, 放在像素级 iPhone 15 Pro frame 里。
【布局】
- Status bar (时间 + 电池 + 信号)
- App header (标题 / 头像 / 搜索)
- Main content (一个清晰的 archetype: feed / list / detail / form)
- Bottom tab bar (4-5 tab)
【设计细节】
- 真实的 dynamic island; safe-area 留白`,
		enName: "Mobile App Screen",
		scenario: "design",
		aspectHint: "iPhone 15 Pro frame",
		tags: ["mobile","ios","app","phone"],
	},
	{
		id: "frame-liquid-bg-hero",
		name: "流体背景 Hero 帧",
		icon: "🌊",
		description: "WebGL 风流体置换背景 + 顶部叠加金句, 适合视频片头 / landing hero / 海报",
		category: "poster",
		body: `【模板: 流体背景 Hero】
【意图】可作为视频片头帧、SaaS landing 顶部 hero、海报底图。WebGL 流体感, 但用 CSS / canvas 退化绘制, 确保单文件可双击打开。Inspired by hyperframes vfx-liquid-background。

【画布】1920×1080 (横) 或 1080×1920 (竖), 二选一。背景占满。

【流体背景 — 3 种实现, 按用户偏好选】
1. **CSS 多层 radial-gradient 错位呼吸** (最稳, 默认推荐):
   - 3-5 个大椭圆 \`radial-gradient(...)\`, 颜色取自调色板。
   - 每个椭圆套 \`@keyframes\` 平移 + scale + hue-rotate, 周期 8-14s, 错峰; 整个画面叠 \`mix-blend-mode: screen\` 或 \`overlay\`。
   - 顶层加 1 层 \`backdrop-filter: blur(80px)\` 让边缘更糊。
2. **Canvas + simple perlin noise** (中阶):
   - 80 行 inline JS, 用 \`requestAnimationFrame\` 画 metaballs 或 simplex noise field。
   - 性能允许时启用, \`prefers-reduced-motion\` 时降回静态截图。
3. **WebGL fragment shader** (高阶, 慎用):
   - 用 jsdelivr CDN 引 \`regl\` 或 inline plain WebGL。
   - shader 写 domain-warp noise; 单个 quad, 一个 uniform \`u_time\`。

【顶层文字层】
- 居中或左下: 一句巨型金句 (5-7vw, 衬线或粗 sans), 字体: \`Source Serif Pro\` / \`Inter Tight\` / \`Manrope Black\`。
- 文字色用 paper white \`#fafaf8\` 或 ink, 取决于背景明暗; 加 \`mix-blend-mode: difference\` 让它在任何流体颜色上都可读。
- 副标 (小 sans, opacity 0.7) 一行。
- 底部可选 CTA chip 或 hairline + 元数据 row。

【调色 — 4 选 1, 不要彩虹】
- 🌅 **Solar Peach** — \`#ffb18a\` + \`#f78b4c\` + \`#d97757\`, 暖橙桃。
- 🌊 **Ocean Aqua** — \`#5ac8fa\` + \`#0a84ff\` + \`#1e3a8a\`, 海蓝。
- 🌌 **Aurora Violet** — \`#a78bfa\` + \`#7c5cff\` + \`#1e1b4b\`, 极光紫。
- 🌿 **Forest Mint** — \`#86efac\` + \`#34d399\` + \`#065f46\`, 苔森林。

【设计细节】
- 严禁: 多色彩虹 (>4 个色相)、PowerPoint 渐变、霓虹荧光叠加。
- 字体: 中文用 \`Noto Serif SC\` (display) / \`Noto Sans SC\` (副标)。
- 严禁外链图片; 全部 CSS + SVG + 可选 canvas。
- 必须用用户提供的金句 / 标题; 如果用户输入是数据 → 提炼一句 ≤ 18 字的金句。
- 单文件 HTML, 可被 \`prefers-reduced-motion\` 关动效。`,
		enName: "Liquid Background Hero",
		scenario: "video",
		aspectHint: "1920×1080 (16:9) 或 1080×1920 (9:16)",
		tags: ["liquid","fluid","background","hero","html-in-canvas","vfx"],
	},
	{
		id: "sprite-animation",
		name: "像素动画解说",
		icon: "🕹️",
		description: "像素美术 + kinetic 字体的解说帧, 纯 CSS 循环, 可录视频",
		category: "poster",
		body: `【模板: 像素 / 8-bit 动画解说】
【意图】教育型动画的单帧海报, 纯 CSS keyframes 循环, 不用 JS。
【布局】
- Full-bleed cream stage
- Bold display year / 大字数字
- 中心一个像素艺术 mascot (SVG 或纯 CSS 绘制)
- kinetic 中文 / 日文 display 字
- 底部 timeline ribbon 一直走
【设计细节】
- 动画用 @keyframes, 不依赖 JS
- 复古调色板: 红 / 米 / 墨绿`,
		enName: "Sprite Animation",
		scenario: "marketing",
		aspectHint: "竖版/横版均可",
		tags: ["pixel","8-bit","复古","explainer"],
	},
	{
		id: "poster-hero",
		name: "营销海报",
		icon: "🖼️",
		description: "竖版海报 / 朋友圈分享图, 强视觉冲击",
		category: "poster",
		body: `【模板: 营销海报】
- 容器 \`w-[1080px] h-[1920px] mx-auto\`, 全屏渐变 / mesh 背景。
- 上部 30% 留白 + 一个大 emoji 或抽象几何图形。
- 中部主标题占视觉中心 (text-8xl, font-black), 一句话副标题。
- 下部信息卡片: 3-5 条核心要点用图标 + 短句。
- 底部右下角放品牌 / 二维码 (用 SVG 占位)。
- 使用大胆的色彩: 渐变背景 (from-violet-500 via-fuchsia-500 to-indigo-500 之类), 文字白色 + 1 个对比色高亮。
- 使用 SVG 做装饰性元素 (圆 / 三角 / 波浪 / 噪点纹理)。`,
		enName: "Marketing Poster",
		scenario: "marketing",
		aspectHint: "1080×1920 竖版",
		tags: ["poster","海报","朋友圈"],
	},
	{
		id: "magazine-poster",
		name: "杂志风海报",
		icon: "🗞️",
		description: "Sunday-paper 风格, 大字 serif headline + 双栏正文 + 编号 sections",
		category: "poster",
		body: `【模板: 杂志风海报 / Magazine Poster】
【意图】Newsprint editorial 风格的长图海报, 读起来像一篇报纸全版。
【布局】
- Dateline 顶栏 (publication / date / issue)
- Oversized serif headline (含 strike-through 词 + 斜体 accent)
- 双栏 body 正文
- 6 个编号 sections, 每个含小标题 + 1-2 段 + pull-quote
- 底部署名 + 小 ornament
【设计细节】
- 纸感: 暖灰 cream 背景 + 细 dot pattern, 黑字
- 字体: Playfair Display + IBM Plex Serif + JetBrains Mono`,
		enName: "Magazine Poster",
		scenario: "marketing",
		aspectHint: "竖版长图",
		tags: ["magazine","newsprint","editorial","manifesto"],
	},
	{
		id: "mockup-device-3d",
		name: "iPhone × MacBook 立体展架",
		icon: "📱",
		description: "iPhone + MacBook 仿 GLTF 静态展架, 屏幕内嵌真实 HTML 内容, 玻璃镜头折射, 360° 转盘构图",
		category: "poster",
		body: `【模板: 设备 3D 展架 (Device 3D Showcase / HTML-in-Canvas)】
【意图】产品发布、App 演示、设计稿展示。把用户提供的 UI 内容真实渲染到 iPhone / MacBook "屏幕"里, 周围用 CSS 3D transform 模拟 GLTF 模型的玻璃 / 高光 / 折射。Inspired by hyperframes vfx-iphone-device。

【硬性构图】
- **画布**: 1920×1080, 暖灰渐变背景 \`radial-gradient(#1a1a1f → #0a0a0f)\`, 底部反射地面 (mirror gradient)。
- **iPhone 15 Pro 模型**: 左侧 / 中部, \`transform: rotateY(-12deg) rotateX(4deg) translateZ(40px)\`; 边框钛金属银 \`#a8a8ad\` (实心 4px) + 屏幕圆角 56px; 屏幕内嵌 iframe-like div, 真实渲染用户的 HTML 内容 (mobile viewport 375×812)。
- **MacBook Pro 14"** (可选第二台): 右侧, 略小, \`rotateY(8deg)\`; 上盖屏幕嵌入桌面 viewport 内容 (1440×900 缩放); 底座键盘 + trackpad 用 CSS 阴影线条绘制 (不画键帽细节)。
- **玻璃 / 镜头光斑**: 顶部加 2-3 个 \`radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, transparent 60%)\` 的椭圆 highlight, 模拟 morphing glass lens。
- **地面反射**: 设备下方 \`transform: scaleY(-1)\` + \`mask-image: linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 70%)\`。

【屏幕内容来源】
- 用户提供的是文本/数据 → 自动渲染为一个 mock app 界面 (顶部 status bar + 标题 + body + 底部 tab bar 或 home indicator)。
- 用户提供的是 HTML → 原样嵌入屏幕 div 内 (注意缩放 transform 让它适配屏幕宽高)。
- 屏幕内 UI 用 Tailwind, 字号要按 mobile 真实尺寸 (text-sm / text-base, 不要 text-9xl)。

【可选附加元素】
- 右下角 "product slug" 角标: 大 logo + 一行 tagline + 副标 hairline。
- 顶部一行 caption (英文 sans, 字号小, 透明 0.6): 产品 codename / 日期 / 版本。
- 加 8s 自动 CSS 转盘: \`@keyframes turntable\` rotateY -12 ↔ 12, ease-in-out infinite alternate; 可被 \`prefers-reduced-motion\` 关闭。

【设计细节】
- **绝不**: 用外部 mockup 图片 URL (任何 unsplash / dribbble link), 全部用 CSS / SVG 绘制设备。
- 字体: 设备外的 caption / logo 用 \`Inter Tight\` / \`SF Pro\` 风格; 设备内根据用户内容自适应。
- 背景可选 4 套调色: charcoal / pearl / midnight blue / mocha; 不要彩虹渐变。
- 单文件 HTML; iframe 不要用 srcdoc 嵌套 (容易出问题), 用 \`<div class="screen">\` + Tailwind 渲染内容。
- 必须用用户真实数据填充屏幕内容, 严禁 lorem ipsum 或 "Your text here"。`,
		enName: "Device 3D Showcase",
		scenario: "product",
		aspectHint: "1920×1080 (16:9)",
		tags: ["device","mockup","iphone","macbook","html-in-canvas","product"],
	},
	{
		id: "waitlist-page",
		name: "等候名单页",
		icon: "✉️",
		description: "极简产品预发布落地页, 含邮箱捕获、logo、装饰图层",
		category: "prototype",
		body: `【模板: 等候名单页 / Waitlist】
【意图】为新产品 / 早鸟内测做一张极简等候页。
【布局】
- 居中布局: brand logo + 一行 tagline + 大字 hero (说清楚做什么)
- 邮箱捕获 input + submit 按钮 (合并成一个 pill)
- 下方 3 个小卖点 (icon + 一行字)
- 底部 founders note + 社交链接
【设计细节】
- 装饰: SVG 渐变 mesh / 噪点纹理 / 一颗星轨
- 成功提交后给一个微动效 (✓ + 文案变化)`,
		enName: "Waitlist Page",
		scenario: "marketing",
		aspectHint: "桌面 1440",
		tags: ["waitlist","launch","预发布"],
	},
	{
		id: "pricing-page",
		name: "定价页",
		icon: "💳",
		description: "三档定价 + 特性对比表 + FAQ",
		category: "prototype",
		body: `【模板: 定价页】
【意图】标准 SaaS 三档定价页, 一眼对齐价值与价格。
【布局】
- Header + monthly/annual 切换
- 3 档定价卡片 (Free / Pro / Enterprise), 中间档 popular 高亮
- 完整特性对比表 (✓ / – / 不同档勾)
- FAQ (details/summary)
- 底部 CTA`,
		enName: "Pricing Page",
		scenario: "sales",
		aspectHint: "桌面 1440",
		tags: ["pricing","plans","定价"],
	},
	{
		id: "wireframe-sketch",
		name: "手绘线框图",
		icon: "✏️",
		description: "网格背景 + marker 笔触 + 多 tab + sticky note + scribble 图表",
		category: "prototype",
		body: `【模板: 手绘 Wireframe】
【意图】白板 / 草稿前阶段的 wireframe 探索。
【布局】
- Graph-paper 背景
- 多 tab labels (variants 标签)
- scribbled chart placeholders + hatched fills
- Sticky-note annotations (黄色, 旋转一点点)
【设计细节】
- 字体: Caveat / Architects Daughter; 不要规规矩矩的对齐`,
		enName: "Wireframe Sketch",
		scenario: "design",
		aspectHint: "桌面 1440",
		tags: ["wireframe","lo-fi","sketch","草稿","手绘"],
	},
	{
		id: "web-proto-soft",
		name: "Apple Soft 原型",
		icon: "🫧",
		description: "Apple 调: 银/奶 canvas + 双层斜面卡片 + button-in-button + spring",
		category: "prototype",
		body: `【模板: Apple Soft 原型】
【意图】Apple-tier 软质感, squircle + spring motion + ambient mesh。
【布局】
- Silver / cream canvas + ambient mesh background
- Double-bezel 卡片 (内外两层圆角 + 高光)
- Button-in-button CTA
- Spring motion (微反弹的 hover)`,
		enName: "Apple-tier Soft Prototype",
		scenario: "design",
		aspectHint: "桌面 1440",
		tags: ["apple","soft","squircle","spring"],
	},
	{
		id: "web-proto-brutalist",
		name: "Brutalist 原型",
		icon: "⬛",
		description: "Swiss industrial-print 风: 单字 grotesque、巨数字、ASCII 装饰",
		category: "prototype",
		body: `【模板: Brutalist 网页原型】
【意图】Swiss Industrial Print 风格, 不柔和不友好, 强权威感。
【布局】
- Newsprint canvas + hairline grid dividers
- Monolithic black grotesque 标题, viewport-bleeding 巨数字
- Hazard-red accent + ASCII 装饰 (┌─┘ 等)
- Sections 用极简数字编号`,
		enName: "Brutalist Prototype",
		scenario: "design",
		aspectHint: "桌面 1440",
		tags: ["brutalist","swiss","industrial","hairline"],
	},
	{
		id: "web-proto-editorial",
		name: "Editorial 原型",
		icon: "📜",
		description: "Editorial-minimalist: 暖色单色 canvas + serif display + grotesque body",
		category: "prototype",
		body: `【模板: Editorial 网页原型】
【意图】杂志感 minimalist, 大量留白 + 微动效。
【布局】
- Warm monochrome canvas
- Serif display + grotesque body + mono meta
- 1px hairline borders, 极柔和 chip
- Macro-whitespace, ambient micro-motion`,
		enName: "Editorial Prototype",
		scenario: "design",
		aspectHint: "桌面 1440",
		tags: ["editorial","minimalist","serif"],
	},
	{
		id: "saas-landing",
		name: "SaaS Landing",
		icon: "🚀",
		description: "单页 SaaS 落地页, 含 hero/features/social-proof/pricing/CTA",
		category: "prototype",
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
- 至少处理 \`md:\` 断点, 移动端单栏`,
		enName: "SaaS Landing",
		scenario: "marketing",
		aspectHint: "桌面 1440",
		tags: ["saas","landing","marketing"],
	},
	{
		id: "prototype-web",
		name: "Web 产品原型",
		icon: "🛠️",
		description: "可点击的功能性 Web 原型, 含导航、英雄区、特性区、CTA",
		category: "prototype",
		body: `【模板: Web 产品原型】
- 输出一个完整的产品 landing page。
- Sections: Top Nav (logo + 导航 + CTA 按钮) → Hero (大标题 + 副标 + 双 CTA + 可视化占位) → Features (3-6 个特性卡) → How it works (步骤) → Social proof (logo wall / 评价) → Pricing (可选) → Footer。
- 使用现代 SaaS 设计趋势: 大字号、柔和渐变、glassmorphism 卡片、滚动到视图入场动画 (pure CSS 即可)。
- 响应式: 移动端单栏, 桌面多栏; 至少处理 \`md:\` 断点。
- 添加交互: nav 滚动变色; 特性卡 hover 浮起; FAQ 可手风琴展开 (用 \`<details>\`)。
- 这是高保真原型, 应该让人觉得"明天就能上线"。`,
		enName: "Web Prototype",
		scenario: "design",
		aspectHint: "1440×900 桌面",
		tags: ["prototype","landing","原型"],
	},
	{
		id: "resume-modern",
		name: "极简简历",
		icon: "📄",
		description: "现代极简简历, A4 单页, 适合打印或导出 PDF",
		category: "resume",
		body: `【模板: 现代极简简历】
- 容器宽度模拟 A4: \`w-[210mm] min-h-[297mm] mx-auto\`, 内边距 16-20mm。
- 顶部姓名巨大 (text-4xl), 底下一行 contact (邮箱 / 电话 / 城市 / GitHub / LinkedIn), 中间用细竖线分隔。
- 主体两栏可选: 左 60% 主线（经历/项目/教育）, 右 40% 副线（技能/语言/获奖）。
- 章节标题: small caps 风格, 上方一条短 accent 线 (w-8 h-0.5)。
- 经历每条: 公司 + 职位 + 时间区间 (右对齐), 下方 1-3 条 bullet 用动词开头。
- 不使用花哨颜色, 黑白灰 + 1 个 accent (深蓝 / 墨绿)。
- 添加 @media print 样式, 隐藏不必要的元素, 颜色保留。`,
		enName: "Modern Resume",
		scenario: "personal",
		aspectHint: "A4 (210×297mm)",
		tags: ["resume","cv","简历"],
	},
	{
		id: "deck-open-slide-canvas",
		name: "1920 画布自由 Deck",
		icon: "🎨",
		description: "锁死 1920×1080 画布, React 组件级自由组合, 不绑模板",
		category: "slides",
		body: `【模板: 1920 画布自由 Deck】
【意图】不想被模板束缚的场景 (个人作品集、奇特演讲、艺术 / 设计课 deck)。给一个固定 1920×1080 画布 + 极强的类型 / 调色约束, 让 agent 像写 React 组件一样按内容自由排布每一页。Inspired by 1weiho/open-slide。

【硬性技术规格】
- 画布: 每页严格 \`width: 1920px; height: 1080px;\` 用 \`transform: scale(...)\` 适配视窗 (默认 \`scale(0.7)\` 居中)。
- **绝对禁止 overflow**: 每页内容必须 fit in 1920×1080, 不许滚动条出现。
- 字号 type scale (px): \`2xs:18 · xs:22 · sm:28 · md:36 · lg:48 · xl:64 · 2xl:88 · 3xl:120 · 4xl:160 · 5xl:220\`。
- 边距 padding: 96 / 128 / 160 三档之一。
- 每页有 \`<section class="slide" data-slide-id="<n>">\`。

【调色板 — 每个 deck 选 1 套, 全程不改】
- 🌫 **Ash & Lime** — bg \`#f1efea\`, ink \`#161616\`, accent \`#c5e803\`。
- 🌌 **Sea Indigo** — bg \`#0a0e1a\`, ink \`#f5f5f7\`, accent \`#5ac8fa\`。
- 🧉 **Mate Mocha** — bg \`#1a1411\`, ink \`#f5e9d6\`, accent \`#d97757\`。
- 🌸 **Pearl Rose** — bg \`#fdf6f3\`, ink \`#1a1015\`, accent \`#ff5d8f\`。

【布局自由度 — 这是核心】
- 不强制模板, 每页根据**内容性质**自选布局: cover / question / quote / image-text / 三列 / 五列 / 列表 / 数据卡 / 满版图。
- 但每页**必须遵守一条规则**: 视觉重心 (visual hierarchy) 只有 1 个 — 一句金句、一个数字、一张图, 不要"什么都强调"。
- 不许塞两段平等的文字; 真要并列就上 3 列等权重网格。

【字体】
- 西文: \`Inter Tight\` (display) + \`Inter\` (body); 或 \`Source Serif Pro\` (editorial 风时)。
- 中文: \`Noto Sans SC\` (sans 风) 或 \`Noto Serif SC\` (editorial 风); 不混 sans + serif。
- mono: \`JetBrains Mono\` 给数据 / 时间戳。

【设计细节】
- 严禁 emoji 装饰 (内容里的允许); 严禁多色彩虹; accent 只用一个色。
- 严禁 SVG icon 套用 lucide / feather 等通用库 (自己写 inline SVG)。
- 加键盘 ← / → 切换 + hash 同步; 角标固定: 右下 \`№N/M\`, 左下 deck title。
- 必须用用户的真实内容; 严禁 lorem ipsum。
- 单文件 HTML; Tailwind CDN; 不要外链图片。`,
		enName: "Open-Slide 1920 Canvas Deck",
		scenario: "design",
		aspectHint: "1920×1080 (16:9)",
		tags: ["canvas","open-slide","freeform","1920","react"],
	},
	{
		id: "deck-safety-alert",
		name: "安全 / 风险红色 Deck",
		icon: "⚠️",
		description: "红琥珀警示色 + hazard 条纹 + L1/L2/L3 tier 卡片 + 删除线标题",
		category: "slides",
		body: `【模板: Safety Alert Deck】
【意图】安全 / 风险 / 事故复盘 / red team / policy-as-code 用 deck。
【布局】
- 顶/底 45° 红黑 hazard 条纹
- 红色删除线否定标题
- L1/L2/L3 绿 / 琥珀 / 红 tier 卡片
- 圆点状态 alert box
- policy-yaml 代码块 (红左边框 + bad 关键词高亮)
- 红绿 checklist + 事故堆叠柱状图`,
		enName: "Testing / Safety Alert Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["safety","security","policy","incident"],
	},
	{
		id: "deck-graphify-dark",
		name: "暗底图谱 Deck",
		icon: "🌌",
		description: "深夜渐变 + 漂浮 orbs + SVG 力导向图谱 + JetBrains Mono",
		category: "slides",
		body: `【模板: Graphify Dark Graph Deck】
【意图】AI-native / 知识图谱 / dev-tool launch deck。
【布局】
- Cover: #06060c→#0e1020 渐变 + 浮动 blur orbs + SVG 力导向 graph
- Section 页: 彩虹渐变标题
- 代码 / CLI 页: JetBrains Mono 高亮
- Glassmorphism 卡片页`,
		enName: "Graphify Dark Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["graph","dev tool","ai","cli"],
	},
	{
		id: "deck-xhs-white",
		name: "白底杂志风 Deck",
		icon: "🌈",
		description: "纯白 + 顶部彩虹 bar + 渐变文字 + 马卡龙软卡片 + 黑底 pill",
		category: "slides",
		body: `【模板: 白底杂志风 Deck】
【意图】可同时发小红书图文与横版 PPT 双用的白底杂志风。
【布局】
- 纯白背景 + 顶部 10 色彩虹 bar
- 80-110px display 标题 + 紫→蓝→绿→橙→粉渐变文字
- 马卡龙软卡片组 (粉 / 紫 / 蓝 / 绿 / 橙)
- 黑底白字 .focus pill + 引用大块`,
		enName: "White Editorial Deck",
		scenario: "marketing",
		aspectHint: "16:9 / 3:4",
		tags: ["editorial","rainbow","macaron"],
	},
	{
		id: "deck-product-launch",
		name: "产品发布 Keynote",
		icon: "🎉",
		description: "暗 hero + 亮内容, 橙→桃 accent, 特性卡 + 定价 + CTA",
		category: "slides",
		body: `【模板: Product Launch Keynote】
【意图】新产品发布的 Keynote 风 deck。
【布局】
- Cover (暗背景 + 大字主题)
- Why we built this (问题)
- Introducing (产品名 + 1 张 hero shot)
- Feature cards (3-6 个)
- Pricing tiers
- CTA / Available now
【设计细节】
- accent: 暖橙→桃 渐变`,
		enName: "Product Launch Deck",
		scenario: "marketing",
		aspectHint: "16:9",
		tags: ["launch","keynote","product"],
	},
	{
		id: "deck-guizang-editorial",
		name: "贵赞编辑墨水 Deck",
		icon: "🖋️",
		description: "电子杂志 × 电子墨水; 10 个版面 + 5 套调色板 (墨水/靛蓝瓷/森林墨/牛皮纸/沙丘)",
		category: "slides",
		body: `【模板: 贵赞编辑墨水 Deck (Editorial × E-Ink)】
【意图】叙事、观点、分享、个人风格表达。墨纸印刷感, 不要科技感。Inspired by op7418/guizang-ppt-skill Style A。

【调色板 — 5 选 1, 严禁改 hex、严禁混用】
- 🖋 **墨水经典 Monocle** — ink \`#0a0a0b\`, paper \`#f1efea\`, paper-tint \`#e8e5de\`, ink-tint \`#18181a\`. 默认 / 通用商业 / 科技。
- 🌊 **靛蓝瓷 Indigo Porcelain** — ink \`#0a1f3d\`, paper \`#f1f3f5\`, paper-tint \`#e4e8ec\`, ink-tint \`#152a4a\`. 科技 / 研究 / 数据。
- 🌿 **森林墨 Forest Ink** — ink \`#1a2e1f\`, paper \`#f5f1e8\`, paper-tint \`#ece7da\`, ink-tint \`#253d2c\`. 自然 / 可持续 / 文化。
- 🍂 **牛皮纸 Kraft Paper** — ink \`#2a1e13\`, paper \`#eedfc7\`, paper-tint \`#e0d0b6\`, ink-tint \`#3a2a1d\`. 怀旧 / 人文 / 文学。
- 🌙 **沙丘 Dune** — ink \`#1f1a14\`, paper \`#f0e6d2\`, paper-tint \`#e3d7bf\`, ink-tint \`#2d2620\`. 艺术 / 设计 / 时尚。

【布局 — 10 个磁带式版式池, 可复用; **数量由【用户内容】决定**, 完整覆盖每个要点; 短内容 6-12 张起步, 长内容应更多 (同一版式可在不同章节重复使用)】
- **L01 Hero Cover** — 居中大字 hero typography + kicker + subtitle + lead paragraph + 底部元数据 row。
- **L02 Act Divider** — kicker + 8.5-10vw 巨大 headline + 一句引言; 章节切换可反色 (ink ↔ paper)。
- **L03 Big Numbers Grid** — 3×2 数据卡 (label / 大数字 / 注释)。
- **L04 Quote + Image** — 左 kicker + headline + body + callout; 右 16:10 图 (基线对齐 baseline 不是 top)。
- **L05 Image Grid** — 3×2 或 3×1 等高图网格 (26vh 或 22vh); 严格统一高度。
- **L06 Pipeline / Flow** — 横向编号步骤组, 每步: №X + 标题 + 描述; 支持键盘逐步推进。
- **L07 Hero Question** — 7vw 全屏单一问句, 按语义断行, 周围极简。
- **L08 Big Quote** — 5.8vw 巨大衬线引文 + 英文翻译 + 署名 + 日期。
- **L09 Before / After** — 1:1 split; 左列 opacity .55 (旧/before); 右列 full brightness (新/after)。
- **L10 Mixed Media** — 8:4 比例; 左大段文字 (kicker / headline / body / callout) + 右 3:4 竖图作辅助。

【设计细节】
- **严禁**: 渐变 / drop-shadow / 圆角 / 圆形装饰 / blur / SVG 图标库 / emoji 装饰。
- **字体**: Display 用 \`Playfair Display\` (英) / \`Noto Serif SC\` (中); Body 用 \`Inter\` / \`Noto Sans SC\`; 编号 / 数字偶尔可用 italic 衬线。
- **杂志感细节**: kicker 用 11px uppercase letterspacing 0.12em; folio 右下角 \`01 / 12\`; 顶部细 hairline rule + 期刊 logo / topic。
- **不许**: 数据捏造、Lorem ipsum、占位图片 URL。所有图请用纯 CSS / SVG 内联描绘 (色块 + 简笔)。
- 键盘 ← / → 切换; hash 同步; 单文件 HTML。`,
		enName: "Guizang Editorial E-Ink Deck",
		scenario: "marketing",
		aspectHint: "16:9 横向翻页",
		tags: ["editorial","e-ink","magazine","narrative","guizang"],
	},
	{
		id: "deck-dir-key-nav",
		name: "极简方向键 Keynote",
		icon: "▶︎",
		description: "8 页单色背景, 160px display + 4px accent + Mono 箭头列表",
		category: "slides",
		body: `【模板: 极简方向键 Keynote】
【意图】“有话要说但没什么可看” 的极简 keynote。
【布局】
- 页数由【用户内容】决定 (短内容 8 页起步, 长内容应更多); 每页单色背景, 从下列调色板里循环选取 (靛 / 奶 / 绛 / 翠 / 灰 / 紫 / 白 / 炭), 同色可复用
- 160px display 标题 + 4px 短粗 accent 线
- 箭头 → 前缀的 Mono 列表
- 左下 ← → kbd 提示 + 右下页码`,
		enName: "Dir-Key Nav Minimal Deck",
		scenario: "personal",
		aspectHint: "16:9",
		tags: ["minimal","kbd","monocolor"],
	},
	{
		id: "deck-tech-sharing",
		name: "技术分享 Deck",
		icon: "💻",
		description: "GitHub-dark + JetBrains Mono + 终端代码块, 含 agenda + Q&A",
		category: "slides",
		body: `【模板: Tech Sharing Deck】
【意图】工程内部分享 / 会议 talk 的 deck。
【布局】
- Cover (议题 + 讲者 + handle)
- Agenda 页
- 正文页若干 (代码块 + 关键观点)
- Demo 页 (terminal 截图)
- Q&A 页
【设计细节】
- GitHub-dark 配色 + JetBrains Mono`,
		enName: "Tech Sharing Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["tech talk","conference","engineering"],
	},
	{
		id: "deck-course-module",
		name: "课程 / 培训 Deck",
		icon: "🎓",
		description: "暖纸背景 + Playfair, 左侧学习目标常驻, 含 MCQ 自测页",
		category: "slides",
		body: `【模板: 课程 / 培训模块 Deck】
【意图】教学 / workshop 用 deck, 持续显示学习目标。
【布局】
- Cover (模块名 + 讲师)
- Learning objectives 列表 (左侧持续显示)
- 正文页 (concept + 例子)
- MCQ 自测页
- Wrap-up + 下一模块预告
【设计细节】
- warm paper bg + Playfair serif`,
		enName: "Course Module Deck",
		scenario: "education",
		aspectHint: "16:9",
		tags: ["course","workshop","training","教学"],
	},
	{
		id: "deck-blueprint",
		name: "蓝图架构 Deck",
		icon: "📐",
		description: "奶油纸 + 锈红 + 蓝图网格 mask + 黑边硬卡片 + pipeline 盒",
		category: "slides",
		body: `【模板: Knowledge Arch Blueprint Deck】
【意图】认真的、印刷友好的架构 / pipeline 讲解 deck。
【布局】
- 奶油 #F0EAE0 底 + 蓝图 48px 网格 mask
- Pipeline 步骤盒 (其中一个抬高)
- 右侧锈红 #B5392A insight callout
- Playfair serif 大字 + SVG 虚线反馈环
【设计细节】
- 零渐变零软阴影`,
		enName: "Knowledge Arch Blueprint",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["blueprint","architecture","engineering"],
	},
	{
		id: "deck-xhs-pastel",
		name: "马卡龙慢生活 Deck",
		icon: "🍡",
		description: "奶油底 + 柔光 blob + 马卡龙圆角卡片 + Playfair 斜体序号",
		category: "slides",
		body: `【模板: 马卡龙慢生活 Deck】
【意图】生活方式 / 个人成长 / 情绪向内容用 deck。
【布局】
- 奶油 #fef8f1 底 + 三个柔光 blob
- Playfair 斜体衬线 display + sans 正文
- 28px 圆角马卡龙卡片 (桃 / 薄荷 / 天 / 紫 / 柠 / 玫)
- Playfair 斜体 01-04 序号
- SVG donut 图 + chip+page 顶栏`,
		enName: "Pastel Slow-life Deck",
		scenario: "personal",
		aspectHint: "16:9",
		tags: ["xhs","pastel","lifestyle","lifestyle"],
	},
	{
		id: "deck-swiss-international",
		name: "瑞士国际主义 Deck",
		icon: "🟦",
		description: "16 列网格 + 单一饱和 accent + 22 个锁死版面 (Klein Blue / Lemon / Mint / Safety Orange)",
		category: "slides",
		body: `【模板: 瑞士国际主义 Deck (Swiss International)】
【意图】事实、产品、分析、方法论表达。极度冷静、理性、学院派, 没有任何手绘 / 噪点 / 装饰。Inspired by op7418/guizang-ppt-skill Style B。

【主题】**只能从下面 4 套二选一, 不许混用、不许改 hex**:
- 🔵 **Klein Blue (IKB)** — accent \`#002FA7\`, paper \`#fafaf8\`, ink \`#0a0a0a\`. 商业 / AI / 设计场景。
- 🟡 **Lemon Yellow** — accent \`#FFD500\`, paper \`#f7f5ee\` (淡奶油), ink \`#0a0a0a\`. 年轻 / 零售 / 体育。文字必须用黑色 (不能白色)。
- 🟢 **Lemon Green / Neon** — accent \`#C5E803\`, paper \`#f7f5ee\`, ink \`#0a0a0a\`. 可持续 / 科技初创 / Gen-Z 品牌。文字必须用黑色。
- 🟠 **Safety Orange** — accent \`#FF6B35\`, paper \`#f7f5ee\`, ink \`#0a0a0a\`. 工业 / 汽车 / 紧急消息。文字用白色 + bold ≥ 600。

【布局 — 22 个可复用版式池, 不许新增或改造版式; **数量由内容决定**, 把【用户内容】完整覆盖完为止 (短内容 6-10 张起步, 长内容应远超此范围, 同一版式可在不同章节重复使用)】
- **S01 Cover** — 全屏 accent + ASCII 呼吸点阵 + 反白标题 + 元数据 chrome (date / № / topic)。
- **S02 Vertical Timeline** — 左侧虚线轴 + 圆点; 右侧节点 = 年份 + KPI + 描述。
- **S03 Statement** — 9.6vw 居中巨字 + 左侧大段留白 + 底部 hairline + 注释。
- **S04 Six Cells** — 2×3 网格, 每格: icon + 编号 + 短标题 + 单行描述。
- **S05 Three Sub-cards** — 左侧 hero 标题 + 右侧 3 张水平堆叠的灰色卡。
- **S06 KPI Tower** — 4 列变高蓝色柱状; 柱顶 icon; 柱底大数字 + 标签。
- **S07 H-Bar Chart** — 水平排名横条, 宽度反映数据, 末端标数字。
- **S08 Duo Compare** — 垂直分割线; 左 Before / 右 After。
- **S09 Closing Manifesto** — 左 IKB 块 + ASCII 点阵 + 宣言; 右白底 + 3 条要点。
- **S10 Dot Matrix Statement** — 居中宣言 + 角落几何点矩阵 / 圆环矩阵。
- **S11 Horizontal Timeline** — 顶部 headline, 中部 hairline 轴, 等距节点, 节点下方步骤名。
- **S12 Manifesto + Ink Banner** — 上半 headline + 解释; 下半全宽黑色横幅 + 反白小字。
- **S13 Three Forces Cards** — 左 ink hero 块; 右 3 张灰色卡, 每卡: 大数字 + 文本。
- **S14 Loop Diagram** — 左编号步骤; 右 SVG 同心环; 中心 "LOOP" 标签。
- **S15 Image Matrix + Hero Stat** — 4×3 等高卡片 (12 项) + 底部 summary 大数字 + 标签。
- **S16 Multi-card Brief** — 3×2 微卡; 主文左上, 注脚右下, 单卡 accent 高亮。
- **S17 System Diagram** — 左 headline + 3 段描述; 右 SVG 三同心圆 + 外部标签。
- **S18 Why Now** — 3 列, 每列: category label + headline + 描述 + 底部数字 (最后一列 accent)。
- **S19 Four Cards** — 顶部 accent hairline + headline + 4 张等宽卡 (元数据 / 标题 / 正文)。
- **S20 Stacked KPI Ledger** — 垂直行 + hairline 分隔; 左大数字 / 中标签 / 右 icon。
- **S21 Tech Spec Sheet** — 左标题块 / 中 3 个 KPI hairline / 右变高柱 / 底数据。
- **S22 Image Hero** — 上 60% 全宽图 + 白色标题块覆盖; 下 40% 解释 + 3 列 KPI。

【设计细节 — 绝对铁律】
- **只用直角**: 全程 \`border-radius: 0\`。圆角 = 立刻违反。
- **1px hairline borders**, 黑色或 accent; 严禁阴影 / 渐变 / blur。
- **16 列网格**: \`grid-template-columns: repeat(16, 1fr); gap: 0\`。
- **字体**: Inter Tight (Latin display) / Inter (body) / Noto Sans SC (中文) / JetBrains Mono (数据); 严禁衬线、严禁装饰字体。
- **字号极端反差**: cover 用 9.6vw display, body 14-16px, label 11px uppercase letterspacing 0.08em。
- **键盘 ← / → 切换 + hash 同步**; 角标固定: \`№N/N\` 右下, topic 标签左下。
- **不许编造**: 数字必须来自用户输入, 图表柱高 = 真实数据按比例。
- 输出单文件 HTML, 不用任何外部图片 URL; 装饰几何 (ASCII 矩阵 / 同心圆) 用纯 CSS 或内联 SVG。`,
		enName: "Swiss International Deck",
		scenario: "marketing",
		aspectHint: "16:9 横向翻页",
		tags: ["swiss","grid","international","ikb","editorial","facts"],
	},
	{
		id: "deck-simple",
		name: "通用 Simple Deck",
		icon: "▫️",
		description: "通用 horizontal-swipe HTML deck, 不要 magazine 调",
		category: "slides",
		body: `【模板: Simple Deck】
【意图】干净通用的 horizontal-swipe deck (pitch / overview / study)。
【布局】
- Cover + N 个 content 页 + 收尾 (N 由【用户内容】长度决定, 完整覆盖每个要点; 短内容 6-10 起步, 长内容应更多)
- 每页一个核心信息 + 1 张图 / 1 个图表
- 顶部 progress bar
【设计细节】
- 键盘 ← / → 切换 + hash 同步`,
		enName: "Simple Deck",
		scenario: "product",
		aspectHint: "16:9",
		tags: ["deck","simple","swipe"],
	},
	{
		id: "deck-pitch",
		name: "投资人 Pitch Deck",
		icon: "🚀",
		description: "10 页融资 deck, 白底 + 蓝紫渐变 hero, traction 柱状, $X.XM ask",
		category: "slides",
		body: `【模板: Investor Pitch Deck】
【意图】10 页投资人 ready 的 fundraising deck。
【布局】
- Cover (Logo + Tagline + Round/$Ask)
- Problem · Solution · Why Now
- Product (截图占位)
- Market size (TAM/SAM/SOM)
- Traction (柱状图大数字)
- Business model
- Go-to-market
- Team
- Ask: $4.5M-style page
- Thanks / Contact`,
		enName: "Investor Pitch Deck",
		scenario: "finance",
		aspectHint: "16:9 ×10",
		tags: ["pitch","investor","seed","vc"],
	},
	{
		id: "weekly-update",
		name: "团队周报 Deck",
		icon: "🗓️",
		description: "6-8 页横向滑动周报: 已发布 / 进行中 / 阻塞 / 指标 / 求助",
		category: "slides",
		body: `【模板: 团队周报 Deck】
【意图】6-8 页 horizontal-swipe slides, 周报固定结构。
【布局】
- Cover (周次 + 团队 + 一句话主题)
- Shipped (列表 + owner)
- In flight (进度条)
- Blocked (红色 callout)
- Metrics (KPI 卡片网格 + 周对比)
- Asks (求助清单)
- Thanks 收尾
【设计细节】
- 键盘左右切换, hash 同步`,
		enName: "Weekly Update Deck",
		scenario: "operations",
		aspectHint: "16:9 ×8",
		tags: ["weekly","周报","status"],
	},
	{
		id: "deck-xhs-post",
		name: "小红书图文 Deck",
		icon: "🎀",
		description: "9 页 3:4 竖版图文, 暖 pastel + 虚线 sticker 卡片",
		category: "slides",
		body: `【模板: 小红书 / Instagram Carousel】
【意图】发小红书 / IG carousel 的 9 页 3:4 竖版图文。
【布局】
- Cover + N 个 content 页 + 收尾 CTA (N 由【用户内容】决定, 完整覆盖每个要点; 短内容 7 页起步, 长内容应更多, 受小红书平台单帖图片数约束建议总数 ≤ 18)
- 暖色 pastel 背景
- 虚线 sticker 卡片 + 底部页码 dots`,
		enName: "Xiaohongshu Post Deck",
		scenario: "marketing",
		aspectHint: "810×1080 ×9",
		tags: ["xhs","instagram","carousel"],
	},
	{
		id: "deck-presenter-mode",
		name: "演讲者模式 Deck",
		icon: "🎤",
		description: "tokyo-night 默认主题, T 切换 5 主题, S 打开提词器 popup",
		category: "slides",
		body: `【模板: Presenter Mode Deck】
【意图】怕忘词的演讲者专用 deck, 含逐字稿 notes 与 popup teleprompter。
【布局】
- 每页 + \`<aside class="notes">\` 150-300 字稿
- 右下小 toolbar: T 切主题 / S 打开 popup
- Popup: CURRENT / NEXT / SCRIPT / TIMER 四张磁吸卡
【设计细节】
- 默认 tokyo-night; 共 5 套主题 (含 light)`,
		enName: "Presenter Mode Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["presenter","notes","提词","teleprompter"],
	},
	{
		id: "deck-magazine-web",
		name: "杂志风网页 PPT",
		icon: "📰",
		description: "电子杂志 × 电子墨水风, WebGL 流体背景 + 衬线 display",
		category: "slides",
		body: `【模板: 杂志风网页 PPT (magazine-web-ppt)】
【意图】horizontal-swipe HTML deck, 杂志 × e-ink 调。
【布局】
- Cover (衬线 display + WebGL 流体背景)
- 章节幕封页
- 数据大字报页 (一个巨数字 + 一句解释)
- 图片网格页
- 金句页 (Sunday-paper 风)
【设计细节】
- 字体: Playfair / Noto Serif SC display + Inter / 思源 sans body
- 键盘 ← / → 切换; hash 同步`,
		enName: "Magazine Web Deck",
		scenario: "marketing",
		aspectHint: "16:9 横向翻页",
		tags: ["magazine","editorial","e-ink","horizontal swipe"],
	},
	{
		id: "deck-hermes-cyber",
		name: "Cyber Terminal Deck",
		icon: "🟢",
		description: "黑底 + CRT 网格扫描线 + $ 命令行标题 + 薄荷绿大字 + 三档 tag",
		category: "slides",
		body: `【模板: Hermes Cyber Terminal Deck】
【意图】CLI / agent / dev tool 测评 deck (含 trace, diff, benchmark)。
【布局】
- #0a0c10 黑底 + 56px 赛博网格 + CRT 暗角
- 窗口红绿灯 chrome + \`$ prompt\` 标题
- 薄荷绿 #7ed3a4 大字 + JetBrains Mono
- Stroke-only 柱状图 + blinking 光标
- 琥珀 / 绿 / 红 三档 tag`,
		enName: "Hermes Cyber Terminal Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["cyber","terminal","review","cli"],
	},
	{
		id: "deck-obsidian-claude",
		name: "GitHub Dark 紫渐变 Deck",
		icon: "🌃",
		description: "GitHub-dark + 紫蓝环境光 + 三色渐变标题 + GitHub 风代码",
		category: "slides",
		body: `【模板: Obsidian Claude Gradient Deck】
【意图】类 GitHub Blog / Linear Changelog 的开发者教程 deck。
【布局】
- GitHub-dark #0d1117 + 紫蓝 radial 环境光 + 60px 网格 mask
- 居中布局 + 紫色 pill tag
- 三色渐变标题 (#a855f7→#60a5fa→#34d399)
- GitHub 风代码 palette + 紫色左边框高亮块`,
		enName: "Obsidian Claude Gradient Deck",
		scenario: "engineering",
		aspectHint: "16:9",
		tags: ["github","dark","purple","mcp","agent"],
	},
	{
		id: "ppt-keynote",
		name: "Keynote 风格 PPT",
		icon: "🎬",
		description: "苹果 Keynote 级别幻灯片, 一屏一卡, 键盘左右切换",
		category: "slides",
		body: `【模板: Keynote 风格 PPT】
- 每张幻灯片是一个 \`<section class="slide">\`, 整体宽 1280 高 720, 居中显示, 背景渐变。
- 单页内容极简: 大标题 + 1-3 行支持文字; 或一张数据图; 或一个金句。
- 字号: 标题 \`text-7xl font-semibold tracking-tight\`, 副标题 \`text-2xl text-neutral-500\`。
- 第一页是封面 (主题 + 演讲者 / 日期), 最后一页是 "Thanks." 或行动号召。
- 顶部右上角小指示器: 当前页 / 总页数。
- 加一段 JavaScript 监听 ArrowLeft / ArrowRight / 空格键切换 slide; 同时维护 hash (#/3)。
- 每页之间用 fade-in 动画。
- 保持留白, 数据卡片用 grid 布局对齐, 颜色克制。`,
		enName: "Keynote-style Slides",
		scenario: "marketing",
		aspectHint: "16:9 (1280×720)",
		tags: ["slides","deck","presentation","幻灯片","演讲"],
	},
	{
		id: "deck-replit",
		name: "Replit Slides 风 Deck",
		icon: "🟣",
		description: "Replit Slides 八套主题 (helix/holm/vance/bevel/world/atlas/bluehouse)",
		category: "slides",
		body: `【模板: Replit Slides Style Deck】
【意图】Replit Slides 风的单文件 horizontal-swipe deck, 选 1 套主题不混用。
【布局】
- Pick one theme: helix / holm / vance / bevel / world-dark / world-mint / atlas / bluehouse
- Cover + agenda + N 个 content + 收尾 (N 由【用户内容】长度决定, 完整覆盖每个要点; 短内容 6-10 起步, 长内容应更多)
【设计细节】
- 每套主题有完整调色板 + 字体 + accent, 不要混用`,
		enName: "Replit Slides Deck",
		scenario: "product",
		aspectHint: "16:9",
		tags: ["replit","themed","memo"],
	},
	{
		id: "frame-flowchart-sticky",
		name: "便利贴流程图帧",
		icon: "📝",
		description: "SVG 曲线连接 + 便利贴节点 + 光标交互, 像白板 brainstorm",
		category: "video",
		body: `【模板: 便利贴流程图帧 (Sticky Flowchart)】
【意图】把一个流程 / 系统 / 工作流画成"白板 + 便利贴"的样子, 适合 onboarding 视频、运营流程说明、系统架构讲解。Inspired by hyperframes flowchart。

【画布】1920×1080。背景: 米黄白板纸 \`#f4ede1\` 或冷灰白板 \`#f0f2f4\`; 加非常浅的 hex grid \`rgba(0,0,0,0.04)\` 让它有白板感。

【节点 (Sticky Notes)】
- 每节点 = 一张 240×180px 便利贴, 4 套颜色随机分配: 黄 \`#fcd34d\` / 桃 \`#fca5a5\` / 薄荷 \`#a7f3d0\` / 天 \`#a5b4fc\`。
- 便利贴有轻微旋转 \`transform: rotate(±2deg)\` 不一致, 投影 \`drop-shadow(0 6px 14px rgba(0,0,0,0.12))\`, 顶部胶带 \`linear-gradient(...)\` 装饰。
- 节点内容: 1 个 emoji 或单线 SVG icon + 大字标题 (16-20px) + 一行描述 (12px)。
- 节点字体: \`Kalam\` / \`Caveat\` / \`Patrick Hand\` 手写感字体 (中文用 \`霞鹜文楷\` 或 \`LXGW WenKai Screen\`)。

【连接线 (SVG)】
- 用 \`<path>\` Bezier 曲线连接节点, stroke \`#2a2a2a\`, width 2.5, \`stroke-linecap: round\`, \`stroke-dasharray: 0\` (实线) 或 \`8 6\` (虚线 = 条件分支)。
- 箭头终端用 \`marker-end\`, 黑色三角小箭头。
- 复杂节点可有循环或分支: 同一节点连出 2 条 (分叉) 或 2 条进入一节点 (合并)。

【可选交互】
- 顶部 caption (sans, 12px uppercase): "FLOW · MIGRATION · 2026"。
- 鼠标 hover 节点: 抬起阴影 + scale 1.05, 用 CSS transition。
- 一个"光标"装饰 (\`<svg>\` arrow + name tag), 浮在某节点旁, 模拟 figma 协作光标。

【设计细节】
- 至少 5 个节点, 最多 12 个。
- 节点排布不要全部居中对齐, 要有一点白板风的"随手贴"感, 但保证连接线清晰不交叉。
- 严禁: 全屏深色背景、霓虹色、企业 dashboard 风格。
- 字体不能用 Inter / 衬线, 必须手写感。
- 单文件 HTML, 不要外部图标库 (用 inline SVG)。
- 必须用用户的真实流程内容; 节点文字直接来自用户输入。`,
		enName: "Sticky Flowchart Frame",
		scenario: "operations",
		aspectHint: "1920×1080 (16:9)",
		tags: ["flowchart","diagram","sticky","whiteboard","frame"],
	},
	{
		id: "motion-frames",
		name: "动效英雄帧",
		icon: "🌀",
		description: "可循环 CSS 动效组合: 旋转环、地球仪、计时器、视差标签",
		category: "video",
		body: `【模板: Motion 帧 / Hero Loop】
【意图】一帧带循环动效的 hero, 可作为视频片头或落地页大图。
【布局】
- Rotating type ring (SVG + transform)
- Animated globe / 抽象几何
- Ticking timer (mono 字体, JS 可有可无)
- Parallax labels 浮动
【设计细节】
- 纯 CSS 动效, 流畅可循环
- 电影感调色 + 1 个霓虹 accent`,
		enName: "Motion Frames",
		scenario: "marketing",
		aspectHint: "桌面 hero",
		tags: ["motion","title card","loop","video poster"],
	},
	{
		id: "frame-glitch-title",
		name: "故障艺术标题帧",
		icon: "⚡",
		description: "数字故障 / 像散偏移 / 数据腐败标题, 适合视频转场 / cyberpunk hero",
		category: "video",
		body: `【模板: 故障艺术标题帧 (Glitch Title)】
【意图】单帧 hero / 视频转场 / cyberpunk 风格标题。Inspired by hyperframes glitch。

【画布】1920×1080, 背景 \`#070708\` 近黑或 CRT 暗灰 \`#0d0e10\`; 加 56px 网格 (透明 5%) + scanlines 横线 (透明 8%, 2px 间隔)。

【主标题】
- 居中, 6-9vw, weight 800/900, 字体 \`Space Grotesk Bold\` / \`Inter Tight Black\` / \`JetBrains Mono Bold\`。
- 颜色: 主层 \`#f5f5f7\`; 后面套 2 层伪影:
  - cyan \`#00f0ff\` translate(\`-3px\`, \`1px\`)。
  - magenta \`#ff2bd6\` translate(\`3px\`, \`-1px\`)。
- 整层加 clip-path 切片 5-8 段, 每段 \`@keyframes\` 随机 translateX -10px → 10px, 持续 80-160ms, 错峰播放, 营造 "data corruption" 像散。
- 每隔 1.5s 触发一次"重故障" — 整个标题被 horizontal smear 1 frame, 用 \`filter: url(#displacementFilter)\` 或简单 CSS 平移。

【附加层】
- 顶部一行 caption (uppercase mono, 11px, opacity 0.6): \`>> SIGNAL_LOST · CH-04 · 14:32:08\`。
- 标题下面 1 行副标 (24-28px, mono, opacity 0.7), 偶发被 \` ̶▒̶\` 字符替换 (假乱码)。
- 角落随机点缀 \`█▓▒░\` ASCII 噪点 chunks。
- 底部 timecode (mono, opacity 0.4)。
- 整画面叠 noise grain 层 \`background-image: url("data:image/svg+xml,...turbulence...")\`, opacity 6%, mix-blend-mode overlay。

【SVG 滤镜 (可选)】
- 定义 \`<filter id="rgbShift">\` 用 \`feColorMatrix\` + \`feOffset\` + \`feMerge\` 把 R/G/B 三通道偏移; 整层 \`filter: url(#rgbShift)\` 在故障瞬间应用。

【设计细节】
- 颜色仅用: 黑 / 白 / cyan / magenta / 一点 amber 警告色; 严禁全彩虹。
- 字体: 西文 \`Space Grotesk\` 或 \`JetBrains Mono\` Bold; 中文 \`Noto Sans Mono CJK SC\` 或 \`Noto Sans SC\` Bold。
- 严禁 lorem ipsum; 必须用用户的标题 + 副标。
- 动效用 \`@keyframes\`, 可被 \`prefers-reduced-motion\` 关闭 (退回静态 chromatic split)。
- 单文件 HTML。`,
		enName: "Glitch Title Frame",
		scenario: "video",
		aspectHint: "1920×1080 (16:9)",
		tags: ["glitch","cyberpunk","title","transition","vfx","frame"],
	},
	{
		id: "frame-light-leak-cinema",
		name: "胶片漏光电影帧",
		icon: "🎞️",
		description: "胶片漏光 + 颗粒噪点 + 16:9 letterbox + 衬线大字, 电影感开场 / 章节卡",
		category: "video",
		body: `【模板: 胶片漏光电影帧】
【意图】纪录片 / 个人短片 / 视频章节卡的开场单帧 —— 暖橙漏光 + 35mm 颗粒 + 衬线大字, 古典胶片质感。Inspired by hyperframes light-leak。

【画布】
- **2.39:1 letterbox** (推荐): 1920×800, 上下黑边各 140px (\`#000\`)。
- 或 16:9: 1920×1080, 无 letterbox。

【背景】
- 底层: 深暖色 (深红棕 \`#1a0d08\` / 墨绿 \`#0a1410\` / 蓝紫 \`#0d0e1a\`) 或场景描绘 (CSS gradient 模拟天空 / 室内 / 室外)。
- **胶片漏光 (Light Leak)**: 2-3 个大 \`radial-gradient(ellipse at top right, #ffb547 0%, transparent 50%)\` + 1 个底部 \`linear-gradient(to top, #d97757 0%, transparent 30%)\`; 颜色取暖橙 / 桃 / 玫红 / 暗黄, **不要冷蓝**。
- **35mm Grain**: 全屏覆盖 SVG turbulence noise 图层, opacity 14%, \`mix-blend-mode: overlay\`; 也可用 \`background-image: url("data:image/svg+xml,...feTurbulence...")\`。
- 可选: 1 道 \`feDisplacementMap\` 模拟胶片摆动 (慎用)。

【文字】
- 中央或左下: 大字衬线 (Source Serif Pro / Playfair Display / EB Garamond) 5-8vw, weight 500 italic; 颜色暖白 \`#f5e9d6\` 或 cream。
- 副标 (24-28px) 一行, opacity 0.7, 同样衬线。
- 角落 caption (uppercase letterspace 0.18em, 10-11px, mono, opacity 0.5): "REEL 03 · CH I · 1985"。
- 底部 timecode + 拍摄地 + 日期 (mono, opacity 0.4)。

【可选附加】
- "胶片划痕": 几条 1-2px 竖向白线, opacity 0.2, 不规则间距 (用 \`box-shadow\` 多重 inset 或多个 \`<div>\`)。
- "胶片齿孔": letterbox 黑边内, 等距小白方块 (CSS repeating-linear-gradient)。
- 入场动效: 整画面从 underexposed (brightness 0.3) → normal, 800ms 内; 漏光位置缓慢漂移 12s 一个周期。

【设计细节】
- 颜色绝不超过 4 个色相 (深背景 + 2 个暖漏光色 + 文字 cream)。
- 严禁: 蓝紫漏光 (违反胶片质感)、emoji、霓虹色、几何 dashboard 装饰。
- 中文: \`Noto Serif SC\` italic 不存在 → 用 \`Noto Serif SC\` regular + 字距加大。
- 必须用用户提供的标题; 自动估算合理"年份 / 章节 / 地点" 元数据 (但来源用户内容)。
- 单文件 HTML, 用 \`prefers-reduced-motion\` 关动效。`,
		enName: "Light-Leak Cinematic Frame",
		scenario: "video",
		aspectHint: "2.39:1 letterbox (1920×800) 或 16:9 (1920×1080)",
		tags: ["cinema","film","light-leak","grain","letterbox","frame"],
	},
	{
		id: "frame-logo-outro",
		name: "品牌 Logo 收尾帧",
		icon: "🎬",
		description: "Logo 分块组装入场 + glow bloom + tagline 揭示, 适合视频片尾 / 品牌闭幕",
		category: "video",
		body: `【模板: Logo 收尾帧 (Logo Outro)】
【意图】视频结尾的品牌 reveal 帧 —— logo 分块拼装 + glow bloom + tagline 上浮 + CTA。Inspired by hyperframes logo-outro。

【画布】1920×1080, 黑色 \`#08090c\` 或品牌深色背景; 加微妙 vignette \`radial-gradient(...)\` 让中心更亮。

【布局】
- **中心 Logo**: 用 CSS / 内联 SVG 绘制; 由 4-8 个几何块 (圆 / 方 / 三角 / hairline) 组成。
  - 入场动画: 每个块从屏幕外滑入 (±100px 不同方向) + scale 1.4→1.0 + opacity 0→1, 错峰 80ms; 总时长 1.2s。
  - 入场完成后, 整个 logo 加 glow bloom: \`filter: drop-shadow(0 0 24px <accent>40)\`; 同时一道 shimmer \`mask-image\` 横扫 logo (500ms)。
- **品牌名**: logo 下方 6-8% 位置, 大字 (Inter Tight / SF Pro Display, 48-72px, weight 700, letter-spacing -0.02em), 入场: typewriter or fade-up after logo bloom (1.4s 开始)。
- **Tagline**: 品牌名下方一行 (24-28px, weight 400, opacity 0.7), fade in (1.8s)。
- **底部 CTA + 元数据**: 双行底部 row, 例如 \`htmlanything.dev · @htmlanything · 2026\`, 11px uppercase letter-spacing 0.16em, 颜色 opacity 0.4, hairline 分隔。

【调色 — 4 选 1, 不混用】
- 🌌 **Midnight Indigo** — bg \`#08090c\`, accent \`#7c5cff\` (霓虹紫蓝 glow)。
- 🌅 **Solar Amber** — bg \`#0e0a08\`, accent \`#ffb547\` (暖琥珀)。
- 🌿 **Forest Mint** — bg \`#0a1410\`, accent \`#5fb38a\` (薄荷绿)。
- ⚪ **Bone & Ink** — bg \`#f1efea\`, accent \`#0a0a0b\` (无 neon, 走 editorial 风, glow 改成阴影)。

【设计细节】
- **绝不**: 用外链 logo 图片; logo 必须用纯 CSS / 内联 SVG 几何绘制。
- 入场动画用 \`@keyframes\` + \`animation-delay\`; 可被 \`prefers-reduced-motion\` 关闭。
- 字体: 西文 \`Inter Tight\` / \`SF Pro Display\` / \`Manrope\`; 中文 \`Noto Sans SC\` weight 700。
- 必须用用户提供的品牌名 + tagline; 若没有, 跑 fallback "HTML Anything" / "Anything → beautiful HTML"。
- 单文件 HTML; 整个动画完成后 freeze (不要 loop, 这是视频结尾帧)。
- 顶部可选 5px ribbon (accent 色) 增加品牌识别。`,
		enName: "Logo Outro Frame",
		scenario: "video",
		aspectHint: "1920×1080 (16:9)",
		tags: ["logo","outro","branding","end-card","frame"],
	},
	{
		id: "video-hyperframes",
		name: "Hyperframes 视频脚本",
		icon: "🎞️",
		description: "Hyperframes / Remotion 兼容的连续帧动画, 可自动播放",
		category: "video",
		body: `【模板: Hyperframes 视频帧】
- 输出 N 个连续 \`<section class="frame">\`, 每个 \`w-[1920px] h-[1080px]\`; N 由【用户内容】信息密度决定 (短脚本 6-10 帧起步, 长脚本应更多, 每帧只承载一个镜头/概念)。
- 每帧表达一个镜头/概念: 文字 + 视觉构图 (中央构图 / 黄金分割 / 三分法)。
- 每帧底部隐藏标记 \`<!-- frame:N duration:3000 transition:fade -->\` 供后续 Remotion / Hyperframes 渲染脚本读取。
- 顶部加一段 JavaScript 自动播放: 每 3 秒切换到下一帧, 也支持点击 / 方向键控制; 角落显示进度条。
- 第 1 帧是 hook (一个数据 / 一个反常识 / 一个问题), 第 2-N 是论证, 最后是结论 + CTA。
- 字号巨大 (text-9xl), 一句话即可, 不要堆砌。
- 配色统一一套电影感 (深色背景 + 1 个霓虹强调色)。
- 输出最后包含一段简短注释 \`<!-- HYPERFRAMES_META: ... -->\`, 包含每帧 duration / transition / sceneSummary 的 JSON 元数据, 用于后续转 Remotion。`,
		enName: "Hyperframes Video",
		scenario: "video",
		aspectHint: "1920×1080 (16:9)",
		tags: ["video","hyperframes","remotion","视频"],
	},
	{
		id: "frame-data-chart-nyt",
		name: "NYT 风数据图表帧",
		icon: "📈",
		description: "NYT-newsroom 排版 + 错峰揭示动画 + 编辑级图表 (折线/柱/范围带)",
		category: "video",
		body: `【模板: NYT 风数据图表帧】
【意图】把一段数据 (CSV / JSON / 一句结论) 做成《纽约时报》专栏感的单帧/动画图表, 适合视频片段或推特卡。Inspired by hyperframes data-chart。

【画布】1920×1080, 暖白底 \`#f7f5ee\` 或墨黑底 \`#0e0e0e\` 二选一; 文字色和背景相反。

【布局】
- **顶部 kicker** (11px uppercase letterspace 0.14em, 颜色 = accent 红 \`#a91d1d\` 或 mint \`#5fb38a\`): 数据来源 + 类目, 如 "GLOBAL · WEEKLY ACTIVE USERS · 2018–2026"。
- **大字标题** (Cheltenham / Playfair / Source Serif Pro, 5.6vw, italic 副标可选): 一句结论。**结论必须从用户数据中提炼**, 不是描述图。
- **图表区** (占画布 55-65%):
  - 折线: 1-2 条线, 主线 ink 实心 2.5px, 次线 dashed 1.5px; 数据点用 6px 实心圆; 关键点旁标注 \`2024 · 412M\` 黑色 mono 小字。
  - 柱状: 全部 ink 单色或加 1 道 accent 高亮柱; 柱顶大数字; 柱底类目斜体 (Cheltenham italic)。
  - 范围带 (range band): 浅灰填充 \`#e6e2d2\` 包络 + 中线 ink。
- **底部 source + footnote** (10px mono, opacity 0.6): "Source: 用户数据 · Chart by html-anything"。
- **错峰揭示动画**: 标题 fade-in (0s), kicker (200ms), 折线 stroke-dashoffset 1.2s ease-out (400ms), 数据标签依次 100ms 间隔。可被 \`prefers-reduced-motion\` 关闭。

【设计细节】
- **绝不**: 使用 chart.js / d3 库 (除非 jsdelivr CDN 引入); 推荐手写 SVG, 不超过 80 行 inline。
- 字体: 标题 \`Source Serif Pro\` 或 \`Cheltenham\` (无则用 \`Playfair Display\`); body \`IBM Plex Sans\` 或 \`Inter\`; 数据标签 \`IBM Plex Mono\`。
- 1 个主色 (ink) + 1 个 accent (NYT red \`#a91d1d\` / 编辑 mint \`#5fb38a\` / 暖橙 \`#d97757\` 三选一)。
- Y 轴刻度仅 hairline + 3-4 个 tick, 标签在轴外侧 mono 字。
- 严禁 grid 全屏铺线、阴影、3D 立体柱; 严禁 emoji。
- 必须用用户提供的数据。如果输入是文本结论, 自动估算合理坐标 (但要标注 "schematic"); 如果是 CSV/JSON, 直接绘制。
- 单文件 HTML; 数据点旁注释格式: \`<text class="annot">2024 · 412M</text>\`。`,
		enName: "NYT-Style Data Chart Frame",
		scenario: "video",
		aspectHint: "1920×1080 (16:9)",
		tags: ["data","chart","nyt","editorial","frame"],
	},
	{
		id: "vfx-text-cursor",
		name: "VFX 文字光标",
		icon: "✨",
		description: "光标拖光 + 彩色像散射线 + 定向光斑, 适合视频片头逐字揭示金句",
		category: "video",
		body: `【模板: VFX 文字光标 (Text Cursor)】
【意图】视频开场/Hero 帧 —— 光标在画布上"打字", 文字逐字浮现, 后面拖着彩色像散尾迹 + 定向光斑。Inspired by hyperframes vfx-text-cursor。

【画布】1920×1080, 背景 \`#06070a\` 暗哑黑 或 \`#0a0d12\` (有暖偏蓝); 加微妙 vignette。

【内容】
- 一句金句 (中英不限), 居中, 字号 6-8vw, weight 700, 字体 \`Inter Tight\` / \`Source Sans 3\` / \`Noto Sans SC\`。
- 逐字揭示, 每个字符 80ms 间隔; 当前字符后面跟着一个 cursor \`▍\` (或细 vertical bar)。
- 已揭示文字默认白色 \`#f5f5f7\`, opacity 1; 即将揭示位置加 chromatic ghost: 一份 \`text-shadow: 2px 0 #ff3b6f, -2px 0 #00d4ff\` 在 reveal 瞬间, 200ms 内收敛回正常。
- 光标本身: 16px 宽矩形, 颜色 = accent (取 1: hot pink \`#ff3b6f\` / cyan \`#00d4ff\` / amber \`#ffb547\`), 闪烁 \`@keyframes\` 1.0s 周期; 后面拖一条 60-120px 的 motion blur trail (径向渐变到透明)。

【光斑 / 射线】
- 在打字位置附近随机生成 3-5 道**定向光斑** (light leak): 用 \`linear-gradient(45deg, transparent, accent20, transparent)\` 的细长矩形 + \`mix-blend-mode: screen\`, 不规则角度。
- 当文字打完, 整段文字加 0.5s shimmer sweep (光带横扫)。

【字段】
- 顶部 caption (uppercase letterspace 0.18em, 11px, opacity 0.5): "FRAME 01 · OPENING"。
- 文字底下副标 (24-28px, opacity 0.6): 来源 / 章节。
- 右下角 timecode (\`00:03:21\` mono)。

【设计细节】
- **绝不**: 多色彩虹 chromatic (只用 1 个 hot pink + cyan 这种二元像散, 不要 R/G/B 全色)。
- 字体: 西文 \`Inter Tight\` Bold; 中文 \`Noto Sans SC\` Bold; 严禁衬线。
- 动效用 \`@keyframes\` + JS 计时器 (\`setTimeout\` 逐字), 可被 \`prefers-reduced-motion\` 关闭 (直接显示所有字)。
- 必须用用户提供的金句; 不要捏造。
- 单文件 HTML, 不要外链字体以外的资源。`,
		enName: "VFX Text Cursor",
		scenario: "video",
		aspectHint: "1920×1080 (16:9)",
		tags: ["vfx","text","cursor","chromatic","reveal","frame"],
	},
];

/** 获取所有内置 skill 的数量（调试用） */
export const BUILT_IN_SKILL_COUNT: number = 78;
