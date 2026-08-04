import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderExcelViewer(opts: {
  title: string;
  fileUrl: string;
  watermark?: string;
  highlight?: string;
}): string {
  const highlight = opts.highlight || "";

  return layout({
    title: opts.title,
    head: `
      <style>
        :root {
          --xl-green: #217346;
          --xl-green-2: #185c37;
          --xl-border: #d0d0d0;
          --xl-header: #f3f3f3;
          --xl-grid: #e5e5e5;
          --xl-sel: #21734633;
          --xl-sel-border: #217346;
          --xl-muted: #666;
          --xl-rowhead-w: 46px;
          --xl-colhead-h: 24px;
        }
        html, body {
          background: #f3f3f3 !important;
          color: #222 !important;
          font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif !important;
        }
        .topbar {
          background: #fff !important;
          border-bottom: 1px solid var(--xl-border) !important;
          color: #222 !important;
        }
        .topbar h1 { color: #222 !important; }
        .topbar .meta { color: var(--xl-muted); font-size: 12px; }
        .topbar button {
          background: #fff;
          color: #222;
          border: 1px solid var(--xl-border);
          border-radius: 4px;
        }
        .topbar button:hover { border-color: var(--xl-green); color: var(--xl-green); }
        .topbar button.active {
          background: #eaf6ef;
          border-color: #9fd0b1;
          color: var(--xl-green-2);
        }
        .sep { width: 1px; height: 20px; background: var(--xl-border); margin: 0 4px; }
        .ribbon {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: #fff;
          border-bottom: 1px solid var(--xl-border);
        }
        .name-box {
          min-width: 72px;
          max-width: 120px;
          height: 28px;
          border: 1px solid var(--xl-border);
          border-radius: 3px;
          padding: 0 8px;
          font-size: 12px;
          display: flex;
          align-items: center;
          background: #fafafa;
          font-family: Consolas, "IBM Plex Mono", monospace;
        }
        .fx-label {
          color: var(--xl-green);
          font-weight: 700;
          font-style: italic;
          font-size: 14px;
          padding: 0 4px;
        }
        .fx-input {
          flex: 1;
          height: 28px;
          border: 1px solid var(--xl-border);
          border-radius: 3px;
          padding: 0 10px;
          font-size: 13px;
          outline: none;
          background: #fff;
        }
        .fx-input:focus { border-color: var(--xl-green); }
        .shell {
          height: calc(100% - 49px - 41px);
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .grid-wrap {
          flex: 1;
          overflow: auto;
          background: #fff;
          position: relative;
          min-height: 0;
        }
        #status {
          padding: 48px 24px;
          text-align: center;
          color: #666;
          font-size: 14px;
        }
        table.xl-sheet {
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          min-width: 100%;
          font-size: 12px;
          color: #000;
        }
        table.xl-sheet th,
        table.xl-sheet td {
          border-right: 1px solid var(--xl-grid);
          border-bottom: 1px solid var(--xl-grid);
          padding: 2px 6px;
          height: 22px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle;
          background: #fff;
        }
        table.xl-sheet thead th {
          position: sticky;
          top: 0;
          z-index: 3;
          background: var(--xl-header);
          font-weight: 600;
          text-align: center;
          color: #444;
          height: var(--xl-colhead-h);
        }
        table.xl-sheet thead th.corner {
          left: 0;
          z-index: 4;
          min-width: var(--xl-rowhead-w);
          width: var(--xl-rowhead-w);
        }
        table.xl-sheet tbody th {
          position: sticky;
          left: 0;
          z-index: 2;
          background: var(--xl-header);
          text-align: center;
          font-weight: 500;
          color: #555;
          min-width: var(--xl-rowhead-w);
          width: var(--xl-rowhead-w);
        }
        table.xl-sheet td {
          min-width: 88px;
          max-width: 280px;
          cursor: cell;
        }
        table.xl-sheet td.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.xl-sheet td.selected {
          outline: 2px solid var(--xl-sel-border);
          outline-offset: -2px;
          background: var(--xl-sel);
          position: relative;
          z-index: 1;
        }
        table.xl-sheet td.hl {
          background: #fff2a8;
        }
        table.xl-sheet tr:hover td:not(.selected) { background: #f7fbf8; }
        table.xl-sheet tr:hover th { background: #e8f5ee; }
        .sheet-tabs {
          display: flex;
          align-items: flex-end;
          gap: 0;
          padding: 0 8px;
          background: #f3f3f3;
          border-top: 1px solid var(--xl-border);
          min-height: 36px;
          overflow-x: auto;
        }
        .sheet-tab {
          appearance: none;
          border: 1px solid transparent;
          border-bottom: none;
          background: transparent;
          padding: 7px 16px;
          font-size: 12px;
          color: #444;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          white-space: nowrap;
        }
        .sheet-tab:hover { background: #e8e8e8; }
        .sheet-tab.active {
          background: #fff;
          border-color: var(--xl-border);
          color: var(--xl-green-2);
          font-weight: 600;
          box-shadow: 0 -1px 0 #fff inset;
        }
        .notice {
          padding: 6px 12px;
          background: #fff8e6;
          color: #7a5b00;
          font-size: 12px;
          border-bottom: 1px solid #f0e0a8;
        }
        .watermark::after { color: rgba(0,0,0,0.08) !important; }
        .search-box {
          height: 28px;
          border: 1px solid var(--xl-border);
          border-radius: 4px;
          padding: 0 8px;
          font-size: 12px;
          width: 160px;
        }
      </style>
    `,
    body: `
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
          <h1 title="${escapeHtml(opts.title)}">${escapeHtml(opts.title)}</h1>
          <span class="meta" id="pageMeta"></span>
        </div>
        <div class="actions">
          <input class="search-box" id="searchBox" placeholder="查找内容…" />
          <button type="button" id="searchBtn">查找</button>
          <span class="sep"></span>
          <button type="button" id="freezeBtn" class="active">冻结首行</button>
          <button type="button" id="fitCols">按内容加宽</button>
          <span class="sep"></span>
          <button type="button" id="downloadBtn">下载原文件</button>
        </div>
      </div>
      ${watermarkLayer(opts.watermark)}
      <div class="ribbon">
        <div class="name-box" id="nameBox">A1</div>
        <div class="fx-label">fx</div>
        <input class="fx-input" id="fxInput" readonly placeholder="选中单元格后显示内容" />
      </div>
      <div class="shell">
        <div id="notice" class="notice" hidden></div>
        <div class="grid-wrap" id="gridWrap">
          <div id="status">正在加载 Excel…</div>
          <div id="gridHost" hidden></div>
        </div>
        <div class="sheet-tabs" id="sheetTabs"></div>
      </div>
      <script>
        (async function () {
          const fileUrl = ${JSON.stringify(opts.fileUrl)};
          const keywordInit = ${JSON.stringify(highlight)};
          const status = document.getElementById("status");
          const gridHost = document.getElementById("gridHost");
          const sheetTabs = document.getElementById("sheetTabs");
          const pageMeta = document.getElementById("pageMeta");
          const nameBox = document.getElementById("nameBox");
          const fxInput = document.getElementById("fxInput");
          const notice = document.getElementById("notice");
          const freezeBtn = document.getElementById("freezeBtn");
          const searchBox = document.getElementById("searchBox");
          const MAX_ROWS = 1500;
          const MAX_COLS = 100;

          let workbook = null;
          let sheetNames = [];
          let activeSheet = "";
          let freezeHeader = true;
          let fileBuffer = null;
          let selected = null;

          function loadScript(src) {
            return new Promise(function (resolve, reject) {
              const s = document.createElement("script");
              s.src = src;
              s.onload = function () { resolve(); };
              s.onerror = function () { reject(new Error("加载失败: " + src)); };
              document.head.appendChild(s);
            });
          }

          function colLetter(n) {
            let s = "";
            let x = n;
            while (x >= 0) {
              s = String.fromCharCode((x % 26) + 65) + s;
              x = Math.floor(x / 26) - 1;
            }
            return s;
          }

          function escapeText(s) {
            return String(s)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          }

          function isNumericLike(v) {
            if (typeof v === "number") return true;
            if (typeof v !== "string") return false;
            const t = v.trim();
            if (!t) return false;
            return /^-?\\d+(\\.\\d+)?([eE][-+]?\\d+)?%$/.test(t) || /^-?\\d+(\\.\\d+)?$/.test(t);
          }

          function sheetToMatrix(name) {
            const sheet = workbook.Sheets[name];
            if (!sheet) return { rows: [], cols: 0, truncated: false };
            const ref = sheet["!ref"];
            if (!ref) return { rows: [], cols: 0, truncated: false };
            const range = XLSX.utils.decode_range(ref);
            const totalRows = range.e.r - range.s.r + 1;
            const totalCols = range.e.c - range.s.c + 1;
            const rowLimit = Math.min(totalRows, MAX_ROWS);
            const colLimit = Math.min(totalCols, MAX_COLS);
            const rows = [];
            for (let r = 0; r < rowLimit; r++) {
              const row = [];
              for (let c = 0; c < colLimit; c++) {
                const addr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
                const cell = sheet[addr];
                let val = "";
                if (cell) {
                  if (cell.w != null) val = cell.w;
                  else if (cell.v != null) val = cell.v;
                }
                row.push(val);
              }
              rows.push(row);
            }
            return {
              rows: rows,
              cols: colLimit,
              truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
              totalRows: totalRows,
              totalCols: totalCols,
            };
          }

          function renderSheet(name) {
            activeSheet = name;
            selected = null;
            nameBox.textContent = "A1";
            fxInput.value = "";
            const data = sheetToMatrix(name);
            if (data.truncated) {
              notice.hidden = false;
              notice.textContent = "工作表较大，已截断显示前 " + data.rows.length + " 行 / " + data.cols +
                " 列（原表约 " + data.totalRows + " 行 × " + data.totalCols + " 列）。完整内容请下载原文件。";
            } else {
              notice.hidden = true;
            }

            let html = '<table class="xl-sheet" id="xlTable"><thead><tr>';
            html += '<th class="corner"></th>';
            for (let c = 0; c < data.cols; c++) {
              html += "<th>" + colLetter(c) + "</th>";
            }
            html += "</tr></thead><tbody>";
            for (let r = 0; r < data.rows.length; r++) {
              html += "<tr><th>" + (r + 1) + "</th>";
              for (let c = 0; c < data.cols; c++) {
                const v = data.rows[r][c];
                const text = v == null ? "" : String(v);
                const cls = isNumericLike(v) ? "num" : "";
                html += '<td class="' + cls + '" data-r="' + r + '" data-c="' + c + '" title="' + escapeText(text) + '">' +
                  escapeText(text) + "</td>";
              }
              html += "</tr>";
            }
            html += "</tbody></table>";
            gridHost.innerHTML = html;
            gridHost.hidden = false;

            const thead = gridHost.querySelector("thead");
            if (thead) thead.style.position = freezeHeader ? "sticky" : "static";

            gridHost.querySelectorAll("td").forEach(function (td) {
              td.addEventListener("click", function () {
                gridHost.querySelectorAll("td.selected").forEach(function (x) { x.classList.remove("selected"); });
                td.classList.add("selected");
                const r = Number(td.getAttribute("data-r"));
                const c = Number(td.getAttribute("data-c"));
                selected = { r: r, c: c };
                nameBox.textContent = colLetter(c) + (r + 1);
                fxInput.value = td.getAttribute("title") || td.textContent || "";
              });
            });

            Array.from(sheetTabs.children).forEach(function (btn) {
              btn.classList.toggle("active", btn.getAttribute("data-name") === name);
            });

            pageMeta.textContent = name + " · " + data.rows.length + " 行 × " + data.cols + " 列";
            if (keywordInit) applySearch(keywordInit);
          }

          function renderTabs() {
            sheetTabs.innerHTML = "";
            sheetNames.forEach(function (name, i) {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "sheet-tab" + (i === 0 ? " active" : "");
              btn.textContent = name;
              btn.setAttribute("data-name", name);
              btn.onclick = function () { renderSheet(name); };
              sheetTabs.appendChild(btn);
            });
          }

          function applySearch(q) {
            const needle = (q || "").trim().toLowerCase();
            gridHost.querySelectorAll("td.hl").forEach(function (td) { td.classList.remove("hl"); });
            if (!needle) return;
            let first = null;
            gridHost.querySelectorAll("td").forEach(function (td) {
              const t = (td.getAttribute("title") || td.textContent || "").toLowerCase();
              if (t.includes(needle)) {
                td.classList.add("hl");
                if (!first) first = td;
              }
            });
            if (first) {
              first.click();
              first.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            }
          }

          function autoWidth() {
            const table = document.getElementById("xlTable");
            if (!table) return;
            const cols = table.querySelectorAll("thead th").length - 1;
            for (let c = 0; c < cols; c++) {
              let max = 64;
              table.querySelectorAll("tbody tr").forEach(function (tr) {
                const td = tr.children[c + 1];
                if (!td) return;
                const len = (td.getAttribute("title") || "").length;
                max = Math.min(280, Math.max(max, 24 + len * 8));
              });
              table.querySelectorAll("tr").forEach(function (tr) {
                const cell = tr.children[c + 1];
                if (cell) {
                  cell.style.minWidth = max + "px";
                  cell.style.width = max + "px";
                }
              });
            }
          }

          try {
            status.textContent = "正在加载表格引擎…";
            if (!window.XLSX) await loadScript("/assets/xlsx.full.min.js");
            if (!window.XLSX) throw new Error("SheetJS 未加载");

            status.textContent = "正在解析工作簿…";
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
            fileBuffer = await res.arrayBuffer();
            workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
            sheetNames = workbook.SheetNames || [];
            if (!sheetNames.length) throw new Error("工作簿没有工作表");

            status.remove();
            renderTabs();
            renderSheet(sheetNames[0]);
            if (keywordInit) {
              searchBox.value = keywordInit;
            }
          } catch (err) {
            status.textContent = "Excel 预览失败：" + (err && err.message ? err.message : String(err));
            status.style.color = "#b42318";
          }

          freezeBtn.onclick = function () {
            freezeHeader = !freezeHeader;
            freezeBtn.classList.toggle("active", freezeHeader);
            const thead = gridHost.querySelector("thead");
            if (thead) {
              thead.querySelectorAll("th").forEach(function (th) {
                th.style.top = freezeHeader ? "0" : "auto";
              });
            }
            // re-apply sticky via class on wrap
            if (freezeHeader) renderSheet(activeSheet);
            else {
              gridHost.querySelectorAll("thead th").forEach(function (th) {
                th.style.position = "static";
              });
            }
          };
          document.getElementById("fitCols").onclick = autoWidth;
          document.getElementById("searchBtn").onclick = function () {
            applySearch(searchBox.value);
          };
          searchBox.addEventListener("keydown", function (e) {
            if (e.key === "Enter") applySearch(searchBox.value);
          });
          document.getElementById("downloadBtn").onclick = function () {
            if (!fileBuffer) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([fileBuffer]));
            a.download = ${JSON.stringify(opts.title)};
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
          };
        })();
      </script>
    `,
  });
}
