import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderMarkdownViewer(opts: {
  title: string;
  content: string;
  watermark?: string;
  truncated?: boolean;
}): string {
  const raw = marked.parse(opts.content, {
    gfm: true,
    breaks: false,
  });
  const html = DOMPurify.sanitize(typeof raw === "string" ? raw : String(raw));

  return layout({
    title: opts.title,
    ext: "md",
    engine: "marked · GFM",
    head: `
      <style>
        .md-wrap {
          max-width: none;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 20px 24px 32px;
          overflow: auto;
          box-sizing: border-box;
        }
        .md {
          background: #fff;
          border: 0;
          border-radius: 0;
          padding: 0;
          line-height: 1.7;
          box-shadow: none;
          max-width: 900px;
          margin: 0 auto;
        }
        .md h1,.md h2,.md h3 { margin-top: 1.4em; line-height: 1.3; }
        .md h1 { border-bottom: 1px solid var(--border); padding-bottom: .3em; }
        .md h2 { border-bottom: 1px solid #eef2f7; padding-bottom: .25em; }
        .md hr {
          border: 0;
          border-top: 1px solid #eef2f7;
          margin: 1.5em 0;
        }
        .md code {
          background: #f1f5f9; padding: .15em .4em; border-radius: 4px;
          font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .92em;
        }
        .md pre {
          background: #f8fafc; color: #0f172a; padding: 14px 16px;
          border-radius: 10px; overflow: auto; border: 1px solid var(--border);
        }
        .md pre code { background: transparent; color: inherit; padding: 0; }
        .md blockquote {
          margin: 0; padding: .2em 1em; color: var(--muted);
          border-left: 4px solid #c7d2fe;
          background: #eef2ff55;
          border-radius: 0 8px 8px 0;
        }
        .md table { border-collapse: collapse; width: 100%; }
        .md th,.md td { border: 1px solid var(--border); padding: 8px 10px; }
        .md th { background: #f8fafc; }
        .md img { max-width: 100%; border-radius: 8px; }
        .md a { color: var(--accent-600); }
        .notice {
          max-width: 860px; margin: 12px auto 0; padding: 8px 12px;
          background: #fffbeb; color: #92400e; border: 1px solid #fde68a;
          border-radius: 8px; font-size: 12px;
        }
      </style>
    `,
    body: `
      ${opts.truncated ? `<div class="notice">文件较大，仅渲染前部分 Markdown</div>` : ""}
      ${watermarkLayer(opts.watermark)}
      <div class="viewer"><div class="md-wrap"><article class="md">${html}</article></div></div>
    `,
  });
}
