<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeftRight, ChevronDown, ChevronsLeft, ChevronsRight, Copy, Eraser, RefreshCcw, Undo2 } from 'lucide-vue-next'
import { readToolboxIndexedCache, removeToolboxIndexedCache, writeToolboxIndexedCache } from '@/utils/toolboxIndexedCache'
import { useThemeStore } from '@/stores/theme'

type DiffLineType = 'equal' | 'changed' | 'leftOnly' | 'rightOnly'
type DiffTokenType = 'equal' | 'added' | 'removed'
type DiffOpType = 'equal' | 'removed' | 'added'

type DiffToken = {
  text: string
  type: DiffTokenType
}

type DiffOp = {
  type: DiffOpType
  text: string
}

type DiffLine = {
  index: number
  type: DiffLineType
  leftText: string
  rightText: string
  leftLineNumber: number | null
  rightLineNumber: number | null
  leftSourceIndex: number | null
  rightSourceIndex: number | null
  leftInsertIndex: number
  rightInsertIndex: number
  leftTokens: DiffToken[]
  rightTokens: DiffToken[]
}

type TextDiffCache = {
  leftText: string
  rightText: string
  undoStack: TextSnapshot[]
  redoStack: TextSnapshot[]
}

type TextSnapshot = {
  leftText: string
  rightText: string
}

const TEXT_DIFF_CACHE_KEY = 'toolbox:text-diff:workbench'

const themeStore = useThemeStore()
const leftText = ref('')
const rightText = ref('')
const showEditors = ref(true)
const restoringCache = ref(true)
const undoStack = ref<TextSnapshot[]>([])
const redoStack = ref<TextSnapshot[]>([])
const skipAutoHistory = ref(false)
let manualHistoryTimer: number | null = null
let pendingManualSnapshot: TextSnapshot | null = null
const editingCell = ref<{ lineIndex: number; side: 'left' | 'right' } | null>(null)
const editingValue = ref('')

onMounted(async () => {
  const cached = await readToolboxIndexedCache<TextDiffCache>(TEXT_DIFF_CACHE_KEY)
  if (cached) {
    leftText.value = cached.leftText || ''
    rightText.value = cached.rightText || ''
    undoStack.value = cached.undoStack || []
    redoStack.value = cached.redoStack || []
    showEditors.value = !(cached.leftText || cached.rightText)
  }
  restoringCache.value = false
})

watch([leftText, rightText], ([nextLeft, nextRight], [prevLeft, prevRight]) => {
  if (!restoringCache.value && !skipAutoHistory.value && (nextLeft !== prevLeft || nextRight !== prevRight)) {
    pendingManualSnapshot ||= buildSnapshot(prevLeft, prevRight)
    if (manualHistoryTimer !== null) {
      window.clearTimeout(manualHistoryTimer)
    }
    manualHistoryTimer = window.setTimeout(() => {
      if (pendingManualSnapshot && !isSameSnapshot(pendingManualSnapshot, getCurrentSnapshot())) {
        pushUndoSnapshot(pendingManualSnapshot)
        redoStack.value = []
      }
      pendingManualSnapshot = null
      manualHistoryTimer = null
      persistState()
    }, 400)
  }

  persistState()
}, { deep: true })

const diffLines = computed(() => buildLineDiff(leftText.value, rightText.value))
const hasAnyText = computed(() => Boolean(leftText.value || rightText.value))
const changedCount = computed(() => diffLines.value.filter(line => line.type !== 'equal').length)
const identical = computed(() => hasAnyText.value && changedCount.value === 0 && leftText.value === rightText.value)
const leftSummary = computed(() => buildSummary(leftText.value))
const rightSummary = computed(() => buildSummary(rightText.value))
const isLightTheme = computed(() => themeStore.mode === 'light')
const canUndo = computed(() => undoStack.value.length > 0)

function persistState() {
  if (restoringCache.value) {
    return
  }

  if (!leftText.value && !rightText.value && !undoStack.value.length && !redoStack.value.length) {
    void removeToolboxIndexedCache(TEXT_DIFF_CACHE_KEY)
    return
  }

  void writeToolboxIndexedCache<TextDiffCache>(TEXT_DIFF_CACHE_KEY, {
    leftText: leftText.value,
    rightText: rightText.value,
    undoStack: undoStack.value,
    redoStack: redoStack.value,
  })
}

function buildSnapshot(leftValue: string, rightValue: string): TextSnapshot {
  return {
    leftText: leftValue,
    rightText: rightValue,
  }
}

function getCurrentSnapshot(): TextSnapshot {
  return buildSnapshot(leftText.value, rightText.value)
}

function isSameSnapshot(left: TextSnapshot, right: TextSnapshot) {
  return left.leftText === right.leftText && left.rightText === right.rightText
}

function pushUndoSnapshot(snapshot: TextSnapshot) {
  if (undoStack.value.length > 0 && isSameSnapshot(undoStack.value[undoStack.value.length - 1], snapshot)) {
    return
  }
  undoStack.value.push(snapshot)
  if (undoStack.value.length > 100) {
    undoStack.value.shift()
  }
}

function flushPendingManualHistory() {
  if (manualHistoryTimer !== null) {
    window.clearTimeout(manualHistoryTimer)
    manualHistoryTimer = null
  }

  if (pendingManualSnapshot && !isSameSnapshot(pendingManualSnapshot, getCurrentSnapshot())) {
    pushUndoSnapshot(pendingManualSnapshot)
    redoStack.value = []
  }

  pendingManualSnapshot = null
}

function applySnapshot(snapshot: TextSnapshot, options: { recordHistory?: boolean; clearRedo?: boolean } = {}) {
  const { recordHistory = true, clearRedo = true } = options
  const currentSnapshot = getCurrentSnapshot()

  if (isSameSnapshot(currentSnapshot, snapshot)) {
    return
  }

  flushPendingManualHistory()

  if (recordHistory) {
    pushUndoSnapshot(currentSnapshot)
    if (clearRedo) {
      redoStack.value = []
    }
  }

  skipAutoHistory.value = true
  leftText.value = snapshot.leftText
  rightText.value = snapshot.rightText
  queueMicrotask(() => {
    skipAutoHistory.value = false
    persistState()
  })
}

function buildSummary(text: string) {
  if (!text) {
    return '空内容'
  }
  const lines = text.split('\n').length
  return `${lines} 行 / ${text.length} 字符`
}

function toLines(text: string) {
  return text === '' ? [] : text.split('\n')
}

function joinLines(lines: string[]) {
  return lines.length ? lines.join('\n') : ''
}

function buildLineDiff(left: string, right: string): DiffLine[] {
  if (!left && !right) {
    return []
  }

  const leftLines = toLines(left)
  const rightLines = toLines(right)
  const ops = buildLineOps(leftLines, rightLines)
  const rows: DiffLine[] = []

  let rowIndex = 0
  let leftCursor = 0
  let rightCursor = 0
  let opCursor = 0

  while (opCursor < ops.length) {
    const op = ops[opCursor]

    if (op.type === 'equal') {
      rows.push({
        index: rowIndex++,
        type: 'equal',
        leftText: op.text,
        rightText: op.text,
        leftLineNumber: leftCursor + 1,
        rightLineNumber: rightCursor + 1,
        leftSourceIndex: leftCursor,
        rightSourceIndex: rightCursor,
        leftInsertIndex: leftCursor,
        rightInsertIndex: rightCursor,
        leftTokens: [{ text: op.text, type: 'equal' }],
        rightTokens: [{ text: op.text, type: 'equal' }],
      })
      leftCursor += 1
      rightCursor += 1
      opCursor += 1
      continue
    }

    const removedBlock: string[] = []
    const addedBlock: string[] = []

    while (opCursor < ops.length && ops[opCursor].type !== 'equal') {
      if (ops[opCursor].type === 'removed') {
        removedBlock.push(ops[opCursor].text)
      } else {
        addedBlock.push(ops[opCursor].text)
      }
      opCursor += 1
    }

    const changedSize = Math.min(removedBlock.length, addedBlock.length)

    for (let index = 0; index < changedSize; index += 1) {
      const tokenDiff = buildTokenDiff(removedBlock[index], addedBlock[index])
      rows.push({
        index: rowIndex++,
        type: 'changed',
        leftText: removedBlock[index],
        rightText: addedBlock[index],
        leftLineNumber: leftCursor + 1,
        rightLineNumber: rightCursor + 1,
        leftSourceIndex: leftCursor,
        rightSourceIndex: rightCursor,
        leftInsertIndex: leftCursor,
        rightInsertIndex: rightCursor,
        leftTokens: tokenDiff.left,
        rightTokens: tokenDiff.right,
      })
      leftCursor += 1
      rightCursor += 1
    }

    for (let index = changedSize; index < removedBlock.length; index += 1) {
      rows.push({
        index: rowIndex++,
        type: 'leftOnly',
        leftText: removedBlock[index],
        rightText: '',
        leftLineNumber: leftCursor + 1,
        rightLineNumber: null,
        leftSourceIndex: leftCursor,
        rightSourceIndex: null,
        leftInsertIndex: leftCursor,
        rightInsertIndex: rightCursor,
        leftTokens: [{ text: removedBlock[index], type: 'removed' }],
        rightTokens: [],
      })
      leftCursor += 1
    }

    for (let index = changedSize; index < addedBlock.length; index += 1) {
      rows.push({
        index: rowIndex++,
        type: 'rightOnly',
        leftText: '',
        rightText: addedBlock[index],
        leftLineNumber: null,
        rightLineNumber: rightCursor + 1,
        leftSourceIndex: null,
        rightSourceIndex: rightCursor,
        leftInsertIndex: leftCursor,
        rightInsertIndex: rightCursor,
        leftTokens: [],
        rightTokens: [{ text: addedBlock[index], type: 'added' }],
      })
      rightCursor += 1
    }
  }

  return rows
}

function buildLineOps(leftLines: string[], rightLines: string[]): DiffOp[] {
  const dp = Array.from({ length: leftLines.length + 1 }, () => Array(rightLines.length + 1).fill(0))

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      if (leftLines[leftIndex] === rightLines[rightIndex]) {
        dp[leftIndex][rightIndex] = dp[leftIndex + 1][rightIndex + 1] + 1
      } else {
        dp[leftIndex][rightIndex] = Math.max(dp[leftIndex + 1][rightIndex], dp[leftIndex][rightIndex + 1])
      }
    }
  }

  const ops: DiffOp[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < leftLines.length && rightIndex < rightLines.length) {
    if (leftLines[leftIndex] === rightLines[rightIndex]) {
      ops.push({ type: 'equal', text: leftLines[leftIndex] })
      leftIndex += 1
      rightIndex += 1
      continue
    }

    if (dp[leftIndex + 1][rightIndex] >= dp[leftIndex][rightIndex + 1]) {
      ops.push({ type: 'removed', text: leftLines[leftIndex] })
      leftIndex += 1
    } else {
      ops.push({ type: 'added', text: rightLines[rightIndex] })
      rightIndex += 1
    }
  }

  while (leftIndex < leftLines.length) {
    ops.push({ type: 'removed', text: leftLines[leftIndex] })
    leftIndex += 1
  }

  while (rightIndex < rightLines.length) {
    ops.push({ type: 'added', text: rightLines[rightIndex] })
    rightIndex += 1
  }

  return ops
}

function buildTokenDiff(left: string, right: string) {
  const prefixLength = commonPrefixLength(left, right)
  const suffixLength = commonSuffixLength(left, right, prefixLength)

  const leftMiddle = left.slice(prefixLength, left.length - suffixLength)
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength)

  const prefix = left.slice(0, prefixLength)
  const suffix = suffixLength > 0 ? left.slice(left.length - suffixLength) : ''

  const leftTokens: DiffToken[] = []
  const rightTokens: DiffToken[] = []

  if (prefix) {
    leftTokens.push({ text: prefix, type: 'equal' })
    rightTokens.push({ text: prefix, type: 'equal' })
  }
  if (leftMiddle) {
    leftTokens.push({ text: leftMiddle, type: 'removed' })
  }
  if (rightMiddle) {
    rightTokens.push({ text: rightMiddle, type: 'added' })
  }
  if (suffix) {
    leftTokens.push({ text: suffix, type: 'equal' })
    rightTokens.push({ text: suffix, type: 'equal' })
  }

  if (!leftTokens.length) {
    leftTokens.push({ text: '', type: 'equal' })
  }
  if (!rightTokens.length) {
    rightTokens.push({ text: '', type: 'equal' })
  }

  return { left: leftTokens, right: rightTokens }
}

function commonPrefixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length)
  let index = 0
  while (index < max && left[index] === right[index]) {
    index += 1
  }
  return index
}

function commonSuffixLength(left: string, right: string, prefixLength: number) {
  const max = Math.min(left.length, right.length) - prefixLength
  let index = 0
  while (index < max && left[left.length - 1 - index] === right[right.length - 1 - index]) {
    index += 1
  }
  return index
}

function applyLineToLeft(line: DiffLine) {
  const leftLines = toLines(leftText.value)

  if (line.rightSourceIndex !== null) {
    if (line.leftSourceIndex !== null) {
      leftLines[line.leftSourceIndex] = line.rightText
    } else {
      leftLines.splice(line.leftInsertIndex, 0, line.rightText)
    }
  } else if (line.leftSourceIndex !== null) {
    leftLines.splice(line.leftSourceIndex, 1)
  }

  applySnapshot(buildSnapshot(joinLines(leftLines), rightText.value))
  ElMessage.success('已同步当前差异到左侧')
}

function applyLineToRight(line: DiffLine) {
  const rightLines = toLines(rightText.value)

  if (line.leftSourceIndex !== null) {
    if (line.rightSourceIndex !== null) {
      rightLines[line.rightSourceIndex] = line.leftText
    } else {
      rightLines.splice(line.rightInsertIndex, 0, line.leftText)
    }
  } else if (line.rightSourceIndex !== null) {
    rightLines.splice(line.rightSourceIndex, 1)
  }

  applySnapshot(buildSnapshot(leftText.value, joinLines(rightLines)))
  ElMessage.success('已同步当前差异到右侧')
}

function syncAllToLeft() {
  applySnapshot(buildSnapshot(rightText.value, rightText.value))
  ElMessage.success('已用右侧内容覆盖左侧')
}

function syncAllToRight() {
  applySnapshot(buildSnapshot(leftText.value, leftText.value))
  ElMessage.success('已用左侧内容覆盖右侧')
}

function swapPanels() {
  applySnapshot(buildSnapshot(rightText.value, leftText.value))
}

function toggleEditors() {
  showEditors.value = !showEditors.value
}

function undoLastChange() {
  flushPendingManualHistory()

  const previousSnapshot = undoStack.value.pop()
  if (!previousSnapshot) {
    ElMessage.warning('当前没有可回退的记录')
    return
  }

  redoStack.value.push(getCurrentSnapshot())

  skipAutoHistory.value = true
  leftText.value = previousSnapshot.leftText
  rightText.value = previousSnapshot.rightText
  queueMicrotask(() => {
    skipAutoHistory.value = false
    persistState()
  })
  ElMessage.success('已回退到上一步')
}

async function copyTextContent(value: string, label: string) {
  if (!value) {
    ElMessage.warning(`当前没有可复制的${label}`)
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败')
  }
}

async function clearAll() {
  applySnapshot(buildSnapshot('', ''), { recordHistory: Boolean(leftText.value || rightText.value) })
  showEditors.value = true
  persistState()
}

function isEditing(lineIndex: number, side: 'left' | 'right') {
  const cell = editingCell.value
  return cell !== null && cell.lineIndex === lineIndex && cell.side === side
}

async function startEdit(line: DiffLine, side: 'left' | 'right') {
  if (editingCell.value) {
    commitEdit()
  }

  const text = side === 'left' ? line.leftText : line.rightText
  editingCell.value = { lineIndex: line.index, side }
  editingValue.value = text

  await nextTick()
  const textarea = document.querySelector('.compare-line-content.is-editing .inline-editor') as HTMLTextAreaElement | null
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
    textarea.focus()
    textarea.select()
  }
}

function commitEdit() {
  if (!editingCell.value) return
  const { lineIndex, side } = editingCell.value
  const line = diffLines.value.find(l => l.index === lineIndex)
  if (!line) {
    editingCell.value = null
    editingValue.value = ''
    return
  }

  const sourceIndex = side === 'left' ? line.leftSourceIndex : line.rightSourceIndex
  const insertIndex = side === 'left' ? line.leftInsertIndex : line.rightInsertIndex
  const sourceText = side === 'left' ? leftText.value : rightText.value
  const sourceLines = toLines(sourceText)

  const originalText = sourceIndex !== null ? (sourceLines[sourceIndex] ?? '') : ''
  if (editingValue.value === originalText) {
    editingCell.value = null
    editingValue.value = ''
    return
  }

  if (sourceIndex !== null) {
    const newLines = editingValue.value.split('\n')
    sourceLines.splice(sourceIndex, 1, ...newLines)
  } else if (editingValue.value) {
    const newLines = editingValue.value.split('\n')
    sourceLines.splice(insertIndex, 0, ...newLines)
  }

  const newText = joinLines(sourceLines)
  if (side === 'left') {
    applySnapshot(buildSnapshot(newText, rightText.value))
  } else {
    applySnapshot(buildSnapshot(leftText.value, newText))
  }

  editingCell.value = null
  editingValue.value = ''
}

function cancelEdit() {
  editingCell.value = null
  editingValue.value = ''
}

function handleEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitEdit()
  }
}
</script>

<template>
  <div class="text-diff-page" :class="{ 'is-light-theme': isLightTheme }">
    <div class="text-diff-card">
      <header class="text-diff-header toolbox-inline-header">
        <div>
          <h1 class="text-diff-title">文本对比</h1>
        </div>

        <div class="text-diff-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">双栏对照</span>
          <span class="meta-chip toolbox-meta-chip">行内高亮</span>
          <span class="meta-chip toolbox-meta-chip">单行应用</span>
        </div>
      </header>

      <div class="text-diff-toolbar toolbox-inline-toolbar">
        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="action-btn primary" @click="syncAllToLeft">
            <RefreshCcw :size="14" />
            <span>右侧覆盖左侧</span>
          </button>
          <button class="action-btn" @click="syncAllToRight">
            <RefreshCcw :size="14" />
            <span>左侧覆盖右侧</span>
          </button>
        </div>

        <div class="toolbar-secondary toolbox-toolbar-group">
          <button class="ghost-btn" :title="showEditors ? '查看对比' : '编辑原文'" @click="toggleEditors">
            <span>{{ showEditors ? '查看对比' : '编辑原文' }}</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="回退" :disabled="!canUndo" @click="undoLastChange">
            <Undo2 :size="14" />
            <span>回退</span>
          </button>
          <el-dropdown trigger="click">
            <button class="ghost-btn" title="更多操作">
              <span>更多</span>
              <ChevronDown :size="14" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="swapPanels">
                  <ArrowLeftRight :size="14" />
                  <span>互换左右</span>
                </el-dropdown-item>
                <el-dropdown-item @click="copyTextContent(leftText, '左侧内容')">
                  <Copy :size="14" />
                  <span>复制左侧</span>
                </el-dropdown-item>
                <el-dropdown-item @click="copyTextContent(rightText, '右侧内容')">
                  <Copy :size="14" />
                  <span>复制右侧</span>
                </el-dropdown-item>
                <el-dropdown-item @click="clearAll">
                  <Eraser :size="14" />
                  <span>清空</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="summary-bar">
        <span>左侧：{{ leftSummary }}</span>
        <span>右侧：{{ rightSummary }}</span>
        <span v-if="identical">两侧内容一致</span>
        <span v-else-if="hasAnyText">存在 {{ changedCount }} 处差异</span>
        <span v-else>输入文本后可直接进入双栏对照</span>
      </div>

      <div v-if="showEditors" class="editor-grid">
        <section class="editor-panel">
          <div class="panel-title-row">
            <div>
              <div class="panel-title">左侧文本</div>
            </div>
          </div>
          <textarea
            v-model="leftText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入左侧文本"
          />
        </section>

        <section class="editor-panel">
          <div class="panel-title-row">
            <div>
              <div class="panel-title">右侧文本</div>
            </div>
          </div>
          <textarea
            v-model="rightText"
            class="editor-textarea"
            spellcheck="false"
            placeholder="输入右侧文本"
          />
        </section>
      </div>

      <section v-else class="compare-workspace">
        <div class="compare-header">
          <div class="compare-header-pane">
            <div class="panel-title">左侧文本</div>
            <div class="panel-subtitle">{{ leftSummary }}</div>
          </div>
          <div class="compare-header-actions">同步差异</div>
          <div class="compare-header-pane">
            <div class="panel-title">右侧文本</div>
            <div class="panel-subtitle">{{ rightSummary }}</div>
          </div>
        </div>

        <div v-if="!hasAnyText" class="compare-empty">
          <div class="compare-empty-title">当前还没有可对比的文本</div>
          <div class="compare-empty-desc">先输入左右两侧内容，再回到双栏对照视图查看差异。</div>
          <button class="action-btn" @click="showEditors = true">输入原文</button>
        </div>

        <div v-else class="compare-table">
          <div v-for="line in diffLines" :key="line.index" class="compare-row" :class="`is-${line.type}`">
            <div
              class="compare-side"
              :class="{
                'is-changed-side': line.type === 'changed',
                'is-removed-side': line.type === 'leftOnly',
              }"
            >
              <div class="compare-line-no">{{ line.leftLineNumber ?? '' }}</div>
              <div
                class="compare-line-content"
                :class="{ 'is-editing': isEditing(line.index, 'left') }"
                title="点击编辑此行"
                @click="startEdit(line, 'left')"
              >
                <template v-if="isEditing(line.index, 'left')">
                  <textarea
                    v-model="editingValue"
                    class="inline-editor"
                    rows="1"
                    @keydown="handleEditKeydown"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <template v-if="line.leftTokens.length">
                    <span
                      v-for="(token, tokenIndex) in line.leftTokens"
                      :key="`left-${line.index}-${tokenIndex}`"
                      class="diff-token"
                      :class="`is-${token.type}`"
                    >
                      {{ token.text || ' ' }}
                    </span>
                  </template>
                  <span v-else class="diff-empty-line"></span>
                </template>
              </div>
            </div>

            <div class="compare-actions">
              <template v-if="line.type !== 'equal'">
                <button class="mini-btn icon-btn" title="将右侧差异同步到左侧" @click="applyLineToLeft(line)">
                  <ChevronsLeft :size="16" />
                </button>
                <button class="mini-btn icon-btn" title="将左侧差异同步到右侧" @click="applyLineToRight(line)">
                  <ChevronsRight :size="16" />
                </button>
              </template>
            </div>

            <div
              class="compare-side"
              :class="{
                'is-changed-side': line.type === 'changed',
                'is-added-side': line.type === 'rightOnly',
              }"
            >
              <div class="compare-line-no">{{ line.rightLineNumber ?? '' }}</div>
              <div
                class="compare-line-content"
                :class="{ 'is-editing': isEditing(line.index, 'right') }"
                title="点击编辑此行"
                @click="startEdit(line, 'right')"
              >
                <template v-if="isEditing(line.index, 'right')">
                  <textarea
                    v-model="editingValue"
                    class="inline-editor"
                    rows="1"
                    @keydown="handleEditKeydown"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <template v-if="line.rightTokens.length">
                    <span
                      v-for="(token, tokenIndex) in line.rightTokens"
                      :key="`right-${line.index}-${tokenIndex}`"
                      class="diff-token"
                      :class="`is-${token.type}`"
                    >
                      {{ token.text || ' ' }}
                    </span>
                  </template>
                  <span v-else class="diff-empty-line"></span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.text-diff-page {
  --diff-added-bg: color-mix(in srgb, #22c55e 18%, var(--content-bg-secondary) 82%);
  --diff-added-text: #d1fae5;
  --diff-added-row: color-mix(in srgb, #22c55e 10%, transparent 90%);
  --diff-added-border: color-mix(in srgb, #22c55e 42%, var(--content-border) 58%);
  --diff-removed-bg: color-mix(in srgb, #ef4444 18%, var(--content-bg-secondary) 82%);
  --diff-removed-text: #fecaca;
  --diff-removed-row: color-mix(in srgb, #ef4444 10%, transparent 90%);
  --diff-removed-border: color-mix(in srgb, #ef4444 42%, var(--content-border) 58%);
  --diff-changed-row: color-mix(in srgb, var(--warning) 10%, transparent 90%);
  --diff-changed-border: color-mix(in srgb, var(--warning) 48%, var(--content-border) 52%);
  --diff-gutter-bg: color-mix(in srgb, var(--content-bg-tertiary) 78%, transparent 22%);
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.text-diff-page.is-light-theme {
  --diff-added-bg: #bbf7d0;
  --diff-added-text: #14532d;
  --diff-added-row: #dcfce7;
  --diff-added-border: #22c55e;
  --diff-removed-bg: #fecaca;
  --diff-removed-text: #7f1d1d;
  --diff-removed-row: #fee2e2;
  --diff-removed-border: #ef4444;
  --diff-changed-row: #fef3c7;
  --diff-changed-border: #f59e0b;
  --diff-gutter-bg: #f1f5f9;
}

.text-diff-card {
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

.text-diff-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.text-diff-desc {
  margin: 8px 0 0;
  max-width: 860px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--content-text-secondary);
}

.text-diff-toolbar,
.summary-bar,
.compare-workspace {
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.text-diff-toolbar {
  padding: 14px 16px;
}

.action-btn,
.ghost-btn,
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border: 1px solid var(--content-border);
  border-radius: 10px;
  background: var(--content-bg-secondary);
  color: var(--content-text);
  font: inherit;
  cursor: pointer;
  transition: 150ms ease;
}

.action-btn:disabled,
.ghost-btn:disabled,
.mini-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-btn:hover,
.ghost-btn:hover,
.mini-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--content-border) 62%);
  color: #fff;
  background: color-mix(in srgb, var(--accent) 24%, var(--content-bg-secondary) 76%);
}

.text-diff-page.is-light-theme .action-btn:hover,
.text-diff-page.is-light-theme .ghost-btn:hover,
.text-diff-page.is-light-theme .mini-btn:hover {
  color: #0f172a;
}

.action-btn.primary {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #ffffff 24%) 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgba(79, 107, 255, 0.22);
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 12px 14px;
  font-size: 13px;
  color: var(--content-text-secondary);
}

.editor-grid {
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
  gap: 5px;
  padding: 18px;
  border: 1px solid var(--content-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--content-bg) 28%, transparent 72%);
}

.panel-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.editor-textarea {
  flex: 1;
  width: 100%;
  min-height: 0;
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
}

.editor-textarea::placeholder {
  color: var(--content-text-muted);
}

.compare-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.compare-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr);
  align-items: stretch;
  border-bottom: 1px solid var(--content-border);
}

.compare-header-pane,
.compare-header-actions {
  padding: 14px 16px;
}

.compare-header-pane:first-child,
.compare-header-actions {
  border-right: 1px solid var(--content-border);
}

.compare-header-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--content-text-secondary);
  font-size: 12px;
  background: color-mix(in srgb, var(--content-bg) 20%, transparent 80%);
}

.compare-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.compare-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--content-text);
}

.compare-empty-desc {
  max-width: 420px;
  color: var(--content-text-secondary);
  line-height: 1.7;
}

.compare-table {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.compare-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr);
  min-width: 980px;
  border-bottom: 1px solid var(--content-border-subtle);
}

.compare-side {
  min-width: 0;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
}

.compare-side.is-changed-side {
  background: var(--diff-changed-row);
  box-shadow: inset 3px 0 0 var(--diff-changed-border);
}

.compare-side.is-removed-side {
  background: var(--diff-removed-row);
  box-shadow: inset 3px 0 0 var(--diff-removed-border);
}

.compare-side.is-added-side {
  background: var(--diff-added-row);
  box-shadow: inset 3px 0 0 var(--diff-added-border);
}

.compare-line-no {
  padding: 12px 10px;
  border-right: 1px solid var(--content-border-subtle);
  background: var(--diff-gutter-bg);
  color: var(--content-text-secondary);
  text-align: right;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  user-select: none;
}

.compare-line-content {
  min-width: 0;
  padding: 12px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--content-text);
  cursor: text;
  transition: background 120ms ease;
}

.compare-line-content:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent 94%);
}

.compare-line-content.is-editing {
  padding: 6px 8px;
}

.inline-editor {
  display: block;
  width: 100%;
  min-height: 28px;
  padding: 6px 8px;
  border: 2px solid var(--accent);
  border-radius: 6px;
  background: var(--content-bg);
  color: var(--content-text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  resize: none;
  overflow: hidden;
  outline: none;
  field-sizing: content;
}

.compare-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-left: 1px solid var(--content-border-subtle);
  border-right: 1px solid var(--content-border-subtle);
  background: color-mix(in srgb, var(--content-bg) 20%, transparent 80%);
}

.diff-token {
  border-radius: 4px;
  padding: 1px 0;
}

.diff-token.is-added {
  background: var(--diff-added-bg);
  color: var(--diff-added-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--diff-added-border) 65%, transparent 35%);
}

.diff-token.is-removed {
  background: var(--diff-removed-bg);
  color: var(--diff-removed-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--diff-removed-border) 65%, transparent 35%);
}

.diff-token.is-equal {
  color: var(--content-text);
}

.text-diff-page.is-light-theme .compare-line-content {
  color: #0f172a;
}

.text-diff-page.is-light-theme .compare-line-no {
  color: #475569;
}

.diff-empty-line {
  display: block;
  min-height: 20px;
}

.mini-btn {
  min-width: 40px;
  justify-content: center;
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}

.icon-btn {
  width: 40px;
  height: 32px;
  padding: 0;
}

/* 下拉菜单项图标对齐 */
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1180px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .text-diff-card {
    padding: 18px;
  }

  .compare-header,
  .compare-row {
    grid-template-columns: minmax(0, 1fr) 108px minmax(0, 1fr);
  }

  .compare-row {
    min-width: 860px;
  }

  .compare-header-pane,
  .compare-header-actions,
  .compare-actions {
    padding-left: 10px;
    padding-right: 10px;
  }

  .compare-line-content {
    padding-left: 10px;
    padding-right: 10px;
  }
}
</style>
