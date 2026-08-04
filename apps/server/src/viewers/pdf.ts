import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderPdfViewer(opts: {
  title: string;
  pdfUrl: string;
  page?: number;
  highlight?: string;
  watermark?: string;
}): string {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const highlight = opts.highlight || "";
  return layout({
    title: opts.title,
    head: `
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs" type="module"></script>
      <style>
        #pages { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
        canvas { max-width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,.35); background: #fff; }
        .meta { color: var(--muted); font-size: 12px; }
      </style>
    `,
    body: `
      <div class="topbar">
        <h1>${escapeHtml(opts.title)}</h1>
        <div class="actions">
          <button id="zoomOut">缩小</button>
          <button id="zoomIn">放大</button>
          <span class="meta" id="pageInfo"></span>
        </div>
      </div>
      ${watermarkLayer(opts.watermark)}
      <div class="viewer"><div id="pages"></div></div>
      <script type="module">
        import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
        const url = ${JSON.stringify(opts.pdfUrl)};
        const startPage = ${page};
        const keyword = ${JSON.stringify(highlight)};
        let scale = 1.2;
        const container = document.getElementById("pages");
        const pageInfo = document.getElementById("pageInfo");
        let pdfDoc = null;

        async function renderAll() {
          container.innerHTML = "";
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.id = "p" + i;
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
                const w = item.width * scale;
                const h = item.height * scale;
                ctx.fillStyle = "rgba(255, 230, 0, 0.35)";
                ctx.fillRect(tx[4], tx[5] - h, Math.max(w, 8), Math.max(h, 10));
              }
            }
            container.appendChild(canvas);
          }
          pageInfo.textContent = pdfDoc.numPages + " 页 · 缩放 " + Math.round(scale * 100) + "%";
          const target = document.getElementById("p" + startPage);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        pdfDoc = await pdfjsLib.getDocument(url).promise;
        await renderAll();
        document.getElementById("zoomIn").onclick = async () => { scale = Math.min(scale + 0.2, 3); await renderAll(); };
        document.getElementById("zoomOut").onclick = async () => { scale = Math.max(scale - 0.2, 0.5); await renderAll(); };
      </script>
    `,
  });
}
