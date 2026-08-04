import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderMediaViewer(opts: {
  title: string;
  mediaUrl: string;
  audio: boolean;
  watermark?: string;
}): string {
  const tag = opts.audio
    ? `<audio controls src="${escapeHtml(opts.mediaUrl)}" style="width:min(720px,92%)"></audio>`
    : `<video controls src="${escapeHtml(opts.mediaUrl)}" style="max-width:92%;max-height:80vh;background:#000"></video>`;

  return layout({
    title: opts.title,
    head: `
      <style>
        .stage { height: 100%; display: grid; place-items: center; padding: 24px; }
      </style>
    `,
    body: `
      <div class="topbar"><h1>${escapeHtml(opts.title)}</h1></div>
      ${watermarkLayer(opts.watermark)}
      <div class="viewer"><div class="stage">${tag}</div></div>
    `,
  });
}
