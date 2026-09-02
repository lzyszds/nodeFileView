# filePreview

在线文件预览服务（Node.js + React + Tailwind CSS + shadcn/ui），一期支持 Office→PDF、图片交互、文本高亮、压缩包浏览、音视频直预览，以及 AES / Basic Auth / 水印等接入控制。

控制台与预览页支持多语言：`zh` / `zh-HK` / `en` / `ja` / `ko` / `th` / `vi` / `id` / `ms`。预览可用 `?lang=`，控制台右上角切换；词条在仓库根目录 `locales/`。

## 技术栈

- 后端：Node.js + Fastify + TypeScript + LibreOffice
- 前端：React + Vite + Tailwind CSS v4 + shadcn/ui
- 部署：Docker Compose（镜像内置 LibreOffice）


### 本地开发

前置：Node.js ≥ 20、pnpm、本机已安装 LibreOffice（`soffice` 在 PATH 中）。

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- 演示首页（Vite）：http://127.0.0.1:5173 （React + Tailwind 侧栏控制台）
- API / 预览服务：http://127.0.0.1:6001
- 旧 demo 模板（可选对照）：http://127.0.0.1:6001/__demo/console7

生产构建后由服务端托管前端：

```bash
pnpm build
pnpm start
# 打开 http://127.0.0.1:6001
```

### Docker

镜像内已包含 LibreOffice 与 CJK 字体。

**分工**

1. **GitHub Actions**：云端打出 `linux/amd64` 镜像并推到 GHCR（本机 arm64 不必 build）。
2. **服务器**：`docker pull` + `docker run -e ...` 启动。

Workflow：[`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml)  
推送 `main`/`master` 或手动跑 `Docker Build (amd64)`。

镜像：`ghcr.io/<owner>/filePreview:1.0.0`  
（私有包：`echo $GH_TOKEN | docker login ghcr.io -u USER --password-stdin`）

**服务器上运行（主流程）**

不写的项会用镜像/代码默认值：

| 项 | 不写会怎样 |
|---|---|
| 端口 | 容器内默认 `6001`；外面用 `-p 宿主机端口:6001` 映射 |
| `NOT_TRUST_HOST` | **自带默认**（localhost / 私网段等），一般不用再写 |
| `TRUST_HOST` | 空 = 不额外白名单（仍拦私网 / NOT_TRUST） |
| `BASIC_AUTH_*` | 默认开启登录；本地直通时可显式设为 `false` |
| `BASE_URL` | 可选，仅展示/接入用 |

**精简版（推荐最少写这些）：**

```bash
docker pull --platform linux/amd64 ghcr.io/<owner>/filePreview:1.0.0

docker run -d --name filePreview --restart=always \
  --platform linux/amd64 \
  -p 127.0.0.1:6001:6001 \
  -v /path/to/data:/app/data \
  -e BASIC_AUTH_ENABLED=true \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_PASS='你的强密码' \
  -e 'TRUST_HOST=*.my-imcloud.com,*.chat.qqlink.*' \
  ghcr.io/<owner>/filePreview:1.0.0
```

只有当你的文件域名不在默认黑名单、又想限制「只能拉这些域名」时，才需要 `TRUST_HOST`。  
`NOT_TRUST_HOST` / `BASE_URL` 可按需再加；端口改外面 `-p` 即可，例如 `-p 6001:6001`。

把命令存到服务器脚本即可（例如 `/opt/filePreview/run.sh`）。仓库里的 `docker/run.sh` 只是可选本地调试工具。

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 服务端口 | `6001` |
| `DATA_DIR` | 上传/缓存/临时目录根 | `./data` |
| `MAX_UPLOAD_SIZE_MB` | 最大上传 / 远程下载 | `100` |
| `MAX_ARCHIVE_ENTRY_MB` | 压缩包单文件解压上限 | `100` |
| `BASIC_AUTH_ENABLED` | 控制台登录锁 | `true`（本地直通时显式设为 `false`） |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | 控制台账号密码 | `admin` / 代码内默认（可用 env 覆盖） |
| `BASE_URL` | 对外基址（展示/接入用） | 空 |
| `TRUST_HOST` | 远程 URL 主机白名单（`*` 通配，空=不额外限制） | 空 |
| `NOT_TRUST_HOST` | 远程 URL 主机黑名单 | localhost / 私网段等 |
| `BLOCK_PRIVATE_IP` | DNS 解析后禁私网 IP | `true` |
| `AES_ENABLED` | url 参数 AES-128-CBC | `false` |
| `AES_KEY` / `AES_IV` | 16 字节密钥与 IV | `0123456789abcdef` |
| `PREVIEW_PASSWORD` | 预览口令（非空则启用） | 空 |
| `LIBREOFFICE_PATH` | soffice 可执行文件 | `soffice` |
| `ALLOW_EMBED` | 允许 iframe / webview 嵌预览 | `true` |
| `RATE_LIMIT_MAX` | 全局限流（控制台/API） | `300` |
| `RATE_LIMIT_UPLOAD_MAX` | 上传接口限流 | `30` |
| `RATE_LIMIT_PREVIEW_EXEMPT` | 预览读路径豁免限流（IM 嵌入推荐 `true`） | `true` |
| `CONVERT_MAX_CONCURRENT` | LibreOffice 同时转码数 | `2` |
| `REMOTE_DOWNLOAD_TIMEOUT_MS` | 远程文件下载超时 | `120000` |
| `HOT_REMOTE_CACHE_MS` | 远程命中内存缓存 TTL | `60000` |
| `CLUSTER_WORKERS` | Node 集群 worker 数（`0/1`=单进程） | `0` |
| `COMPRESS_ENABLED` | 响应 gzip/br 压缩 | `true` |
| `LOG_REQUESTS` | 打印每条 HTTP 访问日志 | 生产 `false` |
| `CACHE_TTL_DAYS` | 转码 PDF 磁盘缓存保留天数 | `7` |
| `REMOTE_CACHE_TTL_DAYS` | 远程文件磁盘缓存保留天数 | `7` |
| `TEMP_TTL_HOURS` | 临时文件（serve-/arc-）保留小时数 | `24` |
| `CACHE_CLEANUP_INTERVAL_MS` | 后台清理间隔；`0`=禁用 | `3600000` |
| `CACHE_MAX_MB` | 缓存总容量上限（MB）；`0`=不限制 | `0` |
| `FORCE` / `forceUpdatedCache` | 查询参数刷新转换缓存 | — |

## 预览接入

```
GET /onlinePreview?url=<base64或AES>&watermarkTxt=内部资料&page=1&highlight=合同&forceUpdatedCache=true&password=xxx
```

- `url`：文件地址，支持 `https://...` 或上传后的 `file://local/{fileId}`，默认 Base64；开启 AES 后按 AES-128-CBC 加密再 Base64。
- 本地上传后可在首页点「预览」，或调用：

```bash
curl -F file=@demo.docx http://127.0.0.1:6001/api/upload
```

## 主要 API

- `GET /health`
- `GET /api/auth/status` · `POST /api/auth/login` · `POST /api/auth/logout`
- `GET /api/config/public`
- `POST /api/upload`
- `GET /api/files?page&size&q`
- `DELETE /api/files/:fileId`
- `POST /api/encode-url` `{ url, useAes }`
- `GET /onlinePreview?...`
- `GET /api/raw/:fileId`
- `GET /api/cache/:name`
- `GET /api/archive/:fileId/list`
- `GET /api/archive/:fileId/entry?path=`

## 一期范围

**支持：** DOCX（Word 版式/目录/编辑）、XLSX/XLS/CSV 网格、PPTX 幻灯片、PDF 增强、RTF（LibreOffice→PDF）、图片（含 HEIC）、Markdown GFM、更多源码高亮、压缩包目录树（zip/rar/7z/tar/gz，含远程）、音视频播放；其它 Office/WPS/ODF 经 LibreOffice→PDF。

**不做：** CAD/3D、邮件、ofd/epub/xmind 等专项、音视频转码、真实 FTP 拉取（首页保留参数位）。

## 安全说明

- **控制台锁**：`BASIC_AUTH_ENABLED=true` 时，首页需账号密码；Docker/`-e` 注入。`TRUST_HOST` / `NOT_TRUST_HOST` 限制远程拉取（跳转每跳复检）。HTML/JS 经 `/api/raw|/api/remote` 强制下载，避免同源挂马。
- 上传扩展名白名单，禁止可执行后缀
- 路径均限制在 `data/` 根目录内
- 远程拉取仅 http(s)，默认拦截私网 IP 与 IPv4-mapped IPv6
- LibreOffice 转换超时强制结束
- 响应头包含 `X-Content-Type-Options` 等
