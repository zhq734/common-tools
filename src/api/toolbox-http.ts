import { ElMessage } from 'element-plus'
import { buildCurlCommand, executeDebugRequest } from './toolbox-http-engine'
import type {
  ApiResult,
  ToolboxHttpExecuteRequest,
  ToolboxHttpExecuteResponse,
  ToolboxHttpGroup,
  ToolboxHttpGroupTree,
  ToolboxHttpHistory,
  ToolboxHttpRequestDetail,
  ToolboxHttpRequestSaveRequest,
} from '@/types'

/** 本地持久化数据结构 */
type LocalDatabase = {
  nextGroupId: number
  nextRequestId: number
  nextHistoryId: number
  groups: ToolboxHttpGroup[]
  requests: ToolboxHttpRequestDetail[]
  history: ToolboxHttpHistory[]
}

const DB_KEY = 'common-tools:toolbox-http-db'
const HISTORY_LIMIT = 50
const DEFAULT_GROUP_NAME = '默认分组'

/**
 * 生成当前时间 ISO 字符串。
 * @returns 当前时间字符串
 * 创建者：zhenghq
 */
function now(): string {
  return new Date().toISOString()
}

/**
 * 读取本地数据库；首次访问时初始化默认分组。
 * @returns 本地数据库对象
 * 创建者：zhenghq
 */
function readDb(): LocalDatabase {
  try {
    const raw = window.localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDatabase
      if (Array.isArray(parsed.groups) && Array.isArray(parsed.requests) && Array.isArray(parsed.history)) {
        return parsed
      }
    }
  } catch {
    // 忽略损坏的本地缓存，走初始化分支
  }
  const initial: LocalDatabase = {
    nextGroupId: 2,
    nextRequestId: 1,
    nextHistoryId: 1,
    groups: [{ id: 1, name: DEFAULT_GROUP_NAME, defaultGroup: true, requestCount: 0, createTime: now() }],
    requests: [],
    history: [],
  }
  writeDb(initial)
  return initial
}

/**
 * 将本地数据库写回 localStorage。
 * @param db 本地数据库对象
 * @returns void
 * 创建者：zhenghq
 */
function writeDb(db: LocalDatabase): void {
  window.localStorage.setItem(DB_KEY, JSON.stringify(db))
}

/**
 * 包装成与后端一致的 Result 响应。
 * @param data 业务数据
 * @returns 统一响应包装
 * 创建者：zhenghq
 */
function ok<T>(data: T): ApiResult<T> {
  return { code: 200, message: 'ok', data }
}

/**
 * 抛出带提示的业务异常。
 * @param message 错误提示
 * @returns 永不返回
 * 创建者：zhenghq
 */
function fail(message: string): never {
  ElMessage.error(message)
  throw new Error(message)
}

/**
 * 校验必填文本。
 * @param value 原始文本
 * @param label 字段名称
 * @returns 去除首尾空白后的文本
 * 创建者：zhenghq
 */
function requireText(value: string | undefined, label: string): string {
  const text = (value || '').trim()
  if (!text) fail(`${label}不能为空`)
  return text
}

/**
 * 校验 URL 必须以 http/https 开头，避免浏览器相对路径与危险协议。
 * @param value 原始 URL
 * @returns 规范化后的 URL
 * 创建者：zhenghq
 */
function requireUrl(value: string | undefined): string {
  const url = (value || '').trim()
  if (!/^https?:\/\//i.test(url)) fail('URL 必须以 http:// 或 https:// 开头')
  return url
}

/**
 * 解析分组 ID；为空时回落到默认分组。
 * @param db 本地数据库
 * @param groupId 目标分组 ID
 * @returns 有效分组 ID
 * 创建者：zhenghq
 */
function resolveGroupId(db: LocalDatabase, groupId?: number): number {
  if (groupId && db.groups.some(group => group.id === groupId)) return groupId
  return db.groups.find(group => group.defaultGroup)?.id || db.groups[0].id
}

/**
 * 由保存请求构建完整请求详情。
 * @param db 本地数据库
 * @param id 请求 ID
 * @param data 保存请求参数
 * @param previous 已有请求（用于保留执行摘要）
 * @returns 请求详情
 * 创建者：zhenghq
 */
function buildDetail(
  db: LocalDatabase,
  id: number,
  data: ToolboxHttpRequestSaveRequest,
  previous?: ToolboxHttpRequestDetail,
): ToolboxHttpRequestDetail {
  const timestamp = now()
  return {
    id,
    groupId: resolveGroupId(db, data.groupId),
    name: requireText(data.name, '请求名称'),
    method: (data.method || 'GET').trim().toUpperCase(),
    url: requireUrl(data.url),
    queryParams: data.queryParams || [],
    headers: data.headers || [],
    authType: data.authType || 'none',
    authConfig: data.authConfig || {},
    bodyMode: data.bodyMode || 'none',
    bodyText: data.bodyText || '',
    bodyForm: data.bodyForm || [],
    timeoutMs: data.timeoutMs && data.timeoutMs > 0 ? data.timeoutMs : 30000,
    followRedirects: data.followRedirects !== false,
    lastStatusCode: previous?.lastStatusCode ?? undefined,
    lastDurationMs: previous?.lastDurationMs ?? undefined,
    lastRunAt: previous?.lastRunAt,
    lastErrorMessage: previous?.lastErrorMessage ?? undefined,
    createTime: previous?.createTime || timestamp,
    updateTime: timestamp,
  }
}

/**
 * 将请求详情转换为执行参数。
 * @param detail 请求详情
 * @returns 执行参数
 * 创建者：zhenghq
 */
function toExecuteRequest(detail: ToolboxHttpRequestDetail): ToolboxHttpExecuteRequest {
  return {
    method: detail.method,
    url: detail.url,
    queryParams: detail.queryParams,
    headers: detail.headers,
    authType: detail.authType,
    authConfig: detail.authConfig,
    bodyMode: detail.bodyMode,
    bodyText: detail.bodyText,
    bodyForm: detail.bodyForm,
    timeoutMs: detail.timeoutMs,
    followRedirects: detail.followRedirects,
  }
}

/**
 * 记录一次执行历史并更新请求的最近执行摘要。
 * @param requestId 请求 ID
 * @param request 执行参数
 * @param response 执行响应
 * @returns void
 * 创建者：zhenghq
 */
function recordHistory(
  requestId: number,
  request: ToolboxHttpExecuteRequest,
  response: ToolboxHttpExecuteResponse,
): void {
  const db = readDb()
  const history: ToolboxHttpHistory = {
    id: db.nextHistoryId++,
    requestId,
    requestSnapshotJson: JSON.stringify(request),
    responseStatusCode: response.statusCode,
    responseHeadersJson: JSON.stringify(response.responseHeaders || {}),
    responseBody: (response.responseBody || '').slice(0, 64 * 1024),
    responseSize: response.responseSize,
    durationMs: response.durationMs,
    success: response.success,
    errorMessage: response.errorMessage,
    createTime: now(),
  }
  db.history.unshift(history)
  db.history = db.history.filter(item => item.requestId === requestId).slice(0, HISTORY_LIMIT)
    .concat(db.history.filter(item => item.requestId !== requestId))

  const target = db.requests.find(item => item.id === requestId)
  if (target) {
    target.lastStatusCode = response.statusCode ?? undefined
    target.lastDurationMs = response.durationMs ?? undefined
    target.lastRunAt = response.executedAt || now()
    target.lastErrorMessage = response.errorMessage ?? undefined
  }
  writeDb(db)
}

/**
 * 工具箱 HTTP 调试台的纯前端实现。
 * 接口签名与原后端 API 保持一致，数据保存在浏览器 localStorage 中。
 * 创建者：zhenghq
 */
export const toolboxHttpApi = {
  /**
   * 查询全部分组。
   * @returns 分组列表
   * 创建者：zhenghq
   */
  listGroups: (): Promise<ApiResult<ToolboxHttpGroup[]>> =>
    Promise.resolve(ok(readDb().groups)),

  /**
   * 新建分组。
   * @param name 分组名称
   * @returns 新建的分组
   * 创建者：zhenghq
   */
  createGroup: (name: string): Promise<ApiResult<ToolboxHttpGroup>> => {
    const db = readDb()
    const group: ToolboxHttpGroup = {
      id: db.nextGroupId++,
      name: requireText(name, '分组名称'),
      defaultGroup: false,
      requestCount: 0,
      createTime: now(),
    }
    db.groups.push(group)
    writeDb(db)
    return Promise.resolve(ok(group))
  },

  /**
   * 重命名分组（默认分组不可编辑）。
   * @param id 分组 ID
   * @param name 新名称
   * @returns 更新后的分组
   * 创建者：zhenghq
   */
  updateGroup: (id: number, name: string): Promise<ApiResult<ToolboxHttpGroup>> => {
    const db = readDb()
    const group = db.groups.find(item => item.id === id)
    if (!group) fail('分组不存在')
    if (group.defaultGroup) fail('默认分组不允许编辑')
    group.name = requireText(name, '分组名称')
    group.updateTime = now()
    writeDb(db)
    return Promise.resolve(ok(group))
  },

  /**
   * 删除分组，其下请求迁移到默认分组（默认分组不可删除）。
   * @param id 分组 ID
   * @returns 空响应
   * 创建者：zhenghq
   */
  deleteGroup: (id: number): Promise<ApiResult<void>> => {
    const db = readDb()
    const group = db.groups.find(item => item.id === id)
    if (!group) fail('分组不存在')
    if (group.defaultGroup) fail('默认分组不允许删除')
    const defaultId = resolveGroupId(db)
    db.requests.forEach(request => {
      if (request.groupId === id) request.groupId = defaultId
    })
    db.groups = db.groups.filter(item => item.id !== id)
    writeDb(db)
    return Promise.resolve(ok(undefined))
  },

  /**
   * 查询分组与请求的树形结构。
   * @returns 分组树列表
   * 创建者：zhenghq
   */
  listTree: (): Promise<ApiResult<ToolboxHttpGroupTree[]>> => {
    const db = readDb()
    const tree = db.groups.map(group => {
      const requests = db.requests.filter(request => request.groupId === group.id)
      return {
        ...group,
        requestCount: requests.length,
        requests: requests.map(request => ({
          id: request.id,
          groupId: request.groupId,
          name: request.name,
          method: request.method,
          url: request.url,
          lastStatusCode: request.lastStatusCode,
          lastDurationMs: request.lastDurationMs,
          lastRunAt: request.lastRunAt,
          lastErrorMessage: request.lastErrorMessage,
          createTime: request.createTime,
          updateTime: request.updateTime,
        })),
      }
    })
    return Promise.resolve(ok(tree))
  },

  /**
   * 查询单个请求详情。
   * @param id 请求 ID
   * @returns 请求详情
   * 创建者：zhenghq
   */
  getRequest: (id: number): Promise<ApiResult<ToolboxHttpRequestDetail>> => {
    const detail = readDb().requests.find(item => item.id === id)
    if (!detail) fail('请求不存在')
    return Promise.resolve(ok(detail))
  },

  /**
   * 新建请求。
   * @param data 保存参数
   * @returns 新建的请求详情
   * 创建者：zhenghq
   */
  createRequest: (data: ToolboxHttpRequestSaveRequest): Promise<ApiResult<ToolboxHttpRequestDetail>> => {
    const db = readDb()
    const detail = buildDetail(db, db.nextRequestId++, data)
    db.requests.push(detail)
    writeDb(db)
    return Promise.resolve(ok(detail))
  },

  /**
   * 更新请求。
   * @param id 请求 ID
   * @param data 保存参数
   * @returns 更新后的请求详情
   * 创建者：zhenghq
   */
  updateRequest: (id: number, data: ToolboxHttpRequestSaveRequest): Promise<ApiResult<ToolboxHttpRequestDetail>> => {
    const db = readDb()
    const index = db.requests.findIndex(item => item.id === id)
    if (index < 0) fail('请求不存在')
    const detail = buildDetail(db, id, data, db.requests[index])
    db.requests[index] = detail
    writeDb(db)
    return Promise.resolve(ok(detail))
  },

  /**
   * 删除请求及其历史记录。
   * @param id 请求 ID
   * @returns 空响应
   * 创建者：zhenghq
   */
  deleteRequest: (id: number): Promise<ApiResult<void>> => {
    const db = readDb()
    db.requests = db.requests.filter(item => item.id !== id)
    db.history = db.history.filter(item => item.requestId !== id)
    writeDb(db)
    return Promise.resolve(ok(undefined))
  },

  /**
   * 执行已保存的请求并记录历史。
   * @param id 请求 ID
   * @returns 调试响应结果
   * 创建者：zhenghq
   */
  executeRequest: async (id: number): Promise<ApiResult<ToolboxHttpExecuteResponse>> => {
    const detail = readDb().requests.find(item => item.id === id)
    if (!detail) fail('请求不存在')
    const request = toExecuteRequest(detail)
    const response = await executeDebugRequest(request)
    recordHistory(id, request, response)
    return ok(response)
  },

  /**
   * 执行临时请求（不保存历史）。
   * @param data 执行参数
   * @returns 调试响应结果
   * 创建者：zhenghq
   */
  executeTemporary: async (data: ToolboxHttpExecuteRequest): Promise<ApiResult<ToolboxHttpExecuteResponse>> =>
    ok(await executeDebugRequest(data)),

  /**
   * 查询指定请求的执行历史。
   * @param id 请求 ID
   * @param limit 返回条数上限
   * @returns 历史记录列表
   * 创建者：zhenghq
   */
  listHistory: (id: number, limit = 20): Promise<ApiResult<ToolboxHttpHistory[]>> => {
    const safeLimit = limit > 0 ? Math.min(limit, HISTORY_LIMIT) : 20
    const items = readDb().history.filter(item => item.requestId === id).slice(0, safeLimit)
    return Promise.resolve(ok(items))
  },

  /**
   * 生成 curl 命令。
   * @param data 执行参数
   * @returns 包含 curlCommand 的对象
   * 创建者：zhenghq
   */
  generateCurl: (data: ToolboxHttpExecuteRequest): Promise<ApiResult<{ curlCommand: string }>> =>
    Promise.resolve(ok({ curlCommand: buildCurlCommand(data) })),
}
