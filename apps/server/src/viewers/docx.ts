import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderDocxViewer(opts: {
  title: string;
  fileUrl: string;
  watermark?: string;
  highlight?: string;
}): string {
  const highlight = opts.highlight || "";
  const safeTitle = escapeHtml(opts.title);
  const downloadBase = opts.title.replace(/\.docx$/i, "") || "document";

  return layout({
    title: opts.title,
    chrome: "content",
    head: `
      <style>
        :root {
          --word-chrome: #f3f3f3;
          --word-border: #d4d4d4;
          --word-canvas: #ffffff;
          --word-text: #242424;
          --word-muted: #616161;
          --word-accent: #185abd;
          --sidebar-w: 280px;
        }
        /* 用 fixed inset 铺满宿主（含 iframe），避免 100vh/100% 链断裂留下空隙 */
        html, body {
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: var(--word-chrome) !important;
          color: var(--word-text) !important;
          font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif !important;
        }
        .topbar {
          background: #fff !important;
          border-bottom: 1px solid var(--word-border) !important;
          color: var(--word-text) !important;
          box-shadow: 0 1px 0 rgba(0,0,0,.04);
          display: none !important;
        }
        .topbar h1 { display: none !important; }
        .topbar .meta { color: var(--word-muted); font-size: 12px; }
        .topbar button, .topbar .btn, .toolbar button {
          background: #fff;
          color: var(--word-text);
          border: 1px solid var(--word-border);
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 13px;
          cursor: pointer;
        }
        .topbar button:hover, .toolbar button:hover {
          background: #eff6fc;
          border-color: #c7e0f4;
          color: var(--word-accent);
        }
        .topbar button.active, .toolbar button.active {
          background: #deecf9;
          border-color: #b4d6f0;
          color: var(--word-accent);
        }
        .topbar button:disabled, .toolbar button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }
        .sep { width: 1px; height: 20px; background: var(--word-border); margin: 0 4px; }
        .shell {
          position: fixed !important;
          inset: 0 !important;
          width: auto !important;
          height: auto !important;
          max-width: none !important;
          max-height: none !important;
          display: grid !important;
          grid-template-columns: var(--sidebar-w) 1fr;
          grid-template-rows: 1fr;
          overflow: hidden !important;
          flex: none !important;
          background: var(--word-chrome);
        }
        .shell.sidebar-collapsed {
          grid-template-columns: 0 1fr;
        }
        .shell.sidebar-collapsed .sidebar {
          overflow: hidden;
          border: 0;
          padding: 0;
        }
        .sidebar {
          background: #fafafa;
          border-right: 1px solid var(--word-border);
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          height: 100%;
          align-self: stretch;
        }
        .sidebar-hd {
          padding: 12px 14px;
          font-size: 12px;
          font-weight: 600;
          color: var(--word-muted);
          border-bottom: 1px solid var(--word-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .outline {
          overflow: auto;
          padding: 8px;
          flex: 1;
          min-height: 0;
        }
        .outline a {
          display: block;
          color: var(--word-text);
          text-decoration: none;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 12.5px;
          line-height: 1.35;
          border-left: 2px solid transparent;
        }
        .outline a:hover { background: #eef4fb; }
        .outline a.active {
          background: #deecf9;
          border-left-color: var(--word-accent);
          color: var(--word-accent);
        }
        .outline a.lv1 { font-weight: 600; }
        .outline a.lv2 { padding-left: 18px; }
        .outline a.lv3 { padding-left: 28px; color: #444; }
        .outline a.lv4, .outline a.lv5, .outline a.lv6 { padding-left: 36px; color: #666; }
        .outline .empty {
          color: var(--word-muted);
          font-size: 12px;
          padding: 16px 8px;
        }
        .main {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          height: 100% !important;
          overflow: hidden;
          align-self: stretch;
        }
        .toolbar {
          display: none;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
          padding: 8px 12px;
          background: #fff;
          border-bottom: 1px solid var(--word-border);
        }
        .toolbar.visible { display: none !important; }
        .toolbar .hint {
          margin-left: auto;
          font-size: 12px;
          color: var(--word-muted);
        }
        .viewer {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          height: auto !important;
          overflow: auto !important;
          background: #fff;
          position: relative;
        }
        #status {
          padding: 48px 24px;
          text-align: center;
          color: #eee;
          font-size: 14px;
        }
        #docx-root {
          padding: 0 !important;
          margin: 0 !important;
          min-height: 100%;
          width: 100%;
        }
        #docx-root .docx-wrapper {
          background: #fff !important;
          padding: 0 !important;
          margin: 0 !important;
          display: block !important;
          width: 100% !important;
          max-width: none !important;
          gap: 0 !important;
        }
        #docx-root .docx-wrapper > section.docx {
          background: #fff !important;
          box-shadow: none !important;
          margin: 0 !important;
          margin-bottom: 0 !important;
          width: 100% !important;
          max-width: none !important;
          min-height: 0 !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          color: #000;
          transform-origin: top left;
          box-sizing: border-box !important;
        }
        #docx-root .docx-wrapper > section.docx + section.docx {
          border-top: 1px dashed #e5e7eb;
          padding-top: 16px !important;
        }
        body.editing #docx-root .docx-wrapper > section.docx article {
          outline: 1px dashed #9dc3e6;
          outline-offset: 4px;
          min-height: 2em;
        }
        body.editing #docx-root .docx-wrapper > section.docx article:focus {
          outline: 2px solid #185abd;
        }
        #docx-root mark.nfv-hl {
          background: #fff2a8;
          color: inherit;
          padding: 0 .05em;
          border-radius: 2px;
        }
        .watermark {
          background-image: repeating-linear-gradient(
            -28deg,
            transparent 0,
            transparent 90px,
            rgba(0,0,0,0.03) 90px,
            rgba(0,0,0,0.03) 180px
          ) !important;
        }
        .watermark::after { color: rgba(0,0,0,0.08) !important; }
        @media (max-width: 900px) {
          :root { --sidebar-w: 220px; }
        }
        @media (max-width: 720px) {
          .shell { grid-template-columns: 1fr !important; }
          .sidebar {
            position: absolute;
            z-index: 20;
            left: 0; top: 0; bottom: 0;
            width: min(80vw, 280px);
            height: 100%;
            box-shadow: 8px 0 24px rgba(0,0,0,.18);
            transform: translateX(-105%);
            transition: transform .2s ease;
          }
          .shell.sidebar-open .sidebar { transform: translateX(0); }
        }
        @media print {
          .topbar, .sidebar, .toolbar, .watermark { display: none !important; }
          .shell {
            display: block !important;
            position: static !important;
            inset: auto !important;
            height: auto !important;
            width: auto !important;
          }
          .viewer { height: auto !important; overflow: visible !important; background: #fff !important; }
          #docx-root { padding: 0 !important; }
          #docx-root .docx-wrapper > section.docx {
            box-shadow: none !important;
            transform: none !important;
            margin: 0 !important;
          }
        }
      </style>
    `,
    body: `
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
          <button type="button" id="toggleSidebar" title="目录">目录</button>
          <span class="meta" id="pageMeta"></span>
        </div>
        <div class="actions">
          <button type="button" id="editBtn">编辑</button>
          <button type="button" id="downloadBtn" disabled>下载 DOCX</button>
          <span class="sep"></span>
          <button type="button" id="zoomOut" title="缩小">−</button>
          <button type="button" id="zoomLabel" class="active" style="min-width:64px">100%</button>
          <button type="button" id="zoomIn" title="放大">+</button>
          <span class="sep"></span>
          <button type="button" id="fitWidth">适合宽度</button>
          <button type="button" id="fitPage">实际大小</button>
          <button type="button" id="printBtn">打印</button>
        </div>
      </div>
      ${watermarkLayer(opts.watermark)}
      <div class="shell" id="shell">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-hd">
            <span>文档目录</span>
            <button type="button" id="refreshOutline" style="padding:3px 8px;font-size:12px">刷新</button>
          </div>
          <nav class="outline" id="outline">
            <div class="empty">加载后自动生成标题目录</div>
          </nav>
        </aside>
        <div class="main">
          <div class="toolbar" id="editToolbar">
            <button type="button" data-cmd="bold" title="加粗"><b>B</b></button>
            <button type="button" data-cmd="italic" title="斜体"><i>I</i></button>
            <button type="button" data-cmd="underline" title="下划线"><u>U</u></button>
            <span class="sep"></span>
            <button type="button" data-cmd="insertUnorderedList">• 列表</button>
            <button type="button" data-cmd="insertOrderedList">1. 列表</button>
            <span class="sep"></span>
            <button type="button" data-block="H1">标题1</button>
            <button type="button" data-block="H2">标题2</button>
            <button type="button" data-block="P">正文</button>
            <span class="sep"></span>
            <button type="button" data-cmd="undo">撤销</button>
            <button type="button" data-cmd="redo">重做</button>
            <span class="hint">编辑后可下载新的 DOCX（版式会尽量保留，复杂对象可能简化）</span>
          </div>
          <div class="viewer" id="viewer">
            <div id="status">正在加载 Word 文档…</div>
            <div id="docx-root" hidden></div>
          </div>
        </div>
      </div>
      <script>
        (async function () {
          const fileUrl = ${JSON.stringify(opts.fileUrl)};
          const keyword = ${JSON.stringify(highlight)};
          const downloadBase = ${JSON.stringify(downloadBase)};
          const status = document.getElementById("status");
          const root = document.getElementById("docx-root");
          const viewer = document.getElementById("viewer");
          const pageMeta = document.getElementById("pageMeta");
          const zoomLabel = document.getElementById("zoomLabel");
          const outlineEl = document.getElementById("outline");
          const shell = document.getElementById("shell");
          const editBtn = document.getElementById("editBtn");
          const downloadBtn = document.getElementById("downloadBtn");
          const editToolbar = document.getElementById("editToolbar");
          [
            ["toggleSidebar", "切换目录"],
            ["refreshOutline", "刷新目录"],
            ["editBtn", "切换编辑"],
            ["downloadBtn", "下载 DOCX"],
            ["zoomOut", "缩小"],
            ["zoomIn", "放大"],
            ["fitWidth", "适合宽度"],
            ["fitPage", "实际大小"],
            ["printBtn", "打印"],
          ].forEach(function (item) {
            window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
          });
          let scale = 1;
          let editing = false;
          let dirty = false;
          let originalBuffer = null;
          /** styleId(escaped) -> heading level 1-6；兼容 WPS/旧文档用数字 styleId 的情况 */
          let headingStyleMap = Object.create(null);

          function loadScript(src) {
            return new Promise(function (resolve, reject) {
              const existing = document.querySelector('script[data-nfv-src="' + src + '"]');
              if (existing) {
                if (existing.getAttribute("data-nfv-loaded") === "1") return resolve();
                existing.addEventListener("load", function () { resolve(); });
                existing.addEventListener("error", function () { reject(new Error("加载失败: " + src)); });
                return;
              }
              const s = document.createElement("script");
              s.src = src;
              s.async = false;
              s.setAttribute("data-nfv-src", src);
              s.onload = function () {
                s.setAttribute("data-nfv-loaded", "1");
                resolve();
              };
              s.onerror = function () {
                reject(new Error("加载失败: " + src));
              };
              document.head.appendChild(s);
            });
          }

          async function ensureDocxLib() {
            if (window.docx && window.docx.renderAsync) return;
            await loadScript("/assets/jszip.min.js");
            if (!window.JSZip) throw new Error("JSZip 未加载");
            await loadScript("/assets/docx-preview.min.js");
            for (let i = 0; i < 20; i++) {
              if (window.docx && window.docx.renderAsync) return;
              await new Promise(function (r) { setTimeout(r, 50); });
            }
            throw new Error("docx-preview 未加载");
          }

          function applyZoom() {
            const sections = root.querySelectorAll("section.docx");
            for (const el of sections) {
              el.style.transform = "scale(" + scale + ")";
              const h = el.getBoundingClientRect().height / (scale || 1);
              el.style.marginBottom = Math.max(0, (scale - 1) * h) + "px";
            }
            zoomLabel.textContent = Math.round(scale * 100) + "%";
            window.__NFV_PREVIEW__?.setState({ kind: "docx", scale: scale });
          }

          function fitWidth() {
            const section = root.querySelector("section.docx");
            if (!section) return;
            const pad = 48;
            const avail = Math.max(320, viewer.clientWidth - pad);
            const prev = scale;
            scale = 1;
            applyZoom();
            const natural = section.scrollWidth || section.offsetWidth || 794;
            scale = Math.min(1.75, Math.max(0.45, avail / natural));
            if (!isFinite(scale) || scale <= 0) scale = prev || 1;
            applyZoom();
          }

          function highlightKeyword(container, text) {
            if (!text || !text.trim()) return;
            const needle = text.trim();
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            const lower = needle.toLowerCase();
            for (const node of nodes) {
              const value = node.nodeValue || "";
              const idx = value.toLowerCase().indexOf(lower);
              if (idx < 0) continue;
              try {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + needle.length);
                const mark = document.createElement("mark");
                mark.className = "nfv-hl";
                range.surroundContents(mark);
              } catch (_) {}
            }
            const first = container.querySelector("mark.nfv-hl");
            if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          function escapeStyleClassId(id) {
            return String(id || "")
              .replace(/[ .]+/g, "-")
              .replace(/[&]+/g, "and")
              .toLowerCase();
          }

          function levelFromStyleName(name) {
            const n = String(name || "").toLowerCase().trim();
            if (!n) return 0;
            // 目录域本身不进大纲
            if (/(?:^|\\s)toc\\s*[1-9]/.test(n) || /^toc$/.test(n)) return 0;
            let m = n.match(/heading\\s*([1-6])/);
            if (m) return Number(m[1]);
            m = n.match(/标题\\s*([1-6])/);
            if (m) return Number(m[1]);
            if (n === "title" || n === "标题" || n === "titolo" || n === "titel") return 1;
            return 0;
          }

          async function loadHeadingStyleMap(buffer) {
            const map = Object.create(null);
            if (!window.JSZip || !buffer) return map;
            try {
              const zip = await window.JSZip.loadAsync(buffer);
              const file = zip.file("word/styles.xml");
              if (!file) return map;
              const xml = await file.async("string");
              const blocks = xml.split(/<w:style[\\s>]/).slice(1);
              const byId = Object.create(null);
              for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                const type = (b.match(/w:type="([^"]+)"/) || [])[1];
                if (type && type !== "paragraph") continue;
                const id = (b.match(/w:styleId="([^"]+)"/) || [])[1];
                if (!id) continue;
                const name = (b.match(/<w:name[^>]*w:val="([^"]*)"/) || [])[1] || "";
                const basedOn = (b.match(/<w:basedOn[^>]*w:val="([^"]*)"/) || [])[1] || "";
                const ol = (b.match(/<w:outlineLvl[^>]*w:val="(\\d+)"/) || [])[1];
                byId[id] = { id: id, name: name, basedOn: basedOn, ol: ol };
              }
              function resolve(id, seen) {
                if (!id || !byId[id]) return 0;
                if (Object.prototype.hasOwnProperty.call(map, escapeStyleClassId(id))) {
                  return map[escapeStyleClassId(id)];
                }
                if (seen[id]) return 0;
                seen[id] = true;
                const s = byId[id];
                const fromName = levelFromStyleName(s.name);
                if (fromName) return fromName;
                if (s.ol != null && s.ol !== "") {
                  const lv = Number(s.ol) + 1;
                  if (lv >= 1 && lv <= 6) return lv;
                }
                if (s.basedOn) return resolve(s.basedOn, seen);
                return 0;
              }
              Object.keys(byId).forEach(function (id) {
                const level = resolve(id, Object.create(null));
                if (level) map[escapeStyleClassId(id)] = level;
              });
            } catch (_) {}
            return map;
          }

          function headingLevel(el) {
            // docx-preview：Heading1 -> docx_heading1；但 WPS/部分文档 styleId 是数字，变成 docx_2
            const cls = (el.getAttribute("class") || "").toString().toLowerCase();
            // 排除目录域（TOC1 / toc-1）
            if (/(?:^|[\\s_-])toc(?:[-_\\s]*)[1-6](?:\\b|$)/.test(cls)) return 0;

            // 优先用 styles.xml 解析出的 styleId → 级别映射
            if (cls) {
              const tokens = cls.split(/\\s+/);
              for (let t = 0; t < tokens.length; t++) {
                const token = tokens[t];
                if (!token) continue;
                const id = token.indexOf("docx_") === 0 ? token.slice(5) : token;
                if (headingStyleMap[id]) return headingStyleMap[id];
                if (headingStyleMap[token]) return headingStyleMap[token];
              }
            }

            // 兼容标准英文/中文样式名直接出现在 class 中的情况
            for (let i = 6; i >= 1; i--) {
              const n = String(i);
              if (
                cls.includes("heading" + n) ||
                cls.includes("heading-" + n) ||
                cls.includes("heading_" + n) ||
                cls.includes("标题" + n) ||
                cls.includes("标题-" + n) ||
                cls.includes("标题_" + n)
              ) {
                return i;
              }
            }

            if (
              (/(?:^|[\\s_-])title(?:\\b|$)/.test(cls) || /(?:^|[\\s_-])标题(?:\\b|$)/.test(cls)) &&
              !/标题[-_\\s]*[1-6]/.test(cls)
            ) {
              return 1;
            }

            const tag = (el.tagName || "").toUpperCase();
            if (/^H[1-6]$/.test(tag)) return Number(tag.slice(1));

            const outlineAttr = el.getAttribute("data-outline-level") || el.getAttribute("data-level");
            if (outlineAttr && /^[0-5]$/.test(outlineAttr)) return Number(outlineAttr) + 1;

            try {
              const style = window.getComputedStyle(el);
              const size = parseFloat(style.fontSize) || 0;
              const weight = style.fontWeight;
              const bold = weight === "bold" || Number(weight) >= 600;
              if (bold && size >= 22) return 1;
              if (bold && size >= 18) return 2;
              if (bold && size >= 15) return 3;
            } catch (_) {}
            return 0;
          }

          function buildOutline() {
            if (!outlineEl || !root) return;
            try {
              // 优先 article；结构异常时退回整棵 section
              let nodes = root.querySelectorAll(
                "article p, article h1, article h2, article h3, article h4, article h5, article h6"
              );
              if (!nodes.length) {
                nodes = root.querySelectorAll(
                  "section.docx p, section.docx h1, section.docx h2, section.docx h3, section.docx h4, section.docx h5, section.docx h6"
                );
              }
              const items = [];
              let idx = 0;
              const seen = new Set();
              nodes.forEach(function (el) {
                const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
                if (!text || text.length > 240) return;
                const level = headingLevel(el);
                if (!level) return;
                if (!el.id) el.id = "nfv-h-" + (++idx);
                if (seen.has(el.id)) return;
                seen.add(el.id);
                items.push({ id: el.id, text: text.slice(0, 80), level: level });
              });
              if (!items.length) {
                outlineEl.innerHTML = '<div class="empty">未识别到标题样式。可在编辑模式用「标题1/2」标记后刷新目录。</div>';
                return;
              }
              outlineEl.innerHTML = items.map(function (it) {
                return '<a class="lv' + it.level + '" href="#' + it.id + '" data-id="' + it.id + '">' +
                  it.text.replace(/</g, "&lt;") + "</a>";
              }).join("");
              outlineEl.querySelectorAll("a").forEach(function (a) {
                a.addEventListener("click", function (e) {
                  e.preventDefault();
                  const target = document.getElementById(a.getAttribute("data-id"));
                  if (!target) return;
                  outlineEl.querySelectorAll("a").forEach(function (x) { x.classList.remove("active"); });
                  a.classList.add("active");
                  target.scrollIntoView({ behavior: "smooth", block: "center" });
                });
              });
            } catch (err) {
              outlineEl.innerHTML = '<div class="empty">目录生成失败：' +
                (err && err.message ? err.message : String(err)) + "</div>";
            }
          }

          function setEditing(on) {
            editing = on;
            document.body.classList.toggle("editing", on);
            editBtn.textContent = on ? "完成编辑" : "编辑";
            editBtn.classList.toggle("active", on);
            editToolbar.classList.toggle("visible", on);
            window.__NFV_PREVIEW__?.setState({ editing: editing });
            root.querySelectorAll("section.docx article").forEach(function (article) {
              article.contentEditable = on ? "true" : "false";
              if (on) {
                article.addEventListener("input", onInput);
              }
            });
            if (on) {
              downloadBtn.disabled = false;
              pageMeta.textContent = (pageMeta.textContent || "").replace(/ · 已修改/, "") + " · 编辑中";
            } else {
              buildOutline();
              pageMeta.textContent = dirty
                ? (pageMeta.dataset.base || "") + " · 已修改"
                : (pageMeta.dataset.base || pageMeta.textContent);
            }
          }

          function onInput() {
            dirty = true;
            downloadBtn.disabled = false;
          }

          function collectHtml() {
            const parts = [];
            root.querySelectorAll("section.docx article").forEach(function (article) {
              const clone = article.cloneNode(true);
              clone.querySelectorAll("mark.nfv-hl").forEach(function (m) {
                const t = document.createTextNode(m.textContent || "");
                m.replaceWith(t);
              });
              parts.push(clone.innerHTML);
            });
            return parts.join('<div style="page-break-after:always"></div>');
          }

          async function downloadDocx() {
            downloadBtn.disabled = true;
            downloadBtn.textContent = "导出中…";
            try {
              // If never edited, download original bytes for best fidelity
              if (!dirty && originalBuffer) {
                const blob = new Blob([originalBuffer], {
                  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                });
                triggerDownload(blob, downloadBase + ".docx");
                return;
              }
              const html = collectHtml();
              const res = await fetch("/api/docx/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  html: html,
                  title: downloadBase,
                  fileName: downloadBase + "-edited.docx",
                }),
              });
              if (!res.ok) {
                const err = await res.json().catch(function () { return {}; });
                throw new Error(err.error || ("导出失败 HTTP " + res.status));
              }
              const blob = await res.blob();
              triggerDownload(blob, downloadBase + "-edited.docx");
            } catch (err) {
              alert(err && err.message ? err.message : String(err));
            } finally {
              downloadBtn.disabled = false;
              downloadBtn.textContent = "下载 DOCX";
            }
          }

          function triggerDownload(blob, name) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
              URL.revokeObjectURL(a.href);
              a.remove();
            }, 1000);
          }

          try {
            status.textContent = "正在加载预览引擎…";
            await ensureDocxLib();
            status.textContent = "正在解析 Word 文档…";
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error("下载文档失败 HTTP " + res.status);
            originalBuffer = await res.arrayBuffer();
            headingStyleMap = await loadHeadingStyleMap(originalBuffer);

            root.hidden = false;
            status.remove();

            await window.docx.renderAsync(originalBuffer, root, null, {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: true,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: true,
              useBase64URL: true,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true,
              debug: false,
            });

            const pages = root.querySelectorAll("section.docx").length;
            const baseMeta = pages ? (pages + " 页 · Word 版式") : "Word 版式";
            pageMeta.dataset.base = baseMeta;
            pageMeta.textContent = baseMeta;
            window.__NFV_PREVIEW__?.setState({ kind: "docx", pages: pages, editing: editing });
            applyZoom();
            buildOutline();
            try { highlightKeyword(root, keyword); } catch (_) {}
            // 样式表注入后 dual-rAF 再扫一次，避免首屏漏检
            requestAnimationFrame(function () {
              requestAnimationFrame(function () { buildOutline(); });
            });
            downloadBtn.disabled = false;
            if (viewer.clientWidth < 900) fitWidth();
          } catch (err) {
            status.textContent = "DOCX 预览失败：" + (err && err.message ? err.message : String(err));
            status.style.color = "#fecaca";
            root.hidden = true;
          }

          document.getElementById("toggleSidebar").onclick = function () {
            if (window.matchMedia("(max-width: 720px)").matches) {
              shell.classList.toggle("sidebar-open");
            } else {
              shell.classList.toggle("sidebar-collapsed");
              this.classList.toggle("active");
            }
          };
          document.getElementById("refreshOutline").onclick = buildOutline;
          editBtn.onclick = function () { setEditing(!editing); };
          downloadBtn.onclick = function () { downloadDocx(); };
          editToolbar.querySelectorAll("[data-cmd]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              document.execCommand(btn.getAttribute("data-cmd"), false);
              dirty = true;
            });
          });
          editToolbar.querySelectorAll("[data-block]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              const block = btn.getAttribute("data-block");
              if (block === "P") document.execCommand("formatBlock", false, "p");
              else document.execCommand("formatBlock", false, block.toLowerCase());
              dirty = true;
              buildOutline();
            });
          });
          document.getElementById("zoomIn").onclick = function () {
            scale = Math.min(2.5, +(scale + 0.1).toFixed(2));
            applyZoom();
          };
          document.getElementById("zoomOut").onclick = function () {
            scale = Math.max(0.4, +(scale - 0.1).toFixed(2));
            applyZoom();
          };
          document.getElementById("zoomLabel").onclick = function () {
            scale = 1;
            applyZoom();
          };
          document.getElementById("fitWidth").onclick = fitWidth;
          document.getElementById("fitPage").onclick = function () {
            scale = 1;
            applyZoom();
          };
          document.getElementById("printBtn").onclick = function () { window.print(); };
        })();
      </script>
    `,
  });
}
