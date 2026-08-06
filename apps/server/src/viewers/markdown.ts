import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderMarkdownViewer(opts: {
  title: string;
  content: string;
  watermark?: string;
  truncated?: boolean;
}): string {
  const raw = marked.parse(opts.content, {
    gfm: true,
    breaks: false,
  });
  const html = DOMPurify.sanitize(typeof raw === "string" ? raw : String(raw));
  const ui = previewUi();

  return layout({
    title: opts.title,
    ext: "md",
    engine: "marked · GFM",
    head: `
      <style>
        .md-viewer {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .md-wrap {
          max-width: none;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 20px 24px 32px;
          overflow: auto;
          box-sizing: border-box;
        }
        .md {
          background: #fff;
          border: 0;
          border-radius: 0;
          padding: 0;
          line-height: 1.7;
          box-shadow: none;
          max-width: 900px;
          margin: 0 auto;
        }
        .md h1,.md h2,.md h3 { margin-top: 1.4em; line-height: 1.3; }
        .md h1 { border-bottom: 1px solid var(--border); padding-bottom: .3em; }
        .md h2 { border-bottom: 1px solid #eef2f7; padding-bottom: .25em; }
        .md hr {
          border: 0;
          border-top: 1px solid #eef2f7;
          margin: 1.5em 0;
        }
        .md code {
          background: #f1f5f9; padding: .15em .4em; border-radius: 4px;
          font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .92em;
        }
        .md pre {
          background: #f8fafc; color: #0f172a; padding: 14px 16px;
          border-radius: 10px; overflow: auto; border: 1px solid var(--border);
        }
        .md pre code { background: transparent; color: inherit; padding: 0; }
        .md blockquote {
          margin: 0; padding: .2em 1em; color: var(--muted);
          border-left: 4px solid #c7d2fe;
          background: #eef2ff55;
          border-radius: 0 8px 8px 0;
        }
        .md table { border-collapse: collapse; width: 100%; }
        .md th,.md td { border: 1px solid var(--border); padding: 8px 10px; }
        .md th { background: #f8fafc; }
        .md img { max-width: 100%; border-radius: 8px; }
        .md a { color: var(--accent-600); }
        #mdEditor {
          display: none;
          flex: 1;
          min-height: 0;
          width: 100%;
          border: 0;
          outline: none;
          resize: none;
          padding: 20px 24px;
          box-sizing: border-box;
          font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
          font-size: 14px;
          line-height: 1.6;
          color: #0f172a;
          background: #fff;
        }
        body.md-editing .md-wrap { display: none; }
        body.md-editing #mdEditor { display: block; }
        .notice {
          max-width: none; margin: 0; padding: 8px 12px;
          background: #fffbeb; color: #92400e; border: 0;
          border-bottom: 1px solid #fde68a; border-radius: 0; font-size: 12px;
          flex-shrink: 0;
        }
      </style>
    `,
    body: `
      <div class="md-viewer">
        <div class="nfv-local-bar">
          <span class="meta">${escapeHtml(opts.title)}</span>
          <button type="button" id="editBtn">${escapeHtml(ui.edit)}</button>
          <button type="button" id="saveBtn" class="primary">${escapeHtml(ui.save)}</button>
          <button type="button" id="forwardBtn">${escapeHtml(ui.forward)}</button>
        </div>
        ${opts.truncated ? `<div class="notice">文件较大，仅渲染前部分 Markdown</div>` : ""}
        <div class="notice" id="editNotice" hidden></div>
        ${watermarkLayer(opts.watermark)}
        <div class="md-wrap" id="mdWrap"><article class="md" id="mdArticle">${html}</article></div>
        <textarea id="mdEditor" spellcheck="false" aria-label="Markdown 编辑"></textarea>
      </div>
      <script type="module">
        import { marked } from "https://esm.sh/marked@15.0.7";
        const UI = ${JSON.stringify(ui)};
        let content = ${JSON.stringify(opts.content)};
        const fileTitle = ${JSON.stringify(opts.title)};
        let editing = false;
        let dirty = false;
        const article = document.getElementById("mdArticle");
        const editor = document.getElementById("mdEditor");
        const editBtn = document.getElementById("editBtn");
        const saveBtn = document.getElementById("saveBtn");
        const forwardBtn = document.getElementById("forwardBtn");
        const editNotice = document.getElementById("editNotice");

        function doForward() {
          const text = editing ? editor.value : content;
          const isDirty = dirty || (editing && editor.value !== content);
          const name = fileTitle && /\\.md$/i.test(fileTitle) ? fileTitle : (fileTitle || "document") + ".md";
          const bytes = new TextEncoder().encode(text);
          const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const detail = {
            kind: "markdown",
            title: fileTitle,
            fileName: name,
            mimeType: "text/markdown;charset=utf-8",
            dirty: isDirty,
            byteLength: data.byteLength,
            data: data,
            base64: bufferToBase64(data),
          };
          window.__NFV_PREVIEW__?.emit("forward", detail);
          return detail;
        }
        function bufferToBase64(buf) {
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
          }
          return btoa(binary);
        }
        window.__NFV_PREVIEW__?.registerAction(
          "forward",
          { label: UI.forward, kind: "method" },
          doForward,
        );

        function escapeHtml(s) {
          return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }

        function sanitizeHtml(html) {
          const doc = new DOMParser().parseFromString(
            "<div id='root'>" + html + "</div>",
            "text/html",
          );
          doc.querySelectorAll("script,iframe,object,embed,link,meta").forEach(function (el) {
            el.remove();
          });
          doc.querySelectorAll("*").forEach(function (el) {
            Array.from(el.attributes).forEach(function (attr) {
              const name = attr.name.toLowerCase();
              const value = String(attr.value || "");
              if (name.startsWith("on") || (name === "href" && /^javascript:/i.test(value))) {
                el.removeAttribute(attr.name);
              }
            });
          });
          const root = doc.getElementById("root");
          return root ? root.innerHTML : "";
        }

        function renderMarkdown(src) {
          try {
            const html = marked.parse(src, { gfm: true, breaks: false });
            article.innerHTML = sanitizeHtml(typeof html === "string" ? html : String(html));
          } catch (_) {
            article.innerHTML = "<pre>" + escapeHtml(src) + "</pre>";
          }
        }

        function setEditing(on) {
          const wrap = document.getElementById("mdWrap");
          if (on) {
            const savedTop = wrap ? wrap.scrollTop : 0;
            const savedMax = wrap ? Math.max(1, wrap.scrollHeight - wrap.clientHeight) : 1;
            const ratio = savedTop / savedMax;
            editor.value = content;
            editing = true;
            document.body.classList.add("md-editing");
            editBtn.textContent = UI.doneEdit;
            editBtn.classList.add("active");
            editNotice.hidden = false;
            editNotice.textContent = "编辑中：改完点「完成编辑」预览，或直接「保存」下载。";
            editor.focus({ preventScroll: true });
            requestAnimationFrame(function () {
              const maxE = Math.max(1, editor.scrollHeight - editor.clientHeight);
              editor.scrollTop = Math.round(ratio * maxE);
            });
          } else {
            const savedTop = editor.scrollTop;
            const savedMax = Math.max(1, editor.scrollHeight - editor.clientHeight);
            const ratio = savedTop / savedMax;
            const next = editor.value;
            if (next !== content) dirty = true;
            content = next;
            editing = false;
            document.body.classList.remove("md-editing");
            editBtn.textContent = UI.edit;
            editBtn.classList.remove("active");
            editNotice.hidden = !dirty;
            if (dirty) editNotice.textContent = "已修改，点「保存」下载文件。";
            renderMarkdown(content);
            requestAnimationFrame(function () {
              if (!wrap) return;
              const maxW = Math.max(1, wrap.scrollHeight - wrap.clientHeight);
              wrap.scrollTop = Math.round(ratio * maxW);
            });
          }
        }

        function saveDownload() {
          if (editing) {
            const next = editor.value;
            if (next !== content) dirty = true;
            content = next;
          }
          const name = fileTitle && /\\.md$/i.test(fileTitle) ? fileTitle : (fileTitle || "document") + ".md";
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
          a.download = name;
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
        }

        editBtn.onclick = function () { setEditing(!editing); };
        saveBtn.onclick = function () { saveDownload(); };
        forwardBtn.onclick = function () { doForward(); };
      </script>
    `,
  });
}
