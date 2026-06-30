export interface UploadResult {
  url: string;
  fileName: string;
  ossId: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const PLUGIN_API_KEY = import.meta.env.VITE_PLUGIN_API_KEY ?? 'test-plugin-key-123456';

/**
 * 分片上传核心逻辑
 * @param file 要上传的 Blob 或 File 对象
 * @param fileName 原始文件名
 * @param chunkSize 分片大小，默认 2MB
 * @param onProgress 进度回调 (0-100)
 * @returns 最终 OSS 文件的信息
 */
export async function uploadAudioInChunks(
  file: Blob,
  fileName: string,
  chunkSize: number = 2 * 1024 * 1024,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID();

  // 1. 串行/并发上传所有分片
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    await uploadSingleChunk(uploadId, i, chunk, fileName);

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalChunks) * 90)); // 前 90% 进度留给切片上传
    }
  }

  // 2. 调用合并接口
  const mergeData = await mergeChunks(uploadId, fileName, totalChunks);

  if (onProgress) {
    onProgress(100);
  }

  return mergeData;
}

/**
 * 单独上传一个切片 (流式使用)
 */
export async function uploadSingleChunk(
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  fileName: string
): Promise<void> {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('chunkIndex', String(chunkIndex));
  formData.append('file', chunk, `${fileName}.part${chunkIndex}`);

  const res = await fetch(`${API_BASE_URL}/medical/pluginRuntime/oss/upload/chunk`, {
    method: 'POST',
    headers: { 'X-Plugin-Key': PLUGIN_API_KEY },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`分片 ${chunkIndex} 上传失败: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.code !== 200) {
    throw new Error(`分片 ${chunkIndex} 上传业务失败: ${data.msg}`);
  }
}

/**
 * 单独调用合并接口 (流式使用)
 */
export async function mergeChunks(
  uploadId: string,
  fileName: string,
  totalChunks: number
): Promise<UploadResult> {
  const mergeFormData = new FormData();
  mergeFormData.append('uploadId', uploadId);
  mergeFormData.append('fileName', fileName);
  mergeFormData.append('totalChunks', String(totalChunks));

  const mergeRes = await fetch(`${API_BASE_URL}/medical/pluginRuntime/oss/upload/merge`, {
    method: 'POST',
    headers: { 'X-Plugin-Key': PLUGIN_API_KEY },
    body: mergeFormData,
  });

  if (!mergeRes.ok) {
    throw new Error(`合并分片请求失败: ${mergeRes.statusText}`);
  }

  const mergeData = await mergeRes.json();
  if (mergeData.code !== 200) {
    throw new Error(`合并分片业务失败: ${mergeData.msg}`);
  }

  return mergeData.data;
}
