# nodeFileView

在线文件预览服务（Node.js + React + Tailwind CSS + shadcn/ui），一期支持 Office→PDF、图片交互、文本高亮、压缩包浏览、音视频直预览，以及 AES / Basic Auth / 水印等接入控制。

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
- API / 预览服务：http://127.0.0.1:8013
- 旧 demo 模板（可选对照）：http://127.0.0.1:8013/__demo/console7

生产构建后由服务端托管前端：

```bash
pnpm build
pnpm start
# 打开 http://127.0.0.1:8013
```

### Docker

镜像内已包含 LibreOffice 与 CJK 字体。控制台密码在**启动容器时**用环境变量注入（不会写进镜像）：

```bash
# 方式 1：命令行直接带密码启动
BASIC_AUTH_USER=admin BASIC_AUTH_PASS='你的强密码' \
  docker compose -f docker/docker-compose.yml up -d --build

# 方式 2：写在 docker/.env（推荐，勿提交 Git）
cp docker/.env.example docker/.env
# 编辑 docker/.env 里的 BASIC_AUTH_PASS
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build

# 打开 http://127.0.0.1:8013 用上面的账号密码登录控制台
```

仅 `docker run` 时同样用 `-e`：

```bash
docker run --rm -p 8013:8013 -v "$PWD/data:/app/data" \
  -e BASIC_AUTH_ENABLED=true \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_PASS='你的强密码' \
  nodefileview
```

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 服务端口 | `8013` |
| `DATA_DIR` | 上传/缓存/临时目录根 | `./data` |
| `MAX_UPLOAD_SIZE_MB` | 最大上传 | `200` |
| `BASIC_AUTH_ENABLED` | 控制台登录锁（上传/删除/监控等） | 本地开发 `false`；Docker 默认 `true` |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | 控制台账号密码（Docker `environment` / `.env` 注入） | `admin` / `admin123` |
| `AES_ENABLED` | url 参数 AES-128-CBC | `false` |
| `AES_KEY` / `AES_IV` | 16 字节密钥与 IV | `0123456789abcdef` |
| `PREVIEW_PASSWORD` | 预览口令（非空则启用） | 空 |
| `BLOCK_PRIVATE_IP` | 远程 URL 禁私网（SSRF） | `true` |
| `LIBREOFFICE_PATH` | soffice 可执行文件 | `soffice` |
| `FORCE` / `forceUpdatedCache` | 查询参数刷新转换缓存 | — |

## 预览接入

```
GET /onlinePreview?url=<base64或AES>&watermarkTxt=内部资料&page=1&highlight=合同&forceUpdatedCache=true&password=xxx
```

- `url`：文件地址，支持 `https://...` 或上传后的 `file://local/{fileId}`，默认 Base64；开启 AES 后按 AES-128-CBC 加密再 Base64。
- 本地上传后可在首页点「预览」，或调用：

```bash
curl -F file=@demo.docx http://127.0.0.1:8013/api/upload
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

**支持：** DOCX（Word 版式/目录/编辑）、XLSX/XLS/CSV 网格、PPTX 幻灯片、PDF 增强、图片（含 HEIC）、Markdown GFM、源码高亮、压缩包目录树、音视频播放；其它 Office/WPS/ODF 经 LibreOffice→PDF。

**不做：** CAD/3D、邮件、ofd/epub/xmind 等专项、音视频转码、真实 FTP 拉取（首页保留参数位）。

## 安全说明

- **控制台锁**：`BASIC_AUTH_ENABLED=true` 时，首页需账号密码；密码用 Docker/`environment` 或 `.env` 注入即可（常见做法）。私网部署够用；公网务必换强密码并上 HTTPS。密码会进容器环境变量，不要写进镜像层或提交到 Git。`/onlinePreview` 等预览链路不要求此账号（另可用 `PREVIEW_PASSWORD`）。
- 上传扩展名白名单，禁止可执行后缀
- 路径均限制在 `data/` 根目录内
- 远程拉取仅 http(s)，可选拦截私网 IP
- LibreOffice 转换超时强制结束
- 响应头包含 `X-Content-Type-Options`、`X-Frame-Options` 等
