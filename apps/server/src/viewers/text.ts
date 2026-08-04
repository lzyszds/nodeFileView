import hljs from "highlight.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderTextViewer(opts: {
  title: string;
  content: string;
  language?: string;
  watermark?: string;
  truncated?: boolean;
}): string {
  let highlighted: string;
  try {
    if (opts.language) {
      highlighted = hljs.highlight(opts.content, {
        language: opts.language,
        ignoreIllegals: true,
      }).value;
    } else {
      highlighted = hljs.highlightAuto(opts.content).value;
    }
  } catch {
    highlighted = escapeHtml(opts.content);
  }

  return layout({
    title: opts.title,
    head: `
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" />
      <style>
        pre {
          margin: 0; padding: 20px; overflow: auto; min-height: 100%;
          font-family: "IBM Plex Mono", "SF Mono", Menlo, monospace;
          font-size: 13px; line-height: 1.55; background: #0d1117;
        }
        .notice { padding: 8px 16px; background: #2a2410; color: #f0d48a; font-size: 12px; border-bottom: 1px solid var(--border); }
      </style>
    `,
    body: `
      <div class="topbar"><h1>${escapeHtml(opts.title)}</h1></div>
      ${opts.truncated ? `<div class="notice">文件较大，仅展示前部分内容</div>` : ""}
      ${watermarkLayer(opts.watermark)}
      <div class="viewer"><pre><code class="hljs">${highlighted}</code></pre></div>
    `,
  });
}

export function guessLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    md: "markdown",
    markdown: "markdown",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
    html: "xml",
    htm: "xml",
    vue: "xml",
  };
  return map[ext] || (hljs.getLanguage(ext) ? ext : undefined);
}
