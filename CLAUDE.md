# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deploy

```bash
# Development (watch mode)
npm run dev

# Production build — outputs dist/main.js + dist/styles.css
npm run build
```

**Deploy to Obsidian**: Copy `dist/main.js`, `dist/styles.css`, and root `manifest.json` into the Obsidian vault's `.obsidian/plugins/obsidian-lumislate/` directory, then reload Obsidian.

## Architecture

LumiSlate is an Obsidian plugin that renders Markdown notes as styled HTML canvases in a custom right-sidebar view. It uses a sandboxed iframe for rendering and supports AI-powered generation.

### Dual-Mode System

The plugin operates in two mutually exclusive modes, switchable via tabs in the view toolbar:

- **Marp ("自定义模式")**: Parses Markdown `---` dividers as slide boundaries. If the body contains `---`, each slide is rendered as a fixed-ratio `<section>` (controlled by frontmatter `size` field: 16:9, 4:3, 1:1) within a vertical-scrolling flex container. If no `---` exists, it falls back to a continuous long-form page with unrestricted height. The `marpSizeBtn` is only enabled when dividers are present (`_hasDividers` state).

- **Design ("AI模式")**: Uses the Skill system to select a design template (blog-post, saas-landing, etc.). AI generates a self-contained HTML document based on the selected skill's prompt body.

### Rendering Pipeline

```
Markdown → extractFrontmatter → assemblePrompt → AI stream → extractHtml
→ injectReverseMappingScript → iframe.srcdoc
```

- **`extractHtml(streamed)`** (`ai_service.ts`): Strips markdown fences, locates `<!DOCTYPE html>`...`</html>`, or wraps raw text as fallback. Used to clean AI output before rendering.
- **`previewHtml(streamed)`**: Same as `extractHtml` but appends closing `</body></html>` tags for incremental iframe rendering during streaming.
- **`injectReverseMappingScript(html)`**: Injects the bidirectional editing script before `</body>` in every rendered page.

### AI Service (`ai_service.ts`)

`compileWithAI(prompt, opts, callbacks)` is the unified entry point:

- **Local path**: Uses `child_process.spawn` to invoke CLI agents (claude, codex, gemini, cursor-agent, deepseek, aider, etc.). Protocols supported: `stdin`, `argv`, `argv-message`. Detected via `PATH` scan in `local_agent.ts`.
- **HTTP path**: Standard OpenAI-compatible SSE streaming (`fetch` + `ReadableStream.getReader`). Works with Kimi, DeepSeek, Claude, Ollama, etc.

Both paths feed into the same `StreamCallbacks` interface (`onDelta`, `onHtml`, `onMeta`, `onError`, `onDone`).

### Prompt Assembly (`skills.ts`)

All AI prompts follow this structure:

1. `SHARED_DESIGN_DIRECTIVES` — shared design constraints (Tailwind CDN, typography rules, no external images, etc.)
2. Optional extra prefix (e.g., Marp frontmatter directives)
3. Skill `body` (template-specific instructions)
4. User content

Marp mode uses `MARP_BODY` instead of a skill template.

### Caching (`cache_manager.ts`)

`CacheManager` stores generated HTML in the plugin directory (`{pluginDir}/cache/`). Cache key is a FNV-1a hash of `content + '|' + prompt`. Cache includes metadata (theme, prompt, created timestamp). The `updateCacheText()` method patches cached HTML after a reverse-mapping edit without full re-render.

### Preprocessing (`preprocess.ts`)

Before AI rendering, Markdown can be preprocessed (normalize headings, collapse excess blank lines, standardize list indentation). Output is `{basename}_preprocessed.md` in the same directory, with frontmatter markers (`lumislate_preprocessed`, `lumislate_preprocessed_for`). The preprocess key is `'marp'` for Marp mode or the `skillId` for Design mode.

### Reverse Mapping (Bidirectional Editing)

Every rendered HTML page includes `getReverseMappingScript()`, which runs inside the iframe:

- **Hover**: Highlights editable text nodes (P, H1-H6, LI, etc.) with `lumislate-hover` class.
- **Click**: Converts the text node to a `contenteditable` span (`lumislate-editing`).
- **Enter/Escape**: Confirm or cancel edit.
- **On confirm**: Posts `lumislate-text-change` message to parent window with `oldText`, `newText`, `path` (DOM path), and `context` (preview text).

The plugin's `setupReverseMapping()` listens for these messages and calls `applyTextChange()`, which:
1. Finds the active Markdown editor
2. Locates the best match for `oldText` (uses context disambiguation if multiple matches)
3. Calls `editor.replaceRange(newText, from, to)`
4. Updates the cache via `cacheManager.updateCacheText()`

### Export (`export.ts`)

Three export paths available via `ExportMenuModal`:
- **HTML download**: Blob + anchor tag
- **PNG screenshot**: Uses `modern-screenshot`'s `domToBlob` on iframe body at `scale: 2`
- **Save to Vault**: Writes HTML to a path in the vault (configurable default folder)

### Frontmatter Manipulation

Marp mode can update the current note's frontmatter via `updateMarpFrontmatterField(key, value)`. This reads the file, parses frontmatter with regex, updates or inserts the field, and rewrites the entire file with `vault.modify()`.

## Directory Structure

```
src/
  core/
    main.ts          # Plugin class + LumiSlateView (ItemView) + all rendering logic
  ui/
    modals.ts        # PreprocessConfirmModal, ExportMenuModal
    styles.css       # Plugin styles (copied to dist/ on build)
  ai/
    ai_service.ts    # compileWithAI, streamCompileMarkdownToHTML, extractHtml, previewHtml
    local_agent.ts   # CLI agent detection and invocation
    agent_manager.ts # Natural language agent coordinator (currently minimal)
    skills.ts        # Skill definitions, prompt assembly, Marp directive parsing
    skills_router.ts # Skill routing framework (abstract BaseSkill classes)
  utils/
    cache_manager.ts # File-based HTML cache with hash invalidation
    export.ts        # HTML/PNG/Vault export functions
    preprocess.ts    # Markdown preprocessing and preprocessed file management
  config/
    settings.ts      # LumiSlateSettings interface + LumiSlateSettingTab
```

## Key Conventions

- **All AI-rendered HTML gets the reverse mapping script injected** — this is not optional. If you modify how HTML reaches the iframe, ensure `injectReverseMappingScript()` is still called.
- **Marp slide detection uses `/^---\s*$/m`** on the body (after frontmatter extraction) — not the file-level `---` frontmatter delimiters.
- **The `_hasDividers` state controls UI availability** — `marpSizeBtn.disabled = !this._hasDividers`. This state is computed in `refreshViewContext()` and passed to `setContextInfo()`.
- **HTTP API calls use `temperature: 0.3`** and a fixed system prompt. The user message is the fully assembled prompt from `skills.ts`.
- **CSS styles use Obsidian CSS variables** (`--background-secondary`, `--interactive-accent`, etc.) for theming compatibility.
