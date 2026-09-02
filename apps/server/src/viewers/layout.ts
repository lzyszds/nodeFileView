import { htmlLang } from "../i18n/index.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout(opts: {
  title: string;
  body: string;
  head?: string;
  /** 扩展名徽章，如 docx / mp4 */
  ext?: string;
  /** 渲染引擎文案，显示在底栏 */
  engine?: string;
  /** 顶栏右侧操作区 HTML */
  headerActions?: string;
  /** 悬浮工具栏内部 HTML（可选） */
  floatingBar?: string;
  /** 底栏左侧补充 */
  footerLeft?: string;
  /** full=通用预览壳；content=仅主题样式，供 Word/Excel 等自带 chrome 使用 */
  chrome?: "full" | "content";
  /** html lang，默认由 i18n 提供 */
  lang?: string;
}): string {
  const engine = opts.engine || "filePreview";
  const chrome = opts.chrome || "full";
  const isFull = chrome === "full";
  const lang = opts.lang || htmlLang();

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-Content-Type-Options" content="nosniff" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
  <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" /></noscript>
  <style>
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --text: #1e293b;
      --muted: #64748b;
      --accent: #4f46e5;
      --accent-600: #4f46e5;
      --accent-700: #4338ca;
      --accent-soft: #eef2ff;
      --border: #e2e8f0;
      --hover: #f1f5f9;
      --ok: #059669;
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
      --paper-shadow:
        0 20px 25px -5px rgba(15, 23, 42, 0.05),
        0 8px 10px -6px rgba(15, 23, 42, 0.03),
        0 0 0 1px rgba(15, 23, 42, 0.06);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      max-width: 100vw;
      max-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      overflow: hidden;
    }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

    .uv-app {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Header — 参考 Universal View */
    .uv-header, .topbar {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 0 16px;
      background: rgba(255,255,255,.82);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(226,232,240,.9);
      position: relative;
      z-index: 50;
      flex-shrink: 0;
    }
    .uv-header,
    .topbar,
    .uv-float {
      display: none !important;
    }
    /* 页内编辑条：仅本页可见，不走宿主 bridge */
    .nfv-local-bar {
      display: flex !important;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 12px;
      background: #fff;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      position: relative;
      z-index: 40;
      box-sizing: border-box;
    }
    .nfv-local-bar .meta {
      margin-right: auto;
      color: var(--muted);
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .uv-brand { display: none; }
    .uv-logo, .uv-divider, .uv-ext { display: none; }
    .uv-header h1, .topbar h1 { display: none; }
    .uv-header .actions, .topbar .actions {
      display: flex; gap: 8px; flex-wrap: wrap; align-items: center; flex-shrink: 0;
    }
    .topbar .meta, .uv-meta { color: var(--muted); font-size: 12px; }

    button, .btn {
      background: #fff;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      box-shadow: var(--shadow);
      transition: background .15s, border-color .15s, color .15s;
    }
    button:hover, .btn:hover {
      background: var(--hover);
      border-color: #cbd5e1;
    }
    button.active {
      background: var(--accent-soft);
      border-color: #c7d2fe;
      color: var(--accent-700);
    }
    button.primary {
      background: var(--accent-600);
      border-color: var(--accent-600);
      color: #fff;
      box-shadow: 0 4px 10px rgba(79,70,229,.22);
    }
    button.primary:hover {
      background: var(--accent-700);
      border-color: var(--accent-700);
      color: #fff;
    }
    button:disabled { opacity: 0.45; cursor: not-allowed; }

    /* Canvas */
    .uv-main {
      flex: 1;
      min-height: 0;
      width: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
    }
    .viewer, .shell {
      position: relative;
      flex: 1;
      min-height: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
    }
    .paper-shadow { box-shadow: var(--paper-shadow); }

    /* Floating control bar — 不挡内容：贴顶栏下方工具条 */
    .uv-float {
      position: relative;
      top: auto;
      left: auto;
      transform: none;
      z-index: 30;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 6px 14px;
      background: #fff;
      border-bottom: 1px solid var(--border);
      border-radius: 0;
      box-shadow: none;
      font-size: 12px;
      color: #334155;
      flex-shrink: 0;
    }
    .uv-float button {
      border: none;
      box-shadow: none;
      border-radius: 999px;
      padding: 4px 8px;
      background: transparent;
    }
    .uv-float button:hover { background: #f1f5f9; }
    .uv-float .sep {
      width: 1px; height: 14px; background: #e2e8f0; margin: 0 2px;
    }
    .uv-float .mono {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-weight: 500;
      color: #475569;
      min-width: 4.5em;
      text-align: center;
    }

    /* Footer — 已隐藏，嵌入预览不需要底栏 */
    .uv-footer { display: none !important; }

    .empty {
      padding: 64px 24px;
      text-align: center;
      color: var(--muted);
    }

    /* Watermark */
    .watermark {
      pointer-events: none;
      position: absolute;
      inset: 0;
      z-index: 40;
      overflow: hidden;
    }
  </style>
  ${opts.head || ""}
</head>
<body>
  <script>
    (function () {
      const targetNames = ["filePreviewHost", "previewHostBridge", "electronAPI"];
      const actions = new Map();
      let readySent = false;
      let state = {};

      function post(type, detail) {
        const payload = { source: "filePreviewPreview", type: type, detail: detail };
        window.dispatchEvent(new CustomEvent("nfv-preview:" + type, { detail: detail }));
        if (window.parent && window.parent !== window) {
          try { window.parent.postMessage(payload, "*"); } catch (_) {}
        }
        targetNames.forEach(function (name) {
          const target = window[name];
          if (!target) return;
          try {
            if (typeof target.postMessage === "function") target.postMessage(payload);
            if (typeof target.emit === "function") target.emit(type, detail);
            if (typeof target.send === "function") target.send("node-file-view-preview", payload);
          } catch (_) {}
        });
      }

      function snapshotActions() {
        return Array.from(actions.values()).map(function (entry) {
          return {
            id: entry.id,
            label: entry.label,
            kind: entry.kind || "button",
            disabled: entry.getDisabled ? Boolean(entry.getDisabled()) : false,
          };
        });
      }

      function syncActions() {
        post("actions-change", { actions: snapshotActions() });
      }

      function ensureReady() {
        if (readySent) return;
        readySent = true;
        post("ready", {
          title: document.title,
          actions: snapshotActions(),
          state: state,
        });
      }

      window.__NFV_PREVIEW__ = {
        registerAction: function (id, meta, handler, getDisabled) {
          actions.set(id, {
            id: id,
            label: meta && meta.label ? meta.label : id,
            kind: meta && meta.kind ? meta.kind : "button",
            handler: handler,
            getDisabled: getDisabled,
          });
          ensureReady();
          syncActions();
        },
        registerButtonAction: function (id, meta) {
          const el = document.getElementById(id) || document.querySelector('[data-act="' + id + '"]');
          if (!el) return false;
          this.registerAction(
            id,
            meta,
            function () {
              if (el.disabled) return false;
              el.click();
              return true;
            },
            function () {
              return Boolean(el.disabled || el.hidden);
            },
          );
          return true;
        },
        invoke: function (id, payload) {
          const entry = actions.get(id);
          if (!entry) {
            return Promise.reject(new Error("Unknown preview action: " + id));
          }
          post("action-invoked", { id: id, payload: payload });
          return Promise.resolve(entry.handler(payload))
            .then(function (result) {
              post("action-result", { id: id, result: result });
              return result;
            })
            .catch(function (error) {
              post("action-error", {
                id: id,
                message: error && error.message ? error.message : String(error),
              });
              throw error;
            });
        },
        setState: function (nextState) {
          state = Object.assign({}, state, nextState || {});
          ensureReady();
          post("state-change", state);
        },
        emit: post,
        getActions: snapshotActions,
      };

      window.addEventListener("message", function (event) {
        const data = event.data;
        if (!data || data.source !== "filePreviewHost") return;
        if (data.type === "invoke-action" && data.actionId) {
          window.__NFV_PREVIEW__.invoke(data.actionId, data.payload);
        }
      });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureReady, { once: true });
      } else {
        ensureReady();
      }
    })();
  </script>
  ${
    isFull
      ? `<div class="uv-app">
    ${
      opts.headerActions
        ? `<header class="uv-header topbar">
      <div class="actions" style="margin-left:auto">${opts.headerActions}</div>
    </header>`
        : ""
    }
    <div class="uv-main">
      ${opts.floatingBar ? `<div class="uv-float">${opts.floatingBar}</div>` : ""}
      ${opts.body}
    </div>
  </div>`
      : opts.body
  }
</body>
</html>`;
}

export { escapeHtml };

export function watermarkLayer(text?: string): string {
  if (!text) return "";
  const safe = JSON.stringify(text);
  return `<div class="watermark" id="uv-watermark"></div>
<script>
(function () {
  var text = ${safe};
  var overlay = document.getElementById("uv-watermark");
  if (!overlay) return;
  var canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.rotate(-22 * Math.PI / 180);
  ctx.font = "13px Inter, sans-serif";
  ctx.fillStyle = "rgba(100, 116, 139, 0.12)";
  ctx.fillText(text, 30, 160);
  overlay.style.backgroundImage = "url(" + canvas.toDataURL("image/png") + ")";
})();
</script>`;
}
