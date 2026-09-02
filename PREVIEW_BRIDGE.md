# Preview Tool Bridge（filePreview → 其他 WebView 的工具方法接入）

当你在**另一个 WebView**（例如：自建页面 / 你们自己的 WebApp / 第三方 Webview）里嵌入 filePreview 的预览页面时，filePreview 默认会**隐藏所有顶部工具条/按钮**，但仍会把内部“工具动作”以统一协议暴露给宿主，让你用自己的 UI 按钮去调用。

本文档说明如何接入这些“工具方法”。

---

## 1. 预览页会发什么消息（预览 → 宿主）

预览页在 iframe 内运行，默认会通过 `window.postMessage` 把事件发给父窗口。

宿主可以监听：

```js
window.addEventListener("message", (event) => {
  const data = event.data;
  // data.source / data.type / data.detail
});
```

消息结构：

```ts
{
  source: "filePreviewPreview",
  type: string,          // 事件类型
  detail: any            // 事件数据
}
```

常见 `type`：

- `ready`
  - `detail` 包含：`{ title, actions, state }`
- `actions-change`
  - `detail` 包含：`{ actions: Array<{ id, label, kind, disabled }> }`
- `state-change`
  - `detail` 是状态对象（预览器内部更新，例如当前页、缩放比例、搜索关键词等）
- `action-invoked`
  - `detail` 包含：`{ id, payload }`（宿主触发动作后预览器收到请求）
- `action-result`
  - `detail` 包含：`{ id, result }`
- `action-error`
  - `detail` 包含：`{ id, message }`

> 注：预览页也会在 iframe 内触发 `CustomEvent("nfv-preview:" + type)`，但跨 iframe 通常用 `postMessage` 即可。

---

## 2. 宿主如何调用动作（宿主 → 预览）

宿主向预览 iframe 发送消息：

```js
iframe.contentWindow?.postMessage(
  {
    source: "filePreviewHost",
    type: "invoke-action",
    actionId: "zoomIn",      // 要调用的动作 id
    payload: {}             // 可选参数（不同动作格式不同）
  },
  "*"
);
```

预览页收到后，会调用对应的内部按钮/方法。

> 兼容说明：预览页还会尝试调用宿主提供的全局桥对象：`window.filePreviewHost` / `window.previewHostBridge` / `window.electronAPI`。
> 只要宿主对象实现 `postMessage(payload)`、或 `emit(type, detail)`、或 `send(channel, payload)` 之一，就可以接收同样的消息。

---

## 3. 宿主接入步骤（推荐做法）

1. 创建 iframe，指向预览地址（如 `/onlinePreview?...`）。
2. 监听 `message`，等待 `ready` 或 `actions-change`。
3. 根据 `actions` 数组渲染你自己的按钮 UI（`disabled` 用于灰显）。
4. 点击按钮时，向 iframe 发送 `invoke-action`。
5. 如需展示状态（例如当前页码/缩放比例），监听 `state-change`。

---

## 4. 示例：接入 PDF 的缩放/翻页按钮

假设你把 PDF 预览放进 `iframe`：

```html
<iframe id="nfvFrame" style="width:100%;height:100%;border:0"></iframe>
```

宿主侧逻辑（简化示例）：

```js
const iframe = document.getElementById("nfvFrame");

function invoke(actionId, payload = {}) {
  iframe.contentWindow?.postMessage(
    {
      source: "filePreviewHost",
      type: "invoke-action",
      actionId,
      payload,
    },
    "*"
  );
}

window.addEventListener("message", (event) => {
  if (event.data?.source !== "filePreviewPreview") return;
  if (event.source !== iframe.contentWindow) return; // 多 iframe 时建议加过滤

  const { type, detail } = event.data;
  if (type === "ready" || type === "actions-change") {
    // detail.actions: [{id,label,disabled,...}]
    // 你可以用它构建按钮
    console.log(detail.actions);
  }

  if (type === "state-change") {
    // 例如 pdf: { kind:"pdf", page, total }
    console.log(detail);
  }

  if (type === "action-result") {
    console.log("result:", detail);
  }
});

// 你的 UI 按钮点击时调用
document.getElementById("btnZoomIn").onclick = () => invoke("zoomIn");
document.getElementById("btnNext").onclick = () => invoke("nextPage");
```

---

## 5. Excel 的“查找”动作（带参数）

Excel 预览器暴露的动作里包含一个 `search` 方法型动作：

- `actionId`: `search`
- `payload`: `{ keyword: string }`
- 调用效果：高亮并跳转到匹配的单元格

示例：

```js
invoke("search", { keyword: "合同" });
```

---

## 5.1 转发 `forward`（DOCX / Excel / 文本 / Markdown）

页内有「转发」按钮；同时通过 bridge 透出同名方法。点击或 `invoke("forward")` 时，会把**当前文件二进制**回传给宿主（含编辑后的内容）。

payload：

```ts
{
  kind: "docx" | "excel" | "text" | "markdown",
  title: string,
  fileName: string,
  mimeType: string,
  dirty: boolean,
  byteLength: number,
  data: ArrayBuffer,   // 推荐：postMessage 结构化克隆可直接拿到
  base64: string,      // 备用：JSON/字符串 IPC 通道用
  fileUrl?: string,    // 原预览地址（DOCX/Excel）
  sheet?: string,      // Excel 当前表
  language?: string,   // 文本语言
}
```

宿主示例：

```js
window.addEventListener("message", (event) => {
  if (event.data?.source !== "filePreviewPreview") return;
  if (event.data.type !== "forward") return;

  const { fileName, mimeType, data, base64 } = event.data.detail;

  // 方式 A：ArrayBuffer → Blob / FormData
  const blob = new Blob([data], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, fileName);
  // await fetch("/your-upload", { method: "POST", body: form });

  // 方式 B：base64（WebView 只支持 JSON 时）
  // const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
});

// 宿主主动触发
invoke("forward");
```

> 编辑 / 保存仍为页内能力，不通过 bridge 外透。转发会带上当前内容的二进制（已修改则导出编辑后文件）。

---

## 6. 预览器动作清单（当前实现）

不同文件类型会注册不同的动作。预览页会把可用动作通过 `ready/actions-change` 下发给宿主，你应以 `actions` 为准，而不要写死。

当前实现里常见动作 id 包括：

- `pdf`：`zoomIn` `zoomOut` `fitWidth` `prevPage` `nextPage` `fsBtn` `toggleThumbs`
- `image`：`zoomIn` `zoomOut` `rotateR` `flipH` `flipV` `fit` `reset` `download`
- `media`：`pipBtn` `fsBtn` `dlBtn`
- `text`：`zoomIn` `zoomOut` `copyBtn` `wrapBtn` + **`forward`**
- `html`：`reloadBtn` `sourceBtn` `openBtn`
- `pptx`：`prevBtn` `nextBtn` `fsBtn`
- `docx`：`toggleSidebar` `refreshOutline` `zoomIn` `zoomOut` `fitWidth` `fitPage` `printBtn` + **`forward`**
- `excel`：缩放/冻结等 + `search` + **`forward`**
- `markdown`：**`forward`**

---

## 7. 多 WebView/多 iframe 的注意点

- 建议在 `message` 事件里过滤：`event.source === iframe.contentWindow`，避免不同 iframe 的事件串扰。
- `action-result` 当前只带 `id` 和 `result`，没有 requestId。若你会同时触发多个动作，建议保持串行调用，或在宿主侧做队列管理。

---

## 8. 你可能需要的二次封装

如果你的 Webview 框架（比如某个 RN WebView / Flutter WebView / Electron renderer）已经有自己的 IPC 通道，你可以把：
- `actions-change/ready/state-change` → 转成你的事件
- `invoke-action` → 转成你自己的“工具方法调用”

让外部按钮始终只依赖宿主层，而不依赖 iframe 内部 DOM。

