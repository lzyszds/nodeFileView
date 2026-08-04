import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  FileUp,
  Folder,
  Lock,
  LogOut,
  RefreshCw,
  Settings,
  Search,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import {
  AuthRequiredError,
  deleteFile,
  encodeUrl,
  fetchAuthStatus,
  fetchPublicConfig,
  fetchMonitorStats,
  fetchMonitorLogs,
  clearMonitorLogsApi,
  clearMonitorCache,
  formatSize,
  formatTime,
  listFiles,
  loginConsole,
  logoutConsole,
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

type TabId = "files" | "playground" | "settings" | "monitor";

const NAV_TITLES: Record<TabId, string> = {
  files: "文件存储与控制",
  playground: "接口透传调试器",
  settings: "全局系统设置",
  monitor: "转码日志与审计",
};

const FORMAT_GROUPS = [
  { title: "Word", desc: "docx 原生版式 + 目录；doc/wps/odt → PDF" },
  { title: "Excel", desc: "xlsx/xls/csv 网格、多工作表、查找" },
  { title: "PPT / PDF", desc: "pptx 幻灯片；pdf.js 翻页与高亮" },
  { title: "其它", desc: "图片 / Markdown / 源码 / 压缩包 / 音视频" },
];

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("files");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

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

  const markLoggedOut = useCallback(() => {
    setAuthenticated(false);
    setAuthUser(null);
    setConfig(null);
    setFiles([]);
    setMonitorStats(null);
    setMonitorLogs([]);
  }, []);

  useEffect(() => {
    fetchAuthStatus()
      .then((s) => {
        setAuthEnabled(s.enabled);
        setAuthenticated(s.authenticated);
        setAuthUser(s.user);
      })
      .catch(() => {
        setAuthEnabled(false);
        setAuthenticated(true);
      })
      .finally(() => setAuthReady(true));
  }, []);

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
    if (!authReady || !authenticated) return;
    fetchPublicConfig()
      .then((c) => {
        setConfig(c);
        setUseAes(c.aesEnabled);
      })
      .catch((err: Error) => {
        if (err instanceof AuthRequiredError) {
          markLoggedOut();
          return;
        }
        setMessage({ type: "err", text: err.message });
      });
  }, [authReady, authenticated, markLoggedOut]);

  useEffect(() => {
    if (!authReady || !authenticated) return;
    refresh().catch((err: Error) => {
      if (err instanceof AuthRequiredError) {
        markLoggedOut();
        return;
      }
      setMessage({ type: "err", text: err.message });
    });
  }, [authReady, authenticated, refresh, markLoggedOut]);

  useEffect(() => {
    if (!authenticated) return;
    if (activeTab !== "monitor" && activeTab !== "settings") return;
    refreshMonitor().catch((err: Error) => {
      if (err instanceof AuthRequiredError) {
        markLoggedOut();
        return;
      }
      setMessage({ type: "err", text: err.message });
    });
    if (activeTab !== "monitor") return;
    const timer = window.setInterval(() => {
      refreshMonitor().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [authenticated, activeTab, refreshMonitor, markLoggedOut]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await loginConsole(loginUser.trim(), loginPass);
      setAuthEnabled(true);
      setAuthenticated(true);
      setAuthUser(res.user ?? loginUser.trim());
      setLoginPass("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutConsole();
    } catch {
      /* ignore */
    }
    markLoggedOut();
    if (authEnabled) setAuthenticated(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const navItems = useMemo(
    () =>
      [
        { id: "files" as const, label: "文件存储与控制", icon: Folder, group: "控制中心" },
        {
          id: "playground" as const,
          label: "接口透传调试器",
          icon: Terminal,
          group: "控制中心",
        },
        {
          id: "settings" as const,
          label: "全局系统设置",
          icon: Settings,
          group: "系统管理",
        },
        {
          id: "monitor" as const,
          label: "转码日志与审计",
          icon: Activity,
          group: "系统管理",
        },
      ] as const,
    [],
  );

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

  async function purgeAllCache() {
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
  }

  if (!authReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        加载中…
      </div>
    );
  }

  if (authEnabled && !authenticated) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-slate-100">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, #c7d2fe, transparent), radial-gradient(ellipse 60% 40% at 100% 100%, #e2e8f0, transparent)",
          }}
        />
        <form
          onSubmit={handleLogin}
          className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/50"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
              <Lock className="size-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              nodeFileView
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              控制台已上锁，请输入账号密码
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-user">账号</Label>
              <Input
                id="login-user"
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-pass">密码</Label>
              <Input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-600" role="alert">
                {loginError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loginBusy}>
              {loginBusy ? "验证中…" : "解锁进入"}
            </Button>
          </div>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
            凭据来自环境变量 BASIC_AUTH_USER / BASIC_AUTH_PASS
            <br />
            （Docker 启动时可注入）
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="z-30 flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white">
        <div className="flex h-14 items-center justify-between border-b border-slate-100 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-sm shadow-indigo-200">
              nF
            </div>
            <div className="flex flex-col">
              <span className="text-sm leading-none font-bold tracking-tight">
                nodeFileView
              </span>
              <span className="mt-1 text-[10px] text-slate-400">Light Sandbox</span>
            </div>
          </div>
          {authEnabled ? (
            <Lock className="size-3.5 text-slate-400" />
          ) : (
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {(["控制中心", "系统管理"] as const).map((group) => (
            <div key={group} className="space-y-1">
              <p className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                {group}
              </p>
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition",
                        active
                          ? "bg-indigo-50 font-semibold text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.id === "files" && total > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]"
                        >
                          {total}
                        </Badge>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-100 p-4 text-[11px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>引擎状态</span>
            <span className="font-medium text-emerald-600">Ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span>缓存命中</span>
            <span className="font-mono">
              {monitorStats?.cacheHitRateText || configHintsReady(config)}
            </span>
          </div>
          {authEnabled && (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 transition hover:bg-slate-50"
            >
              <LogOut className="size-3" />
              退出 {authUser || "登录"}
            </button>
          )}
        </div>
      </aside>

      {/* Main workspace */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">控制台</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-800">
              {NAV_TITLES[activeTab]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={monitorBusy}
              onClick={() => void purgeAllCache()}
            >
              <RefreshCw className="size-3.5" />
              清理转换缓存
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              上传文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                void handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </header>

        <main
          className={cn(
            "dot-grid min-h-0 flex-1 p-6",
            activeTab === "files" ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {message && (
            <div className="mb-4">
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
            </div>
          )}

          {activeTab === "files" && (
            <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[1.4fr_0.9fr]">
              <Card className="flex min-h-0 flex-col overflow-hidden">
                <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>文件管理</CardTitle>
                    <CardDescription>上传、搜索、分页与预览</CardDescription>
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
                <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                  <div
                    className={cn(
                      "shrink-0 rounded-xl border border-dashed p-5 text-center transition-colors",
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
                    <FileUp className="text-muted-foreground mx-auto mb-2 size-7" />
                    <p className="text-sm font-medium">拖拽文件到此处，或选择上传</p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        选择文件
                      </Button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
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
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3">
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
                </CardContent>
              </Card>

              <div className="min-h-0 space-y-5 overflow-y-auto">
                <Card>
                  <CardHeader>
                    <CardTitle>接入参数</CardTitle>
                    <CardDescription>生成 `/onlinePreview` 链接</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ParamFields
                      remoteUrl={remoteUrl}
                      setRemoteUrl={setRemoteUrl}
                      watermarkTxt={watermarkTxt}
                      setWatermarkTxt={setWatermarkTxt}
                      pageNo={pageNo}
                      setPageNo={setPageNo}
                      highlight={highlight}
                      setHighlight={setHighlight}
                      password={password}
                      setPassword={setPassword}
                      ftpHost={ftpHost}
                      setFtpHost={setFtpHost}
                      useAes={useAes}
                      setUseAes={setUseAes}
                      forceUpdatedCache={forceUpdatedCache}
                      setForceUpdatedCache={setForceUpdatedCache}
                    />
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
              </div>
            </div>
          )}

          {activeTab === "playground" && (
            <div className="mx-auto max-w-3xl space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>接入参数调试器</CardTitle>
                  <CardDescription>
                    生成并打开 `/onlinePreview?...`，调试宿主 WebView 工具方法透传
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ParamFields
                    remoteUrl={remoteUrl}
                    setRemoteUrl={setRemoteUrl}
                    watermarkTxt={watermarkTxt}
                    setWatermarkTxt={setWatermarkTxt}
                    pageNo={pageNo}
                    setPageNo={setPageNo}
                    highlight={highlight}
                    setHighlight={setHighlight}
                    password={password}
                    setPassword={setPassword}
                    ftpHost={ftpHost}
                    setFtpHost={setFtpHost}
                    useAes={useAes}
                    setUseAes={setUseAes}
                    forceUpdatedCache={forceUpdatedCache}
                    setForceUpdatedCache={setForceUpdatedCache}
                  />
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
                  <CardTitle>渲染参数示意</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border bg-muted/30 p-3 font-mono text-xs break-all space-y-1">
                    <div>Watermark: {watermarkTxt || "-"}</div>
                    <div>Encryption: {useAes ? "AES Enabled" : "Plain Text"}</div>
                    <div>Page: {pageNo || "1"}</div>
                    <div>Highlight: {highlight || "-"}</div>
                    <div>
                      Cache Policy:{" "}
                      {forceUpdatedCache ? "BYPASS_CACHE" : "CACHE_HIT_ALLOWED"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="mx-auto max-w-5xl space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>全局配置中心</CardTitle>
                  <CardDescription>
                    配置来自服务端 `.env`（只读）；缓存清理为可执行操作
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!config ? (
                    <p className="text-muted-foreground text-xs">正在加载配置…</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
                        <div>
                          监听地址：{" "}
                          <span className="font-mono">
                            {config.host}:{config.port}
                          </span>
                        </div>
                        <div>
                          数据目录：{" "}
                          <span className="font-mono break-all">
                            {config.dataDir || "-"}
                          </span>
                        </div>
                        <div>
                          最大上传：{" "}
                          <span className="font-mono">{config.maxUploadSizeMb}MB</span>
                        </div>
                        <div>
                          LibreOffice：{" "}
                          <span className="font-mono">
                            {config.libreOfficePath || "soffice"}
                          </span>
                        </div>
                        <div>
                          转码超时：{" "}
                          <span className="font-mono">
                            {config.convertTimeoutMs || 120000}ms
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
                        <div>
                          AES：{" "}
                          <span className="font-mono">
                            {config.aesEnabled ? "Enabled" : "Disabled"}
                          </span>
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
                          <span className="font-mono">
                            {config.allowEmbed ? "Enabled" : "Disabled"}
                          </span>
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
                          <span className="font-mono">
                            {config.ftpEnabled ? "Enabled" : "Disabled（未实现）"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm font-medium">缓存管理</p>
                    {monitorStats ? (
                      <div className="grid gap-3 text-xs md:grid-cols-3">
                        <div className="rounded-lg border p-3">
                          <div className="text-muted-foreground">转码缓存</div>
                          <div className="mt-1 font-mono">
                            {monitorStats.cache.convert.count} 个 ·{" "}
                            {formatSize(monitorStats.cache.convert.bytes)}
                          </div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-muted-foreground">远程文件缓存</div>
                          <div className="mt-1 font-mono">
                            {monitorStats.cache.remote.count} 个 ·{" "}
                            {formatSize(monitorStats.cache.remote.bytes)}
                          </div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-muted-foreground">临时文件</div>
                          <div className="mt-1 font-mono">
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
                        onClick={() => void purgeAllCache()}
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
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "monitor" && (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <StatCard
                  label="今日预览"
                  value={String(monitorStats?.previewToday ?? "—")}
                  hint={`累计 ${monitorStats?.previewTotal ?? 0} · ${monitorStats?.uptimeText || "—"}`}
                />
                <StatCard
                  label="缓存命中率"
                  value={monitorStats?.cacheHitRateText || "—"}
                  hint={`hit ${monitorStats?.cacheHits ?? 0} / miss ${monitorStats?.cacheMisses ?? 0}`}
                  valueClass="text-emerald-600"
                />
                <StatCard
                  label="平均转码耗时"
                  value={monitorStats ? `${monitorStats.avgConvertMs} ms` : "—"}
                  hint={`转码 ${monitorStats?.convertTotal ?? 0} 次`}
                  valueClass="text-indigo-600"
                />
                <StatCard
                  label="转换异常"
                  value={`${monitorStats?.convertErrors ?? "—"} 次`}
                  hint={
                    monitorStats
                      ? `缓存占用 ${formatSize(monitorStats.cache.totalBytes)}`
                      : "—"
                  }
                  valueClass="text-rose-600"
                />
              </div>

              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b py-3">
                  <div>
                    <CardTitle className="text-sm">实时预览转码与缓存日志</CardTitle>
                    <CardDescription>{monitorLogs.length} 条</CardDescription>
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
                      清空
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {monitorLogs.length === 0 ? (
                    <div className="text-muted-foreground p-8 text-center text-xs">
                      暂无日志。预览任意文件后会出现真实流水。
                    </div>
                  ) : (
                    <div className="max-h-[min(52vh,480px)] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[160px]">时间</TableHead>
                            <TableHead className="w-[100px]">类型</TableHead>
                            <TableHead>消息</TableHead>
                            <TableHead className="w-[80px]">耗时</TableHead>
                            <TableHead className="w-[70px]">缓存</TableHead>
                            <TableHead className="w-[70px]">级别</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monitorLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-mono text-xs whitespace-nowrap">
                                {formatTime(log.ts)}
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {log.kind}
                              </TableCell>
                              <TableCell className="max-w-[360px] truncate text-xs">
                                {log.message}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
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
                              <TableCell
                                className={cn(
                                  "text-xs font-medium",
                                  log.level === "error"
                                    ? "text-rose-600"
                                    : log.level === "warn"
                                      ? "text-amber-600"
                                      : "text-emerald-700",
                                )}
                              >
                                {log.level}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function configHintsReady(config: PublicConfig | null): string {
  if (!config) return "—";
  return config.aesEnabled ? "AES on" : "idle";
}

function StatCard(props: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
      <div className="text-[11px] text-slate-500">{props.label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold text-slate-900",
          props.valueClass,
        )}
      >
        {props.value}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">{props.hint}</div>
    </div>
  );
}

function ParamFields(props: {
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  watermarkTxt: string;
  setWatermarkTxt: (v: string) => void;
  pageNo: string;
  setPageNo: (v: string) => void;
  highlight: string;
  setHighlight: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  ftpHost: string;
  setFtpHost: (v: string) => void;
  useAes: boolean;
  setUseAes: (v: boolean) => void;
  forceUpdatedCache: boolean;
  setForceUpdatedCache: (v: boolean) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="remoteUrl">远程文件 URL</Label>
        <Input
          id="remoteUrl"
          value={props.remoteUrl}
          onChange={(e) => props.setRemoteUrl(e.target.value)}
          placeholder="https://example.com/demo.docx"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="watermark">水印 watermarkTxt</Label>
        <Input
          id="watermark"
          value={props.watermarkTxt}
          onChange={(e) => props.setWatermarkTxt(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="page">页码 page</Label>
          <Input
            id="page"
            value={props.pageNo}
            onChange={(e) => props.setPageNo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="highlight">高亮 highlight</Label>
          <Input
            id="highlight"
            value={props.highlight}
            onChange={(e) => props.setHighlight(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">预览密码 password</Label>
        <Input
          id="password"
          type="password"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          placeholder="服务端 PREVIEW_PASSWORD"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ftp">FTP Host（一期未启用）</Label>
        <Input
          id="ftp"
          value={props.ftpHost}
          onChange={(e) => props.setFtpHost(e.target.value)}
          placeholder="保留参数位"
        />
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={props.useAes}
            onCheckedChange={(v) => props.setUseAes(v === true)}
          />
          AES 加密 url 参数
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={props.forceUpdatedCache}
            onCheckedChange={(v) => props.setForceUpdatedCache(v === true)}
          />
          forceUpdatedCache 刷新转换缓存
        </label>
      </div>
    </>
  );
}
