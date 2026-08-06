import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  Container,
  Copy,
  FileText,
  Globe2,
  Link2,
  Shield,
  Terminal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { PublicConfig } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

type HomeTabTarget = "files" | "playground";

const IMAGE = "ghcr.io/lzyszds/nodefileview:1.0.0";

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
    <div className="code-block relative border border-neutral-800 bg-neutral-950">
      <pre className="p-4 pr-12 font-mono text-[11px] leading-relaxed text-neutral-100 whitespace-pre">
        {props.code}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="absolute top-2 right-2 z-10 h-7 gap-1 border-neutral-600 bg-neutral-900 px-2 text-[11px] text-neutral-100 hover:bg-neutral-800 hover:text-white"
        onClick={() => void onCopy()}
      >
        {copied ? (
          <>
            <Check className="size-3" />
            {props.copiedLabel}
          </>
        ) : (
          <>
            <Copy className="size-3" />
            {props.copyLabel}
          </>
        )}
      </Button>
    </div>
  );
}

function SectionTitle(props: {
  id: string;
  icon: LucideIcon;
  title: string;
  desc?: string;
}) {
  const Icon = props.icon;
  return (
    <div id={props.id} className="scroll-mt-6 space-y-1">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-900">
          <Icon className="size-4" />
        </span>
        <h2 className="text-base font-semibold text-slate-900">{props.title}</h2>
      </div>
      {props.desc ? (
        <p className="pl-10 text-xs leading-relaxed text-slate-500">
          {props.desc}
        </p>
      ) : null}
    </div>
  );
}

function TipList(props: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {props.items.map((item) => (
        <li
          key={item}
          className="flex gap-2 text-xs leading-relaxed text-slate-600"
        >
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function EnvRow(props: { name: string; desc: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-3">
      <code className="font-mono text-[11px] font-semibold text-neutral-900">
        {props.name}
      </code>
      <p className="text-xs leading-relaxed text-slate-600">{props.desc}</p>
    </div>
  );
}

export function HomePage(props: {
  config: PublicConfig | null;
  onGo: (tab: HomeTabTarget) => void;
}) {
  const { t } = useI18n();

  const deploy = useMemo(() => {
    const trustHost = joinHostList(props.config?.trustHost, DEFAULT_TRUST_HOST);
    const notTrustHost = joinHostList(
      props.config?.notTrustHost,
      DEFAULT_NOT_TRUST_HOST,
    );
    const currentPort = props.config?.port || 8012;
    const shared = { trustHost, notTrustHost };

    return {
      trustHost,
      notTrustHost,
      currentPort,
      current: buildDockerRun({
        comment: `Current instance — PORT=${currentPort}`,
        name: currentPort === 8013 ? "nodefileview-test" : "nodefileview",
        port: currentPort,
        ...shared,
      }),
      prod: buildDockerRun({
        comment: "Production — container listens on 8012",
        name: "nodefileview",
        port: 8012,
        ...shared,
      }),
      test: buildDockerRun({
        comment: "Test — container listens on 8013",
        name: "nodefileview-test",
        port: 8013,
        ...shared,
      }),
    };
  }, [props.config]);

  const formatCards = [
    {
      title: t("home.fmtWord"),
      desc: t("home.fmtWordDesc"),
      tags: ["docx", "doc", "wps", "odt"],
    },
    {
      title: t("home.fmtExcel"),
      desc: t("home.fmtExcelDesc"),
      tags: ["xlsx", "xls", "csv", "tsv"],
    },
    {
      title: t("home.fmtPptPdf"),
      desc: t("home.fmtPptPdfDesc"),
      tags: ["pptx", "ppt", "pdf"],
    },
    {
      title: t("home.fmtImage"),
      desc: t("home.fmtImageDesc"),
      tags: ["jpg", "png", "webp", "heic", "svg"],
    },
    {
      title: t("home.fmtText"),
      desc: t("home.fmtTextDesc"),
      tags: ["md", "txt", "json", "js", "ts", "py"],
    },
    {
      title: t("home.fmtArchive"),
      desc: t("home.fmtArchiveDesc"),
      tags: ["zip", "rar", "7z", "tar", "gz"],
    },
    {
      title: t("home.fmtMedia"),
      desc: t("home.fmtMediaDesc"),
      tags: ["mp4", "webm", "mp3", "wav"],
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
        <Button size="sm" variant="outline" onClick={() => props.onGo("files")}>
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
          onClick={() => props.onGo("playground")}
        >
          {t("home.ctaPlayground")}
        </Button>
      ),
    },
  ];

  const toc = [
    { href: "#guide-flow", label: t("home.tocFlow") },
    { href: "#guide-deploy", label: t("home.tocDeploy") },
    { href: "#guide-proxy", label: t("home.tocProxy") },
    { href: "#guide-api", label: t("home.tocApi") },
    { href: "#guide-formats", label: t("home.tocFormats") },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-6 py-8 md:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, #e8e8e8, transparent), radial-gradient(ellipse 50% 60% at 100% 100%, #f0f0f0, transparent)",
          }}
        />
        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-900">
            <BookOpen className="size-3.5" />
            {t("home.badge")}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              nodeFileView
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
              {t("home.intro")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => props.onGo("files")}>
              {t("home.ctaFiles")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => props.onGo("playground")}
            >
              {t("home.ctaPlayground")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {toc.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full border border-neutral-300 bg-white/80 px-3 py-1 text-[11px] font-medium text-neutral-700",
                  "transition hover:border-neutral-900 hover:bg-neutral-900 hover:text-white",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          id="guide-flow"
          icon={FileText}
          title={t("home.guideTitle")}
          desc={t("home.guideDesc")}
        />
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="shadow-xs">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-xs font-bold text-neutral-900">
                      {i + 1}
                    </span>
                    <Icon className="size-4 text-slate-400" />
                  </div>
                  <CardTitle className="text-sm">{step.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {step.desc}
                  </CardDescription>
                  {step.action ? <div className="pt-1">{step.action}</div> : null}
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          id="guide-deploy"
          icon={Terminal}
          title={t("home.deployTitle")}
          desc={t("home.deployDesc")}
        />

        <Card className="shadow-xs border-neutral-300">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-900">
                {t("home.deployCurrentBadge")}
              </Badge>
              <CardTitle className="text-sm">
                {t("home.deployCurrentTitle", { port: String(deploy.currentPort) })}
              </CardTitle>
            </div>
            <CardDescription className="text-xs leading-relaxed">
              {t("home.deployCurrentDesc")}
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-500">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                PORT={deploy.currentPort}
              </code>
            </div>
          </CardHeader>
          <CardContent>
            <CodeBlock
              code={deploy.current}
              copyLabel={t("home.copy")}
              copiedLabel={t("home.copied")}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Badge className="border border-neutral-900 bg-white text-neutral-900 hover:bg-white">
                  {t("home.deployProdBadge")}
                </Badge>
                <CardTitle className="text-sm">{t("home.deployProdTitle")}</CardTitle>
              </div>
              <CardDescription className="text-xs leading-relaxed">
                {t("home.deployProdDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                code={deploy.prod}
                copyLabel={t("home.copy")}
                copiedLabel={t("home.copied")}
              />
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Badge className="border border-neutral-400 bg-neutral-100 text-neutral-900 hover:bg-neutral-100">
                  {t("home.deployTestBadge")}
                </Badge>
                <CardTitle className="text-sm">{t("home.deployTestTitle")}</CardTitle>
              </div>
              <CardDescription className="text-xs leading-relaxed">
                {t("home.deployTestDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                code={deploy.test}
                copyLabel={t("home.copy")}
                copiedLabel={t("home.copied")}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("home.deployEnvTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {t("home.deployEnvDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnvRow name="PORT" desc={t("home.deployEnvPort")} />
            <EnvRow name="-p" desc={t("home.deployEnvPublish")} />
            <EnvRow name="BASIC_AUTH_*" desc={t("home.deployEnvAuth")} />
            <EnvRow name="BASE_URL" desc={t("home.deployEnvBase")} />
            <EnvRow name="TRUST_HOST" desc={t("home.deployEnvTrust")} />
            <EnvRow name="NOT_TRUST_HOST" desc={t("home.deployEnvNotTrust")} />
            <EnvRow name="-v data" desc={t("home.deployEnvData")} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle
          id="guide-proxy"
          icon={Globe2}
          title={t("home.proxyTitle")}
          desc={t("home.proxyDesc")}
        />
        <Card className="shadow-xs">
          <CardContent className="space-y-4 pt-5">
            <TipList
              items={[
                t("home.proxyTip1"),
                t("home.proxyTip2"),
                t("home.proxyTip3"),
                t("home.proxyTip4"),
              ]}
            />
            <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-xs leading-relaxed text-neutral-800">
              {t("home.proxyCfWarn")}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <SectionTitle
            id="guide-api"
            icon={Link2}
            title={t("home.apiTitle")}
            desc={t("home.apiDesc")}
          />
          <Card className="shadow-xs">
            <CardContent className="space-y-3 pt-5">
              <CodeBlock
                code={API_SNIPPET}
                copyLabel={t("home.copy")}
                copiedLabel={t("home.copied")}
              />
              <p className="text-xs leading-relaxed text-slate-500">
                {t("home.apiHint")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => props.onGo("playground")}
              >
                {t("home.ctaPlayground")}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <SectionTitle
            id="guide-security"
            icon={Shield}
            title={t("home.securityTitle")}
          />
          <Card className="shadow-xs">
            <CardContent className="space-y-3 pt-5">
              <p className="text-xs leading-relaxed text-slate-600">
                {t("home.securityDesc")}
              </p>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold text-slate-800">
                  {t("home.outTitle")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {t("home.outDesc")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle
          id="guide-formats"
          icon={BookOpen}
          title={t("home.formatsTitle")}
          desc={t("home.formatsDesc")}
        />
        <Card className="shadow-xs">
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {formatCards.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {item.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {item.desc}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      .{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
