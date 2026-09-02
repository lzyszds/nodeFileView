import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  Container,
  Copy,
  Cpu,
  FileSpreadsheet,
  FileText,
  Globe2,
  Image as ImageIcon,
  Layers,
  Link2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { PublicConfig } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePreviewLogo } from "@/components/FilePreviewLogo";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

type HomeTabTarget = "files" | "playground";

const IMAGE = "ghcr.io/lzyszds/filePreview:1.0.0";

/** Fallback when public config is still loading — matches current qqlink deploy */
const DEFAULT_TRUST_HOST = "*.my-imcloud.com,*qqlink.*";
const DEFAULT_NOT_TRUST_HOST =
  "localhost,127.0.0.1,0.0.0.0,169.254.*,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*";

const API_SNIPPET = `GET /onlinePreview
  ?url=<base64|aes>
  &watermarkTxt=...
  &page=1
  &highlight=...
  &lang=zh
  &forceUpdatedCache=true`;

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function joinHostList(list: string[] | undefined, fallback: string): string {
  if (!list?.length) return fallback;
  return list.join(",");
}

function buildDockerRun(opts: {
  comment: string;
  name: string;
  port: number;
  trustHost: string;
  notTrustHost: string;
}): string {
  return [
    `# ${opts.comment}`,
    `docker run -d --name ${opts.name} --restart=always \\`,
    `  --platform linux/amd64 -p 127.0.0.1:${opts.port}:${opts.port} \\`,
    `  -e PORT=${opts.port} \\`,
    `  -e BASIC_AUTH_ENABLED=true -e BASIC_AUTH_USER=admin \\`,
    `  -e BASIC_AUTH_PASS='your-strong-password' \\`,
    `  -e TRUST_HOST=${shellSingleQuote(opts.trustHost)} \\`,
    `  -e NOT_TRUST_HOST=${shellSingleQuote(opts.notTrustHost)} \\`,
    `  ${IMAGE}`,
  ].join("\n");
}

function CodeBlock(props: {
  code: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="terminal-obsidian relative overflow-hidden rounded-xl border border-slate-800/90 bg-[#080c14] text-slate-200 shadow-xl group">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-3.5 py-2 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="size-2.5 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.6)] shrink-0" />
          <span className="size-2.5 rounded-full bg-[#eab308] shadow-[0_0_8px_rgba(234,179,8,0.6)] shrink-0" />
          <span className="size-2.5 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
          <span className="ml-2 text-slate-400 font-medium truncate">{t("home.terminalLabel")}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-slate-500 text-[10px] font-mono hidden sm:inline">UTF-8</span>
          <Button
            type="button"
            size="sm"
            className="h-6 gap-1 border border-slate-700/80 bg-slate-800/90 hover:bg-slate-700 hover:text-white px-2 text-[11px] text-slate-200 shadow-xs transition-all cursor-pointer active:scale-95"
            onClick={() => void onCopy()}
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-400" />
                <span className="text-emerald-300 font-medium">{props.copiedLabel}</span>
              </>
            ) : (
              <>
                <Copy className="size-3 text-slate-400 group-hover:text-slate-200 transition-colors" />
                <span>{props.copyLabel}</span>
              </>
            )}
          </Button>
        </div>
      </div>
      <pre className="p-4 font-mono text-[12px] leading-relaxed text-slate-200 whitespace-pre overflow-x-auto selection:bg-indigo-500 selection:text-white">
        {props.code}
      </pre>
    </div>
  );
}

function SectionHeader(props: {
  id: string;
  icon: LucideIcon;
  title: string;
  desc?: string;
  badge?: string;
}) {
  const Icon = props.icon;
  return (
    <div id={props.id} className="scroll-mt-6 space-y-1">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100/80 text-indigo-600 shadow-xs">
          <Icon className="size-4" />
        </span>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{props.title}</h2>
        {props.badge && (
          <span className="rounded-full bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-600">
            {props.badge}
          </span>
        )}
      </div>
      {props.desc ? (
        <p className="pl-9 text-xs leading-relaxed text-slate-500 max-w-3xl">
          {props.desc}
        </p>
      ) : null}
    </div>
  );
}

export function HomePage(props: {
  config: PublicConfig | null;
  onGo: (tab: HomeTabTarget) => void;
}) {
  const { t } = useI18n();
  const [deployTab, setDeployTab] = useState<"current" | "prod" | "test">("current");

  const deploy = useMemo(() => {
    const trustHost = joinHostList(props.config?.trustHost, DEFAULT_TRUST_HOST);
    const notTrustHost = joinHostList(
      props.config?.notTrustHost,
      DEFAULT_NOT_TRUST_HOST,
    );
    const currentPort = props.config?.port || 6001;
    const shared = { trustHost, notTrustHost };

    return {
      trustHost,
      notTrustHost,
      currentPort,
      current: buildDockerRun({
        comment: `Current instance — PORT=${currentPort}`,
        name: currentPort === 6002 ? "filePreview-test" : "filePreview",
        port: currentPort,
        ...shared,
      }),
      prod: buildDockerRun({
        comment: "Production — container listens on 6001",
        name: "filePreview",
        port: 6001,
        ...shared,
      }),
      test: buildDockerRun({
        comment: "Test — container listens on 6002",
        name: "filePreview-test",
        port: 6002,
        ...shared,
      }),
    };
  }, [props.config]);

  const formatCards = [
    {
      title: t("home.fmtWord"),
      desc: t("home.fmtWordDesc"),
      icon: FileText,
      iconColor: "text-blue-600 bg-blue-50 border-blue-100",
      badgeColor: "bg-blue-50/80 text-blue-700 border-blue-200/80",
      tags: ["docx", "doc", "wps", "odt"],
    },
    {
      title: t("home.fmtExcel"),
      desc: t("home.fmtExcelDesc"),
      icon: FileSpreadsheet,
      iconColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
      badgeColor: "bg-emerald-50/80 text-emerald-700 border-emerald-200/80",
      tags: ["xlsx", "xls", "csv", "tsv"],
    },
    {
      title: t("home.fmtPptPdf"),
      desc: t("home.fmtPptPdfDesc"),
      icon: Layers,
      iconColor: "text-rose-600 bg-rose-50 border-rose-100",
      badgeColor: "bg-rose-50/80 text-rose-700 border-rose-200/80",
      tags: ["pptx", "ppt", "pdf"],
    },
    {
      title: t("home.fmtImage"),
      desc: t("home.fmtImageDesc"),
      icon: ImageIcon,
      iconColor: "text-amber-600 bg-amber-50 border-amber-100",
      badgeColor: "bg-amber-50/80 text-amber-700 border-amber-200/80",
      tags: ["jpg", "png", "webp", "heic", "svg"],
    },
    {
      title: t("home.fmtText"),
      desc: t("home.fmtTextDesc"),
      icon: Terminal,
      iconColor: "text-purple-600 bg-purple-50 border-purple-100",
      badgeColor: "bg-purple-50/80 text-purple-700 border-purple-200/80",
      tags: ["md", "txt", "json", "js", "ts", "py"],
    },
    {
      title: t("home.fmtArchive"),
      desc: t("home.fmtArchiveDesc"),
      icon: BookOpen,
      iconColor: "text-cyan-600 bg-cyan-50 border-cyan-100",
      badgeColor: "bg-cyan-50/80 text-cyan-700 border-cyan-200/80",
      tags: ["zip", "rar", "7z", "tar", "gz"],
    },
  ];

  const steps: Array<{
    icon: LucideIcon;
    title: string;
    desc: string;
    action?: ReactNode;
  }> = [
    {
      icon: Container,
      title: t("home.step1Title"),
      desc: t("home.step1Desc"),
    },
    {
      icon: Globe2,
      title: t("home.step2Title"),
      desc: t("home.step2Desc"),
    },
    {
      icon: Upload,
      title: t("home.step3Title"),
      desc: t("home.step3Desc"),
      action: (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-xs text-xs font-semibold whitespace-nowrap"
          onClick={() => props.onGo("files")}
        >
          {t("home.ctaFiles")}
        </Button>
      ),
    },
    {
      icon: Link2,
      title: t("home.step4Title"),
      desc: t("home.step4Desc"),
      action: (
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-center border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-xs text-xs font-semibold whitespace-nowrap"
          onClick={() => props.onGo("playground")}
        >
          {t("home.ctaPlayground")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-12 pb-16">
      {/* 2-Column Hero Header with Ambient Lighting & Floating Elements */}
      <section className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-center">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <FilePreviewLogo size={54} className="size-12 sm:size-14 rounded-2xl hover:scale-105 transition-transform" />
            <div className="space-y-1">
              <div className="floating-badge inline-flex items-center gap-2 rounded-full border border-indigo-200/90 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-white px-3.5 py-1 text-xs font-semibold text-indigo-900 shadow-[0_2px_12px_rgba(99,102,241,0.15)] hover:shadow-indigo-300/40 hover:scale-105 transition-all">
                <Sparkles className="size-3.5 text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} />
                <span>{t("home.badge")}</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-5xl leading-tight flex items-baseline flex-wrap gap-3">
              <span className="gradient-title">{t("nav.brand")}</span>
              <span className="text-sm font-semibold tracking-normal text-slate-400 font-mono">filePreview</span>
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 max-w-2xl font-normal">
              {t("home.intro")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="default"
              className="shimmer-btn bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-900/15 hover:shadow-slate-900/30 active:scale-95 font-bold px-6 py-2.5 rounded-xl whitespace-nowrap shrink-0 transition-all cursor-pointer"
              onClick={() => props.onGo("files")}
            >
              <Upload className="size-4 mr-2 shrink-0" />
              <span className="whitespace-nowrap">{t("home.ctaFiles")}</span>
            </Button>
            <Button
              size="default"
              variant="outline"
              className="border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-xs active:scale-95 font-semibold px-5 py-2.5 rounded-xl whitespace-nowrap shrink-0 transition-all cursor-pointer"
              onClick={() => props.onGo("playground")}
            >
              <Terminal className="size-4 mr-2 text-indigo-600 shrink-0" />
              <span className="whitespace-nowrap">{t("home.ctaPlayground")}</span>
            </Button>
          </div>

          {/* Floating Organic Feature Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="float-card-1 inline-flex items-center gap-1.5 rounded-full bg-white/90 border border-slate-200/80 px-3 py-1 font-medium text-slate-700 shadow-2xs">
              <span className="size-1.5 rounded-full bg-indigo-500" />
              {t("home.pillOffice")}
            </span>
            <span className="float-card-2 inline-flex items-center gap-1.5 rounded-full bg-white/90 border border-slate-200/80 px-3 py-1 font-medium text-slate-700 shadow-2xs">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {t("home.pillSandbox")}
            </span>
            <span className="float-card-1 inline-flex items-center gap-1.5 rounded-full bg-white/90 border border-slate-200/80 px-3 py-1 font-medium text-slate-700 shadow-2xs">
              <span className="size-1.5 rounded-full bg-sky-500" />
              {t("home.pillDocker")}
            </span>
          </div>
        </div>

        {/* Right Obsidian Demo Terminal with Dynamic Glow & Live Cursor */}
        <div className="relative group">
          {/* Decorative breathing multi-color aura */}
          <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-indigo-500/30 via-purple-500/25 to-sky-500/30 blur-2xl opacity-75 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <div className="glass-card border border-slate-200/80 shadow-2xl relative overflow-hidden rounded-2xl flex flex-col gap-0 p-0 bg-white">
            <div className="p-3.5 px-4 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm flex items-center justify-between">
              <div className="text-xs font-mono font-bold text-slate-800 flex items-center gap-2">
                <Terminal className="size-3.5 text-indigo-600 shrink-0" />
                <span>{t("home.apiPreviewTitle")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full font-medium shadow-2xs">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                  LIVE
                </span>
                <Badge className="font-mono text-[10px] border border-blue-200 bg-blue-50 text-blue-700 shrink-0">
                  HTTP GET
                </Badge>
              </div>
            </div>
            
            <div className="p-3.5 bg-slate-950 space-y-3">
              <div className="flex items-center gap-1.5 text-indigo-300 font-mono text-[11px] bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-emerald-400 font-bold">$</span>
                <span className="truncate">curl -i http://localhost:6001/onlinePreview...</span>
                <span className="inline-block w-1.5 h-3.5 bg-indigo-400 cursor-blink ml-auto shrink-0" />
              </div>
              <CodeBlock
                code={API_SNIPPET}
                copyLabel={t("home.copy")}
                copiedLabel={t("home.copied")}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Highlights Bento Capsules */}
      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Zap,
            label: t("home.featRender"),
            desc: t("home.featRenderDesc"),
            color: "text-amber-600 bg-amber-50 border-amber-200/80",
          },
          {
            icon: ShieldCheck,
            label: t("home.featSecurity"),
            desc: t("home.featSecurityDesc"),
            color: "text-emerald-600 bg-emerald-50 border-emerald-200/80",
          },
          {
            icon: Container,
            label: t("home.featDocker"),
            desc: t("home.featDockerDesc"),
            color: "text-indigo-600 bg-indigo-50 border-indigo-200/80",
          },
          {
            icon: Cpu,
            label: t("home.featCache"),
            desc: t("home.featCacheDesc"),
            color: "text-sky-600 bg-sky-50 border-sky-200/80",
          },
        ].map((feat) => {
          const Icon = feat.icon;
          return (
            <div
              key={feat.label}
              className="glass-card-interactive group rounded-2xl p-4 flex items-center gap-3.5 cursor-default"
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-2xs group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300", feat.color)}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-950 transition-colors truncate">{feat.label}</div>
                <div className="text-[11px] text-slate-500 font-normal truncate mt-0.5">{feat.desc}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Guide Flow 4 Steps */}
      <section className="space-y-4">
        <SectionHeader
          id="guide-flow"
          icon={FileText}
          title={t("home.guideTitle")}
          desc={t("home.guideDesc")}
          badge={t("home.stepsBadge")}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="glass-card-interactive rounded-2xl p-5 flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="glow-ring flex size-7 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white shadow-xs group-hover:scale-110 group-hover:bg-indigo-600 transition-all">
                      0{i + 1}
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100/70 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-xs group-hover:rotate-6">
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    {step.desc}
                  </p>
                </div>
                {step.action && <div className="pt-2">{step.action}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Horizontal Docker Deploy Workspace */}
      <section className="space-y-4">
        <SectionHeader
          id="guide-deploy"
          icon={Terminal}
          title={t("home.deployTitle")}
          desc={t("home.deployDesc")}
        />

        <div className="glass-card rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 shadow-inner">
              <button
                type="button"
                onClick={() => setDeployTab("current")}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95",
                  deployTab === "current"
                    ? "bg-white text-slate-900 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_8px_rgba(99,102,241,0.15)] ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                {t("home.tabCurrent", { port: deploy.currentPort })}
              </button>
              <button
                type="button"
                onClick={() => setDeployTab("prod")}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95",
                  deployTab === "prod"
                    ? "bg-white text-slate-900 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_8px_rgba(99,102,241,0.15)] ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                {t("home.tabProd")}
              </button>
              <button
                type="button"
                onClick={() => setDeployTab("test")}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95",
                  deployTab === "test"
                    ? "bg-white text-slate-900 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_8px_rgba(99,102,241,0.15)] ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                {t("home.tabTest")}
              </button>
            </div>
          </div>

          <CodeBlock
            code={
              deployTab === "current"
                ? deploy.current
                : deployTab === "prod"
                ? deploy.prod
                : deploy.test
            }
            copyLabel={t("home.copy")}
            copiedLabel={t("home.copied")}
          />
        </div>
      </section>

      {/* Formats Grid with Interactive Bouncy Tags */}
      <section className="space-y-4">
        <SectionHeader
          id="guide-formats"
          icon={BookOpen}
          title={t("home.formatsTitle")}
          desc={t("home.formatsDesc")}
        />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {formatCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="glass-card-interactive rounded-2xl p-4 space-y-3 group hover:border-indigo-200/90"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn("flex size-8 items-center justify-center rounded-lg border shadow-2xs group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300", item.iconColor)}>
                    <Icon className="size-4" />
                  </span>
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-950 transition-colors">{item.title}</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">{item.desc}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "font-mono text-[10px] border px-2 py-0.5 rounded-md font-medium shadow-2xs hover:scale-110 hover:-translate-y-0.5 transition-all duration-200 cursor-default",
                        item.badgeColor
                      )}
                    >
                      .{tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
