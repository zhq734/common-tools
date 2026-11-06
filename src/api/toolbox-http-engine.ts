import type {
  ToolboxHttpExecuteRequest,
  ToolboxHttpExecuteResponse,
  ToolboxHttpKeyValue,
} from '@/types'

/** 解析后的可执行请求信息 */
export type ResolvedDebugRequest = {
  method: string
  url: string
  headers: Record<string, string>
  body: string | null
  timeoutMs: number
  followRedirects: boolean
}

const MAX_HISTORY_RESPONSE_BODY = 64 * 1024

/**
 * 过滤出启用且键名非空的键值对行。
 * @param items 原始键值对列表
 * @returns 规范化后的键值对列表
 * 创建者：zhenghq
 */
function normalizeItems(items?: ToolboxHttpKeyValue[]): ToolboxHttpKeyValue[] {
  if (!Array.isArray(items)) return []
  return items.filter(item => item && item.key && item.key.trim() && item.enabled !== false)
}

/**
 * 判断请求头集合中是否已存在指定名称（忽略大小写）。
 * @param headers 请求头集合
 * @param targetName 目标请求头名称
 * @returns 是否已存在
 * 创建者：zhenghq
 */
function hasHeader(headers: Record<string, string>, targetName: string): boolean {
  return Object.keys(headers).some(name => name.toLowerCase() === targetName.toLowerCase())
}

/**
 * 按后端同款规则将认证信息写入请求头或查询参数。
 * @param headers 请求头集合（原地修改）
 * @param queryParams 查询参数列表（原地修改）
 * @param authType 认证类型
 * @param authConfig 认证配置
 * @returns void
 * 创建者：zhenghq
 */
function applyDebugAuth(
  headers: Record<string, string>,
  queryParams: ToolboxHttpKeyValue[],
  authType?: string,
  authConfig?: Record<string, any>,
): void {
  const type = (authType || 'none').trim().toLowerCase()
  if (type === 'none') return
  const config = authConfig || {}

  if (type === 'basic') {
    const raw = `${config.username ?? ''}:${config.password ?? ''}`
    headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`
  } else if (type === 'bearer') {
    headers.Authorization = `Bearer ${config.token ?? ''}`
  } else if (type === 'apikey') {
    const keyName = config.keyName || 'X-API-Key'
    const keyValue = config.keyValue ?? ''
    if ((config.in || 'header').toLowerCase() === 'query') {
      queryParams.push({ key: keyName, value: keyValue, enabled: true })
    } else {
      headers[keyName] = keyValue
    }
  }
}

/**
 * 将表单键值对拼接为 URL 编码字符串。
 * @param items 表单键值对列表
 * @returns URL 编码后的表单内容
 * 创建者：zhenghq
 */
function joinForm(items?: ToolboxHttpKeyValue[]): string {
  return normalizeItems(items)
    .map(item => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value ?? '')}`)
    .join('&')
}

/**
 * 按 body 模式解析请求体内容。
 * @param bodyMode 请求体模式
 * @param bodyText 原始文本请求体
 * @param bodyForm 表单键值对列表
 * @returns 请求体字符串；无请求体时返回 null
 * 创建者：zhenghq
 */
function resolveBody(
  bodyMode: string,
  bodyText?: string,
  bodyForm?: ToolboxHttpKeyValue[],
): string | null {
  if (bodyMode === 'json' || bodyMode === 'text') return bodyText || ''
  if (bodyMode === 'form-urlencoded') return joinForm(bodyForm)
  return null
}

/**
 * 按 body 模式返回默认 Content-Type。
 * @param bodyMode 请求体模式
 * @returns 默认 Content-Type；无默认值时返回 null
 * 创建者：zhenghq
 */
function defaultContentType(bodyMode: string): string | null {
  if (bodyMode === 'json') return 'application/json'
  if (bodyMode === 'text') return 'text/plain'
  if (bodyMode === 'form-urlencoded') return 'application/x-www-form-urlencoded'
  return null
}

/**
 * 将启用的查询参数拼接到 URL 上。
 * @param baseUrl 原始 URL
 * @param queryParams 查询参数列表
 * @returns 拼接后的 URL
 * 创建者：zhenghq
 */
function appendQueryParams(baseUrl: string, queryParams: ToolboxHttpKeyValue[]): string {
  const safeBaseUrl = (baseUrl || '').trim()
  if (!queryParams.length) return safeBaseUrl
  const connector = safeBaseUrl.includes('?') ? '&' : '?'
  const query = queryParams
    .map(item => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value ?? '')}`)
    .join('&')
  return `${safeBaseUrl}${connector}${query}`
}

/**
 * 将调试请求解析为可直接发送的结构（与后端 resolveDebugRequest 保持一致）。
 * @param request 调试请求参数
 * @returns 解析后的可执行请求信息
 * 创建者：zhenghq
 */
export function resolveDebugRequest(request: ToolboxHttpExecuteRequest): ResolvedDebugRequest {
  const method = (request.method || 'GET').trim().toUpperCase()
  const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : 30000
  const followRedirects = request.followRedirects !== false

  const queryParams = normalizeItems(request.queryParams).map(item => ({ ...item }))
  const headers: Record<string, string> = {}
  for (const item of normalizeItems(request.headers)) {
    headers[item.key.trim()] = item.value ?? ''
  }

  applyDebugAuth(headers, queryParams, request.authType, request.authConfig)

  const bodyMode = (request.bodyMode || 'none').trim().toLowerCase()
  const body = resolveBody(bodyMode, request.bodyText, request.bodyForm)
  if (body !== null && !hasHeader(headers, 'Content-Type')) {
    const contentType = defaultContentType(bodyMode)
    if (contentType) headers['Content-Type'] = contentType
  }

  return {
    method,
    url: appendQueryParams(request.url || '', queryParams),
    headers,
    body,
    timeoutMs,
    followRedirects,
  }
}

/**
 * 按 shell 单引号规则转义字符串。
 * @param value 原始字符串
 * @returns 转义后的 shell 参数
 * 创建者：zhenghq
 */
function quoteForShell(value: string): string {
  return `'${String(value ?? '').replace(/'/g, `'\\"'\\"'`)}'`
}

/**
 * 由解析后的请求生成 curl 命令（与后端 buildCurlCommandFromResolved 一致）。
 * @param resolved 解析后的可执行请求信息
 * @returns curl 命令字符串
 * 创建者：zhenghq
 */
export function buildCurlCommandFromResolved(resolved: ResolvedDebugRequest): string {
  const parts = ['curl', '-X', resolved.method]
  if (!resolved.followRedirects) parts.push('--max-redirs', '0')
  for (const [name, value] of Object.entries(resolved.headers)) {
    parts.push('-H', quoteForShell(`${name}: ${value}`))
  }
  if (resolved.body) {
    parts.push('--data-raw', quoteForShell(resolved.body))
  }
  parts.push(quoteForShell(resolved.url))
  return parts.join(' ')
}

/**
 * 由原始调试请求生成 curl 命令。
 * @param request 调试请求参数
 * @returns curl 命令字符串
 * 创建者：zhenghq
 */
export function buildCurlCommand(request: ToolboxHttpExecuteRequest): string {
  return buildCurlCommandFromResolved(resolveDebugRequest(request))
}

/**
 * 使用浏览器 fetch 直接发送 HTTP 调试请求。
 * 注意：浏览器受同源策略（CORS）限制，目标服务需允许跨域；无法读取被 CORS 隐藏的响应头。
 * @param request 调试请求参数
 * @returns 调试响应结果（含状态码、耗时、响应头、响应体和 curl 命令）
 * 创建者：zhenghq
 */
export async function executeDebugRequest(
  request: ToolboxHttpExecuteRequest,
): Promise<ToolboxHttpExecuteResponse> {
  const resolved = resolveDebugRequest(request)
  const curlCommand = buildCurlCommandFromResolved(resolved)
  const startedAt = performance.now()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), resolved.timeoutMs)

  try {
    const response = await fetch(resolved.url, {
      method: resolved.method,
      headers: resolved.headers,
      body: resolved.body,
      redirect: resolved.followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
    })
    const buffer = await response.arrayBuffer()
    const durationMs = Math.round(performance.now() - startedAt)
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    let responseBody = new TextDecoder('utf-8').decode(buffer)
    if (responseBody.length > MAX_HISTORY_RESPONSE_BODY) {
      responseBody = responseBody.slice(0, MAX_HISTORY_RESPONSE_BODY)
    }

    return {
      success: true,
      statusCode: response.status,
      durationMs,
      responseSize: buffer.byteLength,
      contentType: response.headers.get('content-type') || '',
      resolvedUrl: response.url || resolved.url,
      requestHeaders: resolved.headers,
      responseHeaders,
      responseBody,
      curlCommand,
      executedAt: new Date().toISOString(),
    }
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? `请求超时（${resolved.timeoutMs} ms）或被中断`
      : (error?.message || String(error))
    return {
      success: false,
      statusCode: null,
      durationMs: Math.round(performance.now() - startedAt),
      responseSize: 0,
      resolvedUrl: resolved.url,
      requestHeaders: resolved.headers,
      responseHeaders: {},
      responseBody: '',
      curlCommand,
      errorMessage: message,
      executedAt: new Date().toISOString(),
    }
  } finally {
    window.clearTimeout(timer)
  }
}
