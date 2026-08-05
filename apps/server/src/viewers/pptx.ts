import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderPptxViewer(opts: {
  title: string;
  fileUrl: string;
  watermark?: string;
}): string {
  const ui = previewUi();
  return layout({
    title: opts.title,
    ext: "pptx",
    engine: "pptx-preview",
    headerActions: `
      <button type="button" id="prevBtn">${escapeHtml(ui.prevPage)}</button>
      <button type="button" id="nextBtn">${escapeHtml(ui.nextPage)}</button>
      <button type="button" class="primary" id="fsBtn">${escapeHtml(ui.fullscreen)}</button>
    `,
    floatingBar: `
      <button type="button" id="prevFab" title="${escapeHtml(ui.prevPage)}">‹</button>
      <span class="mono" id="pageLabel">- / -</span>
      <button type="button" id="nextFab" title="${escapeHtml(ui.nextPage)}">›</button>
    `,
    head: `
      <style>
        .shell {
          height: calc(100% - 32px);
          display: grid;
          grid-template-columns: 200px 1fr;
          min-height: 0;
          padding-top: 0;
        }
        .thumbs {
          background: rgba(255,255,255,.92);
          border-right: 1px solid var(--border);
          overflow: auto;
          padding: 12px 10px;
          z-index: 10;
        }
        .thumbs-hd {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: #94a3b8;
          padding: 0 6px 10px;
        }
        .thumb {
          display: block;
          width: 100%;
          margin: 0 0 12px;
          border: 2px solid transparent;
          border-radius: 10px;
          background: #fff;
          color: var(--text);
          cursor: pointer;
          padding: 0;
          text-align: left;
          overflow: hidden;
          box-shadow: var(--paper-shadow);
        }
        .thumb:hover { border-color: #c7d2fe; }
        .thumb.active {
          border-color: var(--accent-600);
          box-shadow: 0 0 0 3px rgba(79,70,229,.15);
        }
        .thumb .n {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 8px;
          font-size: 11px;
          background: #f8fafc;
          border-bottom: 1px solid #eef2f7;
          color: var(--muted);
        }
        .thumb .shot {
          position: relative;
          height: 96px;
          overflow: hidden;
          background: #fff;
        }
        .thumb .shot img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
          background: #fff;
        }
        .thumb .shot .mini-host {
          position: absolute;
          left: 0; top: 0;
          transform-origin: top left;
          pointer-events: none;
        }
        .thumb .fallback {
          height: 96px;
          display: grid;
          place-items: center;
          font-size: 22px;
          font-weight: 700;
          color: #cbd5e1;
          background: linear-gradient(180deg, #fff, #f8fafc);
        }
        .stage-wrap {
          overflow: auto;
          display: grid;
          place-items: center;
          padding: 20px;
          min-height: 0;
        }
        #pptx-host {
          width: min(960px, 94vw);
        }
        #pptx-host .pptx-preview-wrapper {
          margin: 0 auto !important;
          background: transparent !important;
        }
        #pptx-host .pptx-preview-slide-wrapper {
          margin: 0 auto !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          box-shadow: var(--paper-shadow) !important;
          border: 1px solid var(--border) !important;
          background: #fff !important;
        }
        #pptx-host .pptx-preview-wrapper-pagination,
        #pptx-host .pptx-preview-wrapper-next,
        #pptx-host .pptx-preview-wrapper-pre {
          display: none !important;
        }
        #status {
          color: var(--muted);
          padding: 48px;
          text-align: center;
        }
        #thumb-paint {
          position: fixed;
          left: -10000px;
          top: 0;
          width: 480px;
          height: 270px;
          overflow: hidden;
          pointer-events: none;
          opacity: 0;
        }
        @media (max-width: 860px) {
          .shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
          .thumbs {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: 0;
            border-bottom: 1px solid var(--border);
            padding: 10px;
          }
          .thumbs-hd { display: none; }
          .thumb { min-width: 140px; width: 140px; margin: 0; flex: 0 0 auto; }
          .thumb .shot, .thumb .fallback { height: 78px; }
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="shell">
        <aside class="thumbs" id="thumbs">
          <div class="thumbs-hd">Slides</div>
        </aside>
        <div class="stage-wrap">
          <div id="status">正在加载演示文稿…</div>
          <div id="pptx-host" hidden></div>
        </div>
      </div>
      <div id="thumb-paint" aria-hidden="true"></div>
      <script type="module">
        const UI = ${JSON.stringify(ui)};
        const fileUrl = ${JSON.stringify(opts.fileUrl)};
        const status = document.getElementById("status");
        const host = document.getElementById("pptx-host");
        const thumbs = document.getElementById("thumbs");
        const paint = document.getElementById("thumb-paint");
        const pageLabel = document.getElementById("pageLabel");
        let previewer = null;
        let current = 0;
        let total = 0;
        let slideWidth = 960;
        let slideHeight = 540;
        [
          ["prevBtn", UI.prevPage],
          ["nextBtn", UI.nextPage],
          ["fsBtn", UI.fullscreen],
        ].forEach(function (item) {
          window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
        });

        function updateChrome() {
          pageLabel.textContent = (current + 1) + " / " + total;
          Array.from(thumbs.querySelectorAll(".thumb")).forEach(function (el, idx) {
            el.classList.toggle("active", idx === current);
          });
          window.__NFV_PREVIEW__?.setState({
            kind: "pptx",
            page: current + 1,
            total: total,
          });
        }

        function go(i) {
          if (!previewer || total <= 0) return;
          current = Math.max(0, Math.min(total - 1, i));
          try {
            previewer.renderSingleSlide(current);
          } catch (err) {
            console.warn(err);
          }
          updateChrome();
          const active = thumbs.querySelectorAll(".thumb")[current];
          if (active) active.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }

        function waitFrames(n) {
          return new Promise(function (resolve) {
            function step() {
              if (n <= 0) return resolve();
              n -= 1;
              requestAnimationFrame(step);
            }
            step();
          });
        }

        function makeThumb(index, cloneNode) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "thumb" + (index === 0 ? " active" : "");
          btn.innerHTML = '<div class="n"><span>幻灯片 ' + (index + 1) + '</span><span>' + (index + 1) + '</span></div>';
          if (cloneNode) {
            const shot = document.createElement("div");
            shot.className = "shot";
            const box = document.createElement("div");
            box.className = "mini-host";
            cloneNode.style.margin = "0";
            cloneNode.style.boxShadow = "none";
            cloneNode.style.border = "none";
            cloneNode.style.borderRadius = "0";
            cloneNode.style.position = "relative";
            cloneNode.style.top = "0";
            box.appendChild(cloneNode);
            shot.appendChild(box);
            btn.appendChild(shot);
            requestAnimationFrame(function () {
              const sw = cloneNode.offsetWidth || slideWidth;
              const sh = cloneNode.offsetHeight || slideHeight;
              const tw = shot.clientWidth || 176;
              const th = shot.clientHeight || 96;
              const s = Math.min(tw / sw, th / sh);
              box.style.transform = "scale(" + s + ")";
              box.style.width = sw + "px";
              box.style.height = sh + "px";
            });
          } else {
            const fb = document.createElement("div");
            fb.className = "fallback";
            fb.textContent = String(index + 1);
            btn.appendChild(fb);
          }
          btn.addEventListener("click", function () { go(index); });
          return btn;
        }

        async function buildThumbs() {
          const hd = thumbs.querySelector(".thumbs-hd");
          thumbs.innerHTML = "";
          if (hd) thumbs.appendChild(hd);
          else {
            const h = document.createElement("div");
            h.className = "thumbs-hd";
            h.textContent = "Slides";
            thumbs.appendChild(h);
          }

          // Prefer list-mode offscreen render: all slides exist at once
          try {
            const listHost = document.createElement("div");
            paint.appendChild(listHost);
            const listPreviewer = init(listHost, {
              width: slideWidth,
              height: slideHeight,
              mode: "list",
            });
            await listPreviewer.preview(sharedBuf.slice(0));
            await waitFrames(4);
            await new Promise(function (r) { setTimeout(r, 80); });
            const slides = listHost.querySelectorAll(".pptx-preview-slide-wrapper");
            if (slides.length > 0) {
              total = slides.length;
              slides.forEach(function (slide, i) {
                thumbs.appendChild(makeThumb(i, slide.cloneNode(true)));
              });
              listPreviewer.destroy?.();
              paint.innerHTML = "";
              previewer.renderSingleSlide(0);
              current = 0;
              updateChrome();
              return;
            }
            listPreviewer.destroy?.();
            paint.innerHTML = "";
          } catch (err) {
            console.warn("list thumb fallback", err);
            paint.innerHTML = "";
          }

          // Fallback: sequential single-slide clone
          for (let i = 0; i < total; i++) {
            previewer.renderSingleSlide(i);
            await waitFrames(3);
            await new Promise(function (r) { setTimeout(r, 50); });
            const root = host.querySelector(".pptx-preview-slide-wrapper");
            thumbs.appendChild(makeThumb(i, root ? root.cloneNode(true) : null));
          }
          previewer.renderSingleSlide(0);
          current = 0;
          updateChrome();
        }

        let init = null;
        let sharedBuf = null;

        try {
          const mod = await import("https://esm.sh/pptx-preview@1.0.7");
          init = mod.init;
          status.textContent = "正在下载文件…";
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
          sharedBuf = await res.arrayBuffer();

          status.textContent = "正在解析幻灯片…";
          host.hidden = false;
          const avail = Math.min(960, Math.max(640, host.clientWidth || 960));
          slideWidth = avail;
          slideHeight = Math.round(avail * 0.5625);
          previewer = init(host, {
            width: slideWidth,
            height: slideHeight,
            mode: "slide",
          });
          await previewer.preview(sharedBuf);

          total = Number(previewer.slideCount || 0);
          if (!total || total < 1) total = 1;

          status.remove();
          await buildThumbs();
        } catch (err) {
          status.hidden = false;
          status.textContent = UI.pptxFailed.replace("{error}", err && err.message ? err.message : String(err));
          host.hidden = true;
        }

        function next() { go(current + 1); }
        function prev() { go(current - 1); }
        document.getElementById("nextBtn").onclick = next;
        document.getElementById("prevBtn").onclick = prev;
        document.getElementById("nextFab").onclick = next;
        document.getElementById("prevFab").onclick = prev;
        document.getElementById("fsBtn").onclick = function () {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
          else document.exitFullscreen?.();
        };
        window.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            next();
          }
          if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            prev();
          }
        });
      </script>
    `,
  });
}
