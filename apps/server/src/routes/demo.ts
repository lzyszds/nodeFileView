/**
 * Demo HTML 路由（可选）。
 * 主控制台已改为 React + Tailwind（apps/web），不再依赖本文件拼装页面。
 * 保留 /__demo/console7、/__demo/archive8 仅供对照旧 demo 模板。
 */
import type { FastifyInstance } from "fastify";
import fs from "node:fs";

type DemoKey = "console7" | "archive8";

const DEMO_PATHS: Record<DemoKey, string | undefined> = {
  console7:
    process.env.DEMO_CONSOLE7_PATH ||
    "/Users/mac/Downloads/ai_studio_code (7).html",
  archive8:
    process.env.DEMO_ARCHIVE8_PATH ||
    "/Users/mac/Downloads/ai_studio_code (8).html",
};

const cache: Partial<Record<DemoKey, string>> = {};

function loadDemoHtml(key: DemoKey): string | null {
  if (cache[key]) return cache[key]!;
  const filePath = DEMO_PATHS[key];
  if (!filePath) return null;
  try {
    const html = fs.readFileSync(filePath, "utf8");
    cache[key] = html;
    return html;
  } catch {
    return null;
  }
}

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/__demo/console7", async (request, reply) => {
    const html0 = loadDemoHtml("console7");
    if (!html0)
      return reply.code(404).type("text/plain").send("Missing DEMO_CONSOLE7_PATH");

    // demo（7）在不同文件名字符下可能导致预览链接不稳定；以及你要求的按钮/行为调整。
    // 这里做“字符串级补丁”，确保不依赖手动修改下载目录 demo 文件。
    let html = html0;

    // 0) 固定主页为 100vh；文件页内部滚动，监控/设置页允许主区域滚动
    {
      const lockStyle = `<style id="nfv-demo7-lock-viewport">
html, body { height: 100%; overflow: hidden !important; }
body { margin: 0; }
#app { height: 100vh !important; overflow: hidden !important; display: flex !important; flex-direction: row !important; }
#app > aside { flex-shrink: 0; }
#app > .flex-1 { min-width: 0; min-height: 0; }
main { min-height: 0; flex: 1 1 auto; }
.nfv-files-root { height: 100%; min-height: 0; }
.nfv-files-left { min-height: 0; display: flex; flex-direction: column; }
.nfv-files-list-card { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.nfv-files-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.nfv-logs-scroll { max-height: min(52vh, 480px); overflow: auto; }
</style>`;
      if (html.includes('id="nfv-demo7-lock-viewport"')) {
        html = html.replace(
          /<style id="nfv-demo7-lock-viewport">[\s\S]*?<\/style>/,
          lockStyle,
        );
      } else {
        html = html.replace(/<\/head>/, `${lockStyle}</head>`);
      }
    }

    html = html.replace(
      /<main class="flex-1 overflow-y-auto dot-grid-pattern p-6">/,
      `<main class="flex-1 min-h-0 dot-grid-pattern p-6" :class="activeNav === 'files' ? 'overflow-hidden' : 'overflow-y-auto'">`,
    );
    html = html.replace(
      /<main class="flex-1 overflow-hidden dot-grid-pattern p-6">/,
      `<main class="flex-1 min-h-0 dot-grid-pattern p-6" :class="activeNav === 'files' ? 'overflow-hidden' : 'overflow-y-auto'">`,
    );
    html = html.replace(
      /<main class="flex-1 min-h-0 dot-grid-pattern p-6" :class="activeNav === 'files' \? 'overflow-hidden' : 'overflow-y-auto'">/,
      `<main class="flex-1 min-h-0 dot-grid-pattern p-6" :class="activeNav === 'files' ? 'overflow-hidden' : 'overflow-y-auto'">`,
    );
    html = html.replace(
      /<div v-if="activeNav === 'files'" class="grid grid-cols-1 xl:grid-cols-12 gap-6">/,
      `<div v-if="activeNav === 'files'" class="nfv-files-root grid grid-cols-1 xl:grid-cols-12 gap-6">`,
    );
    html = html.replace(
      /<div class="xl:col-span-8 space-y-4">/,
      `<div class="nfv-files-left xl:col-span-8 space-y-4">`,
    );
    html = html.replace(
      /<div class="bg-white border border-slate-200\/90 rounded-xl shadow-xs overflow-hidden">/,
      `<div class="nfv-files-list-card bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">`,
    );
    html = html.replace(
      /<table class="w-full text-left text-xs font-sans">/,
      `<div class="nfv-files-table-scroll"><table class="w-full text-left text-xs font-sans">`,
    );
    html = html.replace(/<\/table>\s*<\/div>\s*<\/div>/, "</table></div>\n                    </div>\n                </div>");

    // 1) generatedDrawerUrl：file 参数 base64，避免文件名空格/特殊字符导致出问题
    html = html.replace(
      /return\s+`\/onlinePreview\?file=\$\{selectedFile\.value\.name\}&watermarkTxt=\$\{drawerParam\.value\.watermark\}&aes=\$\{drawerParam\.value\.useAes\}`;/,
      `const fileToken = btoa(unescape(encodeURIComponent(selectedFile.value.name)));
                const localId = selectedFile.value.fileId || fileToken;
                const virtualUrl = "file://local/" + localId;
                const encodedUrl = btoa(unescape(encodeURIComponent(virtualUrl)));
                return \`/onlinePreview?url=\${encodeURIComponent(encodedUrl)}&file=\${fileToken}&watermarkTxt=\${drawerParam.value.watermark}&aes=\${drawerParam.value.useAes}\`;`,
    );

    // 2) openDrawerPreview：从 alert 改为直接打开新窗口
    html = html.replace(
      /const openDrawerPreview\s*=\s*\(\)\s*=>\s*{\s*alert\(`调起预览:\s*\$\{generatedDrawerUrl\.value\}`\);\s*};/,
      `const openDrawerPreview = () => {
  window.open(generatedDrawerUrl.value, "_blank", "noopener,noreferrer");
};`,
    );

    // 3) 在 openDrawerPreview 附近新增 previewFile：点击文件行里的“预览”按钮时直接打开预览窗口
    if (!html.includes("const previewFile")) {
      html = html.replace(
        /const openDrawerPreview\s*=\s*\(\)\s*=>\s*{\s*window\.open\(generatedDrawerUrl\.value,\s*"_blank",\s*"noopener,noreferrer"\);\s*};/,
        `const openDrawerPreview = () => {
  window.open(generatedDrawerUrl.value, "_blank", "noopener,noreferrer");
};
const previewFile = (file) => {
  selectedFile.value = file;
  setTimeout(() => {
    window.open(generatedDrawerUrl.value, "_blank", "noopener,noreferrer");
  }, 0);
};`,
      );
    }

    // 4) 把返回对象里补上 previewFile（给“预览”按钮用）
    html = html.replace(
      /openDrawerPreview,\s*saveSettings/,
      "openDrawerPreview, previewFile, saveSettings",
    );

    // 5) 文件行按钮：新增“预览”按钮（放在“选中透传”和“删除”之间）
    html = html.replace(
      /<button\s+@click\.stop="selectFileForInspect\(file\)"\s+class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded font-medium text-\[11px\]">选中透传<\/button>\s*<button\s+@click\.stop="deleteFile\(file\)"\s+class="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-\[11px\]">删除<\/button>/,
      `<button @click.stop="selectFileForInspect(file)" class="px-2 py-1 bg-indigo-50 text-indigo-600 rounded font-medium text-[11px]">选中透传</button>
                                        <button @click.stop="previewFile(file)" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-[11px]">预览</button>
                                        <button @click.stop="deleteFile(file)" class="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-[11px]">删除</button>`,
    );

    // 6) 假数据 -> 真实接口：文件列表使用 /api/files，上传/删除走真实 API
    html = html.replace(
      /const files = ref\(\[\s*[\s\S]*?\]\);/,
      "const files = ref([]);",
    );

    // 7) 文件列表分页：每页行数 + 上一页/下一页 + 跳转页码
    //    说明：demo7 的外层滚动结构已在上面锁死，这里只让 table 行渲染分页。
    html = html.replace(
      /<tr v-for="file in filteredFiles" :key="file.name"/g,
      '<tr v-for="file in paginatedFiles" :key="file.name"',
    );

    // 在表格滚动容器外侧插入分页条
    html = html.replace(
      /<\/div>\s*\n\s*<div class="nfv-files-table-scroll"><table class="w-full text-left text-xs font-sans">/,
      `</div>
                        <div class="px-3 pb-3 pt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <div class="flex items-center space-x-2">
                            <span>每页</span>
                            <select v-model.number="pageSize" @change="currentPage = 1; jumpPage = 1" class="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-indigo-500">
                              <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
                            </select>
                            <span>条</span>
                          </div>
                          <div class="flex items-center space-x-2">
                            <button @click="gotoPage(safePage - 1)" :disabled="safePage === 1" class="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                              上一页
                            </button>
                            <span class="font-mono text-slate-600">{{ safePage }} / {{ totalPages }}</span>
                            <button @click="gotoPage(safePage + 1)" :disabled="safePage === totalPages" class="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                              下一页
                            </button>
                            <div class="flex items-center space-x-1">
                              <input type="number" v-model.number="jumpPage" min="1" :max="totalPages" class="w-18 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500" />
                              <button @click="gotoPage(jumpPage)" class="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed text-[11px]">
                                跳转
                              </button>
                            </div>
                          </div>
                        </div>
                        <div class="nfv-files-table-scroll"><table class="w-full text-left text-xs font-sans">`,
    );

    // 注入分页状态/计算属性（只在 setup 里新增变量，不改原逻辑）
    if (!html.includes("const paginatedFiles = computed")) {
      html = html.replace(
        /(const filteredFiles = computed\(\(\) => \{[\s\S]*?\}\);\s*)\n\s*const selectFileForInspect/s,
        `$1

            const pageSizeOptions = [10, 20, 50, 100];
            const pageSize = ref(20);
            const currentPage = ref(1);
            const jumpPage = ref(1);

            const totalPages = computed(() => {
                const total = Math.ceil(filteredFiles.value.length / pageSize.value);
                return Math.max(1, total || 1);
            });

            const safePage = computed(() => {
                const t = totalPages.value;
                const p = Number(currentPage.value || 1);
                return Math.min(Math.max(1, p), t);
            });

            const paginatedFiles = computed(() => {
                const start = (safePage.value - 1) * pageSize.value;
                return filteredFiles.value.slice(start, start + pageSize.value);
            });

            const gotoPage = (n) => {
                const t = totalPages.value;
                const next = Math.min(Math.max(1, Number(n || 1)), t);
                currentPage.value = next;
                jumpPage.value = next;
            };

            const selectFileForInspect`,
      );
    }

    // return 暴露分页变量（确保模板里能用到分页状态/计算属性）
    html = html.replace(
      /generatedDrawerUrl,\s*filteredFiles,/,
      "generatedDrawerUrl, filteredFiles, paginatedFiles, pageSizeOptions, pageSize, currentPage, safePage, totalPages, jumpPage, gotoPage,",
    );

    // 8) 远程地址预览：url 必须 base64，并提供“打开预览”按钮
    if (!html.includes("generatedPlaygroundUrl")) {
      html = html.replace(
        /<div class="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl break-all leading-relaxed space-y-2">\s*<div class="text-slate-500">\/\/ 生成的目标调起 URL<\/div>\s*<div>\/onlinePreview\?url=\{\{ encodeURIComponent\(playgroundUrl\) \}\}&watermarkTxt=nodeFileView&aes=true<\/div>\s*<\/div>/,
        `<div class="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl break-all leading-relaxed space-y-2">
                        <div class="text-slate-500">// 生成的目标调起 URL（url 参数为 base64）</div>
                        <div>{{ generatedPlaygroundUrl }}</div>
                    </div>
                    <button @click="openPlaygroundPreview" :disabled="!playgroundUrl" class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg text-xs shadow-xs transition">
                        新窗口打开远程预览
                    </button>`,
      );

      html = html.replace(
        /const playgroundUrl = ref\('https:\/\/example\.com\/demo\.docx'\);/,
        `const playgroundUrl = ref('https://example.com/demo.docx');

            const generatedPlaygroundUrl = computed(() => {
                const raw = String(playgroundUrl.value || '').trim();
                if (!raw) return '';
                const encoded = btoa(unescape(encodeURIComponent(raw)));
                return '/onlinePreview?url=' + encodeURIComponent(encoded) + '&watermarkTxt=nodeFileView';
            });

            const openPlaygroundPreview = () => {
                const raw = String(playgroundUrl.value || '').trim();
                if (!raw) return;
                if (!/^https?:\\/\\//i.test(raw)) {
                    alert('请输入以 http:// 或 https:// 开头的远程文件地址');
                    return;
                }
                window.open(generatedPlaygroundUrl.value, '_blank', 'noopener,noreferrer');
            };`,
      );

      html = html.replace(
        /playgroundUrl,\s*settings,\s*logs,/,
        "playgroundUrl, generatedPlaygroundUrl, openPlaygroundPreview, settings, logs,",
      );
    }

    // 注入辅助方法（格式化、加载文件列表）
    if (!html.includes("const refreshFilesFromApi = async () =>")) {
      html = html.replace(
        /const selectedFile = ref\(files\.value\[0\]\);/,
        `const selectedFile = ref(null);

            const formatSize = (bytes) => {
                const b = Number(bytes || 0);
                if (b < 1024) return b + ' B';
                if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
                return (b / 1024 / 1024).toFixed(2) + ' MB';
            };

            const refreshFilesFromApi = async () => {
                try {
                    const res = await fetch('/api/files?page=1&size=200&q=');
                    const data = await res.json();
                    const items = Array.isArray(data?.items) ? data.items : [];
                    files.value = items.map((f) => ({
                        fileId: f.fileId,
                        name: f.name,
                        ext: (f.ext || '').toLowerCase(),
                        size: formatSize(f.size),
                        time: f.createdAt ? new Date(f.createdAt).toLocaleString() : '',
                    }));
                    if (!selectedFile.value && files.value.length) {
                        selectedFile.value = files.value[0];
                    }
                    if (
                        selectedFile.value &&
                        !files.value.find((x) => x.fileId === selectedFile.value.fileId)
                    ) {
                        selectedFile.value = files.value[0] || null;
                    }
                } catch (e) {
                    console.warn('load files failed', e);
                }
            };`,
      );
    }

    // 删除改真实 API
    html = html.replace(
      /const deleteFile = \(file\) => \{\s*files\.value = files\.value\.filter\(f => f\.name !== file\.name\);\s*if \(selectedFile\.value\?\.name === file\.name\) \{\s*selectedFile\.value = files\.value\[0\] \|\| null;\s*\}\s*\};/,
      `const deleteFile = async (file) => {
                try {
                    if (file.fileId) {
                        await fetch('/api/files/' + encodeURIComponent(file.fileId), { method: 'DELETE' });
                    }
                    await refreshFilesFromApi();
                } catch (e) {
                    console.warn('delete failed', e);
                }
            };`,
    );

    // 上传改真实 API
    html = html.replace(
      /const handleFileUpload = \(e\) => \{\s*const f = e\.target\.files\[0\];\s*if \(!f\) return;\s*files\.value\.unshift\(\{\s*name: f\.name,\s*ext: f\.name\.split\('\.'\)\.pop\(\),\s*size: \(f\.size \/ 1024 \/ 1024\)\.toFixed\(2\) \+ ' MB'\s*\}\);\s*\};/,
      `const handleFileUpload = async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const form = new FormData();
                    form.append('file', f);
                    await fetch('/api/upload', { method: 'POST', body: form });
                    await refreshFilesFromApi();
                } catch (err) {
                    console.warn('upload failed', err);
                } finally {
                    e.target.value = '';
                }
            };`,
    );

    // 首次 mounted 时拉真实列表
    html = html.replace(
      /onMounted\(\(\) => \{\s*lucide\.createIcons\(\);\s*\}\);/,
      `onMounted(async () => {
                lucide.createIcons();
                await refreshFilesFromApi();
            });`,
    );

    // 9) 监控日志 + 缓存清理：接真实 /api/monitor/*
    if (!html.includes("nfv-real-monitor")) {
      html = html.replace(
        /const \{ createApp, ref, computed, onMounted \} = Vue;/,
        "const { createApp, ref, computed, onMounted, watch } = Vue; /* nfv-real-monitor */",
      );

      html = html.replace(
        /const logs = ref\(\[[\s\S]*?\]\);/,
        `const logs = ref([]);
            const monitorStats = ref(null);
            const formatMonitorTime = (ts) => {
                try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
            };
            const refreshMonitorFromApi = async () => {
                try {
                    const [statsRes, logsRes] = await Promise.all([
                        fetch('/api/monitor/stats'),
                        fetch('/api/monitor/logs?limit=120'),
                    ]);
                    const stats = await statsRes.json();
                    const logData = await logsRes.json();
                    monitorStats.value = stats;
                    logs.value = (Array.isArray(logData?.items) ? logData.items : []).map((item) => ({
                        id: item.id,
                        time: formatMonitorTime(item.ts),
                        kind: item.kind || '-',
                        ext: (item.detail && (item.detail.ext || item.detail.sourceName)) || item.kind || '-',
                        duration: typeof item.durationMs === 'number' ? (item.durationMs + 'ms') : '-',
                        cache: item.cacheHit === true ? 'HIT' : (item.cacheHit === false ? 'MISS' : '-'),
                        level: item.level || 'info',
                        message: item.message || '',
                        status: item.level === 'error' ? 'ERROR' : 'OK',
                    }));
                } catch (e) {
                    console.warn('load monitor failed', e);
                }
            };
            watch(activeNav, (v) => {
                if (v === 'logs' || v === 'settings') refreshMonitorFromApi();
            });
            setInterval(() => {
                if (activeNav.value === 'logs') refreshMonitorFromApi();
            }, 4000);`,
      );

      html = html.replace(
        /const purgeCache = \(\) => \{\s*isRefreshing\.value = true;\s*setTimeout\(\(\) => \{ isRefreshing\.value = false; alert\("转换缓存清理完毕！"\); \}, 500\);\s*\};/,
        `const purgeCache = async () => {
                isRefreshing.value = true;
                try {
                    const res = await fetch('/api/monitor/cache/clear', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scope: 'all' }),
                    });
                    const data = await res.json();
                    if (!res.ok || data?.ok === false) throw new Error(data?.error || '清理失败');
                    await refreshMonitorFromApi();
                    alert('缓存已清理（转码/远程/临时）');
                } catch (e) {
                    alert(e && e.message ? e.message : String(e));
                } finally {
                    isRefreshing.value = false;
                }
            };`,
      );

      html = html.replace(
        /const saveSettings = \(\) => \{\s*alert\("全局配置已保存！"\);\s*\};/,
        `const saveSettings = async () => {
                try {
                    const res = await fetch('/api/config/public');
                    const cfg = await res.json();
                    settings.value = {
                        ...settings.value,
                        watermark: settings.value.watermark || 'nodeFileView',
                        cacheTtl: settings.value.cacheTtl || 7,
                        _server: cfg,
                    };
                    alert('配置来自服务端 .env（只读已刷新）。AES=' + (cfg.aesEnabled ? 'on' : 'off') + ', BasicAuth=' + (cfg.basicAuthEnabled ? 'on' : 'off') + ', 预览密码=' + (cfg.previewPasswordEnabled ? 'on' : 'off') + '。修改请改 .env 后重启。');
                    await refreshMonitorFromApi();
                } catch (e) {
                    alert(e && e.message ? e.message : String(e));
                }
            };`,
      );

      html = html.replace(
        /<div v-if="activeNav === 'logs'" class="max-w-5xl mx-auto bg-white border border-slate-200\/90 rounded-xl shadow-xs overflow-hidden">\s*<div class="p-3\.5 border-b border-slate-100 font-bold text-xs text-slate-900">\s*实时预览转码与缓存日志\s*<\/div>\s*<table class="w-full text-left text-xs font-mono">[\s\S]*?<\/table>\s*<\/div>/,
        `<div v-if="activeNav === 'logs'" class="max-w-5xl mx-auto space-y-4">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs">
                        <div class="text-[11px] text-slate-500">今日预览</div>
                        <div class="text-lg font-mono font-bold text-slate-900">{{ (monitorStats && monitorStats.previewToday != null) ? monitorStats.previewToday : '—' }}</div>
                        <div class="text-[10px] text-slate-400 mt-1">累计 {{ (monitorStats && monitorStats.previewTotal) || 0 }} · {{ (monitorStats && monitorStats.uptimeText) || '—' }}</div>
                    </div>
                    <div class="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs">
                        <div class="text-[11px] text-slate-500">缓存命中率</div>
                        <div class="text-lg font-mono font-bold text-emerald-600">{{ (monitorStats && monitorStats.cacheHitRateText) || '—' }}</div>
                        <div class="text-[10px] text-slate-400 mt-1">hit {{ (monitorStats && monitorStats.cacheHits) || 0 }} / miss {{ (monitorStats && monitorStats.cacheMisses) || 0 }}</div>
                    </div>
                    <div class="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs">
                        <div class="text-[11px] text-slate-500">平均转码耗时</div>
                        <div class="text-lg font-mono font-bold text-indigo-600">{{ monitorStats ? (monitorStats.avgConvertMs + ' ms') : '—' }}</div>
                        <div class="text-[10px] text-slate-400 mt-1">转码 {{ (monitorStats && monitorStats.convertTotal) || 0 }} 次</div>
                    </div>
                    <div class="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs">
                        <div class="text-[11px] text-slate-500">转换异常</div>
                        <div class="text-lg font-mono font-bold text-rose-600">{{ (monitorStats && monitorStats.convertErrors != null) ? monitorStats.convertErrors : '—' }} 次</div>
                        <div class="text-[10px] text-slate-400 mt-1">缓存占用见设置页清理</div>
                    </div>
                </div>
                <div class="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
                <div class="p-3.5 border-b border-slate-100 font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>实时预览转码与缓存日志</span>
                    <div class="flex items-center gap-2">
                      <span class="font-normal text-slate-400">{{ logs.length }} 条</span>
                      <button @click="refreshMonitorFromApi" class="px-2 py-1 text-[11px] rounded-md border border-slate-200 bg-white hover:bg-slate-50 font-medium">刷新</button>
                    </div>
                </div>
                <div v-if="!logs.length" class="p-8 text-center text-xs text-slate-400">暂无日志。预览任意文件后会出现真实流水。</div>
                <div v-else class="nfv-logs-scroll">
                <table class="w-full text-left text-xs font-mono">
                    <thead class="sticky top-0 z-10">
                        <tr class="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th class="p-3 pl-4">时间</th>
                            <th class="p-3">类型</th>
                            <th class="p-3">消息</th>
                            <th class="p-3">耗时</th>
                            <th class="p-3">缓存</th>
                            <th class="p-3 text-right pr-4">状态</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-slate-700">
                        <tr v-for="log in logs" :key="log.id">
                            <td class="p-3 pl-4 text-slate-400 whitespace-nowrap">{{ log.time }}</td>
                            <td class="p-3 font-bold">{{ log.kind }}</td>
                            <td class="p-3 max-w-[320px] truncate" :title="log.message">{{ log.message }}</td>
                            <td class="p-3">{{ log.duration }}</td>
                            <td class="p-3">
                              <span v-if="log.cache === 'HIT'" class="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px]">HIT</span>
                              <span v-else-if="log.cache === 'MISS'" class="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">MISS</span>
                              <span v-else class="text-slate-400">—</span>
                            </td>
                            <td class="p-3 text-right pr-4 font-bold" :class="log.status === 'ERROR' ? 'text-rose-600' : 'text-emerald-600'">{{ log.status }}</td>
                        </tr>
                    </tbody>
                </table>
                </div>
                </div>
            </div>`,
      );

      html = html.replace(
        /playgroundUrl, generatedPlaygroundUrl, openPlaygroundPreview, settings, logs,/,
        "playgroundUrl, generatedPlaygroundUrl, openPlaygroundPreview, settings, logs, monitorStats, refreshMonitorFromApi,",
      );
      // fallback if playground patch order differs
      html = html.replace(
        /playgroundUrl, settings, logs,/,
        "playgroundUrl, settings, logs, monitorStats, refreshMonitorFromApi,",
      );

      html = html.replace(
        /onMounted\(async \(\) => \{\s*lucide\.createIcons\(\);\s*await refreshFilesFromApi\(\);\s*\}\);/,
        `onMounted(async () => {
                lucide.createIcons();
                await refreshFilesFromApi();
                await refreshMonitorFromApi();
            });`,
      );
    }

    reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/__demo/archive8", async (request, reply) => {
    const html = loadDemoHtml("archive8");
    if (!html) return reply.code(404).type("text/plain").send("Missing DEMO_ARCHIVE8_PATH");
    reply.type("text/html; charset=utf-8").send(html);
  });
}

