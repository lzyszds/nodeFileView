import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderPdfViewer(opts: {
  title: string;
  pdfUrl: string;
  page?: number;
  highlight?: string;
  watermark?: string;
  presentation?: boolean;
}): string {
  const ui = previewUi();
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const highlight = opts.highlight || "";
  const presentation = Boolean(opts.presentation);

  return layout({
    title: opts.title,
    ext: presentation ? "ppt" : "pdf",
    engine: presentation ? "LibreOffice · PDF" : "pdf.js",
    headerActions: `
      <button type="button" id="toggleThumbs" class="active">☰</button>
      <button type="button" id="fitWidth">${escapeHtml(ui.fitWidth)}</button>
      <button type="button" class="primary" id="fsBtn">${escapeHtml(ui.fullscreen)}</button>
    `,
    floatingBar: `
      <button type="button" id="prevPage" title="${escapeHtml(ui.prevPage)}">‹</button>
      <span class="mono" id="pageInfo">- / -</span>
      <button type="button" id="nextPage" title="${escapeHtml(ui.nextPage)}">›</button>
      <div class="sep"></div>
      <button type="button" id="zoomOut">−</button>
      <span class="mono" id="zoomLabel">100%</span>
      <button type="button" id="zoomIn">+</button>
    `,
    head: `
      <style>
        :root { --pdf-accent: ${presentation ? "#4f46e5" : "#4f46e5"}; }
        .shell {
          height: 100%;
          display: grid;
          grid-template-columns: 148px 1fr;
          min-height: 0;
          padding-top: 0;
        }
        .shell.no-thumbs { grid-template-columns: 1fr; }
        .thumbs {
          overflow: auto;
          background: rgba(255,255,255,.92);
          border-right: 1px solid var(--border);
          padding: 8px;
        }
        .thumb {
          display: block; width: 100%; margin: 0 0 8px; padding: 0;
          border: 2px solid transparent; border-radius: 8px;
          background: #fff; cursor: pointer;
          box-shadow: var(--paper-shadow);
        }
        .thumb.active { border-color: var(--pdf-accent); }
        .thumb canvas { width: 100%; height: auto; display: block; }
        .thumb .n {
          font-size: 11px; color: var(--muted); padding: 3px 6px; text-align: center;
          border-top: 1px solid #eef2f7;
        }
        .main { overflow: auto; position: relative; }
        #pages {
          padding: ${presentation ? "24px" : "16px"};
          display: flex; flex-direction: column; align-items: center;
          gap: ${presentation ? "28px" : "16px"};
        }
        #pages canvas {
          max-width: 100%;
          box-shadow: var(--paper-shadow);
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        @media (max-width: 800px) {
          .shell { grid-template-columns: 1fr; }
          .thumbs { display: none; }
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="shell" id="shell">
        <aside class="thumbs" id="thumbs"></aside>
        <div class="main" id="main"><div id="pages"></div></div>
      </div>
      <script type="module">
        import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
        const url = ${JSON.stringify(opts.pdfUrl)};
        const startPage = ${page};
        const keyword = ${JSON.stringify(highlight)};
        const presentation = ${presentation ? "true" : "false"};
        let scale = presentation ? 1.35 : 1.2;
        let current = startPage;
        const pagesEl = document.getElementById("pages");
        const thumbsEl = document.getElementById("thumbs");
        const pageInfo = document.getElementById("pageInfo");
        const zoomLabel = document.getElementById("zoomLabel");
        const shell = document.getElementById("shell");
        const main = document.getElementById("main");
        let pdfDoc = null;

        function updateMeta() {
          pageInfo.textContent = current + " / " + pdfDoc.numPages;
          zoomLabel.textContent = Math.round(scale * 100) + "%";
          Array.from(thumbsEl.children).forEach(function (el, i) {
            el.classList.toggle("active", i + 1 === current);
          });
        }

        async function renderPageToCanvas(pageNum, targetScale) {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: targetScale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (keyword) {
            const textContent = await page.getTextContent();
            const lower = keyword.toLowerCase();
            for (const item of textContent.items) {
              const str = item.str || "";
              if (!str.toLowerCase().includes(lower)) continue;
              const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
              const w = (item.width || 8) * targetScale;
              const h = (item.height || 10) * targetScale;
              ctx.fillStyle = "rgba(253, 224, 71, 0.45)";
              ctx.fillRect(tx[4], tx[5] - h, Math.max(w, 8), Math.max(h, 10));
            }
          }
          return canvas;
        }

        async function renderAll() {
          pagesEl.innerHTML = "";
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const canvas = await renderPageToCanvas(i, scale);
            canvas.id = "p" + i;
            canvas.style.cursor = "pointer";
            canvas.onclick = function () { current = i; updateMeta(); };
            pagesEl.appendChild(canvas);
          }
          updateMeta();
          const target = document.getElementById("p" + current);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        async function renderThumbs() {
          thumbsEl.innerHTML = "";
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "thumb" + (i === current ? " active" : "");
            const canvas = await renderPageToCanvas(i, 0.22);
            const n = document.createElement("div");
            n.className = "n";
            n.textContent = String(i);
            btn.appendChild(canvas);
            btn.appendChild(n);
            btn.onclick = function () {
              current = i;
              updateMeta();
              document.getElementById("p" + i)?.scrollIntoView({ behavior: "smooth", block: "start" });
            };
            thumbsEl.appendChild(btn);
          }
        }

        pdfDoc = await pdfjsLib.getDocument(url).promise;
        await renderAll();
        renderThumbs();
        [
          ["toggleThumbs", "切换缩略图"],
          ["fitWidth", "适合宽度"],
          ["fsBtn", "全屏"],
          ["prevPage", "上一页"],
          ["nextPage", "下一页"],
          ["zoomOut", "缩小"],
          ["zoomIn", "放大"],
        ].forEach(function (item) {
          window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
        });
        window.__NFV_PREVIEW__?.setState({
          kind: "pdf",
          page: current,
          total: pdfDoc.numPages,
        });

        main.addEventListener("scroll", function () {
          const canvases = [...pagesEl.querySelectorAll("canvas")];
          let best = current;
          let bestDist = Infinity;
          const mid = main.scrollTop + main.clientHeight / 3;
          for (const c of canvases) {
            const top = c.offsetTop;
            const dist = Math.abs(top - mid);
            if (dist < bestDist) {
              bestDist = dist;
              best = Number(c.id.slice(1));
            }
          }
          if (best !== current) {
            current = best;
            updateMeta();
            window.__NFV_PREVIEW__?.setState({ page: current, total: pdfDoc.numPages });
          }
        });

        document.getElementById("zoomIn").onclick = async function () {
          scale = Math.min(scale + 0.15, 3);
          await renderAll();
        };
        document.getElementById("zoomOut").onclick = async function () {
          scale = Math.max(scale - 0.15, 0.5);
          await renderAll();
        };
        document.getElementById("fitWidth").onclick = async function () {
          const page = await pdfDoc.getPage(current);
          const vp = page.getViewport({ scale: 1 });
          scale = Math.max(0.5, Math.min(2.5, (main.clientWidth - 48) / vp.width));
          await renderAll();
        };
        document.getElementById("prevPage").onclick = function () {
          current = Math.max(1, current - 1);
          document.getElementById("p" + current)?.scrollIntoView({ behavior: "smooth", block: "start" });
          updateMeta();
          window.__NFV_PREVIEW__?.setState({ page: current, total: pdfDoc.numPages });
        };
        document.getElementById("nextPage").onclick = function () {
          current = Math.min(pdfDoc.numPages, current + 1);
          document.getElementById("p" + current)?.scrollIntoView({ behavior: "smooth", block: "start" });
          updateMeta();
          window.__NFV_PREVIEW__?.setState({ page: current, total: pdfDoc.numPages });
        };
        document.getElementById("toggleThumbs").onclick = function () {
          shell.classList.toggle("no-thumbs");
          this.classList.toggle("active");
        };
        document.getElementById("fsBtn").onclick = function () {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
          else document.exitFullscreen?.();
        };
        window.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight" || e.key === "PageDown") document.getElementById("nextPage").click();
          if (e.key === "ArrowLeft" || e.key === "PageUp") document.getElementById("prevPage").click();
        });
      </script>
    `,
  });
}
