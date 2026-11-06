type FileToBase64Message = {
  type: 'fileToBase64'
  file: File
}

type Base64ToImageMessage = {
  type: 'base64ToImage'
  input: string
  mimeTypeHint?: string
}

type TextToBase64Message = {
  type: 'textToBase64'
  input: string
}

type Base64ToTextMessage = {
  type: 'base64ToText'
  input: string
  charsetHint?: string
}

type WorkerMessage = FileToBase64Message | Base64ToImageMessage | TextToBase64Message | Base64ToTextMessage

type ProgressMessage = {
  type: 'progress'
  progress: number
  stage: string
}

type FileToBase64SuccessMessage = {
  type: 'fileToBase64:success'
  pureBase64: string
  mimeType: string
  fileName: string
  size: number
}

type Base64ToImageSuccessMessage = {
  type: 'base64ToImage:success'
  blob: Blob
  mimeType: string
  byteSize: number
}

type TextToBase64SuccessMessage = {
  type: 'textToBase64:success'
  pureBase64: string
  mimeType: string
  charset: string
  byteSize: number
}

type Base64ToTextSuccessMessage = {
  type: 'base64ToText:success'
  text: string
  mimeType: string
  charset: string
  byteSize: number
}

type ErrorMessage = {
  type: 'error'
  message: string
}

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope
const FILE_CHUNK_SIZE = 3 * 1024 * 1024
const DEFAULT_TEXT_MIME_TYPE = 'text/plain'
const DEFAULT_TEXT_CHARSET = 'utf-8'

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  try {
    if (message.type === 'fileToBase64') {
      await convertFileToBase64(message.file)
      return
    }

    if (message.type === 'base64ToImage') {
      await convertBase64ToImage(message.input, message.mimeTypeHint)
      return
    }

    if (message.type === 'textToBase64') {
      await convertTextToBase64(message.input)
      return
    }

    if (message.type === 'base64ToText') {
      await convertBase64ToText(message.input, message.charsetHint)
    }
  } catch (error: any) {
    postMessageSafe({
      type: 'error',
      message: error?.message || '处理失败',
    })
  }
}

async function convertFileToBase64(file: File) {
  const reader = new FileReaderSync()
  const totalSize = file.size
  const chunks: string[] = []
  let offset = 0
  let carry = new Uint8Array(0)

  if (totalSize === 0) {
    postMessageSafe({
      type: 'fileToBase64:success',
      pureBase64: '',
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      size: 0,
    })
    return
  }

  while (offset < totalSize) {
    const end = Math.min(offset + FILE_CHUNK_SIZE, totalSize)
    const slice = file.slice(offset, end)
    const buffer = new Uint8Array(reader.readAsArrayBuffer(slice))
    const merged = new Uint8Array(carry.length + buffer.length)
    merged.set(carry, 0)
    merged.set(buffer, carry.length)

    const alignedLength = merged.length - (merged.length % 3)
    if (alignedLength > 0) {
      chunks.push(bytesToBase64(merged.subarray(0, alignedLength)))
    }
    carry = merged.subarray(alignedLength)
    offset = end

    postMessageSafe({
      type: 'progress',
      progress: Math.min(99, Math.round((offset / totalSize) * 100)),
      stage: '正在转换图片为 Base64',
    })
  }

  if (carry.length > 0) {
    chunks.push(bytesToBase64(carry))
  }

  postMessageSafe({
    type: 'fileToBase64:success',
    pureBase64: chunks.join(''),
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    size: file.size,
  })
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function convertBase64ToImage(input: string, mimeTypeHint?: string) {
  const parsed = parseBase64Input(input, mimeTypeHint || 'image/png')

  postMessageSafe({
    type: 'progress',
    progress: 35,
    stage: '正在解析 Base64',
  })

  const response = await fetch(`data:${parsed.mimeType};base64,${parsed.base64Body}`)
  const blob = await response.blob()

  postMessageSafe({
    type: 'base64ToImage:success',
    blob,
    mimeType: blob.type || parsed.mimeType,
    byteSize: blob.size,
  })
}

async function convertTextToBase64(input: string) {
  if (!input) {
    throw new Error('请输入待编码内容')
  }

  const bytes = new TextEncoder().encode(input)
  const chunks: string[] = []
  let offset = 0
  let carry = new Uint8Array(0)

  while (offset < bytes.length) {
    const end = Math.min(offset + FILE_CHUNK_SIZE, bytes.length)
    const slice = bytes.subarray(offset, end)
    const merged = new Uint8Array(carry.length + slice.length)
    merged.set(carry, 0)
    merged.set(slice, carry.length)

    const alignedLength = merged.length - (merged.length % 3)
    if (alignedLength > 0) {
      chunks.push(bytesToBase64(merged.subarray(0, alignedLength)))
    }
    carry = merged.subarray(alignedLength)
    offset = end

    postMessageSafe({
      type: 'progress',
      progress: Math.min(99, Math.round((offset / bytes.length) * 100)),
      stage: '正在编码内容为 Base64',
    })
  }

  if (carry.length > 0) {
    chunks.push(bytesToBase64(carry))
  }

  postMessageSafe({
    type: 'textToBase64:success',
    pureBase64: chunks.join(''),
    mimeType: DEFAULT_TEXT_MIME_TYPE,
    charset: DEFAULT_TEXT_CHARSET,
    byteSize: bytes.length,
  })
}

async function convertBase64ToText(input: string, charsetHint?: string) {
  const parsed = parseBase64Input(input, DEFAULT_TEXT_MIME_TYPE)
  const charset = parsed.charset || charsetHint || DEFAULT_TEXT_CHARSET

  postMessageSafe({
    type: 'progress',
    progress: 35,
    stage: '正在反编码 Base64 内容',
  })

  const response = await fetch(`data:${parsed.mimeType};base64,${parsed.base64Body}`)
  const buffer = await response.arrayBuffer()

  let text = ''
  try {
    text = new TextDecoder(charset, { fatal: true }).decode(buffer)
  } catch (error: any) {
    if (error instanceof RangeError) {
      throw new Error(`不支持的字符集：${charset}`)
    }
    throw new Error(`当前 Base64 不是有效的 ${charset.toUpperCase()} 文本内容`)
  }

  postMessageSafe({
    type: 'base64ToText:success',
    text,
    mimeType: parsed.mimeType,
    charset,
    byteSize: buffer.byteLength,
  })
}

function parseBase64Input(input: string, fallbackMimeType: string) {
  const normalized = input.trim()
  if (!normalized) {
    throw new Error('请输入 Base64 内容')
  }

  const dataUrlMatch = normalized.match(/^data:([^;,]+)?((?:;[^;,=]+=[^;,]+)*);base64,([\s\S]+)$/i)
  let mimeType = fallbackMimeType
  let charset = ''
  let base64Body = normalized

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType
    const params = dataUrlMatch[2] || ''
    const charsetMatch = params.match(/;charset=([^;,]+)/i)
    charset = charsetMatch?.[1] || ''
    base64Body = dataUrlMatch[3] || ''
  }

  const normalizedBody = normalizeBase64Body(base64Body)
  return {
    mimeType,
    charset,
    base64Body: normalizedBody,
  }
}

function normalizeBase64Body(base64Body: string) {
  let normalized = base64Body.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized) {
    throw new Error('Base64 内容为空')
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new Error('Base64 内容不合法')
  }

  const remainder = normalized.length % 4
  if (remainder === 1) {
    throw new Error('Base64 长度不合法')
  }

  if (remainder > 0) {
    normalized = normalized.padEnd(normalized.length + (4 - remainder), '=')
  }

  return normalized
}

function postMessageSafe(
  message:
    | ProgressMessage
    | FileToBase64SuccessMessage
    | Base64ToImageSuccessMessage
    | TextToBase64SuccessMessage
    | Base64ToTextSuccessMessage
    | ErrorMessage
) {
  ctx.postMessage(message)
}

export {}
