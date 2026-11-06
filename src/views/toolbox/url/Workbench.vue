<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeftRight, Eraser, Link2, RotateCcw } from 'lucide-vue-next'
import { readToolboxIndexedCache, removeToolboxIndexedCache, writeToolboxIndexedCache } from '@/utils/toolboxIndexedCache'

type UrlMode = 'full' | 'queryValues'

type UrlCacheState = {
  mode: UrlMode
  sourceText: string
  resultText: string
}

const URL_TOOL_CACHE_KEY = 'toolbox:url:workbench'

const mode = ref<UrlMode>('full')
const sourceText = ref('')
const resultText = ref('')
const restoringCache = ref(true)

const modeSummary = computed(() => {
  return mode.value === 'full'
    ? '对整段 URL 或普通文本整体编码/解码'
    : '只处理 URL 查询参数中的 value，保留结构可读性'
})

const sourceSummary = computed(() => buildSummary(sourceText.value))
const resultSummary = computed(() => buildSummary(resultText.value))

onMounted(async () => {
  const cached = await readToolboxIndexedCache<UrlCacheState>(URL_TOOL_CACHE_KEY)
  if (cached) {
    mode.value = cached.mode || 'full'
    sourceText.value = cached.sourceText || ''
    resultText.value = cached.resultText || ''
  }
  restoringCache.value = false
})

watch([mode, sourceText, resultText], persistState, { deep: true })

function persistState() {
  if (restoringCache.value) {
    return
  }

  const hasValue = !!sourceText.value.trim() || !!resultText.value.trim() || mode.value !== 'full'
  if (!hasValue) {
    void removeToolboxIndexedCache(URL_TOOL_CACHE_KEY)
    return
  }

  void writeToolboxIndexedCache<UrlCacheState>(URL_TOOL_CACHE_KEY, {
    mode: mode.value,
    sourceText: sourceText.value,
    resultText: resultText.value,
  })
}

function buildSummary(text: string) {
  if (!text) {
    return '空内容'
  }
  const lines = text.split('\n').length
  const chars = text.length
  return `${lines} 行 / ${chars} 字符`
}

function handleEncode() {
  const value = sourceText.value
  if (!value) {
    ElMessage.warning('请输入待编码内容')
    return
  }

  try {
    resultText.value = mode.value === 'full' ? encodeURIComponent(value) : encodeQueryValues(value)
    ElMessage.success('编码完成')
  } catch (error: any) {
    ElMessage.error(error?.message || '编码失败')
  }
}

function handleDecode() {
  const value = sourceText.value
  if (!value) {
    ElMessage.warning('请输入待解码内容')
    return
  }

  try {
    resultText.value = mode.value === 'full' ? decodeURIComponent(value) : decodeQueryValues(value)
    ElMessage.success('解码完成')
  } catch (error: any) {
    ElMessage.error(error?.message || '解码失败，请确认输入合法')
  }
}

function encodeQueryValues(text: string) {
  const [basePart, hashPart = ''] = text.split('#')
  const [pathPart, queryPart = ''] = basePart.split('?')
  if (!queryPart) {
    return text
  }

  const encodedQuery = queryPart
    .split('&')
    .map(segment => {
      if (!segment) return segment
      const eqIndex = segment.indexOf('=')
      if (eqIndex < 0) {
        return segment
      }
      const key = segment.slice(0, eqIndex)
      const value = segment.slice(eqIndex + 1)
      return `${key}=${encodeURIComponent(value)}`
    })
    .join('&')

  return `${pathPart}?${encodedQuery}${hashPart ? `#${hashPart}` : ''}`
}

function decodeQueryValues(text: string) {
  const [basePart, hashPart = ''] = text.split('#')
  const [pathPart, queryPart = ''] = basePart.split('?')
  if (!queryPart) {
    return text
  }

  const decodedQuery = queryPart
    .split('&')
    .map(segment => {
      if (!segment) return segment
      const eqIndex = segment.indexOf('=')
      if (eqIndex < 0) {
        return segment
      }
      const key = segment.slice(0, eqIndex)
      const value = segment.slice(eqIndex + 1)
      return `${key}=${decodeURIComponent(value)}`
    })
    .join('&')

  return `${pathPart}?${decodedQuery}${hashPart ? `#${hashPart}` : ''}`
}

function swapPanels() {
  ;[sourceText.value, resultText.value] = [resultText.value, sourceText.value]
}

async function copyResult() {
  if (!resultText.value) {
    ElMessage.warning('当前没有可复制的结果')
    return
  }

  try {
    await navigator.clipboard.writeText(resultText.value)
    ElMessage.success('结果已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function copySource() {
  if (!sourceText.value) {
    ElMessage.warning('当前没有可复制的输入内容')
    return
  }

  try {
    await navigator.clipboard.writeText(sourceText.value)
    ElMessage.success('输入内容已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function writeBackToInput() {
  if (!resultText.value) {
    ElMessage.warning('当前没有可写回的结果')
    return
  }
  sourceText.value = resultText.value
  ElMessage.success('结果已写回输入区')
}

async function clearAll() {
  mode.value = 'full'
  sourceText.value = ''
  resultText.value = ''
  await removeToolboxIndexedCache(URL_TOOL_CACHE_KEY)
}
</script>

<template>
  <div class="url-tool-page">
    <div class="url-tool-card">
      <header class="url-tool-header toolbox-inline-header">
        <div>
          <h1 class="url-tool-title">URL 编解码</h1>
        </div>

        <div class="url-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">双向转换</span>
          <span class="meta-chip toolbox-meta-chip">整串模式</span>
          <span class="meta-chip toolbox-meta-chip">参数值模式</span>
        </div>
      </header>

      <div class="url-tool-toolbar toolbox-inline-toolbar">
        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="action-btn primary" @click="handleEncode">
            <Link2 :size="14" />
            <span>编码</span>
          </button>
          <button class="action-btn" @click="handleDecode">
            <RotateCcw :size="14" />
            <span>解码</span>
          </button>
        </div>

        <div class="toolbar-secondary toolbox-toolbar-group">
          <el-radio-group v-model="mode" class="mode-group">
            <el-radio-button label="整串模式" value="full" />
            <el-radio-button label="参数值模式" value="queryValues" />
          </el-radio-group>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="互换输入和结果" @click="swapPanels">
            <ArrowLeftRight :size="14" />
            <span>互换</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="清空" @click="clearAll">
            <Eraser :size="14" />
            <span>清空</span>
          </button>
        </div>
      </div>

      <div class="mode-tip">{{ modeSummary }}</div>

      <div class="url-editor-grid">
        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">输入区</div>
              <div class="panel-subtitle">{{ sourceSummary }}</div>
            </div>
            <button class="panel-link" @click="copySource">复制</button>
          </div>

          <textarea
            v-model="sourceText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入待编码或待解码的 URL / 文本"
          />
        </section>

        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">结果区</div>
              <div class="panel-subtitle">{{ resultSummary }}</div>
            </div>
            <div class="panel-inline-actions">
              <button class="panel-link" @click="writeBackToInput">写回输入区</button>
              <button class="panel-link" @click="copyResult">复制</button>
            </div>
          </div>

          <textarea
            v-model="resultText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="转换结果会显示在这里"
          />
        </section>
      </div>

      <div class="url-tool-tips">
        <span>整串模式使用 `encodeURIComponent / decodeURIComponent`。</span>
        <span>参数值模式仅处理 `?a=1&b=2` 里的 value，保留 key 与结构不变。</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.url-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.url-tool-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--content-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(79, 107, 255, 0.1), transparent 28%),
    radial-gradient(circle at bottom left, rgba(34, 197, 94, 0.1), transparent 24%),
    var(--content-bg-secondary);
  overflow: hidden;
}

.url-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.url-tool-desc {
  margin: 8px 0 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--content-text-secondary);
}

.url-tool-toolbar {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.toolbar-secondary,
.panel-inline-actions {
  gap: 5px;
}

.action-btn,
.ghost-btn,
.panel-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 12px;
  border: 1px solid var(--content-border);
  border-radius: 10px;
  background: var(--content-bg-secondary);
  color: var(--content-text);
  font: inherit;
  cursor: pointer;
  transition: 150ms ease;
}

.action-btn:hover,
.ghost-btn:hover,
.panel-link:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--content-border) 62%);
  color: #fff;
  background: color-mix(in srgb, var(--accent) 24%, var(--content-bg-secondary) 76%);
}

.action-btn.primary {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #ffffff 24%) 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgba(79, 107, 255, 0.22);
}

.mode-tip {
  padding: 12px 14px;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 74%, transparent 26%);
  color: var(--content-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.url-editor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.editor-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--content-border);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.editor-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--content-border);
  background: color-mix(in srgb, var(--content-bg-tertiary) 82%, transparent 18%);
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--content-text);
}

.panel-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 320px;
  padding: 18px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--content-text);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  tab-size: 2;
}

.editor-textarea::placeholder {
  color: var(--content-text-muted);
}

.url-tool-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

@media (max-width: 1180px) {
  .url-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .url-tool-card {
    padding: 18px;
  }

  .editor-textarea {
    min-height: 240px;
    padding: 14px;
  }
}

</style>
