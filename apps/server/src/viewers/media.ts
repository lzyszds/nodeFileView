import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderMediaViewer(opts: {
  title: string;
  mediaUrl: string;
  audio: boolean;
  watermark?: string;
}): string {
  const ui = previewUi();
  const ext = opts.title.includes(".")
    ? opts.title.split(".").pop() || (opts.audio ? "mp3" : "mp4")
    : opts.audio
      ? "mp3"
      : "mp4";

  return layout({
    title: opts.title,
    ext,
    engine: "Plyr 3",
    headerActions: `
      <button type="button" id="pipBtn" ${opts.audio ? "hidden" : ""}>PiP</button>
      <button type="button" id="fsBtn">${escapeHtml(ui.fullscreen)}</button>
      <button type="button" class="primary" id="dlBtn">${escapeHtml(ui.download)}</button>
    `,
    floatingBar: `
      <span class="mono" id="infoLabel">${opts.audio ? "Audio" : "Video"}</span>
      <div class="sep"></div>
      <span class="mono" id="timeLabel">--:--</span>
    `,
    head: `
      <link rel="stylesheet" href="https://cdn.plyr.io/3.8.3/plyr.css" />
      <style>
        :root {
          --plyr-color-main: #4f46e5;
          --plyr-video-background: #0f172a;
          --plyr-audio-controls-background: #fff;
          --plyr-audio-control-color: #334155;
          --plyr-range-fill-background: #4f46e5;
        }
        .media-shell {
          height: 100%;
          display: grid;
          place-items: center;
          padding: 16px;
          overflow: hidden;
        }
        .media-card {
          width: min(1100px, 100%);
          max-height: calc(100vh - 72px);
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .plyr-wrap {
          background: #0f172a;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--paper-shadow);
          border: 1px solid var(--border);
        }
        .plyr-wrap.audio {
          background: #fff;
          padding: 8px;
        }
        .plyr {
          --plyr-control-radius: 8px;
        }
        .plyr--video,
        .plyr--video .plyr__video-wrapper,
        .plyr--video video {
          max-height: calc(100vh - 160px);
        }
        .plyr--video video {
          width: 100%;
          height: auto;
          object-fit: contain;
        }
        .meta-row {
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 12px;
          color: var(--muted);
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <div class="media-shell">
          <div class="media-card">
            <div class="plyr-wrap ${opts.audio ? "audio" : ""}">
              ${
                opts.audio
                  ? `<audio id="player" playsinline controls>
                       <source src="${escapeHtml(opts.mediaUrl)}" />
                     </audio>`
                  : `<video id="player" playsinline controls crossorigin="anonymous">
                       <source src="${escapeHtml(opts.mediaUrl)}" />
                     </video>`
              }
            </div>
            <div class="meta-row">
              <span id="detail">${escapeHtml(opts.audio ? ui.mediaAudio : ui.mediaVideo)}</span>
              <span id="duration"></span>
            </div>
          </div>
        </div>
      </div>
      <script src="https://cdn.plyr.io/3.8.3/plyr.polyfilled.js"></script>
      <script>
        const mediaUrl = ${JSON.stringify(opts.mediaUrl)};
        const isAudio = ${opts.audio ? "true" : "false"};
        const player = new Plyr("#player", {
          controls: [
            "play-large", "play", "progress", "current-time", "duration",
            "mute", "volume", "settings", "pip", "fullscreen"
          ],
          settings: ["quality", "speed"],
          speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
          keyboard: { focused: true, global: true },
          tooltips: { controls: true, seek: true },
          i18n: {
            play: "播放", pause: "暂停", mute: "静音", unmute: "取消静音",
            enterFullscreen: "全屏", exitFullscreen: "退出全屏",
            pip: "画中画", settings: "设置", speed: "速度", normal: "正常"
          }
        });
        [
          ["pipBtn", "画中画"],
          ["fsBtn", "全屏"],
          ["dlBtn", "下载"],
        ].forEach(function (item) {
          window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
        });

        function fmt(sec) {
          if (!isFinite(sec)) return "--:--";
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          return m + ":" + String(s).padStart(2, "0");
        }

        player.on("loadedmetadata", function () {
          const media = player.media;
          const dur = fmt(player.duration);
          document.getElementById("timeLabel").textContent = dur;
          document.getElementById("duration").textContent = "时长 " + dur;
          let detail = isAudio ? "音频" : "视频";
          if (!isAudio && media && media.videoWidth) {
            detail += " · " + media.videoWidth + "×" + media.videoHeight;
          }
          document.getElementById("detail").textContent = detail + " · Plyr";
          document.getElementById("infoLabel").textContent =
            isAudio ? "Audio" : (media && media.videoWidth ? media.videoWidth + "p" : "Video");
        });
        player.on("timeupdate", function () {
          document.getElementById("timeLabel").textContent =
            fmt(player.currentTime) + " / " + fmt(player.duration);
        });

        document.getElementById("dlBtn").onclick = function () {
          const a = document.createElement("a");
          a.href = mediaUrl;
          a.download = ${JSON.stringify(opts.title)};
          a.click();
        };
        document.getElementById("fsBtn").onclick = function () {
          player.fullscreen.toggle();
        };
        const pipBtn = document.getElementById("pipBtn");
        if (pipBtn) {
          pipBtn.onclick = function () {
            try { player.pip = !player.pip; }
            catch (e) { alert(e.message || "当前浏览器不支持画中画"); }
          };
        }
      </script>
    `,
  });
}
