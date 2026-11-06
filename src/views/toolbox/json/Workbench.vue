<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeftRight, Copy, Eraser, Minimize2, Maximize2, TextQuote } from 'lucide-vue-next'
import { removeToolboxCache, readToolboxCache, writeToolboxCache } from '@/utils/toolboxStorage'

const JSON_TOOL_CACHE_KEY = 'toolbox:json:workbench'
const cachedState = readToolboxCache(JSON_TOOL_CACHE_KEY, {
  sourceText: '',
  resultText: '',
  escapeWrapWithQuotes: true,
})

const sourceText = ref(cachedState.sourceText)
const resultText = ref(cachedState.resultText)
const escapeWrapWithQuotes = ref(cachedState.escapeWrapWithQuotes)

const sourceSummary = computed(() => buildTextSummary(sourceText.value))
const resultSummary = computed(() => buildTextSummary(resultText.value))

function buildTextSummary(text: string) {
  if (!text) {
    return '空内容'
  }

  const lines = text.split('\n').length
  const chars = text.length

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return `JSON 数组 · ${parsed.length} 项 · ${lines} 行 / ${chars} 字符`
    }
    if (parsed === null) {
      return `JSON null · ${lines} 行 / ${chars} 字符`
    }
    if (typeof parsed === 'object') {
      return `JSON 对象 · ${Object.keys(parsed).length} 个键 · ${lines} 行 / ${chars} 字符`
    }
    if (typeof parsed === 'string') {
      return `JSON 字符串 · ${parsed.length} 字符 · ${lines} 行 / ${chars} 字符`
    }
    return `JSON ${typeof parsed} · ${lines} 行 / ${chars} 字符`
  } catch {
    return `普通文本 · ${lines} 行 / ${chars} 字符`
  }
}

function parseJsonInput() {
  const value = sourceText.value.trim()
  if (!value) {
    ElMessage.warning('请输入 JSON 内容')
    return null
  }

  try {
    return JSON.parse(value)
  } catch (error: any) {
    ElMessage.error(`JSON 解析失败：${error?.message || '格式错误'}`)
    return null
  }
}

function updateResult(value: string, message: string) {
  resultText.value = value
  ElMessage.success(message)
}

function handleFormat() {
  const parsed = parseJsonInput()
  if (parsed === null) {
    return
  }
  updateResult(JSON.stringify(parsed, null, 2), '已完成格式化')
}

function handleCompress() {
  const parsed = parseJsonInput()
  if (parsed === null) {
    return
  }
  updateResult(JSON.stringify(parsed), '已完成压缩')
}

function handleEscape() {
  if (!sourceText.value) {
    ElMessage.warning('请输入待转义内容')
    return
  }

  let escaped = JSON.stringify(sourceText.value)
  if (!escapeWrapWithQuotes.value) {
    escaped = escaped.slice(1, -1)
  }
  updateResult(escaped, '已完成转义')
}

function tryParseJsonStringLiteral(value: string) {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function handleUnescape() {
  const value = sourceText.value.trim()
  if (!value) {
    ElMessage.warning('请输入待反转义内容')
    return
  }

  const direct = tryParseJsonStringLiteral(value)
  if (direct !== null) {
    updateResult(direct, '已完成反转义')
    return
  }

  const wrapped = tryParseJsonStringLiteral(`"${value}"`)
  if (wrapped !== null) {
    updateResult(wrapped, '已完成反转义')
    return
  }

  ElMessage.error('请输入合法的 JSON 字符串或转义片段')
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

function swapPanels() {
  ;[sourceText.value, resultText.value] = [resultText.value, sourceText.value]
}

function writeBackToInput() {
  if (!resultText.value) {
    ElMessage.warning('当前没有可写回的结果')
    return
  }
  sourceText.value = resultText.value
  ElMessage.success('结果已写回输入区')
}

function clearAll() {
  sourceText.value = ''
  resultText.value = ''
  escapeWrapWithQuotes.value = true
  removeToolboxCache(JSON_TOOL_CACHE_KEY)
}

watch(
  [sourceText, resultText, escapeWrapWithQuotes],
  () => {
    writeToolboxCache(JSON_TOOL_CACHE_KEY, {
      sourceText: sourceText.value,
      resultText: resultText.value,
      escapeWrapWithQuotes: escapeWrapWithQuotes.value,
    })
  },
  { deep: true }
)
</script>

<template>
  <div class="json-tool-page">
    <div class="json-tool-card">
      <header class="json-tool-header toolbox-inline-header">
        <div>
          <h1 class="json-tool-title">JSON 工具</h1>
        </div>

        <div class="json-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">格式化</span>
          <span class="meta-chip toolbox-meta-chip">转义</span>
          <span class="meta-chip toolbox-meta-chip">反转义</span>
        </div>
      </header>

      <div class="json-tool-toolbar toolbox-inline-toolbar">
        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="action-btn primary" @click="handleFormat">
            <Minimize2 :size="14" />
            <span>格式化</span>
          </button>
          <button class="action-btn" @click="handleCompress">
            <Maximize2 :size="14" />
            <span>压缩</span>
          </button>
          <button class="action-btn" @click="handleEscape">
            <TextQuote :size="14" />
            <span>转义</span>
          </button>
          <button class="action-btn" @click="handleUnescape">
            <TextQuote :size="14" />
            <span>反转义</span>
          </button>
        </div>

        <div class="toolbar-secondary toolbox-toolbar-group">
          <label class="toolbar-switch">
            <span>转义包含外层引号</span>
            <el-switch v-model="escapeWrapWithQuotes" />
          </label>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="互换输入和结果" @click="swapPanels">
            <ArrowLeftRight :size="14" />
            <span>互换</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="复制结果" @click="copyResult">
            <Copy :size="14" />
            <span>复制</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="清空" @click="clearAll">
            <Eraser :size="14" />
            <span>清空</span>
          </button>
        </div>
      </div>

      <div class="json-editor-grid">
        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">输入区</div>
              <div class="panel-subtitle">{{ sourceSummary }}</div>
            </div>
          </div>

          <textarea
            v-model="sourceText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入 JSON、普通文本，或待反转义的 JSON 字符串"
          />
        </section>

        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">结果区</div>
              <div class="panel-subtitle">{{ resultSummary }}</div>
            </div>
            <button class="panel-link" @click="writeBackToInput">写回左侧</button>
          </div>

          <textarea
            v-model="resultText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="这里显示处理结果，可继续编辑或复制"
          />
        </section>
      </div>

      <div class="json-tool-tips">
        <span>格式化/压缩要求输入为合法 JSON。</span>
        <span>反转义兼容两种输入：`\"demo\"` 和 `"demo"`。</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.json-tool-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border: 1px solid var(--content-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(79, 107, 255, 0.12), transparent 28%),
    radial-gradient(circle at bottom left, rgba(6, 182, 212, 0.08), transparent 24%),
    var(--content-bg-secondary);
  overflow: hidden;
}

.json-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.json-tool-desc {
  margin: 8px 0 0;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--content-text-secondary);
}

.json-tool-toolbar {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.toolbar-secondary {
  gap: 5px;
}

.action-btn,
.ghost-btn,
.panel-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--content-border);
  border-radius: 10px;
  background: var(--content-bg-secondary);
  color: var(--content-text);
  font: inherit;
  cursor: pointer;
  transition: 150ms ease;
}

.action-btn,
.ghost-btn {
  padding: 9px 12px;
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

.action-btn.primary:hover {
  border-color: var(--accent-hover);
  background: linear-gradient(135deg, var(--accent-hover) 0%, color-mix(in srgb, var(--accent-hover) 76%, #ffffff 24%) 100%);
}

.toolbar-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--content-text-secondary);
  font-size: 13px;
}

.json-editor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
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
  gap: 12px;
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

.panel-link {
  padding: 8px 12px;
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

.json-tool-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

@media (max-width: 1180px) {
  .json-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .json-tool-card {
    padding: 18px;
  }

  .editor-textarea {
    min-height: 240px;
    padding: 14px;
  }

  .toolbar-switch {
    justify-content: space-between;
  }
}

</style>
