<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Copy, Download, Eraser, FileText, ImageUp, RefreshCcw, Upload } from 'lucide-vue-next'
import { downloadBlob } from '@/api/openapi-docs'
import { readToolboxIndexedCache, removeToolboxIndexedCache, writeToolboxIndexedCache } from '@/utils/toolboxIndexedCache'

type ActiveTab = 'imageToBase64' | 'base64ToImage' | 'contentToBase64' | 'base64ToContent'

type CachedState = {
  activeTab: ActiveTab
  includeImageDataUrlPrefix: boolean
  imageFile: File | null
  imagePureBase64Result: string
  imageOutputMimeType: string
  imageOutputFileName: string
  base64ImageInputText: string
  decodedBlob: Blob | null
  decodedMimeType: string
  downloadFileName: string
  includeContentDataUrlPrefix: boolean
  contentInputText: string
  contentPureBase64Result: string
  contentOutputMimeType: string
  contentOutputCharset: string
  base64ContentInputText: string
  decodedContentText: string
  decodedContentMimeType: string
  decodedContentCharset: string
}

type WorkerProgressMessage = {
  type: 'progress'
  progress: number
  stage: string
}

type WorkerFileSuccessMessage = {
  type: 'fileToBase64:success'
  pureBase64: string
  mimeType: string
  fileName: string
  size: number
}

type WorkerImageSuccessMessage = {
  type: 'base64ToImage:success'
  blob: Blob
  mimeType: string
  byteSize: number
}

type WorkerTextEncodeSuccessMessage = {
  type: 'textToBase64:success'
  pureBase64: string
  mimeType: string
  charset: string
  byteSize: number
}

type WorkerTextDecodeSuccessMessage = {
  type: 'base64ToText:success'
  text: string
  mimeType: string
  charset: string
  byteSize: number
}

type WorkerErrorMessage = {
  type: 'error'
  message: string
}

type WorkerResponse =
  | WorkerProgressMessage
  | WorkerFileSuccessMessage
  | WorkerImageSuccessMessage
  | WorkerTextEncodeSuccessMessage
  | WorkerTextDecodeSuccessMessage
  | WorkerErrorMessage

const BASE64_TOOL_CACHE_KEY = 'toolbox:base64:workbench'
const LARGE_TEXT_RENDER_THRESHOLD = 240000
const PREVIEW_TEXT_LENGTH = 12000
const DEFAULT_DOWNLOAD_FILE_NAME = 'converted-image'

const activeTab = ref<ActiveTab>('imageToBase64')

const includeImageDataUrlPrefix = ref(true)
const imageFile = ref<File | null>(null)
const imagePreviewUrl = ref('')
const imagePureBase64Result = ref('')
const imageOutputMimeType = ref('image/png')
const imageOutputFileName = ref('')
const showFullImageBase64 = ref(false)

const base64ImageInputText = ref('')
const decodedBlob = ref<Blob | null>(null)
const decodedPreviewUrl = ref('')
const decodedMimeType = ref('image/png')
const decodedByteSize = ref(0)
const downloadFileName = ref(DEFAULT_DOWNLOAD_FILE_NAME)

const includeContentDataUrlPrefix = ref(false)
const contentInputText = ref('')
const contentPureBase64Result = ref('')
const contentOutputMimeType = ref('text/plain')
const contentOutputCharset = ref('utf-8')
const showFullContentBase64 = ref(false)

const base64ContentInputText = ref('')
const decodedContentText = ref('')
const decodedContentMimeType = ref('text/plain')
const decodedContentCharset = ref('utf-8')
const decodedContentByteSize = ref(0)

const processing = ref(false)
const progress = ref(0)
const statusText = ref('')
const imageToBase64Error = ref('')
const base64ToImageError = ref('')
const contentToBase64Error = ref('')
const base64ToContentError = ref('')
const restoringCache = ref(true)

const fileInputRef = ref<HTMLInputElement | null>(null)
const worker = new Worker(new URL('../../../workers/base64Worker.ts', import.meta.url), { type: 'module' })

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingAction: 'fileToBase64' | 'base64ToImage' | 'textToBase64' | 'base64ToText' | null = null

const imageBase64OutputText = computed(() => {
  if (!imagePureBase64Result.value) {
    return ''
  }
  if (!includeImageDataUrlPrefix.value) {
    return imagePureBase64Result.value
  }
  return `data:${imageOutputMimeType.value};base64,${imagePureBase64Result.value}`
})

const contentBase64OutputText = computed(() => {
  if (!contentPureBase64Result.value) {
    return ''
  }
  if (!includeContentDataUrlPrefix.value) {
    return contentPureBase64Result.value
  }
  return `data:${contentOutputMimeType.value};charset=${contentOutputCharset.value};base64,${contentPureBase64Result.value}`
})

const isLargeImageBase64Output = computed(() => imageBase64OutputText.value.length > LARGE_TEXT_RENDER_THRESHOLD)
const isLargeContentBase64Output = computed(() => contentBase64OutputText.value.length > LARGE_TEXT_RENDER_THRESHOLD)
const isLargeDecodedContent = computed(() => decodedContentText.value.length > LARGE_TEXT_RENDER_THRESHOLD)

const visibleImageBase64Output = computed(() => buildVisibleLargeText(imageBase64OutputText.value, isLargeImageBase64Output.value, showFullImageBase64.value))
const visibleContentBase64Output = computed(() => buildVisibleLargeText(contentBase64OutputText.value, isLargeContentBase64Output.value, showFullContentBase64.value))
const visibleDecodedContent = computed(() => buildVisibleLargeText(decodedContentText.value, isLargeDecodedContent.value, true))

const imageFileSummary = computed(() => {
  if (!imageFile.value) {
    return '未选择图片'
  }
  return `${imageFile.value.name} · ${formatBytes(imageFile.value.size)} · ${imageFile.value.type || '未知类型'}`
})

const imageBase64ResultSummary = computed(() => {
  if (!imageBase64OutputText.value) {
    return '尚未生成 Base64'
  }
  return `${imageBase64OutputText.value.length.toLocaleString()} 字符 · ${includeImageDataUrlPrefix.value ? '含 data URL 前缀' : '纯 Base64'}`
})

const decodedImageSummary = computed(() => {
  if (!decodedBlob.value) {
    return '尚未生成图片'
  }
  return `${decodedMimeType.value} · ${formatBytes(decodedByteSize.value)}`
})

const contentInputSummary = computed(() => buildTextSummary(contentInputText.value, '内容为空'))

const contentBase64ResultSummary = computed(() => {
  if (!contentBase64OutputText.value) {
    return '尚未生成 Base64'
  }
  return `${contentBase64OutputText.value.length.toLocaleString()} 字符 · ${includeContentDataUrlPrefix.value ? '含文本 data URL 前缀' : '纯 Base64'}`
})

const contentDecodedSummary = computed(() => {
  if (!decodedContentText.value) {
    return '尚未解码内容'
  }
  const lines = decodedContentText.value.split('\n').length
  return `${decodedContentMimeType.value} · ${decodedContentCharset.value.toUpperCase()} · ${lines} 行 / ${decodedContentText.value.length.toLocaleString()} 字符 · ${formatBytes(decodedContentByteSize.value)}`
})

onMounted(async () => {
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data

    if (message.type === 'progress') {
      progress.value = message.progress
      statusText.value = message.stage
      return
    }

    processing.value = false
    progress.value = 100

    if (message.type === 'error') {
      statusText.value = ''
      if (pendingAction === 'fileToBase64') {
        imageToBase64Error.value = message.message
      } else if (pendingAction === 'base64ToImage') {
        base64ToImageError.value = message.message
      } else if (pendingAction === 'textToBase64') {
        contentToBase64Error.value = message.message
      } else if (pendingAction === 'base64ToText') {
        base64ToContentError.value = message.message
      }
      pendingAction = null
      return
    }

    if (message.type === 'fileToBase64:success') {
      imagePureBase64Result.value = message.pureBase64
      imageOutputMimeType.value = message.mimeType || 'application/octet-stream'
      imageOutputFileName.value = message.fileName || 'image'
      showFullImageBase64.value = !isLargeImageBase64Output.value
      imageToBase64Error.value = ''
      statusText.value = '图片已转换为 Base64'
      pendingAction = null
      ElMessage.success('图片转 Base64 完成')
      schedulePersist()
      return
    }

    if (message.type === 'base64ToImage:success') {
      setDecodedBlob(message.blob, message.mimeType, message.byteSize)
      base64ToImageError.value = ''
      statusText.value = 'Base64 已转换为图片'
      pendingAction = null
      ElMessage.success('Base64 转图片完成')
      schedulePersist()
      return
    }

    if (message.type === 'textToBase64:success') {
      contentPureBase64Result.value = message.pureBase64
      contentOutputMimeType.value = message.mimeType || 'text/plain'
      contentOutputCharset.value = message.charset || 'utf-8'
      showFullContentBase64.value = !isLargeContentBase64Output.value
      contentToBase64Error.value = ''
      statusText.value = '内容已转换为 Base64'
      pendingAction = null
      ElMessage.success('内容转 Base64 完成')
      schedulePersist()
      return
    }

    if (message.type === 'base64ToText:success') {
      decodedContentText.value = message.text
      decodedContentMimeType.value = message.mimeType || 'text/plain'
      decodedContentCharset.value = message.charset || 'utf-8'
      decodedContentByteSize.value = message.byteSize
      base64ToContentError.value = ''
      statusText.value = 'Base64 已转换为内容'
      pendingAction = null
      ElMessage.success('Base64 转内容完成')
      schedulePersist()
    }
  }

  await restoreCache()
  restoringCache.value = false
})

onBeforeUnmount(() => {
  worker.terminate()
  revokeUrl(imagePreviewUrl.value)
  revokeUrl(decodedPreviewUrl.value)
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
})

watch(includeImageDataUrlPrefix, () => {
  if (imagePureBase64Result.value && !isLargeImageBase64Output.value) {
    showFullImageBase64.value = true
  }
  schedulePersist()
})

watch(includeContentDataUrlPrefix, () => {
  if (contentPureBase64Result.value && !isLargeContentBase64Output.value) {
    showFullContentBase64.value = true
  }
  schedulePersist()
})

watch(
  [
    activeTab,
    imageFile,
    imagePureBase64Result,
    imageOutputMimeType,
    imageOutputFileName,
    base64ImageInputText,
    decodedBlob,
    downloadFileName,
    contentInputText,
    contentPureBase64Result,
    contentOutputMimeType,
    contentOutputCharset,
    base64ContentInputText,
    decodedContentText,
    decodedContentMimeType,
    decodedContentCharset,
  ],
  schedulePersist
)

async function restoreCache() {
  const cached = await readToolboxIndexedCache<CachedState>(BASE64_TOOL_CACHE_KEY)
  if (!cached) {
    return
  }

  activeTab.value = cached.activeTab || 'imageToBase64'
  includeImageDataUrlPrefix.value = cached.includeImageDataUrlPrefix !== false
  imagePureBase64Result.value = cached.imagePureBase64Result || ''
  imageOutputMimeType.value = cached.imageOutputMimeType || 'image/png'
  imageOutputFileName.value = cached.imageOutputFileName || ''
  base64ImageInputText.value = cached.base64ImageInputText || ''
  downloadFileName.value = cached.downloadFileName || DEFAULT_DOWNLOAD_FILE_NAME
  includeContentDataUrlPrefix.value = cached.includeContentDataUrlPrefix === true
  contentInputText.value = cached.contentInputText || ''
  contentPureBase64Result.value = cached.contentPureBase64Result || ''
  contentOutputMimeType.value = cached.contentOutputMimeType || 'text/plain'
  contentOutputCharset.value = cached.contentOutputCharset || 'utf-8'
  base64ContentInputText.value = cached.base64ContentInputText || ''
  decodedContentText.value = cached.decodedContentText || ''
  decodedContentMimeType.value = cached.decodedContentMimeType || 'text/plain'
  decodedContentCharset.value = cached.decodedContentCharset || 'utf-8'
  decodedContentByteSize.value = cached.decodedContentText ? new TextEncoder().encode(cached.decodedContentText).length : 0
  showFullImageBase64.value = imageBase64OutputText.value.length <= LARGE_TEXT_RENDER_THRESHOLD
  showFullContentBase64.value = contentBase64OutputText.value.length <= LARGE_TEXT_RENDER_THRESHOLD

  if (cached.imageFile) {
    imageFile.value = cached.imageFile
    imageOutputMimeType.value = cached.imageFile.type || imageOutputMimeType.value
    imageOutputFileName.value = cached.imageFile.name
    setImagePreviewFile(cached.imageFile)
  }

  if (cached.decodedBlob) {
    setDecodedBlob(cached.decodedBlob, cached.decodedMimeType || cached.decodedBlob.type || 'image/png', cached.decodedBlob.size)
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
  }, 500)
}

async function persistState() {
  const hasValue =
    !!imageFile.value ||
    !!imagePureBase64Result.value ||
    !!base64ImageInputText.value.trim() ||
    !!decodedBlob.value ||
    !!contentInputText.value ||
    !!contentPureBase64Result.value ||
    !!base64ContentInputText.value.trim() ||
    !!decodedContentText.value

  const isDefaultState =
    activeTab.value === 'imageToBase64' &&
    includeImageDataUrlPrefix.value &&
    !includeContentDataUrlPrefix.value &&
    downloadFileName.value === DEFAULT_DOWNLOAD_FILE_NAME

  if (!hasValue && isDefaultState) {
    await removeToolboxIndexedCache(BASE64_TOOL_CACHE_KEY)
    return
  }

  await writeToolboxIndexedCache<CachedState>(BASE64_TOOL_CACHE_KEY, {
    activeTab: activeTab.value,
    includeImageDataUrlPrefix: includeImageDataUrlPrefix.value,
    imageFile: imageFile.value,
    imagePureBase64Result: imagePureBase64Result.value,
    imageOutputMimeType: imageOutputMimeType.value,
    imageOutputFileName: imageOutputFileName.value,
    base64ImageInputText: base64ImageInputText.value,
    decodedBlob: decodedBlob.value,
    decodedMimeType: decodedMimeType.value,
    downloadFileName: downloadFileName.value,
    includeContentDataUrlPrefix: includeContentDataUrlPrefix.value,
    contentInputText: contentInputText.value,
    contentPureBase64Result: contentPureBase64Result.value,
    contentOutputMimeType: contentOutputMimeType.value,
    contentOutputCharset: contentOutputCharset.value,
    base64ContentInputText: base64ContentInputText.value,
    decodedContentText: decodedContentText.value,
    decodedContentMimeType: decodedContentMimeType.value,
    decodedContentCharset: decodedContentCharset.value,
  })
}

function triggerFileSelect() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  applySelectedFile(file)
  input.value = ''
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) {
    return
  }
  applySelectedFile(file)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

function applySelectedFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }

  imageFile.value = file
  imagePureBase64Result.value = ''
  imageOutputMimeType.value = file.type || 'application/octet-stream'
  imageOutputFileName.value = file.name
  imageToBase64Error.value = ''
  showFullImageBase64.value = false
  setImagePreviewFile(file)
  schedulePersist()
}

function setImagePreviewFile(file: File) {
  revokeUrl(imagePreviewUrl.value)
  imagePreviewUrl.value = URL.createObjectURL(file)
}

function setDecodedBlob(blob: Blob, mimeType: string, byteSize: number) {
  decodedBlob.value = blob
  decodedMimeType.value = mimeType || blob.type || 'image/png'
  decodedByteSize.value = byteSize || blob.size
  revokeUrl(decodedPreviewUrl.value)
  decodedPreviewUrl.value = URL.createObjectURL(blob)
}

function revokeUrl(url: string) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

function startFileToBase64() {
  if (!imageFile.value) {
    ElMessage.warning('请先选择图片')
    return
  }

  processing.value = true
  progress.value = 0
  statusText.value = '准备开始转换'
  imageToBase64Error.value = ''
  pendingAction = 'fileToBase64'
  worker.postMessage({
    type: 'fileToBase64',
    file: imageFile.value,
  })
}

function startBase64ToImage() {
  if (!base64ImageInputText.value.trim()) {
    ElMessage.warning('请输入 Base64 内容')
    return
  }

  processing.value = true
  progress.value = 0
  statusText.value = '准备开始解析'
  base64ToImageError.value = ''
  pendingAction = 'base64ToImage'
  worker.postMessage({
    type: 'base64ToImage',
    input: base64ImageInputText.value,
  })
}

function startContentToBase64() {
  if (!contentInputText.value) {
    ElMessage.warning('请输入待编码内容')
    return
  }

  processing.value = true
  progress.value = 0
  statusText.value = '准备开始编码'
  contentToBase64Error.value = ''
  pendingAction = 'textToBase64'
  worker.postMessage({
    type: 'textToBase64',
    input: contentInputText.value,
  })
}

function startBase64ToContent() {
  if (!base64ContentInputText.value.trim()) {
    ElMessage.warning('请输入 Base64 内容')
    return
  }

  processing.value = true
  progress.value = 0
  statusText.value = '准备开始反编码'
  base64ToContentError.value = ''
  pendingAction = 'base64ToText'
  worker.postMessage({
    type: 'base64ToText',
    input: base64ContentInputText.value,
  })
}

async function copyImageBase64Output() {
  await copyTextValue(imageBase64OutputText.value, '当前没有可复制的 Base64', 'Base64 已复制')
}

async function copyBase64ImageInput() {
  await copyTextValue(base64ImageInputText.value.trim(), '当前没有可复制的输入内容', '输入内容已复制')
}

async function copyContentInput() {
  await copyTextValue(contentInputText.value, '当前没有可复制的输入内容', '输入内容已复制')
}

async function copyContentBase64Output() {
  await copyTextValue(contentBase64OutputText.value, '当前没有可复制的 Base64', 'Base64 已复制')
}

async function copyBase64ContentInput() {
  await copyTextValue(base64ContentInputText.value.trim(), '当前没有可复制的输入内容', '输入内容已复制')
}

async function copyDecodedContentOutput() {
  await copyTextValue(decodedContentText.value, '当前没有可复制的解码结果', '解码结果已复制')
}

async function copyTextValue(value: string, emptyMessage: string, successMessage: string) {
  if (!value) {
    ElMessage.warning(emptyMessage)
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(successMessage)
  } catch {
    ElMessage.error('复制失败')
  }
}

function downloadImageBase64Text() {
  if (!imageBase64OutputText.value) {
    ElMessage.warning('当前没有可下载的 Base64')
    return
  }

  const blob = new Blob([imageBase64OutputText.value], { type: 'text/plain;charset=utf-8' })
  const fileName = `${stripExtension(imageOutputFileName.value || 'image')}.base64.txt`
  downloadBlob(blob, fileName)
}

function downloadContentBase64Text() {
  if (!contentBase64OutputText.value) {
    ElMessage.warning('当前没有可下载的 Base64')
    return
  }

  const blob = new Blob([contentBase64OutputText.value], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, 'content.base64.txt')
}

function downloadDecodedImage() {
  if (!decodedBlob.value) {
    ElMessage.warning('当前没有可下载的图片')
    return
  }

  const extension = mimeToExtension(decodedMimeType.value)
  const name = stripExtension(downloadFileName.value || DEFAULT_DOWNLOAD_FILE_NAME)
  downloadBlob(decodedBlob.value, `${name}.${extension}`)
}

function downloadDecodedContent() {
  if (!decodedContentText.value) {
    ElMessage.warning('当前没有可下载的解码结果')
    return
  }

  const blob = new Blob([decodedContentText.value], { type: `text/plain;charset=${decodedContentCharset.value}` })
  downloadBlob(blob, 'decoded-content.txt')
}

function clearImageToBase64() {
  imageFile.value = null
  imagePureBase64Result.value = ''
  imageOutputFileName.value = ''
  imageOutputMimeType.value = 'image/png'
  imageToBase64Error.value = ''
  progress.value = 0
  statusText.value = ''
  showFullImageBase64.value = false
  revokeUrl(imagePreviewUrl.value)
  imagePreviewUrl.value = ''
  schedulePersist()
}

function clearBase64ToImage() {
  base64ImageInputText.value = ''
  base64ToImageError.value = ''
  decodedBlob.value = null
  decodedByteSize.value = 0
  decodedMimeType.value = 'image/png'
  progress.value = 0
  statusText.value = ''
  revokeUrl(decodedPreviewUrl.value)
  decodedPreviewUrl.value = ''
  schedulePersist()
}

function clearContentToBase64() {
  contentInputText.value = ''
  contentPureBase64Result.value = ''
  contentOutputMimeType.value = 'text/plain'
  contentOutputCharset.value = 'utf-8'
  contentToBase64Error.value = ''
  progress.value = 0
  statusText.value = ''
  showFullContentBase64.value = false
  schedulePersist()
}

function clearBase64ToContent() {
  base64ContentInputText.value = ''
  decodedContentText.value = ''
  decodedContentMimeType.value = 'text/plain'
  decodedContentCharset.value = 'utf-8'
  decodedContentByteSize.value = 0
  base64ToContentError.value = ''
  progress.value = 0
  statusText.value = ''
  schedulePersist()
}

async function clearAll() {
  clearImageToBase64()
  clearBase64ToImage()
  clearContentToBase64()
  clearBase64ToContent()
  downloadFileName.value = DEFAULT_DOWNLOAD_FILE_NAME
  includeImageDataUrlPrefix.value = true
  includeContentDataUrlPrefix.value = false
  activeTab.value = 'imageToBase64'
  await removeToolboxIndexedCache(BASE64_TOOL_CACHE_KEY)
}

function buildVisibleLargeText(text: string, isLarge: boolean, showFull: boolean) {
  if (!text) {
    return ''
  }
  if (!isLarge || showFull) {
    return text
  }
  return `${text.slice(0, PREVIEW_TEXT_LENGTH)}\n\n... 内容过大，已截断显示。可直接复制全部或下载文本。`
}

function buildTextSummary(text: string, emptyLabel: string) {
  if (!text) {
    return emptyLabel
  }
  return `${text.split('\n').length} 行 / ${text.length.toLocaleString()} 字符`
}

function formatBytes(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function mimeToExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    case 'image/bmp':
      return 'bmp'
    case 'image/x-icon':
      return 'ico'
    default:
      return 'png'
  }
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}
</script>

<template>
  <div class="base64-tool-page">
    <div class="base64-tool-card">
      <header class="base64-tool-header toolbox-inline-header">
        <div>
          <h1 class="base64-tool-title">Base64 转换</h1>
        </div>

        <div class="base64-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">图片转 Base64</span>
          <span class="meta-chip toolbox-meta-chip">Base64 转图片</span>
          <span class="meta-chip toolbox-meta-chip">内容编码/反编码</span>
        </div>
      </header>

      <div class="base64-tool-toolbar toolbox-inline-toolbar">
        <div class="toolbar-tabs toolbox-toolbar-group">
          <button class="tab-btn" :class="{ active: activeTab === 'imageToBase64' }" @click="activeTab = 'imageToBase64'">图片转 Base64</button>
          <button class="tab-btn" :class="{ active: activeTab === 'base64ToImage' }" @click="activeTab = 'base64ToImage'">Base64 转图片</button>
          <button class="tab-btn" :class="{ active: activeTab === 'contentToBase64' }" @click="activeTab = 'contentToBase64'">内容转 Base64</button>
          <button class="tab-btn" :class="{ active: activeTab === 'base64ToContent' }" @click="activeTab = 'base64ToContent'">Base64 转内容</button>
        </div>

        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="清空全部" @click="clearAll">
            <Eraser :size="14" />
            <span>清空全部</span>
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

      <div v-if="activeTab === 'imageToBase64'" class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">源图片</div>
              <div class="panel-subtitle">{{ imageFileSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" @click="triggerFileSelect">
                <Upload :size="14" />
                <span>选择</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !imageFile" @click="startFileToBase64">
                <ImageUp :size="14" />
                <span>转换</span>
              </button>
            </div>
          </div>

          <input ref="fileInputRef" class="hidden-input" type="file" accept="image/*" @change="handleFileChange" />

          <div class="upload-dropzone" @drop="handleDrop" @dragover="handleDragOver">
            <template v-if="imagePreviewUrl">
              <img :src="imagePreviewUrl" alt="上传预览" class="preview-image" />
            </template>
            <template v-else>
              <div class="dropzone-empty">
                <Upload :size="22" />
                <span>拖拽图片到这里，或点击上方按钮选择文件</span>
              </div>
            </template>
          </div>

          <div class="inline-options">
            <label class="toolbar-switch">
              <span>输出包含 data URL 前缀</span>
              <el-switch v-model="includeImageDataUrlPrefix" />
            </label>
            <button class="ghost-btn" @click="clearImageToBase64">
              <RefreshCcw :size="14" />
              <span>重置本区</span>
            </button>
          </div>

          <div v-if="imageToBase64Error" class="error-tip">{{ imageToBase64Error }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Base64 结果</div>
              <div class="panel-subtitle">{{ imageBase64ResultSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!imageBase64OutputText" @click="copyImageBase64Output">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="ghost-btn" :disabled="!imageBase64OutputText" @click="downloadImageBase64Text">
                <Download :size="14" />
                <span>下载</span>
              </button>
            </div>
          </div>

          <div v-if="isLargeImageBase64Output" class="large-text-tip">
            <span>结果较大，默认只渲染前 {{ PREVIEW_TEXT_LENGTH.toLocaleString() }} 个字符，避免页面卡顿。</span>
            <button class="panel-link" @click="showFullImageBase64 = !showFullImageBase64">
              {{ showFullImageBase64 ? '收起全文' : '加载全文' }}
            </button>
          </div>

          <textarea
            :value="visibleImageBase64Output"
            class="editor-textarea"
            readonly
            spellcheck="false"
            placeholder="转换结果会显示在这里"
          />
        </section>
      </div>

      <div v-else-if="activeTab === 'base64ToImage'" class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Base64 输入</div>
              <div class="panel-subtitle">支持 `data:image/...;base64,...`、纯 Base64 和 Base64URL</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!base64ImageInputText.trim()" @click="copyBase64ImageInput">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !base64ImageInputText.trim()" @click="startBase64ToImage">
                <ImageUp :size="14" />
                <span>生成</span>
              </button>
            </div>
          </div>

          <textarea
            v-model="base64ImageInputText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="粘贴 Base64 字符串或 data URL"
          />

          <div class="inline-options">
            <button class="ghost-btn" @click="clearBase64ToImage">
              <RefreshCcw :size="14" />
              <span>重置本区</span>
            </button>
          </div>

          <div v-if="base64ToImageError" class="error-tip">{{ base64ToImageError }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">图片预览</div>
              <div class="panel-subtitle">{{ decodedImageSummary }}</div>
            </div>
            <div class="panel-actions">
              <el-input v-model="downloadFileName" class="filename-input" placeholder="下载文件名" />
              <button class="ghost-btn" :disabled="!decodedBlob" @click="downloadDecodedImage">
                <Download :size="14" />
                <span>下载图片</span>
              </button>
            </div>
          </div>

          <div class="image-preview-box">
            <template v-if="decodedPreviewUrl">
              <img :src="decodedPreviewUrl" alt="Base64 转换预览" class="preview-image" />
            </template>
            <template v-else>
              <div class="dropzone-empty">
                <ImageUp :size="22" />
                <span>解析成功后会在这里显示图片预览</span>
              </div>
            </template>
          </div>
        </section>
      </div>

      <div v-else-if="activeTab === 'contentToBase64'" class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">原始内容</div>
              <div class="panel-subtitle">{{ contentInputSummary }} · 按 UTF-8 编码</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!contentInputText" @click="copyContentInput">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !contentInputText" @click="startContentToBase64">
                <FileText :size="14" />
                <span>编码</span>
              </button>
            </div>
          </div>

          <textarea
            v-model="contentInputText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入任意文本内容，例如 JSON、SQL、证书、中文内容等"
          />

          <div class="inline-options">
            <label class="toolbar-switch">
              <span>输出包含文本 data URL 前缀</span>
              <el-switch v-model="includeContentDataUrlPrefix" />
            </label>
            <button class="ghost-btn" @click="clearContentToBase64">
              <RefreshCcw :size="14" />
              <span>重置本区</span>
            </button>
          </div>

          <div v-if="contentToBase64Error" class="error-tip">{{ contentToBase64Error }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Base64 结果</div>
              <div class="panel-subtitle">{{ contentBase64ResultSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!contentBase64OutputText" @click="copyContentBase64Output">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="ghost-btn" :disabled="!contentBase64OutputText" @click="downloadContentBase64Text">
                <Download :size="14" />
                <span>下载</span>
              </button>
            </div>
          </div>

          <div v-if="isLargeContentBase64Output" class="large-text-tip">
            <span>结果较大，默认只渲染前 {{ PREVIEW_TEXT_LENGTH.toLocaleString() }} 个字符，避免页面卡顿。</span>
            <button class="panel-link" @click="showFullContentBase64 = !showFullContentBase64">
              {{ showFullContentBase64 ? '收起全文' : '加载全文' }}
            </button>
          </div>

          <textarea
            :value="visibleContentBase64Output"
            class="editor-textarea"
            readonly
            spellcheck="false"
            placeholder="编码结果会显示在这里"
          />
        </section>
      </div>

      <div v-else class="workbench-grid">
        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">Base64 输入</div>
              <div class="panel-subtitle">支持纯 Base64 解码</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!base64ContentInputText.trim()" @click="copyBase64ContentInput">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="action-btn primary" :disabled="processing || !base64ContentInputText.trim()" @click="startBase64ToContent">
                <FileText :size="14" />
                <span>解码</span>
              </button>
            </div>
          </div>

          <textarea
            v-model="base64ContentInputText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="粘贴 Base64 文本，例如 SGVsbG8g5L2g5aW9"
          />

          <div class="inline-options">
            <button class="ghost-btn" @click="clearBase64ToContent">
              <RefreshCcw :size="14" />
              <span>重置本区</span>
            </button>
          </div>

          <div v-if="base64ToContentError" class="error-tip">{{ base64ToContentError }}</div>
        </section>

        <section class="workbench-panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">解码结果</div>
              <div class="panel-subtitle">{{ contentDecodedSummary }}</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" :disabled="!decodedContentText" @click="copyDecodedContentOutput">
                <Copy :size="14" />
                <span>复制</span>
              </button>
              <button class="ghost-btn" :disabled="!decodedContentText" @click="downloadDecodedContent">
                <Download :size="14" />
                <span>下载</span>
              </button>
            </div>
          </div>

          <div v-if="isLargeDecodedContent" class="large-text-tip">
            <span>内容较大，当前已直接加载全文；如出现卡顿，建议下载后查看。</span>
          </div>

          <textarea
            :value="visibleDecodedContent"
            class="editor-textarea"
            readonly
            spellcheck="false"
            placeholder="反编码结果会显示在这里"
          />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.base64-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.base64-tool-card {
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
    radial-gradient(circle at bottom left, rgba(251, 146, 60, 0.1), transparent 24%),
    var(--content-bg-secondary);
  overflow: hidden;
}

.base64-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.base64-tool-toolbar,
.progress-card {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.toolbar-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.ghost-btn,
.panel-link {
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
.ghost-btn,
.panel-link {
  padding: 9px 12px;
}

.tab-btn:hover,
.ghost-btn:hover,
.panel-link:hover,
.action-btn:hover {
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

.upload-dropzone,
.image-preview-box {
  flex: 1;
  min-height: 260px;
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

.dropzone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 24px;
  text-align: center;
  color: var(--content-text-secondary);
}

.toolbar-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--content-text-secondary);
  font-size: 13px;
}

.large-text-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning) 16%, transparent 84%);
  color: var(--content-text-secondary);
  font-size: 12px;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 280px;
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

.filename-input {
  width: 180px;
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

  .large-text-tip {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 768px) {
  .base64-tool-card {
    padding: 18px;
  }

  .upload-dropzone,
  .image-preview-box,
  .editor-textarea {
    min-height: 220px;
  }

  .filename-input {
    width: 100%;
  }
}
</style>
