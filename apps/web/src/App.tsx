import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  FileUp,
  Folder,
  HelpCircle,
  RefreshCw,
  Settings,
  Search,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  deleteFile,
  encodeUrl,
  fetchPublicConfig,
  fetchMonitorStats,
  fetchMonitorLogs,
  clearMonitorLogsApi,
  clearMonitorCache,
  formatSize,
  formatTime,
  listFiles,
  uploadFile,
  type FileItem,
  type MonitorEvent,
  type MonitorStats,
  type PublicConfig,
} from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const FORMAT_GROUPS = [
  {
    title: "Word",
    desc: "docx：原生版式 + 目录 + 编辑下载；doc/wps/odt → PDF 增强预览",
  },
  {
    title: "Excel",
    desc: "xlsx/xls/csv/tsv：SheetJS 网格、多工作表、冻结首行、查找",
  },
  {
    title: "PPT",
    desc: "pptx：幻灯片缩略图可点击切页；ppt/odp → PDF 演示模式",
  },
  {
    title: "PDF",
    desc: "pdf.js：缩略图、翻页、适合宽度、全屏、关键字高亮",
  },
  {
    title: "图片",
    desc: "jpg/png/webp/svg/tiff + heic；缩放/旋转/镜像/适应窗口",
  },
  {
    title: "Markdown / 源码",
    desc: "md：GFM 渲染；代码：Shiki github-light、行号、复制、缩放",
  },
  {
    title: "压缩包 / 音视频",
    desc: "zip/tar 目录树搜索；Plyr 播放器（画中画/全屏/倍速/下载）",
  },
];

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [activeTab, setActiveTab] = useState<
    "files" | "playground" | "settings" | "monitor"
  >("files");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [remoteUrl, setRemoteUrl] = useState("");
  const [useAes, setUseAes] = useState(false);
  const [watermarkTxt, setWatermarkTxt] = useState("nodeFileView");
  const [pageNo, setPageNo] = useState("1");
  const [highlight, setHighlight] = useState("");
  const [password, setPassword] = useState("");
  const [forceUpdatedCache, setForceUpdatedCache] = useState(false);
  const [ftpHost, setFtpHost] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [monitorStats, setMonitorStats] = useState<MonitorStats | null>(null);
  const [monitorLogs, setMonitorLogs] = useState<MonitorEvent[]>([]);
  const [monitorBusy, setMonitorBusy] = useState(false);

  const pageSize = 10;

  const refreshMonitor = useCallback(async () => {
    const [stats, logs] = await Promise.all([
      fetchMonitorStats(),
      fetchMonitorLogs(120),
    ]);
    setMonitorStats(stats);
    setMonitorLogs(logs.items);
  }, []);

  const refresh = useCallback(async () => {
    const data = await listFiles({ page, size: pageSize, q });
    setFiles(data.items);
    setTotal(data.total);
  }, [page, q]);

  useEffect(() => {
    fetchPublicConfig()
      .then((c) => {
        setConfig(c);
        setUseAes(c.aesEnabled);
      })
      .catch((err: Error) => setMessage({ type: "err", text: err.message }));
  }, []);

  useEffect(() => {
    refresh().catch((err: Error) =>
      setMessage({ type: "err", text: err.message }),
    );
  }, [refresh]);

  useEffect(() => {
    if (activeTab !== "monitor" && activeTab !== "settings") return;
    refreshMonitor().catch((err: Error) =>
      setMessage({ type: "err", text: err.message }),
    );
    if (activeTab !== "monitor") return;
    const timer = window.setInterval(() => {
      refreshMonitor().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeTab, refreshMonitor]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadFile(fileList[0]);
      setMessage({ type: "ok", text: `已上传 ${uploaded.name}` });
      setPage(1);
      await refresh();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "上传失败",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm("确认删除该文件？")) return;
    setBusy(true);
    try {
      await deleteFile(fileId);
      await refresh();
      setMessage({ type: "ok", text: "已删除" });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setBusy(false);
    }
  }

  async function buildPreviewLink(sourceUrl: string) {
    const encoded = await encodeUrl(sourceUrl, useAes);
    const qs = new URLSearchParams();
    qs.set("url", encoded);
    if (watermarkTxt.trim()) qs.set("watermarkTxt", watermarkTxt.trim());
    if (pageNo.trim()) qs.set("page", pageNo.trim());
    if (highlight.trim()) qs.set("highlight", highlight.trim());
    if (password.trim()) qs.set("password", password.trim());
    if (forceUpdatedCache) qs.set("forceUpdatedCache", "true");
    return `/onlinePreview?${qs.toString()}`;
  }

  async function onGenerate() {
    setBusy(true);
    setMessage(null);
    try {
      if (ftpHost.trim()) {
        setMessage({ type: "err", text: "FTP 拉取一期未启用，仅保留参数位" });
        return;
      }
      const source = remoteUrl.trim();
      if (!source) {
        setMessage({ type: "err", text: "请填写远程文件 URL" });
        return;
      }
      const link = await buildPreviewLink(source);
      setGeneratedLink(link);
      setMessage({ type: "ok", text: "预览链接已生成" });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "生成失败",
      });
    } finally {
      setBusy(false);
    }
  }

  async function previewLocal(item: FileItem) {
    setBusy(true);
    try {
      const link = await buildPreviewLink(`file://local/${item.fileId}`);
      setGeneratedLink(link);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "打开预览失败",
      });
    } finally {
      setBusy(false);
    }
  }

  const configHints = useMemo(() => {
    if (!config) return [] as string[];
    return [
      `最大上传 ${config.maxUploadSizeMb}MB`,
      config.aesEnabled ? "AES 已开启" : "AES 默认关闭",
      config.basicAuthEnabled ? "Basic Auth 已开启" : "Basic Auth 关闭",
      config.previewPasswordEnabled ? "预览密码已配置" : "未配置预览密码",
      config.ftpEnabled ? "FTP 可用" : "FTP 未启用",
    ];
  }, [config]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-md shadow-indigo-200">
            nF
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              nodeFileView
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              Universal File Preview · Light Sandbox
            </p>
          </div>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Office / PPTX / PDF / 图片 / Shiki 代码高亮 / Plyr 音视频 / 压缩包浏览；
          支持 AES · Basic Auth · 水印 · 页码 · 高亮 · 缓存刷新。
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            沙盒就绪
          </span>
          {configHints.map((h) => (
            <Badge key={h} variant="secondary">
              {h}
            </Badge>
          ))}
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("files")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
            activeTab === "files"
              ? "bg-indigo-50 text-indigo-700 shadow-sm"
              : "bg-white/60 text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          <Folder className="size-4" />
          文件管理与上传
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("playground")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
            activeTab === "playground"
              ? "bg-indigo-50 text-indigo-700 shadow-sm"
              : "bg-white/60 text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          <Terminal className="size-4" />
          接入参数调试器
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
            activeTab === "settings"
              ? "bg-indigo-50 text-indigo-700 shadow-sm"
              : "bg-white/60 text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          <Settings className="size-4" />
          全局配置中心
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("monitor")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
            activeTab === "monitor"
              ? "bg-indigo-50 text-indigo-700 shadow-sm"
              : "bg-white/60 text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          <Activity className="size-4" />
          监控与日志
        </button>

        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:text-slate-600 transition"
        >
          <HelpCircle className="size-4" />
          帮助
        </a>
      </nav>

      {activeTab === "files" && (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>文件管理</CardTitle>
              <CardDescription>上传、搜索、分页与删除</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  className="w-40 pl-8 md:w-48"
                  placeholder="搜索文件名"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "rounded-xl border border-dashed p-8 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleUpload(e.dataTransfer.files);
              }}
            >
              <FileUp className="text-muted-foreground mx-auto mb-3 size-8" />
              <p className="font-medium">拖拽文件到此处，或选择上传</p>
              <p className="text-muted-foreground mt-1 text-xs">
                白名单类型 · 禁止可执行后缀 · 服务端大小限制
              </p>
              <div className="mt-4">
                <Button asChild disabled={busy}>
                  <label className="cursor-pointer">
                    选择文件
                    <input
                      type="file"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        void handleUpload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文件名</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground py-8 text-center"
                    >
                      暂无文件
                    </TableCell>
                  </TableRow>
                ) : (
                  files.map((f) => (
                    <TableRow key={f.fileId}>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {f.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        .{f.ext}
                      </TableCell>
                      <TableCell>{formatSize(f.size)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(f.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void previewLocal(f)}
                          >
                            预览
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void handleDelete(f.fileId)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                共 {total} 个 · 第 {page}/{totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || busy}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>

            {message && (
              <Alert variant={message.type === "err" ? "destructive" : "default"}>
                {message.type === "err" ? (
                  <AlertCircle className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                <AlertTitle>
                  {message.type === "err" ? "出错" : "成功"}
                </AlertTitle>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>接入参数</CardTitle>
              <CardDescription>
                生成 `/onlinePreview` 链接并透传控制项
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remoteUrl">远程文件 URL</Label>
                <Input
                  id="remoteUrl"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://example.com/demo.docx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="watermark">水印 watermarkTxt</Label>
                <Input
                  id="watermark"
                  value={watermarkTxt}
                  onChange={(e) => setWatermarkTxt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="page">页码 page</Label>
                  <Input
                    id="page"
                    value={pageNo}
                    onChange={(e) => setPageNo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="highlight">高亮 highlight</Label>
                  <Input
                    id="highlight"
                    value={highlight}
                    onChange={(e) => setHighlight(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">预览密码 password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="服务端 PREVIEW_PASSWORD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ftp">FTP Host（一期未启用）</Label>
                <Input
                  id="ftp"
                  value={ftpHost}
                  onChange={(e) => setFtpHost(e.target.value)}
                  placeholder="保留参数位"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={useAes}
                    onCheckedChange={(v) => setUseAes(v === true)}
                  />
                  AES 加密 url 参数
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={forceUpdatedCache}
                    onCheckedChange={(v) => setForceUpdatedCache(v === true)}
                  />
                  forceUpdatedCache 刷新转换缓存
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void onGenerate()}>
                  生成预览链接
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !generatedLink}
                  onClick={() =>
                    window.open(generatedLink, "_blank", "noopener,noreferrer")
                  }
                >
                  打开预览
                </Button>
              </div>

              {generatedLink && (
                <pre className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                  {generatedLink}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>一期支持范围</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {FORMAT_GROUPS.map((g, i) => (
                <div key={g.title}>
                  {i > 0 && <Separator className="mb-3" />}
                  <p className="text-sm font-medium">{g.title}</p>
                  <p className="text-muted-foreground text-xs">{g.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>使用教程</CardTitle>
              <CardDescription>
                顶部工具条已移除：用自定义按钮透传“工具方法”
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">1) 生成预览链接</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  在「接入参数」填入 `remoteUrl`，按需设置 `watermarkTxt / page / highlight / password / forceUpdatedCache`，点击「生成预览链接」后即可打开 `/onlinePreview?...`。
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">2) 透传控制（在你的 WebView 里接按钮）</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  预览页不再展示顶部按钮，但会把可用“动作”通过消息下发给宿主（`ready / actions-change / state-change`），宿主再用自己的 UI 发送 `invoke-action` 调用。
                </p>
                <pre className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                  {`// 宿主 → 预览 iframe：调用动作
iframe.contentWindow?.postMessage({
  source: "nodeFileViewHost",
  type: "invoke-action",
  actionId: "zoomIn",
  payload: {}
}, "*");

// 预览 → 宿主：监听动作/状态
window.addEventListener("message", (event) => {
  if (event.data?.source !== "nodeFileViewPreview") return;
  if (event.data?.type === "actions-change") {
    // event.data.detail.actions: [{id,label,disabled,...}]
  }
});`}
                </pre>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">3) 常用参数速查</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  `url`：文件地址（支持远程 URL 或上传后 `file://local/&lt;fileId&gt;`），可选 AES。<br />
                  `page`：从第几页开始（PDF/PPTX/Word）。<br />
                  `highlight`：关键字高亮（PDF/文本等）。<br />
                  `password`：预览口令（如服务端开启）。<br />
                  `forceUpdatedCache`：刷新转换缓存。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>项目介绍</CardTitle>
            <CardDescription>
              nodeFileView：轻量在线文件预览（Light Sandbox）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">核心能力</p>
              <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1">
                <li>Office/PDF/图片/Markdown/源码等在线预览</li>
                <li>DOCX 目录生成、Excel 网格交互、PPTX 幻灯片浏览、PDF 翻页与高亮</li>
                <li>压缩包目录树浏览；音视频直接预览（Plyr）</li>
                <li>AES / Basic Auth / 水印 / 页码 / 关键字高亮 / 缓存刷新</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">安全与限制（重要）</p>
              <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1">
                <li>仅支持白名单扩展名；禁止可执行后缀</li>
                <li>本地资源路径仅允许落在 `data/` 根目录内</li>
                <li>远程拉取仅 http(s)；可拦截私网 IP（防 SSRF）</li>
                <li>响应头包含内容类型保护与 iframe 限制（`X-Frame-Options` 等）</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">接入扩展点：工具方法透传</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                预览页默认移除顶部工具条：由宿主 WebView 自建按钮 UI。
                宿主通过 `postMessage` 监听 `ready/actions-change/state-change`，再用
                `invoke-action` 调用预览器内置动作。
              </p>
              <pre className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-[11px] break-all whitespace-pre-wrap">
                {`iframe.contentWindow?.postMessage({
  source: "nodeFileViewHost",
  type: "invoke-action",
  actionId: "zoomIn",
  payload: {}
}, "*");`}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">部署（简要）</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                本地开发：`pnpm install && pnpm dev`；生产构建后用服务端托管前端；也可使用 Docker Compose 部署。
              </p>
            </div>
          </CardContent>
        </Card>
          </div>
        </>
      )}

    {activeTab === "playground" && (
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>接入参数调试器（URL Builder）</CardTitle>
            <CardDescription>
              生成并打开 `/onlinePreview?...`，用于调试你自定义 WebView 的工具方法透传
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remoteUrl">远程文件 URL</Label>
              <Input
                id="remoteUrl"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://example.com/demo.docx"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="watermark">水印 watermarkTxt</Label>
              <Input
                id="watermark"
                value={watermarkTxt}
                onChange={(e) => setWatermarkTxt(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="page">页码 page</Label>
                <Input
                  id="page"
                  value={pageNo}
                  onChange={(e) => setPageNo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="highlight">高亮 highlight</Label>
                <Input
                  id="highlight"
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">预览密码 password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="服务端 PREVIEW_PASSWORD"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ftp">FTP Host（一期未启用）</Label>
              <Input
                id="ftp"
                value={ftpHost}
                onChange={(e) => setFtpHost(e.target.value)}
                placeholder="保留参数位"
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={useAes}
                  onCheckedChange={(v) => setUseAes(v === true)}
                />
                AES 加密 url 参数
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={forceUpdatedCache}
                  onCheckedChange={(v) => setForceUpdatedCache(v === true)}
                />
                forceUpdatedCache 刷新转换缓存
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void onGenerate()}>
                生成预览链接
              </Button>
              <Button
                variant="outline"
                disabled={busy || !generatedLink}
                onClick={() =>
                  window.open(generatedLink, "_blank", "noopener,noreferrer")
                }
              >
                打开预览
              </Button>
            </div>

            {generatedLink && (
              <pre className="bg-muted overflow-x-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {generatedLink}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>渲染参数示意</CardTitle>
            <CardDescription>帮助你确认当前生成链接透传的关键开关</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-muted/30 p-3 font-mono text-xs break-all">
              <div>Watermark: {watermarkTxt || "-"}</div>
              <div>Encryption: {useAes ? "AES Enabled" : "Plain Text"}</div>
              <div>Page: {pageNo || "1"}</div>
              <div>Highlight: {highlight || "-"}</div>
              <div>
                Cache Policy: {forceUpdatedCache ? "BYPASS_CACHE" : "CACHE_HIT_ALLOWED"}
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              顶部工具条已移除：你需要在宿主 WebView 自己做按钮 UI，并通过
              `ready/actions-change/state-change` + `invoke-action` 完成动作调用。
            </p>
          </CardContent>
        </Card>
      </div>
    )}

    {activeTab === "settings" && (
      <div className="mt-8 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>全局配置中心</CardTitle>
            <CardDescription>
              配置来自服务端环境变量（只读）；缓存清理是可执行操作
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!config ? (
              <p className="text-muted-foreground text-xs">正在加载配置…</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/30 p-4 text-xs space-y-2">
                  <div>
                    监听地址：{" "}
                    <span className="font-mono">
                      {config.host}:{config.port}
                    </span>
                  </div>
                  <div>
                    数据目录：{" "}
                    <span className="font-mono break-all">{config.dataDir || "-"}</span>
                  </div>
                  <div>
                    最大上传：{" "}
                    <span className="font-mono">{config.maxUploadSizeMb}MB</span>
                  </div>
                  <div>
                    LibreOffice：{" "}
                    <span className="font-mono">{config.libreOfficePath || "soffice"}</span>
                  </div>
                  <div>
                    转码超时：{" "}
                    <span className="font-mono">{config.convertTimeoutMs || 120000}ms</span>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4 text-xs space-y-2">
                  <div>
                    AES：{" "}
                    <span className="font-mono">{config.aesEnabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div>
                    Basic Auth：{" "}
                    <span className="font-mono">
                      {config.basicAuthEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div>
                    预览密码：{" "}
                    <span className="font-mono">
                      {config.previewPasswordEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div>
                    允许嵌入：{" "}
                    <span className="font-mono">{config.allowEmbed ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div>
                    拦截私网 IP：{" "}
                    <span className="font-mono">
                      {config.blockPrivateIp ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div>
                    限流：{" "}
                    <span className="font-mono">
                      {config.rateLimitMax}/{config.rateLimitWindowMs}ms
                    </span>
                  </div>
                  <div>
                    FTP：{" "}
                    <span className="font-mono">{config.ftpEnabled ? "Enabled" : "Disabled（未实现）"}</span>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium">缓存管理</p>
              {monitorStats ? (
                <div className="grid gap-3 md:grid-cols-3 text-xs">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">转码缓存</div>
                    <div className="font-mono mt-1">
                      {monitorStats.cache.convert.count} 个 ·{" "}
                      {formatSize(monitorStats.cache.convert.bytes)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">远程文件缓存</div>
                    <div className="font-mono mt-1">
                      {monitorStats.cache.remote.count} 个 ·{" "}
                      {formatSize(monitorStats.cache.remote.bytes)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">临时文件</div>
                    <div className="font-mono mt-1">
                      {monitorStats.cache.temp.count} 个 ·{" "}
                      {formatSize(monitorStats.cache.temp.bytes)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">正在读取缓存占用…</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={monitorBusy}
                  onClick={async () => {
                    setMonitorBusy(true);
                    try {
                      await clearMonitorCache("convert");
                      await refreshMonitor();
                      setMessage({ type: "ok", text: "已清理转码缓存" });
                    } catch (err) {
                      setMessage({
                        type: "err",
                        text: err instanceof Error ? err.message : "清理失败",
                      });
                    } finally {
                      setMonitorBusy(false);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  清理转码缓存
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={monitorBusy}
                  onClick={async () => {
                    setMonitorBusy(true);
                    try {
                      await clearMonitorCache("remote");
                      await refreshMonitor();
                      setMessage({ type: "ok", text: "已清理远程缓存" });
                    } catch (err) {
                      setMessage({
                        type: "err",
                        text: err instanceof Error ? err.message : "清理失败",
                      });
                    } finally {
                      setMonitorBusy(false);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  清理远程缓存
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={monitorBusy}
                  onClick={async () => {
                    if (!confirm("确认清理全部缓存与临时文件？")) return;
                    setMonitorBusy(true);
                    try {
                      await clearMonitorCache("all");
                      await refreshMonitor();
                      setMessage({ type: "ok", text: "已清理全部缓存" });
                    } catch (err) {
                      setMessage({
                        type: "err",
                        text: err instanceof Error ? err.message : "清理失败",
                      });
                    } finally {
                      setMonitorBusy(false);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  清理全部
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={monitorBusy}
                  onClick={async () => {
                    setMonitorBusy(true);
                    try {
                      const c = await fetchPublicConfig();
                      setConfig(c);
                      await refreshMonitor();
                      setMessage({ type: "ok", text: "配置已刷新" });
                    } catch (err) {
                      setMessage({
                        type: "err",
                        text: err instanceof Error ? err.message : "刷新失败",
                      });
                    } finally {
                      setMonitorBusy(false);
                    }
                  }}
                >
                  <RefreshCw className="size-3.5" />
                  刷新配置
                </Button>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                修改 AES / Basic Auth / 预览密码等请改 `.env` 后重启服务；前端不提供在线改密保存。
                FTP 拉取尚未实现。`forceUpdatedCache` 在接入参数页可用，会跳过转换/远程缓存。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    {activeTab === "monitor" && (
      <div className="mt-8">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>监控与日志</CardTitle>
              <CardDescription>
                实时预览 / 转码 / 缓存命中流水（进程内保留最近 500 条，约每 4 秒刷新）
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={monitorBusy}
                onClick={() => {
                  refreshMonitor().catch((err: Error) =>
                    setMessage({ type: "err", text: err.message }),
                  );
                }}
              >
                <RefreshCw className="size-3.5" />
                刷新
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={monitorBusy}
                onClick={async () => {
                  if (!confirm("清空监控日志？")) return;
                  setMonitorBusy(true);
                  try {
                    await clearMonitorLogsApi();
                    await refreshMonitor();
                    setMessage({ type: "ok", text: "日志已清空" });
                  } catch (err) {
                    setMessage({
                      type: "err",
                      text: err instanceof Error ? err.message : "清空失败",
                    });
                  } finally {
                    setMonitorBusy(false);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                清空日志
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">今日预览请求</div>
                <div className="text-lg font-mono">
                  {monitorStats?.previewToday ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  累计 {monitorStats?.previewTotal ?? 0} · 运行{" "}
                  {monitorStats?.uptimeText || "—"}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">缓存命中率</div>
                <div className="text-lg font-mono text-emerald-600">
                  {monitorStats?.cacheHitRateText || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  hit {monitorStats?.cacheHits ?? 0} / miss {monitorStats?.cacheMisses ?? 0}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">平均转码耗时</div>
                <div className="text-lg font-mono text-indigo-600">
                  {monitorStats ? `${monitorStats.avgConvertMs} ms` : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  转码次数 {monitorStats?.convertTotal ?? 0}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">转换异常</div>
                <div className="text-lg font-mono text-rose-600">
                  {monitorStats?.convertErrors ?? "—"} 次
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  缓存占用{" "}
                  {monitorStats ? formatSize(monitorStats.cache.totalBytes) : "—"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 text-xs font-bold flex items-center justify-between">
                <span>实时预览转码与缓存日志</span>
                <span className="font-normal text-muted-foreground">
                  {monitorLogs.length} 条
                </span>
              </div>
              {monitorLogs.length === 0 ? (
                <div className="p-6 text-muted-foreground text-xs">
                  暂无日志。上传或打开任意文件预览后，这里会出现真实流水。
                </div>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[160px]">时间</TableHead>
                        <TableHead className="w-[90px]">类型</TableHead>
                        <TableHead className="w-[70px]">级别</TableHead>
                        <TableHead>消息</TableHead>
                        <TableHead className="w-[80px]">耗时</TableHead>
                        <TableHead className="w-[70px]">缓存</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monitorLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {formatTime(log.ts)}
                          </TableCell>
                          <TableCell className="text-xs">{log.kind}</TableCell>
                          <TableCell className="text-xs">
                            <span
                              className={
                                log.level === "error"
                                  ? "text-rose-600"
                                  : log.level === "warn"
                                    ? "text-amber-600"
                                    : "text-emerald-700"
                              }
                            >
                              {log.level}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{log.message}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {typeof log.durationMs === "number"
                              ? `${log.durationMs}ms`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.cacheHit === true
                              ? "HIT"
                              : log.cacheHit === false
                                ? "MISS"
                                : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    </div>
  );
}
