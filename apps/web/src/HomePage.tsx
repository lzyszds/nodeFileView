import {
  BookOpen,
  FileText,
  Link2,
  Shield,
  Upload,
  type LucideIcon,
} from "lucide-react";
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

type HomeTabTarget = "files" | "playground";

export function HomePage(props: {
  onGo: (tab: HomeTabTarget) => void;
}) {
  const { t } = useI18n();

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

  const steps: Array<{ icon: LucideIcon; title: string; desc: string }> = [
    {
      icon: Upload,
      title: t("home.step1Title"),
      desc: t("home.step1Desc"),
    },
    {
      icon: Link2,
      title: t("home.step2Title"),
      desc: t("home.step2Desc"),
    },
    {
      icon: FileText,
      title: t("home.step3Title"),
      desc: t("home.step3Desc"),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-6 py-8 md:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, #e0e7ff, transparent), radial-gradient(ellipse 50% 60% at 100% 100%, #f1f5f9, transparent)",
          }}
        />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium text-indigo-700">
            <BookOpen className="size-3.5" />
            {t("home.badge")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            nodeFileView
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
            {t("home.intro")}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
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
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <Card key={step.title} className="shadow-xs">
              <CardHeader className="space-y-3 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700">
                    {i + 1}
                  </span>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <CardTitle className="text-sm">{step.title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {step.desc}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm">{t("home.formatsTitle")}</CardTitle>
            <CardDescription>{t("home.formatsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
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

        <div className="space-y-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm">{t("home.apiTitle")}</CardTitle>
              <CardDescription>{t("home.apiDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-xl border bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {`GET /onlinePreview
  ?url=<base64|aes>
  &watermarkTxt=...
  &page=1
  &highlight=...
  &lang=zh
  &forceUpdatedCache=true`}
              </pre>
              <p className="text-xs leading-relaxed text-slate-500">
                {t("home.apiHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader className="flex flex-row items-start gap-2 space-y-0">
              <Shield className="mt-0.5 size-4 text-emerald-600" />
              <div>
                <CardTitle className="text-sm">{t("home.securityTitle")}</CardTitle>
                <CardDescription className="mt-1.5 leading-relaxed">
                  {t("home.securityDesc")}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm">{t("home.outTitle")}</CardTitle>
              <CardDescription className="leading-relaxed">
                {t("home.outDesc")}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}
