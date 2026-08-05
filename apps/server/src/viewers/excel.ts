import { previewUi } from "../i18n/index.js";
import { escapeHtml, layout, watermarkLayer } from "./layout.js";

export function renderExcelViewer(opts: {
  title: string;
  fileUrl: string;
  watermark?: string;
  highlight?: string;
}): string {
  const highlight = opts.highlight || "";

  const ui = previewUi();
  return layout({
    title: opts.title,
    chrome: "content",
    head: `
      <script src="/assets/xlsx.full.min.js" defer></script>
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
          --xl-rowhead-w: 48px;
          --xl-font: 13px;
        }
        html, body {
          height: 100vh !important;
          width: 100vw !important;
          overflow: hidden !important;
          background: #f3f3f3 !important;
          color: #222 !important;
          font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif !important;
        }
        .topbar {
          background: #fff !important;
          border-bottom: 1px solid var(--xl-border) !important;
          color: #222 !important;
          flex-shrink: 0;
          justify-content: flex-end !important;
          display: none !important;
        }
        .topbar h1 { display: none !important; }
        .topbar .meta { color: var(--xl-muted); font-size: 12px; }
        .topbar button {
          background: #fff; color: #222;
          border: 1px solid var(--xl-border); border-radius: 4px;
        }
        .topbar button:hover { border-color: var(--xl-green); color: var(--xl-green); }
        .topbar button.active {
          background: #eaf6ef; border-color: #9fd0b1; color: var(--xl-green-2);
        }
        .sep { width: 1px; height: 20px; background: var(--xl-border); margin: 0 4px; }
        .scale-box {
          display: inline-flex; align-items: center; gap: 2px;
          border: 1px solid var(--xl-border); border-radius: 6px; padding: 2px 4px;
          background: #fafafa; font-size: 12px;
        }
        .scale-box .tag { color: var(--xl-muted); padding: 0 4px; user-select: none; white-space: nowrap; }
        .scale-box button { border: 0; box-shadow: none; min-width: 26px; padding: 4px 6px; }
        .scale-box .zlabel {
          min-width: 42px; text-align: center;
          font-variant-numeric: tabular-nums; color: #333;
        }
        .ribbon {
          display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          background: #fff; border-bottom: 1px solid var(--xl-border); flex-shrink: 0;
          display: none !important;
        }
        .name-box {
          min-width: 72px; max-width: 120px; height: 28px;
          border: 1px solid var(--xl-border); border-radius: 3px;
          padding: 0 8px; font-size: 12px; display: flex; align-items: center;
          background: #fafafa; font-family: Consolas, "IBM Plex Mono", monospace;
        }
        .fx-label {
          color: var(--xl-green); font-weight: 700; font-style: italic;
          font-size: 14px; padding: 0 4px;
        }
        .fx-input {
          flex: 1; height: 28px; border: 1px solid var(--xl-border); border-radius: 3px;
          padding: 0 10px; font-size: 13px; outline: none; background: #fff;
        }
        .fx-input:focus { border-color: var(--xl-green); }
        .app { height: 100vh; width: 100vw; display: flex; flex-direction: column; overflow: hidden; }
        .shell { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .grid-wrap {
          flex: 1; overflow: auto; background: #fff; position: relative;
          min-height: 0; overscroll-behavior: contain;
        }
        #status { padding: 48px 24px; text-align: center; color: #666; font-size: 14px; }
        table.xl-sheet {
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          width: 100%;
          font-size: var(--xl-font);
          color: #000;
        }
        table.xl-sheet th,
        table.xl-sheet td {
          border-right: 1px solid var(--xl-grid);
          border-bottom: 1px solid var(--xl-grid);
          padding: 6px 8px;
          box-sizing: border-box;
          background: #fff;
        }
        table.xl-sheet td {
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          vertical-align: top;
          line-height: 1.45;
          cursor: cell;
        }
        table.xl-sheet thead th {
          position: sticky; top: 0; z-index: 3;
          background: var(--xl-header); font-weight: 600;
          text-align: center; color: #444;
          height: 28px; white-space: nowrap;
          overflow: visible; user-select: none;
          vertical-align: middle; padding: 0 4px;
        }
        table.xl-sheet thead th.corner {
          left: 0; z-index: 4;
          width: var(--xl-rowhead-w); min-width: var(--xl-rowhead-w); max-width: var(--xl-rowhead-w);
        }
        table.xl-sheet thead th .col-resizer {
          position: absolute; top: 0; right: -3px; width: 6px; height: 100%;
          cursor: col-resize; z-index: 5;
        }
        table.xl-sheet tbody th {
          position: sticky; left: 0; z-index: 2;
          background: var(--xl-header); text-align: center;
          font-weight: 500; color: #555;
          width: var(--xl-rowhead-w); min-width: var(--xl-rowhead-w); max-width: var(--xl-rowhead-w);
          user-select: none; overflow: visible; vertical-align: middle;
          white-space: nowrap;
        }
        table.xl-sheet tbody th .row-resizer {
          position: absolute; left: 0; bottom: -3px; width: 100%; height: 6px;
          cursor: row-resize; z-index: 5;
        }
        table.xl-sheet td.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.xl-sheet td.selected {
          outline: 2px solid var(--xl-sel-border);
          outline-offset: -2px;
          background: var(--xl-sel);
          position: relative; z-index: 1;
        }
        table.xl-sheet td.hl { background: #fff2a8; }
        table.xl-sheet tr:hover td:not(.selected) { background: #f7fbf8; }
        table.xl-sheet tr:hover th { background: #e8f5ee; }
        body.resizing-col, body.resizing-col * { cursor: col-resize !important; user-select: none !important; }
        body.resizing-row, body.resizing-row * { cursor: row-resize !important; user-select: none !important; }
        .sheet-tabs {
          display: flex; align-items: flex-end; gap: 0; padding: 0 8px;
          background: #f3f3f3; border-top: 1px solid var(--xl-border);
          min-height: 36px; overflow-x: auto; overflow-y: hidden; flex-shrink: 0;
        }
        .sheet-tab {
          appearance: none; border: 1px solid transparent; border-bottom: none;
          background: transparent; padding: 7px 16px; font-size: 12px; color: #444;
          cursor: pointer; border-radius: 4px 4px 0 0; white-space: nowrap;
        }
        .sheet-tab:hover { background: #e8e8e8; }
        .sheet-tab.active {
          background: #fff; border-color: var(--xl-border); color: var(--xl-green-2);
          font-weight: 600; box-shadow: 0 -1px 0 #fff inset;
        }
        .notice {
          padding: 6px 12px; background: #fff8e6; color: #7a5b00; font-size: 12px;
          border-bottom: 1px solid #f0e0a8; flex-shrink: 0;
        }
        .watermark { position: fixed !important; }
        .watermark::after { color: rgba(0,0,0,0.08) !important; }
        .search-box {
          height: 28px; border: 1px solid var(--xl-border); border-radius: 4px;
          padding: 0 8px; font-size: 12px; width: 120px;
        }
      </style>
    `,
    body: `
      <div class="app">
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
          <span class="meta" id="pageMeta"></span>
        </div>
        <div class="actions">
          <div class="scale-box" title="${escapeHtml(ui.rowHeight)}">
            <span class="tag">行高</span>
            <button type="button" id="rowOut">−</button>
            <span class="zlabel" id="rowLabel">100%</span>
            <button type="button" id="rowIn">+</button>
          </div>
          <div class="scale-box" title="${escapeHtml(ui.colWidth)}">
            <span class="tag">列宽</span>
            <button type="button" id="colOut">−</button>
            <span class="zlabel" id="colLabel">100%</span>
            <button type="button" id="colIn">+</button>
          </div>
          <button type="button" id="fitWindow" class="active">适合窗口</button>
          <span class="sep"></span>
          <input class="search-box" id="searchBox" placeholder="查找…" />
          <button type="button" id="searchBtn">查找</button>
          <span class="sep"></span>
          <button type="button" id="freezeBtn" class="active">冻结首行</button>
          <button type="button" id="downloadBtn">下载</button>
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
      </div>
      <script>
        (async function () {
          const UI = ${JSON.stringify(ui)};
          const fileUrl = ${JSON.stringify(opts.fileUrl)};
          const keywordInit = ${JSON.stringify(highlight)};
          const status = document.getElementById("status");
          const gridHost = document.getElementById("gridHost");
          const gridWrap = document.getElementById("gridWrap");
          const sheetTabs = document.getElementById("sheetTabs");
          const pageMeta = document.getElementById("pageMeta");
          const nameBox = document.getElementById("nameBox");
          const fxInput = document.getElementById("fxInput");
          const notice = document.getElementById("notice");
          const freezeBtn = document.getElementById("freezeBtn");
          const searchBox = document.getElementById("searchBox");
          const rowLabel = document.getElementById("rowLabel");
          const colLabel = document.getElementById("colLabel");
          [
            ["rowOut", "减小行高"],
            ["rowIn", "增大行高"],
            ["colOut", "减小列宽"],
            ["colIn", "增大列宽"],
            ["fitWindow", "适合窗口"],
            ["freezeBtn", "冻结首行"],
            ["downloadBtn", "下载"],
          ].forEach(function (item) {
            window.__NFV_PREVIEW__?.registerButtonAction(item[0], { label: item[1] });
          });
          const MAX_ROWS = 800;
          const MAX_COLS = 60;
          const ROW_HEAD = 48;
          const COL_HEAD = 28;
          const MIN_COL = 64;
          const MIN_ROW = 28;

          let workbook = null;
          let sheetNames = [];
          let activeSheet = "";
          let freezeHeader = true;
          let fileBuffer = null;
          let matrix = null;
          let rowScale = 1;
          let colScale = 1;
          let colWidths = [];
          let rowHeights = [];
          let colCount = 0;
          let rowCount = 0;

          function waitXlsx() {
            if (window.XLSX) return Promise.resolve();
            return new Promise(function (resolve, reject) {
              var n = 0;
              var t = setInterval(function () {
                n++;
                if (window.XLSX) { clearInterval(t); resolve(); }
                else if (n > 200) { clearInterval(t); reject(new Error("SheetJS 加载超时")); }
              }, 25);
            });
          }

          function colLetter(n) {
            var s = "", x = n;
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
            var t = v.trim();
            if (!t) return false;
            return /^-?\\d+(\\.\\d+)?([eE][-+]?\\d+)?%$/.test(t) || /^-?\\d+(\\.\\d+)?$/.test(t);
          }

          function clamp(v, min, max) {
            return Math.max(min, Math.min(max, v));
          }

          function updateMeta() {
            if (!activeSheet) return;
            pageMeta.textContent =
              activeSheet + " · " + rowCount + " 行 × " + colCount + " 列 · 已适合窗口";
            window.__NFV_PREVIEW__?.setState({
              kind: "excel",
              sheet: activeSheet,
              rows: rowCount,
              cols: colCount,
              freezeHeader: freezeHeader,
            });
          }

          function applyColWidths() {
            var table = document.getElementById("xlTable");
            if (!table) return;
            var total = 0;
            for (var i = 0; i < colCount; i++) total += colWidths[i] || MIN_COL;
            table.style.width = (ROW_HEAD + total) + "px";
            var headCells = table.querySelectorAll("thead th");
            for (var c = 0; c < colCount; c++) {
              var w = colWidths[c] || MIN_COL;
              var head = headCells[c + 1];
              if (head) {
                head.style.width = w + "px";
                head.style.minWidth = w + "px";
                head.style.maxWidth = w + "px";
              }
              table.querySelectorAll("tbody tr").forEach(function (tr) {
                var td = tr.children[c + 1];
                if (!td) return;
                td.style.width = w + "px";
                td.style.minWidth = w + "px";
                td.style.maxWidth = w + "px";
              });
            }
          }

          function applyRowHeights() {
            var table = document.getElementById("xlTable");
            if (!table) return;
            var bodyRows = table.querySelectorAll("tbody tr");
            for (var i = 0; i < bodyRows.length; i++) {
              var h = rowHeights[i] || MIN_ROW;
              bodyRows[i].style.height = h + "px";
              var cells = bodyRows[i].children;
              for (var j = 0; j < cells.length; j++) {
                cells[j].style.height = h + "px";
                cells[j].style.minHeight = h + "px";
              }
            }
          }

          function applyScaleLabels() {
            rowLabel.textContent = Math.round(rowScale * 100) + "%";
            colLabel.textContent = Math.round(colScale * 100) + "%";
            var fontScale = clamp((rowScale + colScale) / 2, 0.85, 1.8);
            document.documentElement.style.setProperty("--xl-font", (13 * fontScale) + "px");
          }

          /** 按内容权重分配列宽，铺满可视区域；再按换行内容测算行高 */
          function fitToWindow() {
            if (!matrix || !colCount) return;
            var availW = Math.max(240, gridWrap.clientWidth - ROW_HEAD - 4);
            var availH = Math.max(120, gridWrap.clientHeight - COL_HEAD - 4);

            var weights = [];
            var sumW = 0;
            for (var c = 0; c < colCount; c++) {
              var maxLen = 2;
              for (var r = 0; r < rowCount; r++) {
                var cell = matrix.rows[r] ? matrix.rows[r][c] : "";
                var text = cell == null ? "" : String(cell);
                // 按最长行估算（已有换行符时取最长一段）
                var parts = text.split(/\\r?\\n/);
                for (var p = 0; p < parts.length; p++) {
                  maxLen = Math.max(maxLen, parts[p].length);
                }
              }
              var w = clamp(maxLen, 4, 48);
              weights.push(w);
              sumW += w;
            }

            colWidths = [];
            var used = 0;
            for (var c2 = 0; c2 < colCount; c2++) {
              var cw = Math.max(MIN_COL, Math.floor(availW * weights[c2] / sumW));
              colWidths.push(cw);
              used += cw;
            }
            // 余量补给最后一列，保证铺满
            if (colCount > 0) {
              colWidths[colCount - 1] = Math.max(MIN_COL, colWidths[colCount - 1] + (availW - used));
            }

            // 先套列宽
            applyColWidths();

            // 根据列宽估算换行后的行高
            var fontSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--xl-font")) || 13;
            var lineH = fontSize * 1.45;
            var padY = 12;
            rowHeights = [];
            var totalH = 0;
            for (var r2 = 0; r2 < rowCount; r2++) {
              var lines = 1;
              for (var c3 = 0; c3 < colCount; c3++) {
                var raw = matrix.rows[r2] ? matrix.rows[r2][c3] : "";
                var t = raw == null ? "" : String(raw);
                if (!t) continue;
                var segs = t.split(/\\r?\\n/);
                var cellLines = 0;
                var colW = Math.max(24, (colWidths[c3] || MIN_COL) - 16);
                var charsPerLine = Math.max(4, Math.floor(colW / (fontSize * 0.6)));
                for (var s = 0; s < segs.length; s++) {
                  cellLines += Math.max(1, Math.ceil(segs[s].length / charsPerLine));
                }
                lines = Math.max(lines, cellLines);
              }
              var rh = clamp(Math.ceil(lines * lineH + padY), MIN_ROW, 200);
              rowHeights.push(rh);
              totalH += rh;
            }

            // 行数较少时，拉伸行高填满可视高度
            if (rowCount > 0 && totalH < availH) {
              var extra = availH - totalH;
              var add = Math.floor(extra / rowCount);
              var rem = extra - add * rowCount;
              for (var r3 = 0; r3 < rowCount; r3++) {
                rowHeights[r3] += add + (r3 === rowCount - 1 ? rem : 0);
              }
            }

            // 应用缩放系数
            if (rowScale !== 1) {
              for (var r4 = 0; r4 < rowCount; r4++) {
                rowHeights[r4] = clamp(Math.round(rowHeights[r4] * rowScale), MIN_ROW, 260);
              }
            }
            if (colScale !== 1) {
              for (var c4 = 0; c4 < colCount; c4++) {
                colWidths[c4] = clamp(Math.round(colWidths[c4] * colScale), MIN_COL, 600);
              }
              applyColWidths();
            }

            applyRowHeights();
            applyScaleLabels();
            updateMeta();
          }

          function sheetToMatrix(name) {
            var sheet = workbook.Sheets[name];
            if (!sheet) return { rows: [], cols: 0, truncated: false };
            var aoa = XLSX.utils.sheet_to_json(sheet, {
              header: 1, raw: false, defval: "", blankrows: true,
            });
            var totalRows = aoa.length;
            var totalCols = 0;
            for (var i = 0; i < aoa.length; i++) {
              if (aoa[i] && aoa[i].length > totalCols) totalCols = aoa[i].length;
            }
            var rowLimit = Math.min(totalRows, MAX_ROWS);
            var colLimit = Math.min(totalCols, MAX_COLS);
            var rows = new Array(rowLimit);
            for (var r = 0; r < rowLimit; r++) {
              var src = aoa[r] || [];
              var row = new Array(colLimit);
              for (var c = 0; c < colLimit; c++) row[c] = src[c] != null ? src[c] : "";
              rows[r] = row;
            }
            return {
              rows: rows, cols: colLimit,
              truncated: totalRows > MAX_ROWS || totalCols > MAX_COLS,
              totalRows: totalRows, totalCols: totalCols,
            };
          }

          function bindResizers() {
            var table = document.getElementById("xlTable");
            if (!table) return;
            table.querySelectorAll("thead th .col-resizer").forEach(function (handle) {
              handle.onmousedown = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var idx = Number(handle.getAttribute("data-c"));
                var startX = e.clientX;
                var startW = colWidths[idx] || MIN_COL;
                document.body.classList.add("resizing-col");
                function onMove(ev) {
                  colWidths[idx] = clamp(Math.round(startW + (ev.clientX - startX)), 40, 600);
                  applyColWidths();
                }
                function onUp() {
                  document.body.classList.remove("resizing-col");
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                }
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              };
            });
            table.querySelectorAll("tbody th .row-resizer").forEach(function (handle) {
              handle.onmousedown = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var idx = Number(handle.getAttribute("data-r"));
                var startY = e.clientY;
                var startH = rowHeights[idx] || MIN_ROW;
                document.body.classList.add("resizing-row");
                function onMove(ev) {
                  rowHeights[idx] = clamp(Math.round(startH + (ev.clientY - startY)), 20, 260);
                  applyRowHeights();
                }
                function onUp() {
                  document.body.classList.remove("resizing-row");
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                }
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              };
            });
          }

          function renderSheet(name) {
            activeSheet = name;
            nameBox.textContent = "A1";
            fxInput.value = "";
            matrix = sheetToMatrix(name);
            rowCount = matrix.rows.length;
            colCount = matrix.cols;

            if (matrix.truncated) {
              notice.hidden = false;
              notice.textContent = "工作表较大，已截断显示前 " + rowCount + " 行 / " + colCount +
                " 列（原表约 " + matrix.totalRows + " 行 × " + matrix.totalCols + " 列）。";
            } else {
              notice.hidden = true;
            }

            var parts = [];
            parts.push('<table class="xl-sheet" id="xlTable"><thead><tr><th class="corner"></th>');
            for (var c = 0; c < colCount; c++) {
              parts.push(
                '<th>' + colLetter(c) + '<span class="col-resizer" data-c="' + c + '"></span></th>'
              );
            }
            parts.push("</tr></thead><tbody>");
            for (var r = 0; r < rowCount; r++) {
              parts.push('<tr><th>' + (r + 1) + '<span class="row-resizer" data-r="' + r + '"></span></th>');
              for (var c2 = 0; c2 < colCount; c2++) {
                var v = matrix.rows[r][c2];
                var text = v == null ? "" : String(v);
                var cls = isNumericLike(v) ? "num" : "";
                parts.push('<td class="' + cls + '" data-r="' + r + '" data-c="' + c2 + '" title="' +
                  escapeText(text) + '">' + escapeText(text) + "</td>");
              }
              parts.push("</tr>");
            }
            parts.push("</tbody></table>");
            gridHost.innerHTML = parts.join("");
            gridHost.hidden = false;
            gridWrap.scrollTop = 0;
            gridWrap.scrollLeft = 0;

            Array.from(sheetTabs.children).forEach(function (btn) {
              btn.classList.toggle("active", btn.getAttribute("data-name") === name);
            });

            // 默认进入：铺满窗口 + 自动换行行高
            requestAnimationFrame(function () {
              fitToWindow();
              bindResizers();
              if (keywordInit) applySearch(keywordInit);
            });
          }

          function renderTabs() {
            sheetTabs.innerHTML = "";
            sheetNames.forEach(function (name, i) {
              var btn = document.createElement("button");
              btn.type = "button";
              btn.className = "sheet-tab" + (i === 0 ? " active" : "");
              btn.textContent = name;
              btn.setAttribute("data-name", name);
              btn.onclick = function () { renderSheet(name); };
              sheetTabs.appendChild(btn);
            });
          }

          function applySearch(q) {
            var needle = (q || "").trim().toLowerCase();
            gridHost.querySelectorAll("td.hl").forEach(function (td) { td.classList.remove("hl"); });
            window.__NFV_PREVIEW__?.setState({ search: q || "" });
            if (!needle) return;
            var first = null;
            gridHost.querySelectorAll("td").forEach(function (td) {
              var t = (td.getAttribute("title") || td.textContent || "").toLowerCase();
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

          gridHost.addEventListener("click", function (e) {
            if (e.target.closest(".col-resizer, .row-resizer")) return;
            var td = e.target.closest("td");
            if (!td || !gridHost.contains(td)) return;
            gridHost.querySelectorAll("td.selected").forEach(function (x) { x.classList.remove("selected"); });
            td.classList.add("selected");
            var r = Number(td.getAttribute("data-r"));
            var c = Number(td.getAttribute("data-c"));
            nameBox.textContent = colLetter(c) + (r + 1);
            fxInput.value = td.getAttribute("title") || td.textContent || "";
          });

          try {
            status.textContent = "正在加载表格引擎…";
            await waitXlsx();
            status.textContent = "正在下载 / 解析工作簿…";
            var res = await fetch(fileUrl);
            if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
            fileBuffer = await res.arrayBuffer();
            workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
            sheetNames = workbook.SheetNames || [];
            if (!sheetNames.length) throw new Error("工作簿没有工作表");
            status.remove();
            renderTabs();
            renderSheet(sheetNames[0]);
            if (keywordInit) searchBox.value = keywordInit;
            window.__NFV_PREVIEW__?.registerAction(
              "search",
              { label: "查找", kind: "method" },
              function (payload) {
                var keyword = payload && typeof payload.keyword === "string" ? payload.keyword : "";
                searchBox.value = keyword;
                applySearch(keyword);
                return { keyword: keyword };
              }
            );
          } catch (err) {
            status.textContent = UI.excelFailed.replace("{error}", err && err.message ? err.message : String(err));
            status.style.color = "#b42318";
          }

          document.getElementById("rowIn").onclick = function () {
            rowScale = clamp(rowScale + 0.1, 0.6, 2.5);
            fitToWindow();
          };
          document.getElementById("rowOut").onclick = function () {
            rowScale = clamp(rowScale - 0.1, 0.6, 2.5);
            fitToWindow();
          };
          document.getElementById("colIn").onclick = function () {
            colScale = clamp(colScale + 0.1, 0.6, 2.5);
            fitToWindow();
          };
          document.getElementById("colOut").onclick = function () {
            colScale = clamp(colScale - 0.1, 0.6, 2.5);
            fitToWindow();
          };
          document.getElementById("fitWindow").onclick = function () {
            rowScale = 1;
            colScale = 1;
            fitToWindow();
          };

          freezeBtn.onclick = function () {
            freezeHeader = !freezeHeader;
            freezeBtn.classList.toggle("active", freezeHeader);
            gridHost.querySelectorAll("thead th").forEach(function (th) {
              th.style.position = freezeHeader ? "sticky" : "static";
            });
            window.__NFV_PREVIEW__?.setState({ freezeHeader: freezeHeader });
          };
          document.getElementById("searchBtn").onclick = function () { applySearch(searchBox.value); };
          searchBox.addEventListener("keydown", function (e) {
            if (e.key === "Enter") applySearch(searchBox.value);
          });
          document.getElementById("downloadBtn").onclick = function () {
            if (!fileBuffer) {
              var a0 = document.createElement("a");
              a0.href = fileUrl;
              a0.download = ${JSON.stringify(opts.title)};
              a0.click();
              return;
            }
            var a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([fileBuffer]));
            a.download = ${JSON.stringify(opts.title)};
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
          };

          window.addEventListener("resize", function () {
            if (matrix) fitToWindow();
          });
        })();
      </script>
    `,
  });
}
