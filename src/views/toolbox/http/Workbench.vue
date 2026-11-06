<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Play, Plus, MoreVertical, ChevronDown, ChevronUp, ChevronRight } from 'lucide-vue-next'
import { toolboxHttpApi } from '@/api/toolbox-http'
import JsonEditor from '@/components/JsonEditor.vue'
import { readToolboxCache, removeToolboxCache, writeToolboxCache } from '@/utils/toolboxStorage'
import type {
  ToolboxHttpExecuteResponse,
  ToolboxHttpGroup,
  ToolboxHttpGroupTree,
  ToolboxHttpHistory,
  ToolboxHttpKeyValue,
  ToolboxHttpRequestDetail,
  ToolboxHttpRequestSaveRequest,
} from '@/types'

const HTTP_TOOL_CACHE_KEY = 'toolbox:http:workbench'

function createKeyValue(): ToolboxHttpKeyValue {
  return { key: '', value: '', enabled: true }
}

function createEmptyRequest(groupId?: number): ToolboxHttpRequestDetail {
  return {
    id: 0,
    groupId: groupId || 0,
    name: '',
    method: 'GET',
    url: '',
    queryParams: [createKeyValue()],
    headers: [createKeyValue()],
    authType: 'none',
    authConfig: {},
    bodyMode: 'none',
    bodyText: '',
    bodyForm: [createKeyValue()],
    timeoutMs: 30000,
    followRedirects: true,
  }
}

function cloneRequest<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

const loadingTree = ref(false)
const loadingRequest = ref(false)
const saving = ref(false)
const executing = ref(false)
const historyLoading = ref(false)
const searchKeyword = ref('')
const treeData = ref<ToolboxHttpGroupTree[]>([])
const currentRequest = ref<ToolboxHttpRequestDetail | null>(null)
const currentRequestId = ref<number | null>(null)
const currentResponse = ref<ToolboxHttpExecuteResponse | null>(null)
const requestTab = ref('params')
const responseTab = ref('pretty')
const requestPanelCollapsed = ref(false)
const historyDrawerVisible = ref(false)
const historyItems = ref<ToolboxHttpHistory[]>([])
const dirty = ref(false)
const selectedHistory = ref<ToolboxHttpHistory | null>(null)
const initSnapshot = ref('')

const cachedWorkbenchState = readToolboxCache<{
  searchKeyword: string
  requestTab: string
  responseTab: string
  requestPanelCollapsed: boolean
  currentRequestId: number | null
  currentRequest: ToolboxHttpRequestDetail | null
  currentResponse: ToolboxHttpExecuteResponse | null
  initSnapshot: string
}>(HTTP_TOOL_CACHE_KEY, {
  searchKeyword: '',
  requestTab: 'params',
  responseTab: 'pretty',
  requestPanelCollapsed: false,
  currentRequestId: null,
  currentRequest: null,
  currentResponse: null,
  initSnapshot: '',
})

searchKeyword.value = cachedWorkbenchState.searchKeyword || ''
requestTab.value = cachedWorkbenchState.requestTab || 'params'
responseTab.value = cachedWorkbenchState.responseTab || 'pretty'
requestPanelCollapsed.value = Boolean(cachedWorkbenchState.requestPanelCollapsed)
currentRequestId.value = cachedWorkbenchState.currentRequestId ?? null
currentRequest.value = cachedWorkbenchState.currentRequest ? normalizeCachedDetail(cachedWorkbenchState.currentRequest) : null
currentResponse.value = cachedWorkbenchState.currentResponse || null
initSnapshot.value = cachedWorkbenchState.initSnapshot || ''
dirty.value = currentRequest.value ? JSON.stringify(toSavePayload(currentRequest.value)) !== initSnapshot.value : false

const bodyModes = [
  { label: '无', value: 'none' },
  { label: 'JSON', value: 'json' },
  { label: 'Text', value: 'text' },
  { label: 'Form URL Encoded', value: 'form-urlencoded' },
]

const authTypes = [
  { label: '无认证', value: 'none' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'API Key', value: 'apikey' },
]

const requestTabLabelMap: Record<string, string> = {
  params: 'Params',
  headers: 'Headers',
  auth: 'Auth',
  body: 'Body',
  settings: '设置',
}

const filteredTree = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return treeData.value
  return treeData.value
    .map(group => {
      const requests = group.requests.filter(item =>
        `${item.name} ${item.method} ${item.url}`.toLowerCase().includes(keyword)
      )
      if (group.name.toLowerCase().includes(keyword) || requests.length > 0) {
        return { ...group, requests }
      }
      return null
    })
    .filter(Boolean) as ToolboxHttpGroupTree[]
})

const collapsedGroups = ref<Set<number>>(new Set())

function toggleGroup(groupId: number) {
  const next = new Set(collapsedGroups.value)
  if (next.has(groupId)) {
    next.delete(groupId)
  } else {
    next.add(groupId)
  }
  collapsedGroups.value = next
}

const groupOptions = computed(() =>
  treeData.value.map(group => ({
    id: group.id,
    name: group.name,
    defaultGroup: group.defaultGroup,
  }))
)

function handleMobileSelect(requestId: number) {
  if (requestId) {
    loadRequest(requestId)
  }
}

const currentStatusType = computed(() => {
  const code = currentResponse.value?.statusCode || 0
  if (code >= 200 && code < 300) return 'success'
  if (code >= 400) return 'danger'
  return 'info'
})

const prettyResponseBody = computed(() => {
  const body = currentResponse.value?.responseBody || ''
  if (!body.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
})

const isJsonResponse = computed(() => {
  const contentType = currentResponse.value?.contentType || ''
  if (contentType.toLowerCase().includes('json')) return true
  const body = currentResponse.value?.responseBody || ''
  if (!body.trim()) return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
})

const currentRequestTabLabel = computed(() => requestTabLabelMap[requestTab.value] || 'Params')

watch(
  currentRequest,
  value => {
    if (!value) {
      dirty.value = false
      return
    }
    dirty.value = JSON.stringify(toSavePayload(value)) !== initSnapshot.value
  },
  { deep: true }
)

watch(
  () => currentRequest.value?.url,
  (newUrl) => {
    if (!currentRequest.value) return
    if (currentRequest.value.name && currentRequest.value.name.trim()) return
    if (!newUrl || !newUrl.trim()) return
    const path = extractUriPath(newUrl)
    if (path) currentRequest.value.name = path
  }
)

function extractUriPath(rawUrl: string): string {
  const clean = rawUrl.trim()
  try {
    const url = new URL(clean.startsWith('http') ? clean : 'http://' + clean)
    return url.pathname.replace(/\/$/, '') || '/'
  } catch {
    const idx = clean.indexOf('://')
    const afterScheme = idx >= 0 ? clean.slice(idx + 3) : clean
    const pathStart = afterScheme.indexOf('/')
    if (pathStart < 0) return '/'
    const pathWithParams = afterScheme.slice(pathStart)
    return pathWithParams.split('?')[0].split('#')[0]
  }
}

onMounted(async () => {
  await loadTree()
  if (!currentRequest.value) {
    createLocalDraft()
  }
})

async function loadTree(preferId?: number | null) {
  loadingTree.value = true
  try {
    const res = await toolboxHttpApi.listTree()
    treeData.value = res.data || []
    const targetId = preferId ?? currentRequestId.value ?? (!currentRequest.value ? findFirstRequestId(treeData.value) : null)
    if (targetId) {
      if (targetId !== currentRequestId.value || !currentRequest.value) {
        await loadRequest(targetId)
      }
    } else if (!currentRequest.value) {
      createLocalDraft()
    }
  } catch {
    // handled by interceptor
  } finally {
    loadingTree.value = false
  }
}

function findFirstRequestId(groups: ToolboxHttpGroupTree[]) {
  for (const group of groups) {
    if (group.requests.length > 0) return group.requests[0].id
  }
  return null
}

async function loadRequest(id: number) {
  loadingRequest.value = true
  try {
    const res = await toolboxHttpApi.getRequest(id)
    currentRequest.value = normalizeDetail(res.data)
    currentRequestId.value = id
    initSnapshot.value = JSON.stringify(toSavePayload(currentRequest.value))
    dirty.value = false
    selectedHistory.value = null
  } catch {
    // handled by interceptor
  } finally {
    loadingRequest.value = false
  }
}

function normalizeDetail(detail: ToolboxHttpRequestDetail): ToolboxHttpRequestDetail {
  const cloned = cloneRequest(detail)
  cloned.queryParams = normalizeKeyValueList(cloned.queryParams)
  cloned.headers = normalizeKeyValueList(cloned.headers)
  cloned.bodyForm = normalizeKeyValueList(cloned.bodyForm)
  cloned.authConfig = cloned.authConfig || {}
  if (!cloned.groupId && groupOptions.value[0]) {
    cloned.groupId = groupOptions.value[0].id
  }
  return cloned
}

function normalizeKeyValueList(list?: ToolboxHttpKeyValue[]) {
  const items = Array.isArray(list) ? list : []
  return items.length > 0 ? items : [createKeyValue()]
}

function normalizeCachedDetail(detail: ToolboxHttpRequestDetail) {
  return normalizeDetail(detail)
}

function createLocalDraft(groupId?: number) {
  const defaultGroupId = groupId || groupOptions.value[0]?.id || 0
  currentRequest.value = createEmptyRequest(defaultGroupId)
  currentRequestId.value = null
  initSnapshot.value = JSON.stringify(toSavePayload(currentRequest.value))
  dirty.value = false
  currentResponse.value = null
}

function toSavePayload(detail: ToolboxHttpRequestDetail): ToolboxHttpRequestSaveRequest {
  return {
    groupId: detail.groupId,
    name: detail.name,
    method: detail.method,
    url: detail.url,
    queryParams: sanitizeKeyValueList(detail.queryParams),
    headers: sanitizeKeyValueList(detail.headers),
    authType: detail.authType,
    authConfig: detail.authConfig || {},
    bodyMode: detail.bodyMode,
    bodyText: detail.bodyText || '',
    bodyForm: sanitizeKeyValueList(detail.bodyForm),
    timeoutMs: detail.timeoutMs,
    followRedirects: detail.followRedirects,
  }
}

function toExecutePayload(detail: ToolboxHttpRequestDetail) {
  return {
    method: detail.method,
    url: detail.url,
    queryParams: sanitizeKeyValueList(detail.queryParams),
    headers: sanitizeKeyValueList(detail.headers),
    authType: detail.authType,
    authConfig: detail.authConfig || {},
    bodyMode: detail.bodyMode,
    bodyText: detail.bodyText || '',
    bodyForm: sanitizeKeyValueList(detail.bodyForm),
    timeoutMs: detail.timeoutMs,
    followRedirects: detail.followRedirects,
  }
}

function sanitizeKeyValueList(list: ToolboxHttpKeyValue[]) {
  return (list || []).map(item => ({
    key: item.key || '',
    value: item.value || '',
    enabled: item.enabled !== false,
  }))
}

async function handleCreateGroup() {
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '分组名称不能为空',
    })
    await toolboxHttpApi.createGroup(value)
    ElMessage.success('分组已创建')
    await loadTree()
  } catch {
    // cancelled
  }
}

async function handleGroupCommand(command: 'rename' | 'delete', group: ToolboxHttpGroup) {
  if (command === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('请输入新的分组名称', '编辑分组', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: group.name,
        inputPattern: /\S+/,
        inputErrorMessage: '分组名称不能为空',
      })
      await toolboxHttpApi.updateGroup(group.id, value)
      ElMessage.success('分组已更新')
      await loadTree(currentRequestId.value)
    } catch {
      // cancelled
    }
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除分组「${group.name}」吗？该分组下请求会迁移到默认分组。`, '删除分组', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await toolboxHttpApi.deleteGroup(group.id)
    ElMessage.success('分组已删除')
    await loadTree(currentRequestId.value)
  } catch {
    // cancelled
  }
}

async function saveCurrentRequest() {
  if (!currentRequest.value) return
  saving.value = true
  try {
    const payload = toSavePayload(currentRequest.value)
    if (currentRequestId.value) {
      const res = await toolboxHttpApi.updateRequest(currentRequestId.value, payload)
      currentRequest.value = normalizeDetail(res.data)
      initSnapshot.value = JSON.stringify(toSavePayload(currentRequest.value))
      dirty.value = false
      ElMessage.success('请求已保存')
      await loadTree(currentRequestId.value)
    } else {
      const res = await toolboxHttpApi.createRequest(payload)
      currentRequestId.value = res.data.id
      currentRequest.value = normalizeDetail(res.data)
      initSnapshot.value = JSON.stringify(toSavePayload(currentRequest.value))
      dirty.value = false
      ElMessage.success('请求已保存')
      await loadTree(currentRequestId.value)
    }
  } catch {
    // handled
  } finally {
    saving.value = false
  }
}

async function executeCurrentRequest() {
  if (!currentRequest.value) return
  executing.value = true
  try {
    const response =
      currentRequestId.value && !dirty.value
        ? await toolboxHttpApi.executeRequest(currentRequestId.value)
        : await toolboxHttpApi.executeTemporary(toExecutePayload(currentRequest.value))
    currentResponse.value = response.data
    responseTab.value = 'pretty'
    if (currentRequestId.value && !dirty.value) {
      await loadTree(currentRequestId.value)
    }
  } catch {
    // handled
  } finally {
    executing.value = false
  }
}

async function copyCurl() {
  if (!currentRequest.value) return
  try {
    const res = await toolboxHttpApi.generateCurl(toExecutePayload(currentRequest.value))
    await navigator.clipboard.writeText(res.data.curlCommand)
    ElMessage.success('curl 已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function openHistory() {
  if (!currentRequestId.value) {
    ElMessage.warning('请先保存请求后再查看历史')
    return
  }
  historyDrawerVisible.value = true
  historyLoading.value = true
  try {
    const res = await toolboxHttpApi.listHistory(currentRequestId.value, 20)
    historyItems.value = res.data || []
    selectedHistory.value = historyItems.value[0] || null
  } catch {
    // handled
  } finally {
    historyLoading.value = false
  }
}

async function deleteCurrentRequest() {
  if (!currentRequestId.value) {
    createLocalDraft(currentRequest.value?.groupId)
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除请求「${currentRequest.value?.name || ''}」吗？`, '删除请求', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await toolboxHttpApi.deleteRequest(currentRequestId.value)
    ElMessage.success('请求已删除')
    currentRequestId.value = null
    currentRequest.value = null
    currentResponse.value = null
    await loadTree()
    if (!findFirstRequestId(treeData.value)) {
      createLocalDraft(groupOptions.value[0]?.id)
    }
  } catch {
    // cancelled
  }
}

function addKeyValueRow(list: ToolboxHttpKeyValue[]) {
  list.push(createKeyValue())
}

function removeKeyValueRow(list: ToolboxHttpKeyValue[], index: number) {
  if (list.length === 1) {
    list[0] = createKeyValue()
    return
  }
  list.splice(index, 1)
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatBytes(size?: number | null) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function parseJsonText(value?: string) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

watch(
  [
    searchKeyword,
    requestTab,
    responseTab,
    requestPanelCollapsed,
    currentRequestId,
    currentRequest,
    currentResponse,
  ],
  () => {
    if (!currentRequest.value && !currentResponse.value && !searchKeyword.value.trim()) {
      removeToolboxCache(HTTP_TOOL_CACHE_KEY)
      return
    }

    writeToolboxCache(HTTP_TOOL_CACHE_KEY, {
      searchKeyword: searchKeyword.value,
      requestTab: requestTab.value,
      responseTab: responseTab.value,
      requestPanelCollapsed: requestPanelCollapsed.value,
      currentRequestId: currentRequestId.value,
      currentRequest: currentRequest.value ? cloneRequest(currentRequest.value) : null,
      currentResponse: currentResponse.value ? cloneRequest(currentResponse.value) : null,
      initSnapshot: initSnapshot.value,
    })
  },
  { deep: true }
)
</script>

<template>
  <div class="http-workbench">
    <aside class="request-tree-panel">
      <div class="tree-toolbar">
        <el-input v-model="searchKeyword" placeholder="搜索..." size="small" clearable />
        <div class="tree-toolbar-actions">
          <el-button size="small" @click="handleCreateGroup">
            <Plus :size="14" />
            <span>分组</span>
          </el-button>
          <el-button size="small" type="primary" @click="createLocalDraft()">
            <Plus :size="14" />
            <span>请求</span>
          </el-button>
        </div>
      </div>

      <div v-loading="loadingTree" class="tree-list">
        <template v-if="filteredTree.length">
          <div v-for="group in filteredTree" :key="group.id" class="tree-group">
            <div class="tree-group-header" @click="toggleGroup(group.id)">
              <div class="tree-group-title">
                <component
                  :is="collapsedGroups.has(group.id) ? ChevronRight : ChevronDown"
                  :size="14"
                  class="group-chevron"
                />
                <span>{{ group.name }}</span>
                <span class="tree-group-count">{{ group.requests.length }}</span>
              </div>
              <el-dropdown trigger="click" @command="(cmd: 'rename' | 'delete') => handleGroupCommand(cmd, group)">
                <button class="icon-btn" @click.stop>
                  <MoreVertical :size="14" />
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">重命名</el-dropdown-item>
                    <el-dropdown-item command="delete" :disabled="group.defaultGroup">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>

            <div v-show="!collapsedGroups.has(group.id)" class="tree-group-body">
              <button
                v-for="item in group.requests"
                :key="item.id"
                class="request-item"
                :class="{ active: currentRequestId === item.id }"
                :title="item.url || item.name"
                @click="loadRequest(item.id)"
              >
                <span class="request-method" :class="item.method.toLowerCase()">{{ item.method }}</span>
                <span class="request-item-name">{{ item.name }}</span>
              </button>

              <button
                v-show="!collapsedGroups.has(group.id)"
                class="request-create-btn"
                @click="createLocalDraft(group.id)"
              >
                <Plus :size="13" />
                <span>添加到该分组</span>
              </button>
            </div>
          </div>
        </template>

        <div v-else class="tree-empty">
          暂无请求，可先新建分组或请求
        </div>
      </div>
    </aside>

    <div class="mobile-request-bar">
      <el-select
        :model-value="currentRequestId"
        placeholder="选择请求..."
        filterable
        class="mobile-request-select"
        @change="handleMobileSelect"
      >
        <el-option-group
          v-for="group in treeData"
          :key="group.id"
          :label="group.name"
        >
          <el-option
            v-for="item in group.requests"
            :key="item.id"
            :label="`${item.method} ${item.name || item.url || '(空)'}`"
            :value="item.id"
          />
        </el-option-group>
      </el-select>
      <div class="mobile-request-actions">
        <el-button size="small" @click="handleCreateGroup">
          <Plus :size="14" />
          <span>分组</span>
        </el-button>
        <el-button size="small" type="primary" @click="createLocalDraft()">
          <Plus :size="14" />
          <span>请求</span>
        </el-button>
      </div>
    </div>

    <section v-loading="loadingRequest" class="editor-panel">
      <template v-if="currentRequest">
        <div class="editor-header">
          <div class="editor-meta">
            <el-input v-model="currentRequest.name" placeholder="请求名称" class="name-input" />
            <el-select v-model="currentRequest.groupId" class="group-select">
              <el-option v-for="group in groupOptions" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
            <span v-if="dirty" class="dirty-indicator">● 未保存</span>
          </div>
          <div class="editor-actions">
            <el-dropdown trigger="click">
              <el-button>
                <MoreVertical :size="14" />
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :disabled="!currentRequestId" @click="openHistory">历史</el-dropdown-item>
                  <el-dropdown-item @click="copyCurl">复制 curl</el-dropdown-item>
                  <el-dropdown-item divided @click="deleteCurrentRequest">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button :type="currentRequestId ? 'primary' : 'warning'" :disabled="!dirty" :loading="saving" @click="saveCurrentRequest">
              保存
            </el-button>
            <el-button type="success" :loading="executing" @click="executeCurrentRequest">
              <Play :size="14" />
              <span>发送</span>
            </el-button>
          </div>
        </div>

        <div class="request-bar">
          <el-select v-model="currentRequest.method" class="method-select">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
            <el-option label="PATCH" value="PATCH" />
          </el-select>
          <el-input v-model="currentRequest.url" placeholder="https://example.com/api" class="url-input" />
        </div>

        <div class="workspace-grid" :class="{ collapsed: requestPanelCollapsed }">
          <div class="request-config-panel" :class="{ collapsed: requestPanelCollapsed }">
            <div class="panel-section-header">
              <div class="panel-section-meta">
                <div class="panel-section-title">请求参数</div>
                <div class="panel-section-subtitle">当前标签：{{ currentRequestTabLabel }}</div>
              </div>
              <el-button text class="collapse-toggle" @click="requestPanelCollapsed = !requestPanelCollapsed">
                <component :is="requestPanelCollapsed ? ChevronDown : ChevronUp" :size="14" />
                <span>{{ requestPanelCollapsed ? '展开' : '收起' }}</span>
              </el-button>
            </div>

            <el-collapse-transition>
              <div v-show="!requestPanelCollapsed" class="request-config-content">
                <el-tabs v-model="requestTab" class="panel-tabs">
                  <el-tab-pane label="Params" name="params">
                    <div class="kv-list">
                      <div v-for="(item, index) in currentRequest.queryParams" :key="`query-${index}`" class="kv-row">
                        <el-switch v-model="item.enabled" />
                        <el-input v-model="item.key" placeholder="参数名" />
                        <el-input v-model="item.value" placeholder="参数值" />
                        <button class="icon-btn danger" @click="removeKeyValueRow(currentRequest.queryParams, index)">×</button>
                      </div>
                      <el-button text @click="addKeyValueRow(currentRequest.queryParams)">+ 添加参数</el-button>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="Headers" name="headers">
                    <div class="kv-list">
                      <div v-for="(item, index) in currentRequest.headers" :key="`header-${index}`" class="kv-row">
                        <el-switch v-model="item.enabled" />
                        <el-input v-model="item.key" placeholder="Header 名称" />
                        <el-input v-model="item.value" placeholder="Header 值" />
                        <button class="icon-btn danger" @click="removeKeyValueRow(currentRequest.headers, index)">×</button>
                      </div>
                      <el-button text @click="addKeyValueRow(currentRequest.headers)">+ 添加 Header</el-button>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="Auth" name="auth">
                    <div class="auth-panel">
                      <el-select v-model="currentRequest.authType" style="width: 240px">
                        <el-option v-for="item in authTypes" :key="item.value" :label="item.label" :value="item.value" />
                      </el-select>

                      <div v-if="currentRequest.authType === 'basic'" class="auth-fields">
                        <el-input v-model="currentRequest.authConfig.username" placeholder="用户名" />
                        <el-input v-model="currentRequest.authConfig.password" type="password" show-password placeholder="密码" />
                      </div>

                      <div v-else-if="currentRequest.authType === 'bearer'" class="auth-fields">
                        <el-input v-model="currentRequest.authConfig.token" type="textarea" :rows="3" placeholder="Bearer Token" />
                      </div>

                      <div v-else-if="currentRequest.authType === 'apikey'" class="auth-fields">
                        <el-input v-model="currentRequest.authConfig.keyName" placeholder="Key 名称，如 X-API-Key" />
                        <el-input v-model="currentRequest.authConfig.keyValue" placeholder="Key 值" />
                        <el-select v-model="currentRequest.authConfig.in">
                          <el-option label="Header" value="header" />
                          <el-option label="Query" value="query" />
                        </el-select>
                      </div>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="Body" name="body">
                    <div class="body-panel">
                      <el-radio-group v-model="currentRequest.bodyMode">
                        <el-radio-button v-for="mode in bodyModes" :key="mode.value" :label="mode.value">{{ mode.label }}</el-radio-button>
                      </el-radio-group>

                      <JsonEditor
                        v-if="currentRequest.bodyMode === 'json'"
                        v-model="currentRequest.bodyText!"
                        :rows="12"
                        placeholder="输入 JSON 请求体"
                      />

                      <el-input
                        v-else-if="currentRequest.bodyMode === 'text'"
                        v-model="currentRequest.bodyText"
                        type="textarea"
                        :rows="12"
                        placeholder="输入文本请求体"
                        class="mono-textarea"
                      />

                      <template v-else-if="currentRequest.bodyMode === 'form-urlencoded'">
                        <div class="kv-list">
                          <div v-for="(item, index) in currentRequest.bodyForm" :key="`form-${index}`" class="kv-row">
                            <el-switch v-model="item.enabled" />
                            <el-input v-model="item.key" placeholder="字段名" />
                            <el-input v-model="item.value" placeholder="字段值" />
                            <button class="icon-btn danger" @click="removeKeyValueRow(currentRequest.bodyForm, index)">×</button>
                          </div>
                          <el-button text @click="addKeyValueRow(currentRequest.bodyForm)">+ 添加字段</el-button>
                        </div>
                      </template>

                      <div v-else class="body-empty">当前请求不发送 Body</div>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="设置" name="settings">
                    <div class="settings-panel">
                      <el-form label-width="120px">
                        <el-form-item label="超时（毫秒）">
                          <el-input-number v-model="currentRequest.timeoutMs" :min="1000" :max="300000" :step="1000" />
                        </el-form-item>
                        <el-form-item label="跟随重定向">
                          <el-switch v-model="currentRequest.followRedirects" />
                        </el-form-item>
                      </el-form>
                    </div>
                  </el-tab-pane>
                </el-tabs>
              </div>
            </el-collapse-transition>
          </div>

          <div class="response-panel">
            <div class="response-header">
              <div class="response-title">响应结果</div>
              <div class="response-metrics">
                <el-tag :type="currentStatusType">{{ currentResponse?.statusCode ?? '--' }}</el-tag>
                <span>{{ currentResponse?.durationMs != null ? `${currentResponse.durationMs} ms` : '--' }}</span>
                <span>{{ formatBytes(currentResponse?.responseSize) }}</span>
                <span class="content-type">{{ currentResponse?.contentType || '--' }}</span>
              </div>
            </div>

            <template v-if="currentResponse">
              <div v-if="currentResponse.errorMessage" class="response-error">
                {{ currentResponse.errorMessage }}
              </div>

              <el-tabs v-model="responseTab" class="panel-tabs response-tabs">
                <el-tab-pane label="Pretty" name="pretty">
                  <div class="response-tab-content">
                    <JsonEditor
                      v-if="isJsonResponse"
                      :model-value="prettyResponseBody"
                      :rows="16"
                      readonly
                      placeholder="暂无响应"
                      class="response-json-editor"
                    />
                    <pre v-else class="response-pre fill">{{ currentResponse.responseBody || '' }}</pre>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="Raw" name="raw">
                  <div class="response-tab-content">
                    <pre class="response-pre fill">{{ currentResponse.responseBody || '' }}</pre>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="Headers" name="headers">
                  <div class="response-tab-content">
                    <div class="headers-list">
                    <div
                      v-for="(value, key) in currentResponse.responseHeaders"
                      :key="key"
                      class="header-row"
                    >
                      <span class="header-key">{{ key }}</span>
                      <span class="header-value">{{ value }}</span>
                    </div>
                    <div v-if="!Object.keys(currentResponse.responseHeaders || {}).length" class="panel-empty">暂无响应头</div>
                  </div>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="Timeline" name="timeline">
                  <div class="response-tab-content">
                    <div class="timeline-panel">
                      <div class="timeline-item">
                        <span>请求时间</span>
                        <strong>{{ formatDateTime(currentResponse.executedAt) }}</strong>
                      </div>
                      <div class="timeline-item">
                        <span>状态码</span>
                        <strong>{{ currentResponse.statusCode ?? '--' }}</strong>
                      </div>
                      <div class="timeline-item">
                        <span>耗时</span>
                        <strong>{{ currentResponse.durationMs != null ? `${currentResponse.durationMs} ms` : '--' }}</strong>
                      </div>
                      <div class="timeline-item">
                        <span>响应大小</span>
                        <strong>{{ formatBytes(currentResponse.responseSize) }}</strong>
                      </div>
                      <div class="timeline-item">
                        <span>最终地址</span>
                        <strong class="timeline-url">{{ currentResponse.resolvedUrl || '--' }}</strong>
                      </div>
                    </div>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </template>

            <div v-else class="panel-empty">
              发送请求后在这里查看响应结果
            </div>
          </div>
        </div>
      </template>
    </section>

    <el-drawer v-model="historyDrawerVisible" title="请求历史" size="760px">
      <div v-loading="historyLoading" class="history-layout">
        <div class="history-list">
          <button
            v-for="item in historyItems"
            :key="item.id"
            class="history-item"
            :class="{ active: selectedHistory?.id === item.id }"
            @click="selectedHistory = item"
          >
            <div class="history-item-top">
              <el-tag :type="item.success ? 'success' : 'danger'" size="small">
                {{ item.responseStatusCode ?? (item.success ? 'OK' : 'ERR') }}
              </el-tag>
              <span>{{ item.durationMs != null ? `${item.durationMs}ms` : '--' }}</span>
            </div>
            <div class="history-item-time">{{ formatDateTime(item.createTime) }}</div>
          </button>
        </div>

        <div class="history-detail">
          <template v-if="selectedHistory">
            <div class="history-section">
              <div class="history-section-title">请求快照</div>
              <JsonEditor
                :model-value="JSON.stringify(parseJsonText(selectedHistory.requestSnapshotJson), null, 2)"
                :rows="12"
                readonly
                placeholder="无"
              />
            </div>

            <div class="history-section">
              <div class="history-section-title">响应头</div>
              <JsonEditor
                :model-value="JSON.stringify(parseJsonText(selectedHistory.responseHeadersJson), null, 2)"
                :rows="8"
                readonly
                placeholder="无"
              />
            </div>

            <div class="history-section">
              <div class="history-section-title">响应体</div>
              <pre class="response-pre history-response">{{ selectedHistory.responseBody || selectedHistory.errorMessage || '' }}</pre>
            </div>
          </template>

          <div v-else class="panel-empty">暂无历史记录</div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.http-workbench {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: 100%;
  align-items: stretch;
  overflow: auto;
}

.request-tree-panel,
.editor-panel {
  min-width: 0;
  min-height: 0;
}

.request-tree-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 12px;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--content-bg-secondary) 96%, #3c87ff 4%) 0%, var(--content-bg-secondary) 100%);
}

.tree-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tree-toolbar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.tree-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tree-group {
  display: flex;
  flex-direction: column;
}

.tree-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 120ms ease;
}

.tree-group-header:hover {
  background: var(--content-bg-tertiary);
}

.tree-group-title {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--content-text);
}

.group-chevron {
  flex-shrink: 0;
  color: var(--content-text-secondary);
}

.tree-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--content-bg-tertiary);
  color: var(--content-text-secondary);
  font-size: 11px;
}

.tree-group-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 4px;
}

.request-item,
.request-create-btn,
.icon-btn {
  border: none;
  background: transparent;
  font: inherit;
}

.request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--content-text-secondary);
  cursor: pointer;
  transition: background 120ms ease;
  text-align: left;
}

.request-item:hover {
  background: var(--content-bg-tertiary);
}

.request-item.active {
  background: linear-gradient(135deg, rgba(79, 107, 255, 0.16), rgba(79, 107, 255, 0.08));
  outline: 1px solid rgba(79, 107, 255, 0.35);
}

.request-method {
  flex-shrink: 0;
  min-width: 42px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--content-text-secondary);
  background: var(--content-bg-tertiary);
}

.request-method.get { color: #22c55e; background: rgba(34,197,94,0.1); }
.request-method.post { color: #3b82f6; background: rgba(59,130,246,0.1); }
.request-method.put { color: #f59e0b; background: rgba(245,158,11,0.1); }
.request-method.delete { color: #ef4444; background: rgba(239,68,68,0.1); }
.request-method.patch { color: #8b5cf6; background: rgba(139,92,246,0.1); }

.request-item-name {
  flex: 1;
  min-width: 0;
  color: var(--content-text);
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-create-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(79, 107, 255, 0.06);
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}

.request-create-btn:hover {
  background: rgba(79, 107, 255, 0.12);
}

.tree-empty,
.panel-empty,
.body-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 1px dashed var(--content-border);
  border-radius: 16px;
  color: var(--content-text-secondary);
  font-size: 13px;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}

.editor-header,
.request-bar,
.request-config-panel,
.response-panel {
  border: 1px solid var(--content-border);
  border-radius: 18px;
  background: var(--content-bg-secondary);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
}

.editor-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.name-input {
  width: 280px;
  max-width: 100%;
}

.group-select {
  width: 180px;
}

.dirty-indicator {
  color: #f59e0b;
  font-size: 13px;
  white-space: nowrap;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.request-bar {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
}

.workspace-grid {
  display: grid;
  grid-template-rows: 380px minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.workspace-grid.collapsed {
  grid-template-rows: 76px minmax(0, 1fr);
}

.request-config-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.request-config-panel.collapsed {
  overflow: visible;
}

.panel-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--content-border);
}

.panel-section-meta {
  min-width: 0;
}

.panel-section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--content-text);
}

.panel-section-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

.collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.request-config-content {
  flex: 1;
  min-height: 0;
  padding: 4px 16px 16px;
  overflow: auto;
}

.response-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

.response-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.response-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--content-text);
}

.response-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--content-text-secondary);
  flex-wrap: wrap;
}

.content-type {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-tabs {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
}

.panel-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-tabs :deep(.el-tab-pane) {
  height: 100%;
  min-height: 0;
  overflow: visible;
}

.response-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.response-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.response-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.response-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.response-json-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.response-json-editor :deep(.json-toolbar) {
  flex-shrink: 0;
}

.response-json-editor :deep(.json-textarea) {
  flex: 1;
  min-height: 0;
  height: 100%;
  resize: none;
}

.kv-list,
.auth-panel,
.body-panel,
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kv-row {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) minmax(0, 1fr) 36px;
  gap: 5px;
  align-items: center;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--content-text-secondary);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--content-bg-tertiary);
}

.icon-btn.danger {
  color: var(--destructive);
}

.auth-fields {
  display: grid;
  gap: 12px;
}

.response-error {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 13px;
  line-height: 1.6;
}

.response-pre {
  margin: 0;
  padding: 14px;
  min-height: 260px;
  max-height: 100%;
  overflow: auto;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  background: var(--content-bg);
  color: var(--content-text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.response-pre.fill {
  flex: 1;
  min-height: 0;
}

.headers-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
  overflow: visible;
}

.header-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--content-border);
  border-radius: 12px;
  background: var(--content-bg);
}

.header-key {
  color: var(--content-text);
  font-family: var(--font-mono);
}

.header-value {
  color: var(--content-text-secondary);
  word-break: break-word;
}

.timeline-panel {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: visible;
}

.timeline-item {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--content-border);
  border-radius: 12px;
  background: var(--content-bg);
}

.timeline-item span {
  color: var(--content-text-secondary);
}

.timeline-item strong {
  color: var(--content-text);
}

.timeline-url {
  word-break: break-all;
}

.history-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 400px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: calc(100vh - 180px);
  overflow: auto;
}

.history-item {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--content-border);
  border-radius: 12px;
  background: var(--content-bg-secondary);
  text-align: left;
  color: var(--content-text-secondary);
  cursor: pointer;
}

.history-item.active {
  border-color: rgba(79, 107, 255, 0.35);
  background: rgba(79, 107, 255, 0.08);
}

.history-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.history-item-time {
  font-size: 12px;
}

.history-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.history-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--content-text);
}

.history-response {
  min-height: 180px;
}

.mono-textarea :deep(textarea) {
  font-family: var(--font-mono);
}

.mobile-request-bar {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  background: var(--content-bg-secondary);
}

.mobile-request-select {
  flex: 1;
  min-width: 0;
}

.mobile-request-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

@media (max-width: 1280px) {
  .request-tree-panel {
    display: none;
  }

  .mobile-request-bar {
    display: flex;
  }
  .http-workbench {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }

  .workspace-grid {
    grid-template-rows: 360px minmax(0, 1fr);
    flex: none;
    min-height: 860px;
    overflow: visible;
  }

  .workspace-grid.collapsed {
    grid-template-rows: 76px minmax(0, 1fr);
  }

  .editor-panel {
    max-height: calc(100dvh - 220px);
    overflow-x: hidden;
    overflow-y: auto;
  }
}

@media (max-width: 840px) {
  .editor-header,
  .request-bar {
    grid-template-columns: 1fr;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .editor-meta,
  .editor-actions {
    width: 100%;
  }

  .kv-row,
  .header-row,
  .timeline-item,
  .history-layout {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    grid-template-rows: auto auto;
    min-height: auto;
  }

  .workspace-grid.collapsed {
    grid-template-rows: auto auto;
  }

  .editor-panel {
    max-height: calc(100dvh - 180px);
  }
}
</style>
