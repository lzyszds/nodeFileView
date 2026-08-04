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
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-Content-Type-Options" content="nosniff" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --accent: #3d8bfd;
      --border: #2a3548;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: "IBM Plex Sans", "Segoe UI", sans-serif; }
    .topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel);
      position: sticky; top: 0; z-index: 10;
    }
    .topbar h1 { margin: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .topbar .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button, .btn {
      background: #243044; color: var(--text); border: 1px solid var(--border);
      border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px;
    }
    button:hover, .btn:hover { border-color: var(--accent); }
    .viewer { position: relative; height: calc(100% - 49px); overflow: auto; }
    .empty { padding: 48px; text-align: center; color: var(--muted); }
    .watermark {
      pointer-events: none; position: fixed; inset: 0; z-index: 5;
      background-image: repeating-linear-gradient(
        -28deg,
        transparent 0,
        transparent 80px,
        rgba(255,255,255,0.04) 80px,
        rgba(255,255,255,0.04) 160px
      );
    }
    .watermark::after {
      content: attr(data-text);
      position: absolute; inset: 0;
      display: grid; place-items: center;
      font-size: 42px; color: rgba(255,255,255,0.12);
      transform: rotate(-28deg); white-space: nowrap; font-weight: 700;
      letter-spacing: 0.08em;
    }
  </style>
  ${opts.head || ""}
</head>
<body>
  ${opts.body}
</body>
</html>`;
}

export { escapeHtml };

export function watermarkLayer(text?: string): string {
  if (!text) return "";
  return `<div class="watermark" data-text="${escapeHtml(text)}"></div>`;
}
