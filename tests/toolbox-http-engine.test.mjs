import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/**
 * 将 TypeScript 引擎源码转译为 CommonJS 并在 Node 中加载。
 * 引擎中的浏览器 API 仅在 executeDebugRequest 调用时使用，纯函数测试不受影响。
 * @returns {object} 引擎模块导出对象
 * 创建者：zhenghq
 */
function loadEngine() {
  const source = readFileSync(new URL('../src/api/toolbox-http-engine.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'self', 'window', js)(module, module.exports, {}, {})
  return module.exports
}

const { resolveDebugRequest, buildCurlCommandFromResolved, buildCurlCommand } = loadEngine()

/**
 * 构造一份基础调试请求参数。
 * @param {object} overrides 覆盖字段
 * @returns {object} 调试请求参数
 * 创建者：zhenghq
 */
function baseRequest(overrides = {}) {
  return {
    method: 'GET',
    url: 'https://example.com/api',
    queryParams: [],
    headers: [],
    authType: 'none',
    authConfig: {},
    bodyMode: 'none',
    bodyText: '',
    bodyForm: [],
    timeoutMs: 30000,
    followRedirects: true,
    ...overrides,
  }
}

test('启用且键名非空的查询参数会被拼接到 URL', () => {
  const resolved = resolveDebugRequest(baseRequest({
    url: 'https://example.com/api?a=1',
    queryParams: [
      { key: 'q', value: '中文 测试', enabled: true },
      { key: '', value: 'ignored', enabled: true },
      { key: 'off', value: 'x', enabled: false },
    ],
  }))
  assert.equal(resolved.url, 'https://example.com/api?a=1&q=%E4%B8%AD%E6%96%87%20%E6%B5%8B%E8%AF%95')
})

test('POST JSON 请求自动补充 Content-Type', () => {
  const resolved = resolveDebugRequest(baseRequest({
    method: 'post',
    bodyMode: 'json',
    bodyText: '{"a":1}',
  }))
  assert.equal(resolved.method, 'POST')
  assert.equal(resolved.headers['Content-Type'], 'application/json')
  assert.equal(resolved.body, '{"a":1}')
})

test('Bearer 与 API Key 认证按后端规则写入', () => {
  const bearer = resolveDebugRequest(baseRequest({ authType: 'bearer', authConfig: { token: 'tk' } }))
  assert.equal(bearer.headers.Authorization, 'Bearer tk')

  const apiKey = resolveDebugRequest(baseRequest({
    authType: 'apikey',
    authConfig: { keyName: 'X-Key', keyValue: 'v1', in: 'query' },
  }))
  assert.equal(apiKey.url, 'https://example.com/api?X-Key=v1')
})

test('curl 生成包含方法、请求头、请求体与 URL', () => {
  const curl = buildCurlCommand(baseRequest({
    method: 'POST',
    bodyMode: 'json',
    bodyText: '{"a":1}',
    headers: [{ key: 'X-Token', value: 'abc', enabled: true }],
  }))
  assert.equal(curl, "curl -X POST -H 'X-Token: abc' -H 'Content-Type: application/json' --data-raw '{\"a\":1}' 'https://example.com/api'")
})

test('关闭重定向时 curl 附带 max-redirs 限制', () => {
  const curl = buildCurlCommandFromResolved(resolveDebugRequest(baseRequest({ followRedirects: false })))
  assert.match(curl, /--max-redirs 0/)
})
