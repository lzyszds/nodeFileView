import { escapeHtml, layout } from "./layout.js";

export function renderPasswordGate(opts: {
  fields: Record<string, string | undefined>;
  error?: string;
}): string {
  const hidden = Object.entries(opts.fields)
    .filter(([k, v]) => k !== "password" && v != null && v !== "")
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}" />`,
    )
    .join("\n");

  return layout({
    title: "需要预览密码",
    body: `
      <div class="topbar"><h1>需要预览密码</h1></div>
      <div class="empty">
        ${opts.error ? `<p style="color:#f0a0a0">${escapeHtml(opts.error)}</p>` : "<p>此预览受密码保护</p>"}
        <form method="GET" action="/onlinePreview" style="display:inline-grid;gap:10px;justify-items:center">
          ${hidden}
          <input name="password" type="password" placeholder="预览密码" autocomplete="current-password" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:#111827;color:#fff;min-width:240px" />
          <button type="submit">进入预览</button>
        </form>
      </div>
    `,
  });
}
