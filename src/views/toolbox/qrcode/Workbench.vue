<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Copy, Download, Eraser, QrCode, ScanLine, Upload } from 'lucide-vue-next'
import * as QRCodeLib from 'qrcode'
import { downloadBlob } from '@/api/openapi-docs'
import { readToolboxIndexedCache, removeToolboxIndexedCache, writeToolboxIndexedCache } from '@/utils/toolboxIndexedCache'

type ActiveTab = 'generate' | 'decode'
type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

type CachedState = {
  activeTab: ActiveTab
  generateText: string
  generatedQrDataUrl: string
  downloadFileName: string
  errorCorrectionLevel: ErrorCorrectionLevel
  decodeFile: File | null
  decodedText: string
}

type WorkerProgressMessage = {
  type: 'progress'
  progress: number
  stage: string
}

type WorkerSuccessMessage = {
  type: 'decode:success'
  text: string
}

type WorkerErrorMessage = {
  type: 'error'
  message: string
}

type WorkerResponse = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage

const QRCODE_TOOL_CACHE_KEY = 'toolbox:qrcode:workbench'
const worker = new Worker(new URL('../../../workers/qrDecodeWorker.ts', import.meta.url), { type: 'module' })

const activeTab = ref<ActiveTab>('generate')
const generateText = ref('')
const generatedQrDataUrl = ref('')
const downloadFileName = ref('qrcode')
const errorCorrectionLevel = ref<ErrorCorrectionLevel>('M')

const decodeFile = ref<File | null>(null)
const decodePreviewUrl = ref('')
const decodedText = ref('')

const processing = ref(false)
const progress = ref(0)
const statusText = ref('')
const generateError = ref('')
const decodeError = ref('')
const restoringCache = ref(true)
const fileInputRef = ref<HTMLInputElement | null>(null)

let persistTimer: ReturnType<typeof setTimeout> | null = null

const generateSummary = computed(() => {
  if (!generateText.value.trim()) {
    return '输入内容后即可生成二维码'
  }
  return `${generateText.value.length.toLocaleString()} 字符 · 纠错级别 ${errorCorrectionLevel.value}`
})

const decodeSummary = computed(() => {
  if (!decodeFile.value) {
    return '上传二维码图片后识别内容'
  }
  return `${decodeFile.value.name} · ${formatBytes(decodeFile.value.size)}`
})

onMounted(async () => {
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    if (message.type === 'progress') {
      processing.value = true
      progress.value = message.progress
      statusText.value = message.stage
      return
    }

    processing.value = false
    progress.value = 100

    if (message.type === 'error') {
      decodeError.value = message.message
      statusText.value = ''
      return
    }

    decodedText.value = message.text
    decodeError.value = ''
    statusText.value = '识别完成'
    ElMessage.success('二维码内容已识别')
    schedulePersist()
  }

  await restoreCache()
  restoringCache.value = false
})

onBeforeUnmount(() => {
  worker.terminate()
  revokeDecodePreviewUrl()
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
})

watch(activeTab, schedulePersist)
watch(generateText, schedulePersist)
watch(generatedQrDataUrl, schedulePersist)
watch(downloadFileName, schedulePersist)
watch(errorCorrectionLevel, schedulePersist)
watch(decodedText, schedulePersist)
watch(decodeFile, schedulePersist)

async function restoreCache() {
  const cached = await readToolboxIndexedCache<CachedState>(QRCODE_TOOL_CACHE_KEY)
  if (!cached) {
    return
  }

  activeTab.value = cached.activeTab || 'generate'
  generateText.value = cached.generateText || ''
  generatedQrDataUrl.value = cached.generatedQrDataUrl || ''
  downloadFileName.value = cached.downloadFileName || 'qrcode'
  errorCorrectionLevel.value = cached.errorCorrectionLevel || 'M'
  decodedText.value = cached.decodedText || ''

  if (cached.decodeFile) {
    decodeFile.value = cached.decodeFile
    setDecodePreviewFile(cached.decodeFile)
  }
}

function schedulePersist() {
  if (restoringCache.value) {
    return
  }

  if (persistTimer) {
    clearTimeout(persistTimer)
  }

  persistTimer = setTimeout(() => {
    void persistState()
  }, 400)
}

async function persistState() {
  const hasValue =
    !!generateText.value.trim() ||
    !!generatedQrDataUrl.value ||
    !!decodeFile.value ||
    !!decodedText.value.trim()

  if (!hasValue && activeTab.value === 'generate' && errorCorrectionLevel.value === 'M' && downloadFileName.value === 'qrcode') {
    await removeToolboxIndexedCache(QRCODE_TOOL_CACHE_KEY)
    return
  }

  await writeToolboxIndexedCache<CachedState>(QRCODE_TOOL_CACHE_KEY, {
    activeTab: activeTab.value,
    generateText: generateText.value,
    generatedQrDataUrl: generatedQrDataUrl.value,
    downloadFileName: downloadFileName.value,
    errorCorrectionLevel: errorCorrectionLevel.value,
    decodeFile: decodeFile.value,
    decodedText: decodedText.value,
  })
}

async function generateQrCode() {
  const text = generateText.value
  if (!text.trim()) {
    ElMessage.warning('请输入要生成二维码的内容')
    return
  }

  try {
    processing.value = true
    progress.value = 30
    statusText.value = '正在生成二维码'
    generateError.value = ''
    generatedQrDataUrl.value = await QRCodeLib.toDataURL(text, {
      errorCorrectionLevel: errorCorrectionLevel.value,
      margin: 2,
      width: 720,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
    progress.value = 100
    statusText.value = '二维码已生成'
    ElMessage.success('二维码生成完成')
    schedulePersist()
  } catch (error: any) {
    generateError.value = error?.message || '二维码生成失败'
  } finally {
    processing.value = false
  }
}

async function downloadGeneratedQr() {
  if (!generatedQrDataUrl.value) {
    ElMessage.warning('当前没有可下载的二维码')
    return
  }

  const response = await fetch(generatedQrDataUrl.value)
  const blob = await response.blob()
  downloadBlob(blob, `${normalizeFileName(downloadFileName.value || 'qrcode')}.png`)
}

async function copyDecodedText() {
  if (!decodedText.value) {
    ElMessage.warning('当前没有可复制的识别结果')
    return
  }

  try {
    await navigator.clipboard.writeText(decodedText.value)
    ElMessage.success('识别内容已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function copyGenerateText() {
  if (!generateText.value) {
    ElMessage.warning('当前没有可复制的原始内容')
    return
  }

  try {
    await navigator.clipboard.writeText(generateText.value)
    ElMessage.success('原始内容已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function triggerSelectFile() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  applyDecodeFile(file)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) {
    return
  }
  applyDecodeFile(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

function applyDecodeFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }

  decodeFile.value = file
  decodedText.value = ''
  decodeError.value = ''
  setDecodePreviewFile(file)
  schedulePersist()
}

function setDecodePreviewFile(file: File) {
  revokeDecodePreviewUrl()
  decodePreviewUrl.value = URL.createObjectURL(file)
}

function revokeDecodePreviewUrl() {
  if (decodePreviewUrl.value) {
    URL.revokeObjectURL(decodePreviewUrl.value)
    decodePreviewUrl.value = ''
  }
}

function decodeQrCode() {
  if (!decodeFile.value) {
    ElMessage.warning('请先上传二维码图片')
    return
  }

  processing.value = true
  progress.value = 0
  statusText.value = '准备识别二维码'
  decodeError.value = ''
  worker.postMessage({
    type: 'decode',
    file: decodeFile.value,
  })
}

async function clearAll() {
  generateText.value = ''
  generatedQrDataUrl.value = ''
  downloadFileName.value = 'qrcode'
  errorCorrectionLevel.value = 'M'
  decodeFile.value = null
  decodedText.value = ''
  decodeError.value = ''
  generateError.value = ''
  statusText.value = ''
  progress.value = 0
  activeTab.value = 'generate'
  revokeDecodePreviewUrl()
  await removeToolboxIndexedCache(QRCODE_TOOL_CACHE_KEY)
}

function formatBytes(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function normalizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'qrcode'
}
</script>

<template>
  <div class="qrcode-tool-page">
    <div class="qrcode-tool-card">
      <header class="qrcode-tool-header toolbox-inline-header">
        <div>
          <h1 class="qrcode-tool-title">二维码</h1>
        </div>

        <div class="qrcode-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">任意字符串生成</span>
          <span class="meta-chip toolbox-meta-chip">二维码下载</span>
          <span class="meta-chip toolbox-meta-chip">图片识别提取</span>
        </div>
      </header>

      <div class="qrcode-tool-toolbar toolbox-inline-toolbar">
        <div class="toolbar-tabs toolbox-toolbar-group">
          <button class="tab-btn" :class="{ active: activeTab === 'generate' }" @click="activeTab = 'generate'">生成</button>
          <button class="tab-btn" :class="{ active: activeTab === 'decode' }" @click="activeTab = 'decode'">识别</button>
        </div>

        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="清空" @click="clearAll">
            <Eraser :size="14" />
            <span>清空</span>
          </button>
        </div>
      </div>

      <div v-if="processing" class="progress-card">
        <div class="progress-head">
          <span>{{ statusText || '处理中' }}</span>
          <span>{{ progress }}%</span>
        </div>
        <el-progress :percentage="progress" :stroke-width="10" />
      </div>

      <div v-if="activeTab === 'generate'" class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">原始内容</div>
              <div class="panel-subtitle">{{ generateSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!generateText" @click="copyGenerateText">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !generateText.trim()" @click="generateQrCode">
                <QrCode :size="14" />
                <span>生成</span>
              </button>
            </div>
          </div>

          <textarea
            v-model="generateText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入任意文本、URL、JSON、命令或多行内容"
          />

          <div class="inline-options">
            <label class="toolbar-select">
              <span>纠错级别</span>
              <el-select v-model="errorCorrectionLevel" style="width: 60px">
                <el-option label="L" value="L" />
                <el-option label="M" value="M" />
                <el-option label="Q" value="Q" />
                <el-option label="H" value="H" />
              </el-select>
            </label>
            <el-input v-model="downloadFileName" class="filename-input" placeholder="下载文件名" />
          </div>

          <div v-if="generateError" class="error-tip">{{ generateError }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">二维码预览</div>
              <div class="panel-subtitle">生成后可直接下载 PNG 图片</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!generatedQrDataUrl" @click="downloadGeneratedQr">
                <Download :size="14" />
                <span>下载</span>
              </button>
            </div>
          </div>

          <div class="preview-box">
            <template v-if="generatedQrDataUrl">
              <img :src="generatedQrDataUrl" alt="二维码预览" class="preview-image qrcode-image" />
            </template>
            <template v-else>
              <div class="empty-state">
                <QrCode :size="24" />
                <span>输入内容后生成二维码</span>
              </div>
            </template>
          </div>
        </section>
      </div>

      <div v-else class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">二维码图片</div>
              <div class="panel-subtitle">{{ decodeSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" @click="triggerSelectFile">
                <Upload :size="14" />
                <span>选择</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !decodeFile" @click="decodeQrCode">
                <ScanLine :size="14" />
                <span>识别</span>
              </button>
            </div>
          </div>

          <input ref="fileInputRef" class="hidden-input" type="file" accept="image/*" @change="handleFileChange" />

          <div class="upload-dropzone" @drop="handleDrop" @dragover="handleDragOver">
            <template v-if="decodePreviewUrl">
              <img :src="decodePreviewUrl" alt="二维码图片预览" class="preview-image" />
            </template>
            <template v-else>
              <div class="empty-state">
                <Upload :size="24" />
                <span>拖拽二维码图片到这里，或点击上方按钮选择</span>
              </div>
            </template>
          </div>

          <div v-if="decodeError" class="error-tip">{{ decodeError }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">识别结果</div>
              <div class="panel-subtitle">支持复制二维码中的原始内容</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!decodedText" @click="copyDecodedText">
                <Copy :size="14" />
                <span>复制</span>
              </button>
            </div>
          </div>

          <textarea
            :value="decodedText"
            class="editor-textarea"
            readonly
            spellcheck="false"
            placeholder="识别到的二维码内容会显示在这里"
          />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qrcode-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.qrcode-tool-card {
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

.qrcode-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.qrcode-tool-toolbar,
.progress-card {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.qrcode-tool-toolbar {
}

.panel-actions,
.inline-options {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.tab-btn,
.action-btn,
.ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--content-border);
  border-radius: 10px;
  background: var(--content-bg-secondary);
  color: var(--content-text);
  font: inherit;
  cursor: pointer;
  transition: 150ms ease;
}

.tab-btn {
  padding: 9px 14px;
}

.tab-btn.active,
.action-btn.primary {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #ffffff 24%) 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgba(79, 107, 255, 0.22);
}

.action-btn,
.ghost-btn {
  padding: 9px 12px;
}

.tab-btn:hover,
.action-btn:hover,
.ghost-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--content-border) 62%);
}

.action-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--content-text-secondary);
}

.workbench-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.workbench-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--content-border);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
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
  line-height: 1.6;
}

.hidden-input {
  display: none;
}

.preview-box,
.upload-dropzone {
  flex: 1;
  min-height: 280px;
  border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--content-border) 60%);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 60%, transparent 40%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.qrcode-image {
  width: min(360px, 100%);
  image-rendering: pixelated;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 24px;
  text-align: center;
  color: var(--content-text-secondary);
}

.toolbar-select {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--content-text-secondary);
  font-size: 13px;
}

.filename-input {
  width: 150px;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 260px;
  padding: 16px;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  outline: none;
  resize: none;
  background: var(--content-bg-secondary);
  color: var(--content-text);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  tab-size: 2;
}

.editor-textarea::placeholder {
  color: var(--content-text-muted);
}

.error-tip {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--destructive) 14%, transparent 86%);
  color: var(--destructive);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .workbench-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .qrcode-tool-card {
    padding: 18px;
  }

  .preview-box,
  .upload-dropzone,
  .editor-textarea {
    min-height: 220px;
  }

  .filename-input {
    width: 100%;
  }
}

</style>
