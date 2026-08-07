import { escapeHtml, layout, watermarkLayer } from "./layout.js";

/**
 * 纯原生谷歌/Chromium 内核 PDF 预览器（无第三方依赖库），
 * 并通过 URL 参数 #toolbar=0&navpanes=0 隐藏原生预览器的顶部操作栏与侧边导航栏。
 */
export function renderPdfViewer(opts: {
  title: string;
  pdfUrl: string;
  page?: number;
  highlight?: string;
  watermark?: string;
  presentation?: boolean;
}): string {
  const presentation = Boolean(opts.presentation);
  const src = buildPdfSrc(opts.pdfUrl, opts.page, opts.highlight);

  return layout({
    title: opts.title,
    ext: presentation ? "ppt" : "pdf",
    engine: presentation
      ? "LibreOffice · Google Chrome PDF Engine"
      : "Google Chrome PDF Engine",
    head: `
      <style>
        .pdf-native-wrap {
          position: relative;
          flex: 1;
          min-height: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #525659;
        }
        .pdf-native {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
      </style>
    `,
    body: `
      ${watermarkLayer(opts.watermark)}
      <div class="pdf-native-wrap">
        <iframe
          class="pdf-native"
          id="pdfFrame"
          title="${escapeHtml(opts.title)}"
          src="${escapeHtml(src)}"
          allow="fullscreen"
        ></iframe>
      </div>
      <script>
        (function () {
          const page = ${opts.page && opts.page > 0 ? opts.page : 1};
          window.__NFV_PREVIEW__?.setState({
            kind: "pdf",
            engine: "chrome-pdfium",
            page: page,
          });
        })();
      </script>
    `,
  });
}

function buildPdfSrc(
  pdfUrl: string,
  page?: number,
  search?: string,
): string {
  // toolbar=0: 隐藏原生顶部工具条（打印、下载、页码等）
  // navpanes=0: 隐藏左侧缩略图与书签导航面板
  // scrollbar=1: 保留右侧滚动条
  const params: string[] = ["toolbar=0", "navpanes=0", "scrollbar=1"];
  const p = page && page > 0 ? page : 1;
  if (p > 1) {
    params.push(`page=${p}`);
  }
  if (search && search.trim()) {
    params.push(`search=${encodeURIComponent(search.trim())}`);
  }
  const hashIndex = pdfUrl.indexOf("#");
  const base = hashIndex >= 0 ? pdfUrl.slice(0, hashIndex) : pdfUrl;
  return `${base}#${params.join("&")}`;
}

