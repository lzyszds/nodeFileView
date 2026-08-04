import type { ArchiveEntry } from "../services/archives/zipService.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderArchiveViewer(opts: {
  title: string;
  fileId: string;
  entries: ArchiveEntry[];
  watermark?: string;
}): string {
  const rows = opts.entries
    .map((e) => {
      if (e.isDirectory) {
        return `<tr><td colspan="3" class="dir">${escapeHtml(e.path)}</td></tr>`;
      }
      const encoded = Buffer.from(`file://local/${opts.fileId}`, "utf8").toString(
        "base64",
      );
      const href = `/onlinePreview?url=${encodeURIComponent(encoded)}&archiveEntry=${encodeURIComponent(e.path)}`;
      return `<tr>
        <td><a href="${href}" target="_blank" rel="noopener">${escapeHtml(e.path)}</a></td>
        <td>${e.size}</td>
        <td><a class="btn" href="${href}" target="_blank" rel="noopener">预览</a></td>
      </tr>`;
    })
    .join("");

  return layout({
    title: opts.title,
    head: `
      <style>
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
        th { color: var(--muted); font-weight: 500; position: sticky; top: 0; background: var(--panel); }
        a { color: var(--accent); text-decoration: none; }
        .dir { color: var(--muted); font-family: monospace; }
      </style>
    `,
    body: `
      <div class="topbar"><h1>${escapeHtml(opts.title)} · 压缩包目录</h1></div>
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <table>
          <thead><tr><th>路径</th><th>大小</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="empty">空压缩包</td></tr>`}</tbody>
        </table>
      </div>
    `,
  });
}

export function renderErrorPage(message: string, status = 400): string {
  return layout({
    title: "预览失败",
    body: `
      <div class="topbar"><h1>预览失败</h1></div>
      <div class="empty">
        <p>${escapeHtml(message)}</p>
        <p style="font-size:12px">HTTP ${status}</p>
      </div>
    `,
  });
}

export function renderUnsupported(opts: {
  title: string;
  ext: string;
}): string {
  return layout({
    title: opts.title,
    body: `
      <div class="topbar"><h1>${escapeHtml(opts.title)}</h1></div>
      <div class="empty">
        <p>格式 .${escapeHtml(opts.ext)} 暂未在一期支持，或需要额外依赖。</p>
        <p style="font-size:13px;color:var(--muted)">Office / 图片 / 文本 / zip / 常见音视频已支持。</p>
      </div>
    `,
  });
}
