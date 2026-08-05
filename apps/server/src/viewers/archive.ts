import type { ArchiveEntry } from "../services/archives/zipService.js";
import { currentLocale, previewUi, t } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function normalizePath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .replace(/\/$/, "");
}

type TreeNode = {
  id: string;
  name: string;
  isDir: boolean;
  size: number;
  path: string;
  children: TreeNode[];
};

/** 仅按 `/` 分段建树；文件名里的逗号、空格、`@` 等一律当作文件名字符 */
function buildTree(entries: ArchiveEntry[], rootName: string): TreeNode {
  const root: TreeNode = {
    id: "",
    name: rootName,
    isDir: true,
    size: 0,
    path: "",
    children: [],
  };

  const dirMap = new Map<string, TreeNode>([["", root]]);

  const ensureDir = (dirPath: string): TreeNode => {
    const id = normalizePath(dirPath);
    const existing = dirMap.get(id);
    if (existing) return existing;

    const parts = id.split("/").filter(Boolean);
    const name = parts[parts.length - 1] || id;
    const parentId = parts.slice(0, -1).join("/");
    const parent = ensureDir(parentId);
    const node: TreeNode = {
      id,
      name,
      isDir: true,
      size: 0,
      path: id ? `${id}/` : "",
      children: [],
    };
    parent.children.push(node);
    dirMap.set(id, node);
    return node;
  };

  for (const entry of entries) {
    const full = normalizePath(entry.path);
    if (!full || full.includes("..")) continue;

    if (entry.isDirectory) {
      ensureDir(full);
      continue;
    }

    const parts = full.split("/").filter(Boolean);
    if (!parts.length) continue;
    const fileName = parts[parts.length - 1];
    const parentId = parts.slice(0, -1).join("/");
    const parent = ensureDir(parentId);
    if (parent.children.some((c) => !c.isDir && c.path === full)) continue;
    parent.children.push({
      id: full,
      name: fileName,
      isDir: false,
      size: entry.size || 0,
      path: full,
      children: [],
    });
  }

  const sortRec = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
    for (const child of node.children) {
      if (child.isDir) sortRec(child);
    }
  };
  sortRec(root);
  return root;
}

export function renderArchiveViewer(opts: {
  title: string;
  fileId: string;
  entries: ArchiveEntry[];
  watermark?: string;
}): string {
  const encoded = Buffer.from(`file://local/${opts.fileId}`, "utf8").toString(
    "base64",
  );
  const tree = buildTree(opts.entries, t("preview.archiveRoot"));
  const files = opts.entries.filter((e) => !e.isDirectory);
  const dirs = opts.entries.filter((e) => e.isDirectory);
  const totalSize = files.reduce((sum, e) => sum + (e.size || 0), 0);
  const treeJson = JSON.stringify(tree);
  const previewBase = `/onlinePreview?url=${encodeURIComponent(encoded)}&lang=${encodeURIComponent(currentLocale())}&archiveEntry=`;
  const ui = previewUi();

  return layout({
    title: opts.title,
    ext: "zip",
    engine: "Archive Browser",
    footerLeft: t("preview.archiveFiles", {
      count: files.length,
      size: formatSize(totalSize),
    }),
    head: `
      <style>
        .viewer { height: 100%; min-height: 0; }
        .arc {
          display: grid;
          grid-template-columns: minmax(220px, 280px) 1fr;
          height: 100%;
          min-height: 0;
          background: #fff;
        }
        .arc-side {
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: #f8fafc;
        }
        .arc-side-hd {
          padding: 12px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1px solid var(--border);
        }
        .arc-tree {
          flex: 1;
          overflow: auto;
          padding: 8px;
          font-size: 12px;
        }
        .tn {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          border: 0;
          background: transparent;
          text-align: left;
          padding: 6px 8px;
          border-radius: 8px;
          cursor: pointer;
          color: #334155;
        }
        .tn:hover { background: #eef2ff; }
        .tn.active {
          background: #e0e7ff;
          color: #3730a3;
          font-weight: 600;
        }
        .tn .caret {
          display: inline-flex;
          width: 14px;
          height: 14px;
          color: #94a3b8;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
        }
        .tn .caret svg { width: 12px; height: 12px; }
        .tn .fi {
          display: inline-flex;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          color: #f59e0b;
        }
        .tn .fi svg { width: 16px; height: 16px; }
        .tn .name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tn .cnt {
          margin-left: auto;
          color: #94a3b8;
          font-variant-numeric: tabular-nums;
          font-size: 10px;
        }
        .arc-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          position: relative;
        }
        .arc-crumb {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          color: #64748b;
          flex-shrink: 0;
        }
        .arc-crumb button {
          border: 0;
          background: transparent;
          color: #4f46e5;
          cursor: pointer;
          padding: 0;
          font: inherit;
        }
        .arc-crumb button:hover { text-decoration: underline; }
        .arc-crumb .sep { color: #cbd5e1; }
        .arc-stage {
          flex: 1;
          min-height: 0;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .arc-list {
          flex: 1;
          overflow: auto;
          min-height: 0;
        }
        .arc-preview {
          display: none;
          flex: 1;
          min-height: 0;
          flex-direction: column;
          background: #fff;
        }
        .arc-preview.open {
          display: flex;
        }
        .arc-preview.open ~ .arc-list,
        .arc-stage.previewing .arc-list {
          display: none;
        }
        .arc-stage.previewing .arc-preview {
          display: flex;
        }
        .pv-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: #f8fafc;
        }
        .pv-back {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--border);
          background: #fff;
          border-radius: 8px;
          padding: 5px 10px;
          font-size: 12px;
          color: #334155;
          cursor: pointer;
        }
        .pv-back:hover { background: #eef2ff; color: #3730a3; }
        .pv-back svg { width: 14px; height: 14px; }
        .pv-title {
          min-width: 0;
          flex: 1;
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pv-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
        }
        .pv-body img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        .pv-body video,
        .pv-body audio {
          max-width: min(920px, 100%);
          width: 100%;
        }
        .pv-body iframe {
          width: 100%;
          height: 100%;
          border: 0;
          background: #fff;
        }
        .pv-body .pv-fallback {
          padding: 24px;
          text-align: center;
          color: #64748b;
          font-size: 13px;
        }
        .row.file.active {
          background: #eef2ff;
        }
        .row {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) 88px;
          gap: 10px;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: inherit;
          text-decoration: none;
          text-align: left;
          font-size: 13px;
        }
        .row:hover { background: #f8fafc; }
        .row .ico {
          display: inline-flex;
          width: 18px;
          height: 18px;
          align-items: center;
          justify-content: center;
        }
        .row .ico svg { width: 18px; height: 18px; }
        .row .ico.folder { color: #f59e0b; }
        .row .ico.image { color: #06b6d4; }
        .row .ico.media { color: #8b5cf6; }
        .row .ico.doc { color: #3b82f6; }
        .row .ico.sheet { color: #10b981; }
        .row .ico.code { color: #64748b; }
        .row .ico.archive { color: #f97316; }
        .row .ico.file { color: #94a3b8; }
        .row .nm {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
          color: #0f172a;
          text-align: left;
          justify-self: start;
          width: 100%;
        }
        .row.file .nm { color: #4338ca; }
        .row .meta {
          text-align: right;
          color: #94a3b8;
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 11px;
        }
        .empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--muted);
          font-size: 13px;
        }
        @media (max-width: 720px) {
          .arc { grid-template-columns: 1fr; grid-template-rows: 40% 1fr; }
          .arc-side { border-right: 0; border-bottom: 1px solid var(--border); }
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <div class="arc" id="arc-app">
          <aside class="arc-side">
            <div class="arc-side-hd">${escapeHtml(ui.archiveTree)}</div>
            <div class="arc-tree" id="arc-tree"></div>
          </aside>
          <section class="arc-main">
            <div class="arc-crumb" id="arc-crumb"></div>
            <div class="arc-stage" id="arc-stage">
              <div class="arc-list" id="arc-list"></div>
              <div class="arc-preview" id="arc-preview">
                <div class="pv-bar">
                  <button type="button" class="pv-back" id="pv-back">
                    <span aria-hidden="true"></span>
                    ${escapeHtml(ui.archiveBack)}
                  </button>
                  <div class="pv-title" id="pv-title"></div>
                </div>
                <div class="pv-body" id="pv-body"></div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <script>
        (function () {
          const TREE = ${treeJson};
          const PREVIEW_BASE = ${JSON.stringify(previewBase)};
          const ENTRY_BASE = ${JSON.stringify(`/api/archive/${opts.fileId}/entry?path=`)};
          const UI = ${JSON.stringify(ui)};

          function formatSize(n) {
            if (n < 1024) return n + " B";
            if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
            return (n / 1024 / 1024).toFixed(2) + " MB";
          }

          function svgIcon(paths) {
            return (
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
              'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
              'aria-hidden="true">' + paths + "</svg>"
            );
          }

          const ICONS = {
            chevronRight: svgIcon('<path d="m9 18 6-6-6-6"/>'),
            chevronDown: svgIcon('<path d="m6 9 6 6 6-6"/>'),
            arrowLeft: svgIcon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
            folder: svgIcon(
              '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.64 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'
            ),
            folderOpen: svgIcon(
              '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'
            ),
            image: svgIcon(
              '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
            ),
            film: svgIcon(
              '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>'
            ),
            music: svgIcon(
              '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
            ),
            fileText: svgIcon(
              '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'
            ),
            sheet: svgIcon(
              '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>'
            ),
            code: svgIcon(
              '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'
            ),
            archive: svgIcon(
              '<path d="M10 12v-1"/><path d="M10 18v-2"/><path d="M10 7V6"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01"/><circle cx="10" cy="20" r="2"/>'
            ),
            file: svgIcon(
              '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'
            ),
          };

          function fileKind(path) {
            const ext = (path.split(".").pop() || "").toLowerCase();
            if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "ico"].includes(ext))
              return { icon: ICONS.image, cls: "image", mode: "image" };
            if (["mp4", "webm", "mov", "mkv", "avi"].includes(ext))
              return { icon: ICONS.film, cls: "media", mode: "video" };
            if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext))
              return { icon: ICONS.music, cls: "media", mode: "audio" };
            if (["doc", "docx", "pdf", "txt", "md", "rtf", "pages"].includes(ext))
              return { icon: ICONS.fileText, cls: "doc", mode: "iframe" };
            if (["xls", "xlsx", "csv", "numbers"].includes(ext))
              return { icon: ICONS.sheet, cls: "sheet", mode: "iframe" };
            if (["ppt", "pptx", "key"].includes(ext))
              return { icon: ICONS.fileText, cls: "doc", mode: "iframe" };
            if (["js", "ts", "tsx", "jsx", "py", "java", "css", "html", "json", "xml", "yml", "yaml", "sh"].includes(ext))
              return { icon: ICONS.code, cls: "code", mode: "iframe" };
            if (["zip", "rar", "7z", "tar", "gz", "tgz", "jar"].includes(ext))
              return { icon: ICONS.archive, cls: "archive", mode: "iframe" };
            return { icon: ICONS.file, cls: "file", mode: "iframe" };
          }

          function makeIcon(html, cls) {
            const el = document.createElement("span");
            el.className = "ico" + (cls ? " " + cls : "");
            el.innerHTML = html;
            return el;
          }

          function countFiles(node) {
            if (!node.isDir) return 1;
            return node.children.reduce(function (sum, c) { return sum + countFiles(c); }, 0);
          }

          const treeEl = document.getElementById("arc-tree");
          const listEl = document.getElementById("arc-list");
          const crumbEl = document.getElementById("arc-crumb");
          const stageEl = document.getElementById("arc-stage");
          const previewEl = document.getElementById("arc-preview");
          const pvBody = document.getElementById("pv-body");
          const pvTitle = document.getElementById("pv-title");
          const pvBack = document.getElementById("pv-back");
          pvBack.querySelector("span").innerHTML = ICONS.arrowLeft;

          const openDirs = new Set([""]);
          let currentId = "";
          let previewFile = null;

          function findNode(id, node) {
            if (node.id === id) return node;
            for (const c of node.children) {
              const hit = findNode(id, c);
              if (hit) return hit;
            }
            return null;
          }

          function ancestors(id) {
            if (!id) return [""];
            const parts = id.split("/").filter(Boolean);
            const out = [""];
            for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join("/"));
            return out;
          }

          function closePreview() {
            previewFile = null;
            stageEl.classList.remove("previewing");
            pvBody.innerHTML = "";
            pvTitle.textContent = "";
            renderList();
          }

          function openPreview(file) {
            previewFile = file;
            stageEl.classList.add("previewing");
            pvTitle.textContent = file.name;
            pvTitle.title = file.path;
            pvBody.innerHTML = "";
            const kind = fileKind(file.path);
            const entryUrl = ENTRY_BASE + encodeURIComponent(file.path);
            const fullUrl = PREVIEW_BASE + encodeURIComponent(file.path);

            if (kind.mode === "image") {
              const img = document.createElement("img");
              img.src = entryUrl;
              img.alt = file.name;
              img.loading = "lazy";
              img.onerror = function () {
                pvBody.innerHTML = '<div class="pv-fallback">' + UI.archiveImageFail + '</div>';
              };
              pvBody.appendChild(img);
            } else if (kind.mode === "video") {
              const video = document.createElement("video");
              video.src = entryUrl;
              video.controls = true;
              video.playsInline = true;
              pvBody.appendChild(video);
            } else if (kind.mode === "audio") {
              const audio = document.createElement("audio");
              audio.src = entryUrl;
              audio.controls = true;
              pvBody.appendChild(audio);
            } else {
              const iframe = document.createElement("iframe");
              iframe.src = fullUrl;
              iframe.title = file.name;
              iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-downloads allow-forms");
              pvBody.appendChild(iframe);
            }
            renderList();
          }

          pvBack.addEventListener("click", closePreview);

          function renderTree() {
            const frag = document.createDocumentFragment();
            function walk(node, depth) {
              if (node.id !== "") {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "tn" + (node.id === currentId ? " active" : "");
                btn.style.paddingLeft = (8 + depth * 14) + "px";
                const hasKids = node.children.some(function (c) { return c.isDir; });
                const open = openDirs.has(node.id);
                const caret = document.createElement("span");
                caret.className = "caret";
                caret.innerHTML = hasKids
                  ? (open ? ICONS.chevronDown : ICONS.chevronRight)
                  : "";
                const fi = document.createElement("span");
                fi.className = "fi";
                fi.innerHTML = open ? ICONS.folderOpen : ICONS.folder;
                const name = document.createElement("span");
                name.className = "name";
                name.title = node.name;
                name.textContent = node.name;
                const cnt = document.createElement("span");
                cnt.className = "cnt";
                cnt.textContent = String(countFiles(node));
                btn.appendChild(caret);
                btn.appendChild(fi);
                btn.appendChild(name);
                btn.appendChild(cnt);
                btn.addEventListener("click", function (ev) {
                  ev.stopPropagation();
                  closePreview();
                  if (hasKids && currentId === node.id) {
                    if (openDirs.has(node.id)) openDirs.delete(node.id);
                    else openDirs.add(node.id);
                  } else {
                    openDirs.add(node.id);
                    ancestors(node.id).forEach(function (a) { openDirs.add(a); });
                    currentId = node.id;
                  }
                  render();
                });
                frag.appendChild(btn);
              }
              const showKids = node.id === "" || openDirs.has(node.id);
              if (!showKids) return;
              for (const child of node.children) {
                if (child.isDir) walk(child, node.id === "" ? 0 : depth + 1);
              }
            }
            walk(TREE, 0);
            treeEl.innerHTML = "";
            treeEl.appendChild(frag);
          }

          function renderCrumb() {
            const parts = currentId ? currentId.split("/").filter(Boolean) : [];
            crumbEl.innerHTML = "";
            const rootBtn = document.createElement("button");
            rootBtn.type = "button";
            rootBtn.textContent = UI.archiveRoot;
            rootBtn.addEventListener("click", function () {
              closePreview();
              currentId = "";
              render();
            });
            crumbEl.appendChild(rootBtn);
            parts.forEach(function (part, idx) {
              const sep = document.createElement("span");
              sep.className = "sep";
              sep.textContent = "/";
              crumbEl.appendChild(sep);
              const btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = part;
              const id = parts.slice(0, idx + 1).join("/");
              btn.addEventListener("click", function () {
                closePreview();
                currentId = id;
                ancestors(id).forEach(function (a) { openDirs.add(a); });
                render();
              });
              crumbEl.appendChild(btn);
            });
          }

          function renderList() {
            const node = findNode(currentId, TREE) || TREE;
            listEl.innerHTML = "";
            if (!node.children.length) {
              listEl.innerHTML = '<div class="empty">' + UI.archiveEmpty + '</div>';
              return;
            }
            for (const child of node.children) {
              if (child.isDir) {
                const row = document.createElement("button");
                row.type = "button";
                row.className = "row";
                row.style.cssText = "width:100%;border:0;background:transparent;cursor:pointer";
                row.appendChild(makeIcon(ICONS.folder, "folder"));
                const nm = document.createElement("span");
                nm.className = "nm";
                nm.textContent = child.name;
                const meta = document.createElement("span");
                meta.className = "meta";
                meta.textContent = UI.archiveFolder;
                row.appendChild(nm);
                row.appendChild(meta);
                row.addEventListener("click", function () {
                  closePreview();
                  currentId = child.id;
                  openDirs.add(child.id);
                  ancestors(child.id).forEach(function (a) { openDirs.add(a); });
                  render();
                });
                listEl.appendChild(row);
              } else {
                const kind = fileKind(child.path);
                const row = document.createElement("button");
                row.type = "button";
                row.className = "row file" + (previewFile && previewFile.path === child.path ? " active" : "");
                row.style.cssText = "width:100%;border:0;background:transparent;cursor:pointer";
                row.appendChild(makeIcon(kind.icon, kind.cls));
                const nm = document.createElement("span");
                nm.className = "nm";
                nm.textContent = child.name;
                const meta = document.createElement("span");
                meta.className = "meta";
                meta.textContent = formatSize(child.size);
                row.appendChild(nm);
                row.appendChild(meta);
                row.addEventListener("click", function () {
                  openPreview(child);
                });
                listEl.appendChild(row);
              }
            }
          }

          function render() {
            renderTree();
            renderCrumb();
            if (!previewFile) renderList();
          }

          render();
          window.__NFV_PREVIEW__ && window.__NFV_PREVIEW__.setState({
            kind: "archive",
            fileCount: ${files.length},
            dirCount: ${dirs.length},
          });
        })();
      </script>
    `,
  });
}

export function renderErrorPage(message: string, status = 400): string {
  return layout({
    title: t("preview.failedTitle"),
    ext: "err",
    engine: "Error",
    body: `
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
    ext: opts.ext,
    engine: "Unsupported",
    body: `
      <div class="empty">
        <p>${escapeHtml(t("preview.unsupported", { ext: opts.ext }))}</p>
        <p style="font-size:13px;color:var(--muted)">${escapeHtml(t("preview.unsupportedHint"))}</p>
      </div>
    `,
  });
}
