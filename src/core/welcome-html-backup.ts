// 欢迎页 HTML 备份（2026-06-11）
// 如需回滚，将下面 return 的内容复制回 main.ts 中的 getWelcomeHTML() 函数

export const WELCOME_HTML_BACKUP = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e2e8f0;
}
.welcome {
  text-align: center;
  animation: fadeIn 0.8s ease-out;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.logo-area h1 {
  font-size: 3rem; font-weight: 800; letter-spacing: -0.02em;
  color: #e2e8f0;
}
.logo-area .subtitle {
  font-size: 0.85rem; color: #64748b; letter-spacing: 0.02em;
}
.mode-buttons {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}
.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,0.15);
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 160px;
  position: relative;
}
.mode-btn:hover {
  border-color: rgba(96,165,250,0.4);
  background: rgba(30,41,59,0.7);
  transform: translateY(-2px);
}
.mode-btn .icon {
  font-size: 2rem;
}
.mode-btn .label {
  font-size: 1rem; font-weight: 600; color: #e2e8f0;
}
/* Tooltip */
.mode-btn .tooltip {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 10;
}
.mode-btn:hover .tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
</head>
<body>
<div class="welcome">
  <div class="logo-area">
    <h1>LumiSlate</h1>
    <div class="subtitle">选择 Markdown 笔记，开始编译高定画布</div>
  </div>
  <div class="mode-buttons">
    <div class="mode-btn" data-mode="custom" onclick="selectMode('custom')">
      <div class="tooltip">将 Markdown 转换为幻灯片 / 长文画布<br>支持自定义 CSS 与实时预览</div>
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></div>
      <div class="label">自定义模式</div>
    </div>
    <div class="mode-btn" data-mode="design" onclick="selectMode('design')">
      <div class="tooltip">选择设计风格，由 AI 自动生成精美 HTML 页面<br>支持多种排版模板与实时编辑<br><span style="color:#f59e0b">首次使用需要进入设置配置AI功能</span></div>
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg></div>
      <div class="label">AI模式</div>
    </div>
  </div>
</div>
<script>
function selectMode(mode) {
  window.parent.postMessage({ type: 'lumislate-select-mode', mode: mode }, '*');
}
</script>
</body>
</html>`;
