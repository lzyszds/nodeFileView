import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Activity,
  BookOpen,
  CheckCircle2,
  FileUp,
  Folder,
  Globe,
  Lock,
  LogOut,
  ArrowRight,
  KeyRound,
  RefreshCw,
  Settings,
  ShieldCheck,
  Search,
  Terminal,
  Trash2,
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
import { FilePreviewLogo } from "@/components/FilePreviewLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const [remoteUrl, setRemoteUrl] = useState("");
  const [useAes, setUseAes] = useState(false);
  const [watermarkTxt, setWatermarkTxt] = useState("filePreview");
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

  useEffect(() => {
    const brand = t("nav.brand") || "文件预览";
    const currentNav = navItems.find((item) => item.id === activeTab);
    if (activeTab === "home") {
      document.title = `${brand} - 高性能多格式在线文件预览服务`;
    } else if (currentNav) {
      document.title = `${currentNav.label} · ${brand}`;
    }
  }, [activeTab, t, navItems]);

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

  const formatGroups = useMemo(
    () => [
      { title: t("formats.word"), desc: t("formats.wordDesc") },
      { title: t("formats.excel"), desc: t("formats.excelDesc") },
      { title: t("formats.pptPdf"), desc: t("formats.pptPdfDesc") },
      { title: t("formats.other"), desc: t("formats.otherDesc") },
    ],
    [t],
  );

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadFile(fileList[0]);
      setMessage({
        type: "ok",
        text: t("files.uploaded", { name: uploaded.name }),
      });
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
      <div className="flex h-screen items-center justify-center bg-slate-50 text-xs text-slate-500 font-mono">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-6 py-3.5 shadow-lg backdrop-blur-md">
          <span className="size-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="font-semibold text-slate-800">
            {t("common.loading")}
          </span>
        </div>
      </div>
    );
  }

  if (authEnabled && !authenticated) {
    return (
      <div className="login-shell relative flex min-h-screen w-full items-center justify-center overflow-hidden px-5 py-8 sm:p-10">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <main className="relative w-full max-w-[440px]">
          <div className="mb-9 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FilePreviewLogo size={36} />
              <div>
                <span className="block text-[15px] font-bold tracking-tight text-slate-900">
                  文件预览
                </span>
                <span className="block text-[10px] font-medium tracking-[0.12em] text-slate-400 uppercase">
                  workspace
                </span>
              </div>
            </div>
            <LanguageSelect
              locale={locale}
              setLocale={setLocale}
              t={t}
              compact
            />
          </div>
          <form
            onSubmit={handleLogin}
            className="login-card rounded-2xl border border-white/90 bg-white/86 p-7 sm:p-9"
          >
            <div className="mb-8">
              <div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
                <ShieldCheck className="size-[19px]" />
              </div>
              <p className="mb-2 text-[10px] font-bold tracking-[0.16em] text-indigo-600 uppercase">
                Secure sign in
              </p>
              <h1 className="text-[26px] font-bold tracking-[-0.03em] text-slate-900">
                登录控制台
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("login.subtitle")}
              </p>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="login-user"
                  className="text-sm font-semibold text-slate-700"
                >
                  {t("login.user")}
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-user"
                    autoComplete="username"
                    className="h-11 rounded-lg border-slate-200 bg-slate-50/70 pl-10 text-slate-900 shadow-none placeholder:text-slate-400 focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="login-pass"
                  className="text-sm font-semibold text-slate-700"
                >
                  {t("login.pass")}
                </Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-pass"
                    type="password"
                    autoComplete="current-password"
                    className="h-11 rounded-lg border-slate-200 bg-slate-50/70 pl-10 text-slate-900 shadow-none focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    required
                  />
                </div>
              </div>
              {loginError && (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700"
                  role="alert"
                >
                  {loginError}
                </p>
              )}
              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)] hover:bg-slate-800 hover:shadow-[0_10px_22px_rgba(15,23,42,0.22)] active:scale-[0.98]"
                disabled={loginBusy}
              >
                <span>
                  {loginBusy ? t("login.submitting") : t("login.submit")}
                </span>
                {!loginBusy && <ArrowRight className="size-4" />}
              </Button>
            </div>
            <div className="my-7 h-px bg-slate-100" />
            <p className="whitespace-pre-line text-center text-[11px] leading-5 text-slate-400">
              {t("login.hint")}
            </p>
          </form>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
            <ShieldCheck className="size-3.5 text-emerald-500" /> 受访问策略保护
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col font-sans relative dot-grid">
      {/* Ambient Moving Aura Glowing Lights isolated in a non-scrolling layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aura-glow-1 top-[-100px] left-1/4 size-[600px] bg-gradient-to-tr from-indigo-300/35 via-violet-300/30 to-sky-300/25" />
        <div className="aura-glow-2 top-48 -right-16 size-[550px] bg-gradient-to-br from-blue-300/30 via-teal-200/25 to-indigo-300/20" />
        <div className="aura-glow-3 -bottom-24 -left-20 size-[650px] bg-gradient-to-tr from-purple-300/25 via-pink-200/20 to-indigo-300/25" />
      </div>

      {/* Top Minimalist Crystal Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/75 bg-white/80 backdrop-blur-xl transition-colors shadow-2xs">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 gap-4 select-none">
          {/* Left: Brand Identity */}
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-2.5 transition-all hover:opacity-85 cursor-pointer select-none group shrink-0 active:scale-95"
          >
            <FilePreviewLogo
              size={28}
              className="size-7 group-hover:scale-105 transition-transform rounded-lg"
            />
            <span className="text-sm font-bold tracking-tight text-slate-900">
              {t("nav.brand")}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50/90 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-medium text-emerald-700 shadow-2xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t("common.ready")}
            </span>
          </button>

          {/* Center: Sleek Segmented Navigation with Stable Metrics */}
          <nav className="flex items-center gap-1 rounded-full bg-slate-100/90 p-1 border border-slate-200/70 shadow-inner shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-200 select-none cursor-pointer shrink-0 active:scale-95",
                    active
                      ? "bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_12px_rgba(99,102,241,0.18)] ring-1 ring-slate-200/80"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white/60",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 transition-colors",
                      active ? "text-indigo-600" : "text-slate-400",
                    )}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Minimalist Tools (Language + Auth) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSelect
              locale={locale}
              setLocale={setLocale}
              t={t}
              compact
            />

            {authEnabled && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-slate-200">
                <span className="text-xs text-slate-500 font-mono hidden md:inline px-1">
                  {authUser || "admin"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex items-center justify-center size-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-90"
                  title={t("nav.logout", {
                    user: authUser || t("nav.loginFallback"),
                  })}
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Hidden File Input */}
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

      {/* Main Content Area with Smooth Page Entry Animation */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div key={activeTab} className="animate-page-enter">
          {activeTab === "home" && (
            <HomePage config={config} onGo={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === "files" && (
            <div className="space-y-6">
              {/* Action Bar & Quick Upload Header */}
              <div className="glass-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="text-slate-400 absolute top-2.5 left-3 size-4" />
                    <Input
                      className="w-64 border-slate-200 bg-white/90 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl md:w-80"
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
                    size="sm"
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs text-xs rounded-xl"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw className="size-3.5 mr-1" />
                    {t("common.refresh")}
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 hidden lg:block">
                    {t("files.dropHint")}
                  </p>
                  <Button
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800 shadow-sm font-bold text-xs rounded-xl px-4"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="size-3.5 mr-1.5" />
                    {t("files.chooseFile")}
                  </Button>
                </div>
              </div>

              {/* Files Master Workbench */}
              <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
                <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex flex-row items-center justify-between border-b border-slate-200/80 p-4 py-3.5 bg-white/70">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        {t("files.title")}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t("files.desc")}
                      </p>
                    </div>
                    <Badge className="font-mono text-xs border border-indigo-200 bg-indigo-50 text-indigo-700">
                      {total} Files
                    </Badge>
                  </div>
                  <div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-200/80">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-semibold text-slate-700">
                              {t("files.colName")}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-slate-700">
                              {t("files.colType")}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-slate-700">
                              {t("files.colSize")}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-slate-700">
                              {t("files.colTime")}
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-700">
                              {t("files.colActions")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {files.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="py-12 text-center text-xs text-slate-400"
                              >
                                {t("files.empty")}
                              </TableCell>
                            </TableRow>
                          ) : (
                            files.map((f) => (
                              <TableRow
                                key={f.fileId}
                                className="border-b border-slate-100 hover:bg-indigo-50/40 transition-colors"
                              >
                                <TableCell className="max-w-[200px] truncate font-medium text-slate-900 text-xs">
                                  {f.name}
                                </TableCell>
                                <TableCell>
                                  <span className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                    .{f.ext}
                                  </span>
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-500">
                                  {formatSize(f.size)}
                                </TableCell>
                                <TableCell className="text-xs text-slate-500">
                                  {new Date(f.createdAt).toLocaleString(locale)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      className="bg-slate-900 text-white hover:bg-slate-800 text-xs h-7 px-3 font-semibold rounded-lg shadow-2xs"
                                      disabled={busy}
                                      onClick={() => void previewLocal(f)}
                                    >
                                      {t("files.preview")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 h-7 w-7 p-0 rounded-lg transition-colors"
                                      disabled={busy}
                                      onClick={() =>
                                        void handleDelete(f.fileId)
                                      }
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

                    <div className="flex items-center justify-between border-t border-slate-200/80 p-4 bg-white/50">
                      <p className="text-xs text-slate-500">
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
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs text-xs rounded-xl"
                          disabled={page <= 1 || busy}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          {t("common.prev")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs text-xs rounded-xl"
                          disabled={page >= totalPages || busy}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          {t("common.next")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side Parameters & Formats Panel */}
                <div className="space-y-6">
                  <div className="glass-card rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-900">
                        {t("files.paramsTitle")}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t("files.paramsDesc")}
                      </p>
                    </div>
                    <div className="space-y-3.5">
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
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          disabled={busy}
                          className="bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs rounded-xl shadow-sm px-4"
                          onClick={() => void onGenerate()}
                        >
                          {t("files.generate")}
                        </Button>
                        <Button
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-xs rounded-xl shadow-2xs"
                          disabled={busy || !generatedLink}
                          onClick={() =>
                            window.open(
                              generatedLink,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          {t("files.openPreview")}
                        </Button>
                      </div>
                      {generatedLink && (
                        <div className="terminal-obsidian p-3 rounded-xl">
                          <pre className="font-mono text-xs text-slate-200 break-all whitespace-pre-wrap">
                            {generatedLink}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-5 space-y-3.5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">
                      {t("files.formatsTitle")}
                    </h3>
                    <div className="space-y-3">
                      {formatGroups.map((g, i) => (
                        <div key={g.title}>
                          {i > 0 && (
                            <Separator className="my-2.5 bg-slate-100" />
                          )}
                          <p className="text-xs font-semibold text-slate-800">
                            {g.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 leading-relaxed font-normal">
                            {g.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "playground" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="glass-card rounded-2xl p-6 space-y-5 shadow-sm">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    {t("playground.title")}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("playground.desc")}
                  </p>
                </div>
                <div className="space-y-4">
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
                  <div className="flex flex-wrap gap-2.5 pt-2">
                    <Button
                      disabled={busy}
                      className="bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs px-5 rounded-xl shadow-sm cursor-pointer"
                      onClick={() => void onGenerate()}
                    >
                      {t("files.generate")}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 text-xs px-4 rounded-xl shadow-2xs cursor-pointer"
                      disabled={busy || !generatedLink}
                      onClick={() =>
                        window.open(
                          generatedLink,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      {t("files.openPreview")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="glass-card rounded-2xl p-6 space-y-4 shadow-sm">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      {t("playground.renderTitle")}
                    </h3>
                  </div>
                  <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 font-mono text-xs leading-relaxed text-slate-700 space-y-2.5 shadow-2xs">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-400">Watermark:</span>
                      <span className="font-semibold text-slate-900">
                        {watermarkTxt || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-400">Encryption:</span>
                      <span className="font-semibold text-slate-900">
                        {useAes ? "AES Enabled" : "Plain Text"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-400">Page:</span>
                      <span className="font-semibold text-slate-900">
                        {pageNo || "1"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-400">Highlight:</span>
                      <span className="font-semibold text-slate-900">
                        {highlight || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-400">Cache Policy:</span>
                      <span className="font-semibold text-slate-900">
                        {forceUpdatedCache
                          ? "BYPASS_CACHE"
                          : "CACHE_HIT_ALLOWED"}
                      </span>
                    </div>
                    <div className="flex justify-between pt-0.5">
                      <span className="text-slate-400">Lang:</span>
                      <span className="font-semibold text-slate-900">
                        {locale}
                      </span>
                    </div>
                  </div>
                </div>

                {generatedLink && (
                  <div className="glass-card rounded-2xl p-6 space-y-3 shadow-sm">
                    <div className="border-b border-slate-100 pb-2.5">
                      <h3 className="text-xs font-mono font-bold text-slate-800">
                        Generated Target URL
                      </h3>
                    </div>
                    <div className="terminal-obsidian p-3.5 rounded-xl">
                      <pre className="font-mono text-xs text-slate-200 break-all whitespace-pre-wrap">
                        {generatedLink}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <div className="glass-card rounded-2xl p-6 space-y-6 shadow-sm">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    {t("settings.title")}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("settings.desc")}
                  </p>
                </div>
                <div className="space-y-6">
                  {!config ? (
                    <p className="text-xs text-slate-500">
                      {t("settings.loading")}
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 rounded-xl border border-slate-200/90 bg-white/80 p-4 text-xs text-slate-700 shadow-2xs">
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">
                            {t("settings.listen")}:
                          </span>
                          <span className="font-mono text-slate-900 font-semibold">
                            {config.host}:{config.port}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">BASE_URL:</span>
                          <span className="font-mono text-slate-900 truncate max-w-[200px]">
                            {config.baseUrl || t("common.unset")}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">TRUST_HOST:</span>
                          <span className="font-mono text-slate-900 truncate max-w-[200px]">
                            {config.trustHost?.length
                              ? config.trustHost.join(", ")
                              : t("settings.trustHostUnlimited")}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">
                            {t("settings.maxUpload")}:
                          </span>
                          <span className="font-mono text-slate-900 font-semibold">
                            {config.maxUploadSizeMb}MB
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">LibreOffice:</span>
                          <span className="font-mono text-slate-900">
                            {config.libreOfficePath || "soffice"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-0.5">
                          <span className="text-slate-500">
                            {t("settings.convertTimeout")}:
                          </span>
                          <span className="font-mono text-slate-900">
                            {config.convertTimeoutMs || 120000}ms
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-xl border border-slate-200/90 bg-white/80 p-4 text-xs text-slate-700 shadow-2xs">
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">AES:</span>
                          <Badge className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700">
                            {config.aesEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </Badge>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Basic Auth:</span>
                          <Badge className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700">
                            {config.basicAuthEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </Badge>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">
                            {t("settings.previewPassword")}:
                          </span>
                          <Badge className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700">
                            {config.previewPasswordEnabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </Badge>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">
                            {t("settings.allowEmbed")}:
                          </span>
                          <Badge className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700">
                            {config.allowEmbed
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </Badge>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">
                            {t("settings.blockPrivate")}:
                          </span>
                          <Badge className="font-mono text-[10px] border border-slate-200 bg-slate-100 text-slate-700">
                            {config.blockPrivateIp
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </Badge>
                        </div>
                        <div className="flex justify-between pt-0.5">
                          <span className="text-slate-500">
                            {t("settings.rateLimit")}:
                          </span>
                          <span className="font-mono text-slate-900">
                            {config.rateLimitMax}/{config.rateLimitWindowMs}ms
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 rounded-xl border border-slate-200/90 bg-white/80 p-5 shadow-2xs">
                    <p className="text-sm font-bold text-slate-900">
                      {t("settings.cacheTitle")}
                    </p>
                    {monitorStats ? (
                      <div className="grid gap-3.5 text-xs md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="text-slate-500">
                            {t("settings.cacheConvert")}
                          </div>
                          <div className="mt-1.5 font-mono font-bold text-slate-900 text-lg">
                            {t("settings.countSize", {
                              count: monitorStats.cache.convert.count,
                              size: formatSize(
                                monitorStats.cache.convert.bytes,
                              ),
                            })}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="text-slate-500">
                            {t("settings.cacheRemote")}
                          </div>
                          <div className="mt-1.5 font-mono font-bold text-slate-900 text-lg">
                            {t("settings.countSize", {
                              count: monitorStats.cache.remote.count,
                              size: formatSize(monitorStats.cache.remote.bytes),
                            })}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="text-slate-500">
                            {t("settings.cacheTemp")}
                          </div>
                          <div className="mt-1.5 font-mono font-bold text-slate-900 text-lg">
                            {t("settings.countSize", {
                              count: monitorStats.cache.temp.count,
                              size: formatSize(monitorStats.cache.temp.bytes),
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {t("settings.cacheLoading")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs rounded-xl shadow-2xs"
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
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs rounded-xl shadow-2xs"
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
                        className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs rounded-xl shadow-2xs"
                        disabled={monitorBusy}
                        onClick={() => void purgeAllCache()}
                      >
                        {t("settings.clearAll")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold rounded-xl shadow-2xs"
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
                </div>
              </div>
            </div>
          )}

          {activeTab === "monitor" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
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
                />
                <StatCard
                  label={t("monitor.avgConvert")}
                  value={monitorStats ? `${monitorStats.avgConvertMs} ms` : "—"}
                  hint={t("monitor.convertHint", {
                    count: monitorStats?.convertTotal ?? 0,
                  })}
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
                />
              </div>

              <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
                <div className="flex flex-row items-center justify-between gap-3 border-b border-slate-200/80 p-4 py-3.5 bg-white/70">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {t("monitor.logsTitle")}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t("monitor.logsCount", { count: monitorLogs.length })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs rounded-xl shadow-2xs"
                      disabled={monitorBusy}
                      onClick={() => {
                        refreshMonitor().catch((err: Error) =>
                          setMessage({ type: "err", text: err.message }),
                        );
                      }}
                    >
                      <RefreshCw className="size-3.5 mr-1" />
                      {t("common.refresh")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs rounded-xl shadow-2xs"
                      disabled={monitorBusy}
                      onClick={async () => {
                        if (!confirm(t("monitor.confirmClear"))) return;
                        setMonitorBusy(true);
                        try {
                          await clearMonitorLogsApi();
                          await refreshMonitor();
                          setMessage({
                            type: "ok",
                            text: t("monitor.cleared"),
                          });
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
                      <Trash2 className="size-3.5 mr-1" />
                      {t("monitor.clear")}
                    </Button>
                  </div>
                </div>
                <div>
                  {monitorLogs.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      {t("monitor.empty")}
                    </div>
                  ) : (
                    <div className="max-h-[550px] overflow-auto bg-white/60">
                      <Table>
                        <TableHeader className="bg-slate-50/90 sticky top-0 border-b border-slate-200/80">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[160px] text-xs font-semibold text-slate-700">
                              {t("monitor.colTime")}
                            </TableHead>
                            <TableHead className="w-[100px] text-xs font-semibold text-slate-700">
                              {t("monitor.colKind")}
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-slate-700">
                              {t("monitor.colMsg")}
                            </TableHead>
                            <TableHead className="w-[80px] text-xs font-semibold text-slate-700">
                              {t("monitor.colDuration")}
                            </TableHead>
                            <TableHead className="w-[70px] text-xs font-semibold text-slate-700">
                              {t("monitor.colCache")}
                            </TableHead>
                            <TableHead className="w-[70px] text-xs font-semibold text-slate-700">
                              {t("monitor.colLevel")}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monitorLogs.map((log) => (
                            <TableRow
                              key={log.id}
                              className="border-b border-slate-100 hover:bg-indigo-50/40 transition-colors"
                            >
                              <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                                {formatTime(log.ts)}
                              </TableCell>
                              <TableCell className="text-xs font-medium text-slate-800">
                                {log.kind}
                              </TableCell>
                              <TableCell className="max-w-[360px] truncate text-xs text-slate-600">
                                {log.message}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-900 font-semibold">
                                {typeof log.durationMs === "number"
                                  ? `${log.durationMs}ms`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {log.cacheHit === true ? (
                                  <span className="text-emerald-600 font-bold">
                                    HIT
                                  </span>
                                ) : log.cacheHit === false ? (
                                  <span className="text-slate-400">MISS</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "font-mono text-[10px] uppercase border px-2 py-0.5 rounded font-semibold",
                                    log.level === "error"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : log.level === "warn"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-blue-50 text-blue-700 border-blue-200",
                                  )}
                                >
                                  {log.level}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Toast notifications */}
      {message && (
        <div
          className={cn(
            "pointer-events-none fixed right-5 bottom-5 z-50 w-[min(380px,calc(100vw-2.5rem))]",
            "transition-all duration-200 ease-out",
            toastVisible
              ? "translate-y-0 opacity-100 scale-100"
              : "translate-y-2 opacity-0 scale-95",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xl p-4 shadow-2xl text-slate-900">
            {message.type === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900">
                {message.type === "ok"
                  ? t("common.success")
                  : t("common.error")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 font-normal">
                {message.text}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
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
  if (props.compact) {
    return (
      <div className="relative flex items-center">
        <Globe className="pointer-events-none absolute left-2.5 size-3.5 text-slate-400" />
        <select
          className="appearance-none rounded-full bg-slate-100/80 hover:bg-slate-100 py-1 pl-7 pr-3 text-xs font-medium text-slate-600 outline-none transition-colors cursor-pointer border border-slate-200/50 shadow-2xs"
          value={props.locale}
          aria-label={props.t("common.language")}
          onChange={(e) => props.setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code} className="bg-white text-slate-800">
              {localeLabel(code)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <label className="flex w-full items-center gap-2 text-xs text-slate-600">
      <span className="shrink-0 font-medium">{props.t("common.language")}</span>
      <select
        className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 shadow-2xs transition-all cursor-pointer"
        value={props.locale}
        aria-label={props.t("common.language")}
        onChange={(e) => props.setLocale(e.target.value as Locale)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="bg-white text-slate-800">
            {localeLabel(code)}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard(props: { label: string; value: string; hint: string }) {
  return (
    <div className="glass-card-interactive rounded-2xl p-4 space-y-1.5 shadow-sm group relative overflow-hidden">
      <div className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600 transition-colors">
        {props.label}
      </div>
      <div className="font-mono text-2xl font-black tracking-tight text-slate-900 group-hover:scale-105 transition-transform origin-left">
        {props.value}
      </div>
      <div className="text-[11px] text-slate-400 font-normal">{props.hint}</div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
      <div className="space-y-1.5">
        <Label
          htmlFor="remoteUrl"
          className="text-xs font-semibold text-slate-700"
        >
          {t("params.remoteUrl")}
        </Label>
        <Input
          id="remoteUrl"
          className="border-slate-200 bg-white/90 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
          value={props.remoteUrl}
          onChange={(e) => props.setRemoteUrl(e.target.value)}
          placeholder="https://example.com/demo.docx"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="watermark"
          className="text-xs font-semibold text-slate-700"
        >
          {t("params.watermark")}
        </Label>
        <Input
          id="watermark"
          className="border-slate-200 bg-white/90 text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
          value={props.watermarkTxt}
          onChange={(e) => props.setWatermarkTxt(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="page"
            className="text-xs font-semibold text-slate-700"
          >
            {t("params.page")}
          </Label>
          <Input
            id="page"
            className="border-slate-200 bg-white/90 text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
            value={props.pageNo}
            onChange={(e) => props.setPageNo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="highlight"
            className="text-xs font-semibold text-slate-700"
          >
            {t("params.highlight")}
          </Label>
          <Input
            id="highlight"
            className="border-slate-200 bg-white/90 text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
            value={props.highlight}
            onChange={(e) => props.setHighlight(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="password"
          className="text-xs font-semibold text-slate-700"
        >
          {t("params.password")}
        </Label>
        <Input
          id="password"
          type="password"
          className="border-slate-200 bg-white/90 text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          placeholder={t("params.passwordPh")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ftp" className="text-xs font-semibold text-slate-700">
          {t("params.ftp")}
        </Label>
        <Input
          id="ftp"
          className="border-slate-200 bg-white/90 text-xs text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-xl"
          value={props.ftpHost}
          onChange={(e) => props.setFtpHost(e.target.value)}
          placeholder={t("params.ftpPh")}
        />
      </div>
      <div className="space-y-2.5 pt-1">
        <label className="flex items-center gap-2.5 text-xs text-slate-700 font-medium cursor-pointer">
          <Checkbox
            checked={props.useAes}
            onCheckedChange={(v) => props.setUseAes(v === true)}
            className="border-slate-300 data-[state=checked]:bg-slate-900 data-[state=checked]:text-white data-[state=checked]:border-slate-900 rounded"
          />
          {t("params.aes")}
        </label>
        <label className="flex items-center gap-2.5 text-xs text-slate-700 font-medium cursor-pointer">
          <Checkbox
            checked={props.forceUpdatedCache}
            onCheckedChange={(v) => props.setForceUpdatedCache(v === true)}
            className="border-slate-300 data-[state=checked]:bg-slate-900 data-[state=checked]:text-white data-[state=checked]:border-slate-900 rounded"
          />
          {t("params.forceCache")}
        </label>
      </div>
    </>
  );
}
