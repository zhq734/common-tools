/**
 * 触发浏览器下载指定 Blob 内容。
 * @param blob 待下载的文件内容
 * @param filename 下载文件名
 * @returns void
 * 创建者：zhenghq
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
