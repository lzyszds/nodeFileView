import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

function injectBaseHref(html: string, baseHref: string): string {
  if (!baseHref) return html;
  if (/<base\s/i.test(html)) return html;
  const tag = `<base href="${baseHref.replace(/"/g, "&quot;")}" />`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${tag}</head>`);
  }
  return `<!DOCTYPE html><html><head>${tag}</head><body>${html}</body></html>`;
}

export function renderHtmlViewer(opts: {
  title: string;
  content: string;
  baseHref?: string;
  watermark?: string;
  truncated?: boolean;
}): string {
  const ui = previewUi();
  const prepared = injectBaseHref(opts.content, opts.baseHref || "");

  return layout({
    title: opts.title,
    ext: "html",
    engine: "HTML Sandbox",
    headerActions: `
      <button type="button" id="reloadBtn">${escapeHtml(ui.refresh)}</button>
      <button type="button" id="sourceBtn">${escapeHtml(ui.htmlShowSource)}</button>
      <button type="button" class="primary" id="openBtn">↗</button>
    `,
    floatingBar: `
      <span class="mono">sandbox</span>
      <div class="sep"></div>
      <span class="mono" id="modeLabel">${escapeHtml(ui.htmlPreview)}</span>
    `,
    head: `
      <style>
        .html-shell {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
          padding-top: 0;
        }
        .frame-wrap {
          flex: 1;
          min-height: 0;
          margin: 0;
          border: 0;
          border-radius: 0;
          overflow: hidden;
          background: #fff;
          box-shadow: none;
        }
        #frame {
          width: 100%;
          height: 100%;
          border: 0;
          background: #fff;
        }
        #sourcePane {
          display: none;
          flex: 1;
          min-height: 0;
          margin: 0;
          border: 0;
          border-radius: 0;
          overflow: auto;
          background: #fff;
          box-shadow: none;
          padding: 16px;
        }
        #sourcePane.active { display: block; }
        #sourcePane pre {
          margin: 0;
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 12px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
          color: #334155;
        }
        .frame-wrap.hidden { display: none; }
        .notice {
          margin: 56px 16px 0;
          padding: 8px 12px;
          background: #fffbeb;
          color: #92400e;
          border: 1px solid #fde68a;
          border-radius: 8px;
          font-size: 12px;
        }
      </style>
    `,
    body: `
      ${opts.truncated ? `<div class="notice">文件较大，仅渲染前部分 HTML</div>` : ""}
      ${watermarkLayer(opts.watermark)}
      <div class="html-shell">
        <div class="frame-wrap" id="frameWrap">
          <iframe id="frame" title="${escapeHtml(opts.title)}"
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"></iframe>
        </div>
        <div id="sourcePane"><pre id="sourcePre"></pre></div>
      </div>
      <script>
        const UI = ${JSON.stringify(ui)};
        const rawHtml = ${JSON.stringify(prepared)};
        const frame = document.getElementById("frame");
        const frameWrap = document.getElementById("frameWrap");
        const sourcePane = document.getElementById("sourcePane");
        const sourcePre = document.getElementById("sourcePre");
        const modeLabel = document.getElementById("modeLabel");
        let blobUrl = "";
        let showingSource = false;
        [
          ["reloadBtn", UI.refresh],
          ["sourceBtn", UI.htmlShowSource],
          ["openBtn", "↗"],
        ].forEach(function (item) {
          window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
        });
        window.__NFV_PREVIEW__?.setState({ kind: "html", mode: "preview" });

        function mountPreview() {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          const blob = new Blob([rawHtml], { type: "text/html;charset=utf-8" });
          blobUrl = URL.createObjectURL(blob);
          frame.src = blobUrl;
        }

        mountPreview();
        sourcePre.textContent = rawHtml;

        document.getElementById("reloadBtn").onclick = function () {
          mountPreview();
        };
        document.getElementById("openBtn").onclick = function () {
          if (!blobUrl) mountPreview();
          window.open(blobUrl, "_blank", "noopener,noreferrer");
        };
        document.getElementById("sourceBtn").onclick = function () {
          showingSource = !showingSource;
          frameWrap.classList.toggle("hidden", showingSource);
          sourcePane.classList.toggle("active", showingSource);
          modeLabel.textContent = showingSource ? UI.htmlSource : UI.htmlPreview;
          this.textContent = showingSource ? UI.htmlBackPreview : UI.htmlShowSource;
          window.__NFV_PREVIEW__?.setState({ mode: showingSource ? "source" : "preview" });
        };
        window.addEventListener("beforeunload", function () {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
        });
      </script>
    `,
  });
}
