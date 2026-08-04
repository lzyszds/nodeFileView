import type { ArchiveEntry } from "../services/archives/zipService.js";
import fs from "node:fs";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function iconFor(path: string, isDir: boolean): string {
  if (isDir) return "📁";
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "🖼️";
  if (["mp4", "webm", "mov", "mp3", "wav"].includes(ext)) return "🎬";
  if (["doc", "docx", "pdf", "txt", "md"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📑";
  if (["js", "ts", "py", "java", "css", "html", "json"].includes(ext)) return "💻";
  return "📦";
}

export function renderArchiveViewer(opts: {
  title: string;
  fileId: string;
  entries: ArchiveEntry[];
  watermark?: string;
}): string {
  const demoPath =
    process.env.DEMO_ARCHIVE8_PATH ||
    "/Users/mac/Downloads/ai_studio_code (8).html";
  if (demoPath) {
    try {
      const demo8 = fs.readFileSync(demoPath, "utf8");

      // ===== Inject real archive entries into demo8 template =====
      const rootId = "root";

      const normalizePath = (p: string) =>
        p.replace(/\\/g, "/").replace(/\/$/, "");

      const getDirId = (dirPath: string) => normalizePath(dirPath);
      const splitDirId = (dirId: string) =>
        dirId === rootId ? [] : dirId.split("/").filter(Boolean);

      const buildAllFilesAndTree = () => {
        // 有些压缩包不会显式携带所有目录条目（只带文件），所以目录树必须从“文件的父目录/祖先目录”推导出来
        const dirIdSet = new Set<string>();
        for (const e of opts.entries) {
          if (!e.isDirectory) continue;
          const id = getDirId(e.path);
          if (id && id !== rootId) dirIdSet.add(id);
        }

        const files = opts.entries
          .filter((e) => !e.isDirectory)
          .map((e) => {
            const filePath = normalizePath(e.path);
            const parts = filePath.split("/").filter(Boolean);
            const parentDirId = parts.slice(0, -1).join("/") || rootId;
            const ext = (e.name.split(".").pop() || "").toLowerCase();

            const type = (() => {
              if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
                return "image";
              if (["py", "js", "json", "md", "html", "css", "ts", "tsx", "txt", "log"].includes(ext))
                return "code";
              return ext === "exe" || ["sh", "bat", "cmd", "shrc"].includes(ext) ? "bin" : "doc";
            })();

            // 推导所有祖先目录，保证目录树不会缺层
            let cur = parentDirId;
            while (cur && cur !== rootId) {
              dirIdSet.add(cur);
              const idx = cur.lastIndexOf("/");
              cur = idx >= 0 ? cur.slice(0, idx) : "";
            }

            return {
              name: e.name,
              ext,
              type: type === "bin" ? "bin" : type === "doc" ? "doc" : type,
              size: e.size,
              parentDirId,
            };
          });

        const dirs = Array.from(dirIdSet)
          .filter((id) => id && id !== rootId)
          .map((id) => ({
            id,
            name: id.split("/").filter(Boolean).pop() || id,
          }));

        const fileCountByDir = new Map<string, number>();
        for (const f of files) {
          fileCountByDir.set(
            f.parentDirId,
            (fileCountByDir.get(f.parentDirId) || 0) + 1,
          );
        }

        const rootFileCount = fileCountByDir.get(rootId) || 0;

        // init mapping for each folder id
        const allFiles: Record<
          string,
          { folders: Array<{ id: string; name: string; date: string }>; files: Array<any> }
        > = {};

        allFiles[rootId] = { folders: [], files: [] };

        for (const d of dirs) {
          allFiles[d.id] = allFiles[d.id] || { folders: [], files: [] };
        }

        // folder tree
        const dirById = new Map<string, string>(); // id -> display name
        for (const d of dirs) dirById.set(d.id, d.name);

        for (const d of dirs) {
          const parts = splitDirId(d.id);
          const parentDirId =
            parts.length <= 1 ? rootId : parts.slice(0, -1).join("/");
          if (!allFiles[parentDirId]) {
            allFiles[parentDirId] = { folders: [], files: [] };
          }
          const parent = allFiles[parentDirId];
          if (!parent.folders.some((x) => x.id === d.id)) {
            parent.folders.push({
              id: d.id,
              name: d.name,
              date: "-",
            });
          }
        }

        // file lists
        for (const f of files) {
          if (!allFiles[f.parentDirId]) {
            allFiles[f.parentDirId] = { folders: [], files: [] };
          }
          allFiles[f.parentDirId].files.push({
            name: f.name,
            ext: f.ext,
            type: f.type,
            size: formatSize(f.size),
            compressedSize: formatSize(f.size),
            date: "-",
          });
        }

        // sort folders/files for stable rendering
        const sortByName = (a: any, b: any) =>
          String(a.name).localeCompare(String(b.name));
        const sortByFileName = (a: any, b: any) =>
          String(a.name).localeCompare(String(b.name));

        for (const key of Object.keys(allFiles)) {
          allFiles[key].folders.sort((a, b) => sortByName(a, b));
          allFiles[key].files.sort((a, b) => sortByFileName(a, b));
        }

        const treeData = [
          {
            id: rootId,
            name: "根目录",
            level: 0,
            isOpen: true,
            fileCount: rootFileCount,
          },
          ...dirs.map((d) => {
            const parts = splitDirId(d.id);
            const level = parts.length;
            return {
              id: d.id,
              name: d.name,
              level,
              isOpen: level === 1,
              fileCount: fileCountByDir.get(d.id) || 0,
            };
          }),
        ].sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          return String(a.name).localeCompare(String(b.name));
        });

        return { treeData, allFiles };
      };

      const { treeData, allFiles } = buildAllFilesAndTree();

      const fileEntries = opts.entries.filter((e) => !e.isDirectory);
      const totalSize = fileEntries.reduce((sum, e) => sum + (e.size || 0), 0);
      const archive = {
        name: opts.title,
        ext: (opts.title.split(".").pop() || "").toLowerCase(),
        compressedSize: formatSize(totalSize),
        uncompressedSize: formatSize(totalSize),
        ratio: "100%",
      };

      const patched = demo8
        // archive meta
        .replace(
          /const archive = ref\(\{[\s\S]*?\}\);\s*\n\s*const searchQuery/s,
          `const archive = ref(${JSON.stringify(archive)});\n            const searchQuery`,
        )
        // treeData
        .replace(
          /const treeData = ref\(\[[\s\S]*?\]\);\s*\n\s*\/\/ 文件列表模拟数据/s,
          `const treeData = ref(${JSON.stringify(treeData)});\n\n            // 文件列表模拟数据`,
        )
        // allFiles
        .replace(
          /const allFiles = ref\(\{[\s\S]*?\}\);\s*\n\s*\/\/ 计算当前文件夹下的文件夹和文件/s,
          `const allFiles = ref(${JSON.stringify(allFiles)});\n\n            // 计算当前文件夹下的文件夹和文件`,
        )
        // currentPath (make it generic by folderId splitting)
        .replace(
          /\/\/ 面包屑路径计算[\s\S]*?const currentPath = computed\(\(\) => \{[\s\S]*?\}\);\s*\n\s*const selectFolder/s,
          `// 面包屑路径计算
            const currentPath = computed(() => {
                if (currentFolderId.value === 'root') return [];
                return String(currentFolderId.value).split('/').filter(Boolean);
            });

            const selectFolder`,
        )
        // insert navigateToPath after selectFolder
        .replace(
          /const selectFolder = \(node\) => \{[\s\S]*?\};\s*\n\s*\/\/ 触发包内二次无缝预览/s,
          `const selectFolder = (node) => {
                currentFolderId.value = node.id;
                activeSubFile.value = null; // 切换文件夹时关闭二级预览
            };

            // 点击面包屑跳转到对应目录（folderId 由路径段 join('/'）生成）
            const navigateToPath = (idx) => {
                const parts = currentPath.value.slice(0, idx + 1);
                currentFolderId.value = parts.join('/') || 'root';
                activeSubFile.value = null;
            };

            // 触发包内二次无缝预览`,
        )
        // return object: expose navigateToPath
        .replace(/selectFolder,\s*previewSubFile,/g, "selectFolder, navigateToPath, previewSubFile,");

      return patched;
    } catch {
      // ignore and fallback to native implementation
    }
  }

  const encoded = Buffer.from(`file://local/${opts.fileId}`, "utf8").toString(
    "base64",
  );

  const files = opts.entries.filter((e) => !e.isDirectory);
  const dirs = opts.entries.filter((e) => e.isDirectory);

  const treeItems = [...dirs, ...files]
    .map((e) => {
      const depth = e.path.replace(/\\/g, "/").split("/").filter(Boolean).length - 1;
      const pad = Math.max(0, depth) * 18;
      const name = e.name || e.path;
      if (e.isDirectory) {
        return `<div class="row dir" style="--depth:${pad}px">
          <span class="tree" aria-hidden="true"></span>
          <span class="ico">${iconFor(e.path, true)}</span>
          <span class="name">${escapeHtml(name)}</span>
          <span class="meta">文件夹</span>
        </div>`;
      }
      const href = `/onlinePreview?url=${encodeURIComponent(encoded)}&archiveEntry=${encodeURIComponent(e.path)}`;
      return `<a class="row file" style="--depth:${pad}px" href="${href}" target="_blank" rel="noopener">
        <span class="tree" aria-hidden="true"></span>
        <span class="ico">${iconFor(e.path, false)}</span>
        <span class="name">${escapeHtml(name)}</span>
        <span class="meta">${formatSize(e.size)}</span>
      </a>`;
    })
    .join("");

  return layout({
    title: opts.title,
    ext: "zip",
    engine: "Archive Browser",
    head: `
      <style>
        .viewer {
          background:
            radial-gradient(circle at top left, rgba(99, 102, 241, 0.08), transparent 28%),
            linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        }
        .archive-shell {
          min-height: 100%;
          padding: 20px;
        }
        .list {
          margin: 0 auto;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(226, 232, 240, 0.96);
          border-radius: 18px;
          overflow: auto;
          max-width: 1080px;
          width: 100%;
          min-height: 100%;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(12px);
        }
        .list-wrap {
          display: flex;
          height: 100%;
          padding: 0;
        }
        .row {
          display: grid;
          grid-template-columns: var(--depth, 0px) 32px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(241, 245, 249, 0.95);
          font-size: 14px;
          color: inherit;
          text-decoration: none;
          transition: background .16s ease, transform .16s ease;
        }
        .row:last-child { border-bottom: 0; }
        .row.file:hover {
          background: rgba(79, 70, 229, 0.06);
        }
        .row.dir {
          background: rgba(248, 250, 252, 0.9);
        }
        .row.dir .name { color: #475569; }
        .tree {
          width: var(--depth, 0px);
          height: 1px;
        }
        .ico { text-align: center; }
        .name {
          color: #0f172a;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-weight: 500;
        }
        .row.file .name {
          color: var(--accent-700);
        }
        .meta {
          color: var(--muted); font-variant-numeric: tabular-nums;
          min-width: 72px; text-align: right;
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.01em;
        }
        .empty { padding: 48px; text-align: center; color: var(--muted); }
        @media (max-width: 720px) {
          .archive-shell { padding: 0; }
          .list {
            border-radius: 0;
            min-height: 100%;
            border-left: 0;
            border-right: 0;
          }
          .row {
            grid-template-columns: var(--depth, 0px) 28px minmax(0, 1fr);
          }
          .meta {
            grid-column: 3;
            text-align: left;
            min-width: 0;
          }
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="viewer">
        <div class="archive-shell list-wrap">
          <div class="list" id="list">
            ${treeItems || `<div class="empty">空压缩包</div>`}
          </div>
        </div>
      </div>
      <script>
        window.__NFV_PREVIEW__?.setState({
          kind: "archive",
          fileCount: ${files.length},
          dirCount: ${dirs.length},
        });
      </script>
    `,
  });
}

export function renderErrorPage(message: string, status = 400): string {
  return layout({
    title: "预览失败",
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
        <p>格式 .${escapeHtml(opts.ext)} 暂未在一期支持，或需要额外依赖。</p>
        <p style="font-size:13px;color:var(--muted)">DOCX / Excel / PPTX / PDF / 图片 / Markdown / 文本 / 压缩包 / 音视频已优化。</p>
      </div>
    `,
  });
}
