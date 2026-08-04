import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderImageViewer(opts: {
  title: string;
  imageUrl: string;
  watermark?: string;
}): string {
  return layout({
    title: opts.title,
    head: `
      <style>
        .stage {
          height: 100%; display: grid; place-items: center; overflow: hidden;
          cursor: grab; background:
            radial-gradient(circle at 20% 20%, #1b2738, transparent 40%),
            radial-gradient(circle at 80% 0%, #152033, transparent 35%),
            var(--bg);
        }
        .stage.dragging { cursor: grabbing; }
        #img {
          max-width: 90%; max-height: 85%; transform-origin: center center;
          transition: transform 0.05s linear; user-select: none; -webkit-user-drag: none;
          box-shadow: 0 16px 48px rgba(0,0,0,.45);
        }
      </style>
    `,
    body: `
      <div class="topbar">
        <h1>${escapeHtml(opts.title)}</h1>
        <div class="actions">
          <button data-act="zoomIn">放大</button>
          <button data-act="zoomOut">缩小</button>
          <button data-act="rotateL">左旋</button>
          <button data-act="rotateR">右旋</button>
          <button data-act="flipH">水平镜像</button>
          <button data-act="flipV">垂直镜像</button>
          <button data-act="reset">重置</button>
        </div>
      </div>
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <div class="stage" id="stage">
          <img id="img" src="${escapeHtml(opts.imageUrl)}" alt="${escapeHtml(opts.title)}" />
        </div>
      </div>
      <script>
        const img = document.getElementById("img");
        const stage = document.getElementById("stage");
        let scale = 1, rotate = 0, flipH = 1, flipV = 1, x = 0, y = 0;
        let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        function apply() {
          img.style.transform = \`translate(\${x}px,\${y}px) scale(\${scale * flipH}, \${scale * flipV}) rotate(\${rotate}deg)\`;
        }
        document.querySelectorAll("[data-act]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const act = btn.getAttribute("data-act");
            if (act === "zoomIn") scale = Math.min(scale + 0.2, 5);
            if (act === "zoomOut") scale = Math.max(scale - 0.2, 0.2);
            if (act === "rotateL") rotate -= 90;
            if (act === "rotateR") rotate += 90;
            if (act === "flipH") flipH *= -1;
            if (act === "flipV") flipV *= -1;
            if (act === "reset") { scale = 1; rotate = 0; flipH = 1; flipV = 1; x = 0; y = 0; }
            apply();
          });
        });
        stage.addEventListener("wheel", (e) => {
          e.preventDefault();
          scale = Math.min(5, Math.max(0.2, scale + (e.deltaY < 0 ? 0.1 : -0.1)));
          apply();
        }, { passive: false });
        stage.addEventListener("pointerdown", (e) => {
          dragging = true; stage.classList.add("dragging");
          sx = e.clientX; sy = e.clientY; ox = x; oy = y; stage.setPointerCapture(e.pointerId);
        });
        stage.addEventListener("pointermove", (e) => {
          if (!dragging) return;
          x = ox + (e.clientX - sx); y = oy + (e.clientY - sy); apply();
        });
        stage.addEventListener("pointerup", () => { dragging = false; stage.classList.remove("dragging"); });
      </script>
    `,
  });
}
