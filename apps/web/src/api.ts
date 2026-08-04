export interface PublicConfig {
  aesEnabled: boolean;
  basicAuthEnabled: boolean;
  previewPasswordEnabled: boolean;
  maxUploadSizeMb: number;
  ftpEnabled: boolean;
}

export interface FileItem {
  fileId: string;
  name: string;
  size: number;
  ext: string;
  mime: string;
  createdAt: string;
  previewUrl: string;
}

export interface FileListResponse {
  total: number;
  page: number;
  size: number;
  items: FileItem[];
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/config/public");
  return parseJson(res);
}

export async function listFiles(params: {
  page: number;
  size: number;
  q: string;
}): Promise<FileListResponse> {
  const qs = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
    q: params.q,
  });
  const res = await fetch(`/api/files?${qs}`);
  return parseJson(res);
}

export async function uploadFile(file: File): Promise<FileItem & { localUrl: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  return parseJson(res);
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
  await parseJson(res);
}

export async function encodeUrl(url: string, useAes: boolean): Promise<string> {
  const res = await fetch("/api/encode-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, useAes }),
  });
  const data = await parseJson<{ encoded: string }>(res);
  return data.encoded;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
