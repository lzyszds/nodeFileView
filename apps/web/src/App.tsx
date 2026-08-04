import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  deleteFile,
  encodeUrl,
  fetchPublicConfig,
  formatSize,
  listFiles,
  uploadFile,
  type FileItem,
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
    title: "Office / WPS / ODF",
    desc: "doc/docx/xls/xlsx/ppt/pptx/csv · wps/dps/et · odt/ods/odp → PDF",
  },
  {
    title: "图片",
    desc: "jpg/png/gif/bmp/webp/svg/tiff · 缩放 / 翻转 / 镜像 / 拖拽",
  },
  {
    title: "文本与源码",
    desc: "txt/md/xml/java/js/css/py/php · 语法高亮",
  },
  {
    title: "压缩包",
    desc: "zip/jar/tar/gzip · 目录浏览与内部预览",
  },
  {
    title: "音视频",
    desc: "mp3/wav/mp4/webm/mov · 原生播放（一期不转码）",
  },
];

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
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

  const pageSize = 10;

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
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          node<span className="text-primary">FileView</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
          在线文件预览一期：Office→PDF、图片交互、文本高亮、压缩包浏览、音视频直预览；
          支持 AES / Basic Auth / 水印 / 页码 / 高亮 / 缓存刷新。
        </p>
        <div className="flex flex-wrap gap-2">
          {configHints.map((h) => (
            <Badge key={h} variant="secondary">
              {h}
            </Badge>
          ))}
        </div>
      </header>

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
        </div>
      </div>
    </div>
  );
}
