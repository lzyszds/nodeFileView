import { Transform } from "node:stream";

/** 流式下载时提前截断超大文件，避免落盘后再删 */
export function createMaxBytesTransform(maxBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > maxBytes) {
        cb(new Error("Remote file exceeds max size"));
        return;
      }
      cb(null, chunk);
    },
  });
}
