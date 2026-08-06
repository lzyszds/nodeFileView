import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Activity,
  BookOpen,
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
  X,
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
import { LOCALES, localeLabel, useI18n, type Locale } from "@/i18n";
import { HomePage } from "@/HomePage";
import { cn } from "@/lib/utils";

type TabId = "home" | "files" | "playground" | "settings" | "monitor";

export default function App() {
  const { t, locale, setLocale } = useI18n();
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
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [toastVisible, setToastVisible] = useState(false);

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

  useEffect(() => {
    if (!message) {
      setToastVisible(false);
      return;
    }
    setToastVisible(true);
    const hideMs = message.type === "ok" ? 2800 : 4500;
    const hideTimer = window.setTimeout(() => setToastVisible(false), hideMs);
    const clearTimer = window.setTimeout(() => setMessage(null), hideMs + 220);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [message]);

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
      setLoginError(err instanceof Error ? err.message : t("login.failed"));
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
        {
          id: "home" as const,
          label: t("nav.home"),
          icon: BookOpen,
          group: t("nav.controlCenter"),
        },
        {
          id: "files" as const,
          label: t("nav.files"),
          icon: Folder,
          group: t("nav.controlCenter"),
        },
        {
          id: "playground" as const,
          label: t("nav.playground"),
          icon: Terminal,
          group: t("nav.controlCenter"),
        },
        {
          id: "settings" as const,
          label: t("nav.settings"),
          icon: Settings,
          group: t("nav.systemAdmin"),
        },
        {
          id: "monitor" as const,
          label: t("nav.monitor"),
          icon: Activity,
          group: t("nav.systemAdmin"),
        },
      ] as const,
    [t],
  );

  const navGroups = useMemo(
    () => [t("nav.controlCenter"), t("nav.systemAdmin")],
    [t],
  );

  const formatGroups = useMemo(
    () => [
      { title: t("formats.word"), desc: t("formats.wordDesc") },
      { title: t("formats.excel"), desc: t("formats.excelDesc") },
      { title: t("formats.pptPdf"), desc: t("formats.pptPdfDesc") },
      { title: t("formats.other"), desc: t("formats.otherDesc") },
    ],
    [t],
  );

  const navTitles: Record<TabId, string> = useMemo(
    () => ({
      home: t("nav.home"),
      files: t("nav.files"),
      playground: t("nav.playground"),
      settings: t("nav.settings"),
      monitor: t("nav.monitor"),
    }),
    [t],
  );

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadFile(fileList[0]);
      setMessage({ type: "ok", text: t("files.uploaded", { name: uploaded.name }) });
      setPage(1);
      await refresh();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : t("files.uploadFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm(t("files.confirmDelete"))) return;
    setBusy(true);
    try {
      await deleteFile(fileId);
      await refresh();
      setMessage({ type: "ok", text: t("files.deleted") });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : t("files.deleteFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function buildPreviewLink(sourceUrl: string) {
    const encoded = await encodeUrl(sourceUrl, useAes);
    const qs = new URLSearchParams();
    qs.set("url", encoded);
    qs.set("lang", locale);
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
        setMessage({ type: "err", text: t("files.ftpDisabled") });
        return;
      }
      const source = remoteUrl.trim();
      if (!source) {
        setMessage({ type: "err", text: t("files.needUrl") });
        return;
      }
      const link = await buildPreviewLink(source);
      setGeneratedLink(link);
      setMessage({ type: "ok", text: t("files.linkReady") });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : t("files.generateFailed"),
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
        text: err instanceof Error ? err.message : t("files.openFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function purgeAllCache() {
    if (!confirm(t("files.confirmPurgeAll"))) return;
    setMonitorBusy(true);
    try {
      await clearMonitorCache("all");
      await refreshMonitor();
      setMessage({ type: "ok", text: t("files.purgedAll") });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : t("files.purgeFailed"),
      });
    } finally {
      setMonitorBusy(false);
    }
  }

  if (!authReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t("common.loading")}
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
            <p className="mt-1 text-xs text-slate-500">{t("login.subtitle")}</p>
          </div>
          <div className="mb-4">
            <LanguageSelect locale={locale} setLocale={setLocale} t={t} />
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-user">{t("login.user")}</Label>
              <Input
                id="login-user"
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-pass">{t("login.pass")}</Label>
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
              {loginBusy ? t("login.submitting") : t("login.submit")}
            </Button>
          </div>
          <p className="mt-5 whitespace-pre-line text-center text-[10px] leading-relaxed text-slate-400">
            {t("login.hint")}
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
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
          {navGroups.map((group) => (
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
            <span>{t("nav.engineStatus")}</span>
            <span className="font-medium text-emerald-600">{t("common.ready")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("nav.cacheHit")}</span>
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
              {t("nav.logout", { user: authUser || t("nav.loginFallback") })}
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">{t("nav.console")}</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-800">
              {navTitles[activeTab]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelect locale={locale} setLocale={setLocale} t={t} compact />
            <Button
              size="sm"
              variant="outline"
              disabled={monitorBusy}
              onClick={() => void purgeAllCache()}
            >
              <RefreshCw className="size-3.5" />
              {t("nav.purgeCache")}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {t("nav.upload")}
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
          {activeTab === "home" && (
            <HomePage onGo={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === "files" && (
            <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[1.4fr_0.9fr]">
              <Card className="flex min-h-0 flex-col overflow-hidden">
                <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>{t("files.title")}</CardTitle>
                    <CardDescription>{t("files.desc")}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                      <Input
                        className="w-40 pl-8 md:w-48"
                        placeholder={t("files.searchPlaceholder")}
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
                    <p className="text-sm font-medium">{t("files.dropHint")}</p>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t("files.chooseFile")}
                      </Button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("files.colName")}</TableHead>
                          <TableHead>{t("files.colType")}</TableHead>
                          <TableHead>{t("files.colSize")}</TableHead>
                          <TableHead>{t("files.colTime")}</TableHead>
                          <TableHead className="text-right">
                            {t("files.colActions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {files.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-muted-foreground py-8 text-center"
                            >
                              {t("files.empty")}
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
                                {new Date(f.createdAt).toLocaleString(locale)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void previewLocal(f)}
                                  >
                                    {t("files.preview")}
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
                      {t("files.pageInfo", {
                        total,
                        page,
                        pages: totalPages,
                      })}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || busy}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        {t("common.prev")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || busy}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        {t("common.next")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="min-h-0 space-y-5 overflow-y-auto">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("files.paramsTitle")}</CardTitle>
                    <CardDescription>{t("files.paramsDesc")}</CardDescription>
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
                        {t("files.generate")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || !generatedLink}
                        onClick={() =>
                          window.open(generatedLink, "_blank", "noopener,noreferrer")
                        }
                      >
                        {t("files.openPreview")}
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
                    <CardTitle>{t("files.formatsTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {formatGroups.map((g, i) => (
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
                  <CardTitle>{t("playground.title")}</CardTitle>
                  <CardDescription>{t("playground.desc")}</CardDescription>
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
                      {t("files.generate")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !generatedLink}
                      onClick={() =>
                        window.open(generatedLink, "_blank", "noopener,noreferrer")
                      }
                    >
                      {t("files.openPreview")}
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
                  <CardTitle>{t("playground.renderTitle")}</CardTitle>
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
                    <div>Lang: {locale}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="mx-auto max-w-5xl space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.title")}</CardTitle>
                  <CardDescription>{t("settings.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!config ? (
                    <p className="text-muted-foreground text-xs">
                      {t("settings.loading")}
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
                        <div>
                          {t("settings.listen")}：{" "}
                          <span className="font-mono">
                            {config.host}:{config.port}
                          </span>
                        </div>
                        <div>
                          BASE_URL：{" "}
                          <span className="font-mono break-all">
                            {config.baseUrl || t("common.unset")}
                          </span>
                        </div>
                        <div>
                          TRUST_HOST：{" "}
                          <span className="font-mono break-all">
                            {config.trustHost?.length
                              ? config.trustHost.join(", ")
                              : t("settings.trustHostUnlimited")}
                          </span>
                        </div>
                        <div>
                          {t("settings.maxUpload")}：{" "}
                          <span className="font-mono">{config.maxUploadSizeMb}MB</span>
                        </div>
                        <div>
                          LibreOffice：{" "}
                          <span className="font-mono">
                            {config.libreOfficePath || "soffice"}
                          </span>
                        </div>
                        <div>
                          {t("settings.convertTimeout")}：{" "}
                          <span className="font-mono">
                            {config.convertTimeoutMs || 120000}ms
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
                        <div>
                          AES：{" "}
                          <span className="font-mono">
                            {config.aesEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </span>
                        </div>
                        <div>
                          Basic Auth：{" "}
                          <span className="font-mono">
                            {config.basicAuthEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </span>
                        </div>
                        <div>
                          {t("settings.previewPassword")}：{" "}
                          <span className="font-mono">
                            {config.previewPasswordEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </span>
                        </div>
                        <div>
                          {t("settings.allowEmbed")}：{" "}
                          <span className="font-mono">
                            {config.allowEmbed
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </span>
                        </div>
                        <div>
                          {t("settings.blockPrivate")}：{" "}
                          <span className="font-mono">
                            {config.blockPrivateIp
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </span>
                        </div>
                        <div>
                          {t("settings.rateLimit")}：{" "}
                          <span className="font-mono">
                            {config.rateLimitMax}/{config.rateLimitWindowMs}ms
                          </span>
                        </div>
                        <div>
                          {t("settings.ftp")}：{" "}
                          <span className="font-mono">
                            {config.ftpEnabled
                              ? t("common.enabled")
                              : t("settings.ftpDisabled")}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border p-4">
                    <p className="text-sm font-medium">{t("settings.cacheTitle")}</p>
                    {monitorStats ? (
                      <div className="grid gap-2 text-xs md:grid-cols-3">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-muted-foreground">
                            {t("settings.cacheConvert")}
                          </div>
                          <div className="mt-1 font-mono">
                            {t("settings.countSize", {
                              count: monitorStats.cache.convert.count,
                              size: formatSize(monitorStats.cache.convert.bytes),
                            })}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-muted-foreground">
                            {t("settings.cacheRemote")}
                          </div>
                          <div className="mt-1 font-mono">
                            {t("settings.countSize", {
                              count: monitorStats.cache.remote.count,
                              size: formatSize(monitorStats.cache.remote.bytes),
                            })}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-muted-foreground">
                            {t("settings.cacheTemp")}
                          </div>
                          <div className="mt-1 font-mono">
                            {t("settings.countSize", {
                              count: monitorStats.cache.temp.count,
                              size: formatSize(monitorStats.cache.temp.bytes),
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        {t("settings.cacheLoading")}
                      </p>
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
                            setMessage({
                              type: "ok",
                              text: t("settings.clearedConvert"),
                            });
                          } catch (err) {
                            setMessage({
                              type: "err",
                              text:
                                err instanceof Error
                                  ? err.message
                                  : t("files.purgeFailed"),
                            });
                          } finally {
                            setMonitorBusy(false);
                          }
                        }}
                      >
                        {t("settings.clearConvert")}
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
                            setMessage({
                              type: "ok",
                              text: t("settings.clearedRemote"),
                            });
                          } catch (err) {
                            setMessage({
                              type: "err",
                              text:
                                err instanceof Error
                                  ? err.message
                                  : t("files.purgeFailed"),
                            });
                          } finally {
                            setMonitorBusy(false);
                          }
                        }}
                      >
                        {t("settings.clearRemote")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={monitorBusy}
                        onClick={() => void purgeAllCache()}
                      >
                        {t("settings.clearAll")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const c = await fetchPublicConfig();
                            setConfig(c);
                            setMessage({
                              type: "ok",
                              text: t("settings.configRefreshed"),
                            });
                          } catch (err) {
                            setMessage({
                              type: "err",
                              text:
                                err instanceof Error
                                  ? err.message
                                  : t("settings.refreshFailed"),
                            });
                          }
                        }}
                      >
                        {t("settings.refreshConfig")}
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
                  label={t("monitor.previewToday")}
                  value={String(monitorStats?.previewToday ?? "—")}
                  hint={t("monitor.previewHint", {
                    total: monitorStats?.previewTotal ?? 0,
                    uptime: monitorStats?.uptimeText || "—",
                  })}
                />
                <StatCard
                  label={t("monitor.hitRate")}
                  value={monitorStats?.cacheHitRateText || "—"}
                  hint={`hit ${monitorStats?.cacheHits ?? 0} / miss ${monitorStats?.cacheMisses ?? 0}`}
                  valueClass="text-emerald-600"
                />
                <StatCard
                  label={t("monitor.avgConvert")}
                  value={monitorStats ? `${monitorStats.avgConvertMs} ms` : "—"}
                  hint={t("monitor.convertHint", {
                    count: monitorStats?.convertTotal ?? 0,
                  })}
                  valueClass="text-indigo-600"
                />
                <StatCard
                  label={t("monitor.convertErrors")}
                  value={t("monitor.errorsUnit", {
                    count: monitorStats?.convertErrors ?? "—",
                  })}
                  hint={
                    monitorStats
                      ? t("monitor.cacheBytes", {
                          size: formatSize(monitorStats.cache.totalBytes),
                        })
                      : "—"
                  }
                  valueClass="text-rose-600"
                />
              </div>

              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b py-3">
                  <div>
                    <CardTitle className="text-sm">{t("monitor.logsTitle")}</CardTitle>
                    <CardDescription>
                      {t("monitor.logsCount", { count: monitorLogs.length })}
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
                      {t("common.refresh")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={monitorBusy}
                      onClick={async () => {
                        if (!confirm(t("monitor.confirmClear"))) return;
                        setMonitorBusy(true);
                        try {
                          await clearMonitorLogsApi();
                          await refreshMonitor();
                          setMessage({ type: "ok", text: t("monitor.cleared") });
                        } catch (err) {
                          setMessage({
                            type: "err",
                            text:
                              err instanceof Error
                                ? err.message
                                : t("monitor.clearFailed"),
                          });
                        } finally {
                          setMonitorBusy(false);
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      {t("monitor.clear")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {monitorLogs.length === 0 ? (
                    <div className="text-muted-foreground p-8 text-center text-xs">
                      {t("monitor.empty")}
                    </div>
                  ) : (
                    <div className="max-h-[min(52vh,480px)] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[160px]">
                              {t("monitor.colTime")}
                            </TableHead>
                            <TableHead className="w-[100px]">
                              {t("monitor.colKind")}
                            </TableHead>
                            <TableHead>{t("monitor.colMsg")}</TableHead>
                            <TableHead className="w-[80px]">
                              {t("monitor.colDuration")}
                            </TableHead>
                            <TableHead className="w-[70px]">
                              {t("monitor.colCache")}
                            </TableHead>
                            <TableHead className="w-[70px]">
                              {t("monitor.colLevel")}
                            </TableHead>
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

      {message && (
        <div
          className={cn(
            "pointer-events-none fixed right-5 bottom-5 z-50 w-[min(360px,calc(100vw-2.5rem))]",
            "transition-all duration-200 ease-out",
            toastVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          )}
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-lg backdrop-blur-sm",
              message.type === "ok"
                ? "border-emerald-200/80 bg-white/95 text-emerald-900 shadow-emerald-100/80"
                : "border-rose-200/80 bg-white/95 text-rose-900 shadow-rose-100/80",
            )}
          >
            {message.type === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {message.type === "ok" ? t("common.success") : t("common.error")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                {message.text}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={t("common.close")}
              onClick={() => {
                setToastVisible(false);
                setMessage(null);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageSelect(props: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 text-xs text-slate-500",
        props.compact ? "" : "w-full",
      )}
    >
      {!props.compact && <span className="shrink-0">{props.t("common.language")}</span>}
      <select
        className={cn(
          "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100",
          props.compact ? "max-w-[140px]" : "w-full",
        )}
        value={props.locale}
        aria-label={props.t("common.language")}
        onChange={(e) => props.setLocale(e.target.value as Locale)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {localeLabel(code)}
          </option>
        ))}
      </select>
    </label>
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
  const { t } = useI18n();
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="remoteUrl">{t("params.remoteUrl")}</Label>
        <Input
          id="remoteUrl"
          value={props.remoteUrl}
          onChange={(e) => props.setRemoteUrl(e.target.value)}
          placeholder="https://example.com/demo.docx"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="watermark">{t("params.watermark")}</Label>
        <Input
          id="watermark"
          value={props.watermarkTxt}
          onChange={(e) => props.setWatermarkTxt(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="page">{t("params.page")}</Label>
          <Input
            id="page"
            value={props.pageNo}
            onChange={(e) => props.setPageNo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="highlight">{t("params.highlight")}</Label>
          <Input
            id="highlight"
            value={props.highlight}
            onChange={(e) => props.setHighlight(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("params.password")}</Label>
        <Input
          id="password"
          type="password"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          placeholder={t("params.passwordPh")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ftp">{t("params.ftp")}</Label>
        <Input
          id="ftp"
          value={props.ftpHost}
          onChange={(e) => props.setFtpHost(e.target.value)}
          placeholder={t("params.ftpPh")}
        />
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={props.useAes}
            onCheckedChange={(v) => props.setUseAes(v === true)}
          />
          {t("params.aes")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={props.forceUpdatedCache}
            onCheckedChange={(v) => props.setForceUpdatedCache(v === true)}
          />
          {t("params.forceCache")}
        </label>
      </div>
    </>
  );
}
