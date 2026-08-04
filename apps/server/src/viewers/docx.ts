import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderDocxViewer(opts: {
  title: string;
  fileUrl: string;
  watermark?: string;
  highlight?: string;
}): string {
  const highlight = opts.highlight || "";

  return layout({
    title: opts.title,
    head: `
      <style>
        :root {
          --word-chrome: #f3f3f3;
          --word-border: #d4d4d4;
          --word-canvas: #605e5c;
          --word-text: #242424;
          --word-muted: #616161;
          --word-accent: #185abd;
        }
        html, body {
          background: var(--word-chrome) !important;
          color: var(--word-text) !important;
          font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif !important;
        }
        .topbar {
          background: #fff !important;
          border-bottom: 1px solid var(--word-border) !important;
          color: var(--word-text) !important;
          box-shadow: 0 1px 0 rgba(0,0,0,.04);
        }
        .topbar h1 { color: var(--word-text) !important; font-weight: 600; }
        .topbar .meta { color: var(--word-muted); font-size: 12px; }
        .topbar button, .topbar .btn {
          background: #fff;
          color: var(--word-text);
          border: 1px solid var(--word-border);
          border-radius: 4px;
        }
        .topbar button:hover, .topbar .btn:hover {
          background: #eff6fc;
          border-color: #c7e0f4;
          color: var(--word-accent);
        }
        .topbar button.active {
          background: #deecf9;
          border-color: #b4d6f0;
          color: var(--word-accent);
        }
        .viewer {
          height: calc(100% - 49px);
          overflow: auto;
          background: linear-gradient(180deg, #6b6967 0%, var(--word-canvas) 140px);
        }
        #status {
          padding: 48px 24px;
          text-align: center;
          color: #eee;
          font-size: 14px;
        }
        #docx-root {
          padding: 28px 16px 64px;
          min-height: 100%;
        }
        #docx-root .docx-wrapper {
          background: transparent !important;
          padding: 0 !important;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        #docx-root .docx-wrapper > section.docx {
          background: #fff !important;
          box-shadow:
            0 1px 3px rgba(0,0,0,.28),
            0 10px 28px rgba(0,0,0,.2) !important;
          margin: 0 auto !important;
          color: #000;
          transform-origin: top center;
        }
        #docx-root mark.nfv-hl {
          background: #fff2a8;
          color: inherit;
          padding: 0 .05em;
          border-radius: 2px;
        }
        .watermark {
          background-image: repeating-linear-gradient(
            -28deg,
            transparent 0,
            transparent 90px,
            rgba(0,0,0,0.03) 90px,
            rgba(0,0,0,0.03) 180px
          ) !important;
        }
        .watermark::after {
          color: rgba(0,0,0,0.08) !important;
        }
        .sep { width: 1px; height: 20px; background: var(--word-border); margin: 0 4px; }
        @media print {
          .topbar, .watermark { display: none !important; }
          .viewer { height: auto !important; overflow: visible !important; background: #fff !important; }
          #docx-root { padding: 0 !important; }
          #docx-root .docx-wrapper > section.docx {
            box-shadow: none !important;
            transform: none !important;
            margin: 0 !important;
          }
        }
      </style>
    `,
    body: `
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
          <h1 title="${escapeHtml(opts.title)}">${escapeHtml(opts.title)}</h1>
          <span class="meta" id="pageMeta"></span>
        </div>
        <div class="actions">
          <button type="button" id="zoomOut" title="缩小">−</button>
          <button type="button" id="zoomLabel" class="active" style="min-width:64px">100%</button>
          <button type="button" id="zoomIn" title="放大">+</button>
          <span class="sep"></span>
          <button type="button" id="fitWidth">适合宽度</button>
          <button type="button" id="fitPage">实际大小</button>
          <span class="sep"></span>
          <button type="button" id="printBtn">打印</button>
        </div>
      </div>
      ${watermarkLayer(opts.watermark)}
      <div class="viewer" id="viewer">
        <div id="status">正在加载 Word 文档…</div>
        <div id="docx-root" hidden></div>
      </div>
      <script>
        (async function () {
          const fileUrl = ${JSON.stringify(opts.fileUrl)};
          const keyword = ${JSON.stringify(highlight)};
          const status = document.getElementById("status");
          const root = document.getElementById("docx-root");
          const viewer = document.getElementById("viewer");
          const pageMeta = document.getElementById("pageMeta");
          const zoomLabel = document.getElementById("zoomLabel");
          let scale = 1;

          function loadScript(src) {
            return new Promise(function (resolve, reject) {
              const existing = document.querySelector('script[data-nfv-src="' + src + '"]');
              if (existing) {
                if (existing.getAttribute("data-nfv-loaded") === "1") return resolve();
                existing.addEventListener("load", function () { resolve(); });
                existing.addEventListener("error", function () { reject(new Error("加载失败: " + src)); });
                return;
              }
              const s = document.createElement("script");
              s.src = src;
              s.async = false;
              s.setAttribute("data-nfv-src", src);
              s.onload = function () {
                s.setAttribute("data-nfv-loaded", "1");
                resolve();
              };
              s.onerror = function () {
                reject(new Error("加载失败: " + src + "（请确认后端 /assets 可访问）"));
              };
              document.head.appendChild(s);
            });
          }

          async function ensureDocxLib() {
            if (window.docx && window.docx.renderAsync) return;
            await loadScript("/assets/jszip.min.js");
            if (!window.JSZip) {
              throw new Error("JSZip 未加载，请检查 /assets/jszip.min.js");
            }
            await loadScript("/assets/docx-preview.min.js");
            // UMD 可能稍晚挂到 window
            for (let i = 0; i < 20; i++) {
              if (window.docx && window.docx.renderAsync) return;
              await new Promise(function (r) { setTimeout(r, 50); });
            }
            throw new Error("docx-preview 未加载，请检查 /assets/docx-preview.min.js");
          }

          function applyZoom() {
            const sections = root.querySelectorAll("section.docx");
            for (const el of sections) {
              el.style.transform = "scale(" + scale + ")";
              const h = el.getBoundingClientRect().height / (scale || 1);
              el.style.marginBottom = Math.max(0, (scale - 1) * h) + "px";
            }
            zoomLabel.textContent = Math.round(scale * 100) + "%";
          }

          function fitWidth() {
            const section = root.querySelector("section.docx");
            if (!section) return;
            const pad = 48;
            const avail = Math.max(320, viewer.clientWidth - pad);
            const prev = scale;
            scale = 1;
            applyZoom();
            const natural = section.scrollWidth || section.offsetWidth || 794;
            scale = Math.min(1.75, Math.max(0.45, avail / natural));
            if (!isFinite(scale) || scale <= 0) scale = prev || 1;
            applyZoom();
          }

          function highlightKeyword(container, text) {
            if (!text || !text.trim()) return;
            const needle = text.trim();
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            const lower = needle.toLowerCase();
            for (const node of nodes) {
              const value = node.nodeValue || "";
              const idx = value.toLowerCase().indexOf(lower);
              if (idx < 0) continue;
              try {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + needle.length);
                const mark = document.createElement("mark");
                mark.className = "nfv-hl";
                range.surroundContents(mark);
              } catch (_) {}
            }
            const first = container.querySelector("mark.nfv-hl");
            if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          try {
            status.textContent = "正在加载预览引擎…";
            await ensureDocxLib();
            status.textContent = "正在解析 Word 文档…";
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error("下载文档失败 HTTP " + res.status);
            const buffer = await res.arrayBuffer();

            root.hidden = false;
            status.remove();

            await window.docx.renderAsync(buffer, root, null, {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: true,
              useBase64URL: true,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true,
              debug: false,
            });

            const pages = root.querySelectorAll("section.docx").length;
            pageMeta.textContent = pages ? (pages + " 页 · Word 版式") : "Word 版式";
            applyZoom();
            highlightKeyword(root, keyword);
            if (viewer.clientWidth < 900) fitWidth();
          } catch (err) {
            status.textContent = "DOCX 预览失败：" + (err && err.message ? err.message : String(err));
            status.style.color = "#fecaca";
            root.hidden = true;
          }

          document.getElementById("zoomIn").onclick = function () {
            scale = Math.min(2.5, +(scale + 0.1).toFixed(2));
            applyZoom();
          };
          document.getElementById("zoomOut").onclick = function () {
            scale = Math.max(0.4, +(scale - 0.1).toFixed(2));
            applyZoom();
          };
          document.getElementById("zoomLabel").onclick = function () {
            scale = 1;
            applyZoom();
          };
          document.getElementById("fitWidth").onclick = fitWidth;
          document.getElementById("fitPage").onclick = function () {
            scale = 1;
            applyZoom();
          };
          document.getElementById("printBtn").onclick = function () {
            window.print();
          };
        })();
      </script>
    `,
  });
}
