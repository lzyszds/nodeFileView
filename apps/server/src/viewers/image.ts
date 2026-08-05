import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderImageViewer(opts: {
  title: string;
  imageUrl: string;
  watermark?: string;
  ext?: string;
}): string {
  const isHeic = (opts.ext || "").toLowerCase() === "heic";
  const ext = opts.ext || "img";
  const ui = previewUi();

  return layout({
    title: opts.title,
    ext,
    engine: isHeic ? "heic2any" : "Canvas Matrix",
    headerActions: `
      <button type="button" data-act="download" class="primary">${escapeHtml(ui.download)}</button>
    `,
    floatingBar: `
      <button type="button" data-act="zoomOut" title="${escapeHtml(ui.zoomOut)}">−</button>
      <span class="mono" id="zoomLabel">100%</span>
      <button type="button" data-act="zoomIn" title="${escapeHtml(ui.zoomIn)}">+</button>
      <div class="sep"></div>
      <button type="button" data-act="rotateR" title="${escapeHtml(ui.rotate)}">↻</button>
      <button type="button" data-act="flipH" title="${escapeHtml(ui.flipH)}">⇋</button>
      <button type="button" data-act="flipV" title="${escapeHtml(ui.flipV)}">⇵</button>
      <div class="sep"></div>
      <button type="button" data-act="fit">适应</button>
      <button type="button" data-act="reset">1:1</button>
    `,
    head: `
      <style>
        .stage {
          height: 100%;
          display: grid;
          place-items: center;
          overflow: hidden;
          cursor: grab;
          padding: 0;
        }
        .stage.dragging { cursor: grabbing; }
        #img {
          max-width: 86%; max-height: 78%;
          transform-origin: center center;
          user-select: none; -webkit-user-drag: none;
          border-radius: 16px;
          box-shadow: var(--paper-shadow);
          border: 1px solid var(--border);
          background: #fff;
        }
        #status { color: var(--muted); }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <div class="stage" id="stage">
          <div id="status">${isHeic ? "正在转换 HEIC…" : ""}</div>
          <img id="img" alt="${escapeHtml(opts.title)}" hidden />
        </div>
      </div>
      <script>
        (async function () {
          const UI = ${JSON.stringify(ui)};
          const imageUrl = ${JSON.stringify(opts.imageUrl)};
          const isHeic = ${isHeic ? "true" : "false"};
          const img = document.getElementById("img");
          const stage = document.getElementById("stage");
          const status = document.getElementById("status");
          const zoomLabel = document.getElementById("zoomLabel");
          let scale = 1, rotate = 0, flipH = 1, flipV = 1, x = 0, y = 0;
          let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

          function apply() {
            img.style.transform = "translate(" + x + "px," + y + "px) scale(" + (scale * flipH) + "," + (scale * flipV) + ") rotate(" + rotate + "deg)";
            zoomLabel.textContent = Math.round(scale * 100) + "%";
          }

          function fit() {
            if (!img.naturalWidth) return;
            const pad = 80;
            const sxFit = (stage.clientWidth - pad) / img.naturalWidth;
            const syFit = (stage.clientHeight - pad) / img.naturalHeight;
            scale = Math.min(1, sxFit, syFit);
            x = 0; y = 0;
            apply();
          }

          async function load() {
            let url = imageUrl;
            if (isHeic) {
              const mod = await import("https://esm.sh/heic2any@0.0.4");
              const heic2any = mod.default || mod;
              const res = await fetch(imageUrl);
              if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
              const blob = await res.blob();
              const converted = await heic2any({ blob: blob, toType: "image/jpeg", quality: 0.92 });
              const out = Array.isArray(converted) ? converted[0] : converted;
              url = URL.createObjectURL(out);
            }
            await new Promise(function (resolve, reject) {
              img.onload = resolve;
              img.onerror = function () { reject(new Error("图片加载失败")); };
              img.src = url;
            });
            status.remove();
            img.hidden = false;
            fit();
          }

          try { await load(); }
          catch (err) {
            status.textContent = UI.imageFailed.replace("{error}", err && err.message ? err.message : String(err));
          }

          document.querySelectorAll("[data-act]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              const act = btn.getAttribute("data-act");
              if (act === "zoomIn") scale = Math.min(scale + 0.2, 8);
              if (act === "zoomOut") scale = Math.max(scale - 0.2, 0.1);
              if (act === "rotateR") rotate += 90;
              if (act === "flipH") flipH *= -1;
              if (act === "flipV") flipV *= -1;
              if (act === "fit") return fit();
              if (act === "reset") { scale = 1; rotate = 0; flipH = 1; flipV = 1; x = 0; y = 0; }
              if (act === "download") {
                const a = document.createElement("a");
                a.href = img.src;
                a.download = ${JSON.stringify(opts.title)};
                a.click();
                return;
              }
              apply();
            });
          });
          [
            ["zoomOut", UI.zoomOut],
            ["zoomIn", UI.zoomIn],
            ["rotateR", UI.rotate],
            ["flipH", UI.flipH],
            ["flipV", UI.flipV],
            ["fit", "Fit"],
            ["reset", "1:1"],
            ["download", UI.download],
          ].forEach(function (item) {
            window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
          });
          stage.addEventListener("wheel", function (e) {
            e.preventDefault();
            scale = Math.min(8, Math.max(0.1, scale + (e.deltaY < 0 ? 0.1 : -0.1)));
            apply();
          }, { passive: false });
          stage.addEventListener("pointerdown", function (e) {
            dragging = true; stage.classList.add("dragging");
            sx = e.clientX; sy = e.clientY; ox = x; oy = y;
            stage.setPointerCapture(e.pointerId);
          });
          stage.addEventListener("pointermove", function (e) {
            if (!dragging) return;
            x = ox + (e.clientX - sx); y = oy + (e.clientY - sy); apply();
          });
          stage.addEventListener("pointerup", function () {
            dragging = false; stage.classList.remove("dragging");
          });
        })();
      </script>
    `,
  });
}
