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

镜像内已包含 LibreOffice 与 CJK 字体。安全相关配置在**启动容器时**用 `-e` 注入（对齐 kkFileView 风格）。

**推荐：下次直接跑脚本**

```bash
# 先改 docker/run.sh 里的密码 / TRUST_HOST，或用环境变量覆盖
BASIC_AUTH_PASS='你的强密码' ./docker/run.sh
```

脚本路径：[`docker/run.sh`](docker/run.sh)（会构建镜像、绑定 `127.0.0.1:8013`、挂载 `./data`）。

**或 Compose**

```bash
cp docker/.env.example docker/.env   # 改密码与 TRUST_HOST
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

**或手写 docker run**

```bash
docker run -d --name nodefileview --restart=always \
  --platform linux/amd64 \
  -p 127.0.0.1:8013:8013 \
  -v "$PWD/data:/app/data" \
  -e BASIC_AUTH_ENABLED=true \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_PASS='你的强密码' \
  -e BASE_URL=https://preview.qqlink.info \
  -e 'TRUST_HOST=*.my-imcloud.com,*.chat.qqlink.*' \
  -e 'NOT_TRUST_HOST=localhost,127.0.0.1,0.0.0.0,169.254.*,192.168.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*' \
  nodefileview
```
## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 服务端口 | `8013` |
| `DATA_DIR` | 上传/缓存/临时目录根 | `./data` |
| `MAX_UPLOAD_SIZE_MB` | 最大上传 | `200` |
| `MAX_ARCHIVE_ENTRY_MB` | 压缩包单文件解压上限 | `100` |
| `BASIC_AUTH_ENABLED` | 控制台登录锁 | 本地 `false`；Docker `true` |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | 控制台账号密码 | `admin` / 请改 |
| `BASE_URL` | 对外基址（展示/接入用） | 空 |
| `TRUST_HOST` | 远程 URL 主机白名单（`*` 通配，空=不额外限制） | 空 |
| `NOT_TRUST_HOST` | 远程 URL 主机黑名单 | localhost / 私网段等 |
| `BLOCK_PRIVATE_IP` | DNS 解析后禁私网 IP | `true` |
| `AES_ENABLED` | url 参数 AES-128-CBC | `false` |
| `AES_KEY` / `AES_IV` | 16 字节密钥与 IV | `0123456789abcdef` |
| `PREVIEW_PASSWORD` | 预览口令（非空则启用） | 空 |
| `LIBREOFFICE_PATH` | soffice 可执行文件 | `soffice` |
| `ALLOW_EMBED` | 允许 iframe / webview 嵌预览 | `true` |
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

- **控制台锁**：`BASIC_AUTH_ENABLED=true` 时，首页需账号密码；Docker/`-e` 注入。`TRUST_HOST` / `NOT_TRUST_HOST` 限制远程拉取（跳转每跳复检）。HTML/JS 经 `/api/raw|/api/remote` 强制下载，避免同源挂马。
- 上传扩展名白名单，禁止可执行后缀
- 路径均限制在 `data/` 根目录内
- 远程拉取仅 http(s)，默认拦截私网 IP 与 IPv4-mapped IPv6
- LibreOffice 转换超时强制结束
- 响应头包含 `X-Content-Type-Options` 等
