/** Element Plus 中文语言包（无官方类型声明） */
declare module 'element-plus/dist/locale/zh-cn.mjs' {
  import type { Language } from 'element-plus'
  const locale: Language
  export default locale
}

/** qrcode 包（无内置类型声明） */
declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, any>): Promise<string>
}

/** Web Worker 作用域中可用的专用全局接口 */
interface DedicatedWorkerGlobalScope {
  onmessage: ((event: MessageEvent<any>) => void) | null
  postMessage: (message: any) => void
}

/** Worker 中的同步文件读取接口 */
interface FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer
  readAsDataURL(blob: Blob): string
  readAsText(blob: Blob, encoding?: string): string
}

/** Worker 中的同步文件读取构造器 */
declare const FileReaderSync: {
  new (): FileReaderSync
}
