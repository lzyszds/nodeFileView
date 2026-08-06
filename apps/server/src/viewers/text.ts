import { codeToTokens } from "shiki";
import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  htm: "html",
  vue: "vue",
  svelte: "svelte",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  sass: "scss",
  styl: "stylus",
  java: "java",
  go: "go",
  rs: "rust",
  rust: "rust",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  xml: "xml",
  ini: "ini",
  conf: "ini",
  properties: "properties",
  txt: "text",
  log: "text",
  env: "dotenv",
  gitignore: "ignore",
  editorconfig: "ini",
  dockerfile: "dockerfile",
  makefile: "makefile",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  dart: "dart",
  lua: "lua",
  r: "r",
  pl: "perl",
  pm: "perl",
  asm: "asm",
  s: "asm",
  m: "objective-c",
  mm: "objective-cpp",
  gradle: "groovy",
  groovy: "groovy",
  proto: "protobuf",
  graphql: "graphql",
  gql: "graphql",
  zig: "zig",
  nim: "nim",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  jl: "julia",
  scala: "scala",
  clj: "clojure",
  cljs: "clojure",
  lisp: "lisp",
  vim: "vim",
  diff: "diff",
  patch: "diff",
  rtf: "text",
};

export function guessLanguage(ext: string): string | undefined {
  const key = ext.toLowerCase().replace(/^\./, "");
  return LANG_ALIASES[key] || (key || undefined);
}

function extractHighlightedLines(html: string): string[] {
  const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
  const codeInner = codeMatch?.[1];
  if (!codeInner) return [];
  const lineMatches = [...codeInner.matchAll(/<span class="line">([\s\S]*?)<\/span>/g)];
  if (!lineMatches.length) return [];
  return lineMatches.map((m) => m[1] || "&nbsp;");
}

function tokensToLineHtml(
  lineTokens: Array<{ content: string; color?: string; fontStyle?: number }>,
  fallbackColor: string,
): string {
  if (!lineTokens || !lineTokens.length) return "&nbsp;";
  return lineTokens
    .map((t) => {
      const color = t.color || fallbackColor;
      // Shiki token content is already per-line (no '\n' here)
      return `<span style="color:${color}">${escapeHtml(t.content)}</span>`;
    })
    .join("");
}

export async function renderTextViewer(opts: {
  title: string;
  content: string;
  language?: string;
  watermark?: string;
  truncated?: boolean;
}): Promise<string> {
  const lang = opts.language || "text";
  const lines = Math.max(1, opts.content.split(/\r?\n/).length);

  const rawLines = opts.content.split(/\r?\n/);

  let tokensResult: Awaited<
    ReturnType<typeof codeToTokens>
  > | null = null;
  try {
    tokensResult = await codeToTokens(opts.content, {
      lang: lang as any,
      theme: "github-light",
    });
  } catch {
    try {
      tokensResult = await codeToTokens(opts.content, {
        lang: "text",
        theme: "github-light",
      });
    } catch {
      tokensResult = null;
    }
  }

  const fallbackColor = tokensResult?.fg || "#24292e";
  const tokensByLine: Array<
    Array<{ content: string; color?: string; fontStyle?: number }>
  > = (tokensResult as any)?.tokens || [];

  const renderedRows = rawLines
    .map((line, idx) => {
      const lineTokens = tokensByLine[idx] || [];
      const rendered =
        lineTokens.length > 0
          ? tokensToLineHtml(lineTokens, fallbackColor)
          : escapeHtml(line) || "&nbsp;";
      return `<tr><td class="ln">${idx + 1}</td><td class="lc"><div class="line-inner">${rendered}</div></td></tr>`;
    })
    .join("");

  const ext = opts.title.includes(".")
    ? opts.title.split(".").pop() || "txt"
    : "txt";

  const ui = previewUi();
  return layout({
    title: opts.title,
    ext,
    engine: "Shiki · github-light",
    headerActions: `
      <span class="uv-meta" id="langLabel">${escapeHtml(lang)} · UTF-8 · ${lines} lines</span>
      <button type="button" id="zoomOut" title="${escapeHtml(ui.zoomOut)}">−</button>
      <span class="uv-meta" id="zoomLabel" style="min-width:3em;text-align:center">100%</span>
      <button type="button" id="zoomIn" title="${escapeHtml(ui.zoomIn)}">+</button>
      <button type="button" id="copyBtn">复制全部</button>
      <button type="button" id="wrapBtn">取消换行</button>
    `,
    head: `
      <style>
        .viewer {
          display: flex !important;
          flex-direction: column;
          overflow: hidden !important;
          background: #fff;
        }
        .code-shell {
          flex: 1;
          min-height: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 0;
          margin: 0;
          overflow: hidden;
        }
        .code-card {
          flex: 1;
          min-height: 0;
          width: 100%;
          max-width: none;
          background: #fff;
          border: 0;
          border-radius: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: none;
        }
        .code-body {
          flex: 1;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          background: #fff;
          font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
        }
        .code-body.nowrap {
          overflow-x: auto;
        }
        .code-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace !important;
          font-size: var(--code-fs, 13px);
        }
        .code-table td {
          vertical-align: top;
          padding: 0;
        }
        .code-table .ln {
          width: 3.5em;
          padding: 0 8px 0 0;
          text-align: right;
          color: #94a3b8;
          border-right: 1px solid #e2e8f0;
          user-select: none;
          white-space: nowrap;
        }
        .code-table .lc {
          padding-left: 12px;
          min-width: 0;
        }
        .line-inner {
          width: 100%;
          box-sizing: border-box;
          white-space: pre-wrap;
          word-break: break-all;
          overflow-wrap: anywhere;
        }
        .code-body.nowrap .line-inner { white-space: pre; word-break: normal; overflow-wrap: normal; }
        .line-inner span { white-space: inherit !important; word-break: inherit !important; overflow-wrap: inherit !important; }
        .notice {
          margin: 0;
          padding: 8px 12px;
          background: #fffbeb;
          color: #92400e;
          border-bottom: 1px solid #fde68a;
          font-size: 12px;
          flex-shrink: 0;
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        ${opts.truncated ? `<div class="notice">文件较大，仅展示前部分内容</div>` : ""}
        <div class="code-shell">
          <div class="code-card">
            <div class="code-body" id="codeBody">
              <table class="code-table"><tbody>${renderedRows}</tbody></table>
            </div>
          </div>
        </div>
      </div>
      <script>
        const UI = ${JSON.stringify(ui)};
        const raw = ${JSON.stringify(opts.content)};
        let zoom = 1;
        let wrap = true;
        const body = document.getElementById("codeBody");
        const zoomLabel = document.getElementById("zoomLabel");
        [
          ["zoomOut", UI.zoomOut],
          ["zoomIn", UI.zoomIn],
          ["copyBtn", "复制全部"],
          ["wrapBtn", "切换换行"],
        ].forEach(function (item) {
          window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
        });
        window.__NFV_PREVIEW__?.setState({
          kind: "text",
          language: ${JSON.stringify(lang)},
          lines: ${lines},
        });
        function applyZoom() {
          body.style.setProperty("--code-fs", (13 * zoom) + "px");
          zoomLabel.textContent = Math.round(zoom * 100) + "%";
        }
        document.getElementById("copyBtn").onclick = async function () {
          try {
            await navigator.clipboard.writeText(raw);
            this.textContent = "已复制";
            const btn = this;
            setTimeout(function () { btn.textContent = "复制全部"; }, 1200);
          } catch (_) { alert("复制失败"); }
        };
        document.getElementById("wrapBtn").onclick = function () {
          wrap = !wrap;
          body.classList.toggle("nowrap", !wrap);
          this.textContent = wrap ? "取消换行" : "自动换行";
        };
        document.getElementById("zoomIn").onclick = function () {
          zoom = Math.min(2, zoom + 0.1);
          applyZoom();
        };
        document.getElementById("zoomOut").onclick = function () {
          zoom = Math.max(0.7, zoom - 0.1);
          applyZoom();
        };
      </script>
    `,
  });
}
