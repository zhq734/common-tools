<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeftRight, Copy, Eraser, Maximize2, Minimize2, TextQuote } from 'lucide-vue-next'
import { removeToolboxCache, readToolboxCache, writeToolboxCache } from '@/utils/toolboxStorage'

const XML_TOOL_CACHE_KEY = 'toolbox:xml:workbench'
const cachedState = readToolboxCache(XML_TOOL_CACHE_KEY, {
  sourceText: '',
  resultText: '',
})

const sourceText = ref(cachedState.sourceText)
const resultText = ref(cachedState.resultText)

const sourceSummary = computed(() => buildTextSummary(sourceText.value))
const resultSummary = computed(() => buildTextSummary(resultText.value))

function buildTextSummary(text: string) {
  if (!text) {
    return '空内容'
  }

  const lines = text.split('\n').length
  const chars = text.length

  try {
    const doc = parseXml(text)
    const elementCount = doc.getElementsByTagName('*').length
    const rootName = doc.documentElement?.nodeName || 'unknown'
    return `XML 文档 · 根节点 ${rootName} · ${elementCount} 个元素 · ${lines} 行 / ${chars} 字符`
  } catch {
    return `普通文本 · ${lines} 行 / ${chars} 字符`
  }
}

function parseXml(text: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(parseError.textContent || 'XML 解析失败')
  }
  return doc
}

function formatXmlNode(node: Node, depth = 0): string {
  const indent = '  '.repeat(depth)

  if (node.nodeType === Node.DOCUMENT_NODE) {
    const childParts = Array.from(node.childNodes)
      .map(child => formatXmlNode(child, depth))
      .filter(Boolean)
    return childParts.join('\n')
  }

  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    return `${indent}<?${node.nodeName} ${node.nodeValue || ''}?>`.trimEnd()
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}<!--${node.nodeValue || ''}-->`
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.nodeValue?.trim()
    return value ? `${indent}${value}` : ''
  }

  if (node.nodeType === Node.CDATA_SECTION_NODE) {
    return `${indent}<![CDATA[${node.nodeValue || ''}]]>`
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as Element
  const tagName = element.tagName
  const attrs = Array.from(element.attributes)
    .map(attr => `${attr.name}="${attr.value}"`)
    .join(' ')
  const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`
  const closeTag = `</${tagName}>`

  const meaningfulChildren = Array.from(element.childNodes).filter(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      return Boolean(child.nodeValue?.trim())
    }
    return true
  })

  if (!meaningfulChildren.length) {
    const emptyTag = attrs ? `<${tagName} ${attrs}/>` : `<${tagName}/>`
    return `${indent}${emptyTag}`
  }

  if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
    const textValue = meaningfulChildren[0].nodeValue?.trim() || ''
    return `${indent}${openTag}${textValue}${closeTag}`
  }

  const children = meaningfulChildren
    .map(child => formatXmlNode(child, depth + 1))
    .filter(Boolean)
    .join('\n')

  return `${indent}${openTag}\n${children}\n${indent}${closeTag}`
}

function updateResult(value: string, message: string) {
  resultText.value = value
  ElMessage.success(message)
}

function stripWhitespaceTextNodes(node: Node) {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (!child.nodeValue?.trim()) {
        node.removeChild(child)
      }
      continue
    }
    stripWhitespaceTextNodes(child)
  }
}

function handleFormat() {
  const value = sourceText.value.trim()
  if (!value) {
    ElMessage.warning('请输入 XML 内容')
    return
  }

  try {
    const doc = parseXml(value)
    updateResult(formatXmlNode(doc), '已完成格式化')
  } catch (error: any) {
    ElMessage.error(`XML 解析失败：${error?.message || '格式错误'}`)
  }
}

function handleCompress() {
  const value = sourceText.value.trim()
  if (!value) {
    ElMessage.warning('请输入 XML 内容')
    return
  }

  try {
    const doc = parseXml(value)
    stripWhitespaceTextNodes(doc)
    updateResult(new XMLSerializer().serializeToString(doc), '已完成压缩')
  } catch (error: any) {
    ElMessage.error(`XML 解析失败：${error?.message || '格式错误'}`)
  }
}

function handleEscape() {
  const value = sourceText.value
  if (!value) {
    ElMessage.warning('请输入待转义内容')
    return
  }

  updateResult(JSON.stringify(value).slice(1, -1), '已完成转义')
}

function tryParseEscapedString(value: string) {
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

  const direct = tryParseEscapedString(value)
  if (direct !== null) {
    updateResult(direct, '已完成反转义')
    return
  }

  const wrapped = tryParseEscapedString(`"${value}"`)
  if (wrapped !== null) {
    updateResult(wrapped, '已完成反转义')
    return
  }

  ElMessage.error('请输入合法的转义字符串')
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
  removeToolboxCache(XML_TOOL_CACHE_KEY)
}

watch(
  [sourceText, resultText],
  () => {
    writeToolboxCache(XML_TOOL_CACHE_KEY, {
      sourceText: sourceText.value,
      resultText: resultText.value,
    })
  },
  { deep: true }
)
</script>

<template>
  <div class="xml-tool-page">
    <div class="xml-tool-card">
      <header class="xml-tool-header toolbox-inline-header">
        <div>
          <h1 class="xml-tool-title">XML 工具</h1>
        </div>

        <div class="xml-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">格式化</span>
          <span class="meta-chip toolbox-meta-chip">转义</span>
          <span class="meta-chip toolbox-meta-chip">反转义</span>
        </div>
      </header>

      <div class="xml-tool-toolbar toolbox-inline-toolbar">
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
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="互换输入和结果" @click="swapPanels">
            <ArrowLeftRight :size="14" />
            <span>互换</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="复制结果" @click="copyResult">
            <Copy :size="14" />
            <span>复制结果</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="清空" @click="clearAll">
            <Eraser :size="14" />
            <span>清空</span>
          </button>
        </div>
      </div>

      <div class="xml-editor-grid">
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
            placeholder="输入 XML 文档、文本片段，或待反转义内容"
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

      <div class="xml-tool-tips">
        <span>格式化/压缩要求输入为合法 XML。</span>
        <span>转义/反转义按字符串语义处理，例如 `"`、`\"`、`\n`、`\\`。</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.xml-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.xml-tool-card {
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
    radial-gradient(circle at top right, rgba(79, 107, 255, 0.1), transparent 28%),
    radial-gradient(circle at bottom left, rgba(16, 185, 129, 0.1), transparent 24%),
    var(--content-bg-secondary);
  overflow: hidden;
}

.xml-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.xml-tool-desc {
  margin: 8px 0 0;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--content-text-secondary);
}

.xml-tool-toolbar {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
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

.xml-editor-grid {
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

.xml-tool-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

@media (max-width: 1180px) {
  .xml-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .xml-tool-card {
    padding: 18px;
  }

  .editor-textarea {
    min-height: 240px;
    padding: 14px;
  }
}

</style>
