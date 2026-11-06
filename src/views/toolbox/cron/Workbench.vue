<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Copy, Eraser, RefreshCcw, RotateCcw } from 'lucide-vue-next'
import { readToolboxIndexedCache, removeToolboxIndexedCache, writeToolboxIndexedCache } from '@/utils/toolboxIndexedCache'

type CronMode = 'everyNMinutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

type CronCacheState = {
  mode: CronMode
  intervalMinutes: number
  minute: number
  hour: number
  weekday: string
  dayOfMonth: number
  cronExpression: string
  parseMessage: string
}

type ParsedCronResult = {
  mode: CronMode
  intervalMinutes: number
  minute: number
  hour: number
  weekday: string
  dayOfMonth: number
  normalizedExpression: string
  message: string
}

const CRON_TOOL_CACHE_KEY = 'toolbox:cron:workbench'
const weekdayOptions = [
  { label: '周一', value: 'MON' },
  { label: '周二', value: 'TUE' },
  { label: '周三', value: 'WED' },
  { label: '周四', value: 'THU' },
  { label: '周五', value: 'FRI' },
  { label: '周六', value: 'SAT' },
  { label: '周日', value: 'SUN' },
]

const mode = ref<CronMode>('daily')
const intervalMinutes = ref(5)
const minute = ref(0)
const hour = ref(9)
const weekday = ref('MON')
const dayOfMonth = ref(1)
const cronExpression = ref('0 0 9 * * *')
const parseMessage = ref('每天 09:00 执行')
const restoringCache = ref(true)

const hourOptions = Array.from({ length: 24 }, (_, value) => ({
  label: String(value).padStart(2, '0'),
  value,
}))

const minuteOptions = Array.from({ length: 60 }, (_, value) => ({
  label: String(value).padStart(2, '0'),
  value,
}))

const dayOptions = Array.from({ length: 31 }, (_, index) => ({
  label: `${index + 1} 日`,
  value: index + 1,
}))

const intervalOptions = [1, 2, 5, 10, 15, 20, 30].map(value => ({
  label: `${value} 分钟`,
  value,
}))

const modeDescription = computed(() => {
  switch (mode.value) {
    case 'everyNMinutes':
      return `每 ${intervalMinutes.value} 分钟执行一次`
    case 'hourly':
      return `每小时 ${String(minute.value).padStart(2, '0')} 分执行一次`
    case 'daily':
      return `每天 ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`
    case 'weekly':
      return `每周 ${getWeekdayLabel(weekday.value)} ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`
    case 'monthly':
      return `每月 ${dayOfMonth.value} 日 ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`
    case 'custom':
      return '自定义 Cron 表达式'
  }
})

onMounted(async () => {
  const cached = await readToolboxIndexedCache<CronCacheState>(CRON_TOOL_CACHE_KEY)
  if (cached) {
    mode.value = cached.mode || 'daily'
    intervalMinutes.value = sanitizeInterval(cached.intervalMinutes)
    minute.value = sanitizeMinuteHour(cached.minute, 0, 59)
    hour.value = sanitizeMinuteHour(cached.hour, 0, 23)
    weekday.value = normalizeWeekday(cached.weekday) || 'MON'
    dayOfMonth.value = sanitizeMinuteHour(cached.dayOfMonth, 1, 31)
    cronExpression.value = cached.cronExpression || cronExpression.value
    parseMessage.value = cached.parseMessage || parseMessage.value
  } else {
    updateExpressionFromState(false)
  }

  restoringCache.value = false
})

watch(
  [mode, intervalMinutes, minute, hour, weekday, dayOfMonth],
  () => {
    if (mode.value !== 'custom') {
      updateExpressionFromState(false)
    }
    persistState()
  },
  { deep: true }
)

watch([cronExpression, parseMessage], persistState, { deep: true })

function persistState() {
  if (restoringCache.value) {
    return
  }

  const hasValue =
    cronExpression.value.trim() !== '0 0 9 * * *' ||
    mode.value !== 'daily' ||
    intervalMinutes.value !== 5 ||
    minute.value !== 0 ||
    hour.value !== 9 ||
    weekday.value !== 'MON' ||
    dayOfMonth.value !== 1

  if (!hasValue) {
    void removeToolboxIndexedCache(CRON_TOOL_CACHE_KEY)
    return
  }

  void writeToolboxIndexedCache<CronCacheState>(CRON_TOOL_CACHE_KEY, {
    mode: mode.value,
    intervalMinutes: intervalMinutes.value,
    minute: minute.value,
    hour: hour.value,
    weekday: weekday.value,
    dayOfMonth: dayOfMonth.value,
    cronExpression: cronExpression.value,
    parseMessage: parseMessage.value,
  })
}

function updateExpressionFromState(showMessage = true) {
  cronExpression.value = buildCronExpression()
  parseMessage.value = modeDescription.value
  if (showMessage) {
    ElMessage.success('Cron 表达式已更新')
  }
}

function buildCronExpression() {
  switch (mode.value) {
    case 'everyNMinutes':
      return `0 */${intervalMinutes.value} * * * *`
    case 'hourly':
      return `0 ${minute.value} * * * *`
    case 'daily':
      return `0 ${minute.value} ${hour.value} * * *`
    case 'weekly':
      return `0 ${minute.value} ${hour.value} * * ${weekday.value}`
    case 'monthly':
      return `0 ${minute.value} ${hour.value} ${dayOfMonth.value} * *`
    case 'custom':
      return cronExpression.value.trim()
  }
}

function parseCronIntoForm() {
  const expression = cronExpression.value.trim()
  if (!expression) {
    ElMessage.warning('请输入 Cron 表达式')
    return
  }

  try {
    const parsed = parseCronExpression(expression)
    mode.value = parsed.mode
    intervalMinutes.value = parsed.intervalMinutes
    minute.value = parsed.minute
    hour.value = parsed.hour
    weekday.value = parsed.weekday
    dayOfMonth.value = parsed.dayOfMonth
    cronExpression.value = parsed.normalizedExpression
    parseMessage.value = parsed.message
    ElMessage.success('已解析到表单')
  } catch (error: any) {
    parseMessage.value = error?.message || '当前表达式暂不支持反解析'
    ElMessage.error(parseMessage.value)
  }
}

function parseCronExpression(expression: string): ParsedCronResult {
  const rawParts = expression.split(/\s+/).filter(Boolean)
  if (rawParts.length !== 5 && rawParts.length !== 6) {
    throw new Error('仅支持 5 段或 6 段 Cron 表达式')
  }

  const parts = rawParts.length === 5 ? ['0', ...rawParts] : rawParts
  const [second, minuteField, hourField, dayField, monthField, weekField] = parts

  if (second !== '0') {
    throw new Error('当前仅支持秒位为 0 的 Cron 表达式')
  }
  if (monthField !== '*') {
    throw new Error('当前仅支持月份为 * 的常用 Cron 反解析')
  }

  const normalizedWeek = normalizeWeekday(weekField)

  if (dayField === '*' && weekField === '*' && hourField === '*' && isEveryStep(minuteField)) {
    const interval = Number(minuteField.slice(2))
    return {
      mode: 'everyNMinutes',
      intervalMinutes: sanitizeInterval(interval),
      minute: 0,
      hour: 0,
      weekday: 'MON',
      dayOfMonth: 1,
      normalizedExpression: `0 */${sanitizeInterval(interval)} * * * *`,
      message: `每 ${sanitizeInterval(interval)} 分钟执行一次`,
    }
  }

  if (dayField === '*' && weekField === '*' && hourField === '*' && isNumberInRange(minuteField, 0, 59)) {
    const parsedMinute = Number(minuteField)
    return {
      mode: 'hourly',
      intervalMinutes: 5,
      minute: parsedMinute,
      hour: 0,
      weekday: 'MON',
      dayOfMonth: 1,
      normalizedExpression: `0 ${parsedMinute} * * * *`,
      message: `每小时 ${String(parsedMinute).padStart(2, '0')} 分执行一次`,
    }
  }

  if (dayField === '*' && weekField === '*' && isNumberInRange(hourField, 0, 23) && isNumberInRange(minuteField, 0, 59)) {
    const parsedHour = Number(hourField)
    const parsedMinute = Number(minuteField)
    return {
      mode: 'daily',
      intervalMinutes: 5,
      minute: parsedMinute,
      hour: parsedHour,
      weekday: 'MON',
      dayOfMonth: 1,
      normalizedExpression: `0 ${parsedMinute} ${parsedHour} * * *`,
      message: `每天 ${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')} 执行`,
    }
  }

  if (dayField === '*' && normalizedWeek && isNumberInRange(hourField, 0, 23) && isNumberInRange(minuteField, 0, 59)) {
    const parsedHour = Number(hourField)
    const parsedMinute = Number(minuteField)
    return {
      mode: 'weekly',
      intervalMinutes: 5,
      minute: parsedMinute,
      hour: parsedHour,
      weekday: normalizedWeek,
      dayOfMonth: 1,
      normalizedExpression: `0 ${parsedMinute} ${parsedHour} * * ${normalizedWeek}`,
      message: `每周 ${getWeekdayLabel(normalizedWeek)} ${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')} 执行`,
    }
  }

  if (weekField === '*' && isNumberInRange(dayField, 1, 31) && isNumberInRange(hourField, 0, 23) && isNumberInRange(minuteField, 0, 59)) {
    const parsedDay = Number(dayField)
    const parsedHour = Number(hourField)
    const parsedMinute = Number(minuteField)
    return {
      mode: 'monthly',
      intervalMinutes: 5,
      minute: parsedMinute,
      hour: parsedHour,
      weekday: 'MON',
      dayOfMonth: parsedDay,
      normalizedExpression: `0 ${parsedMinute} ${parsedHour} ${parsedDay} * *`,
      message: `每月 ${parsedDay} 日 ${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')} 执行`,
    }
  }

  throw new Error('当前表达式不在已支持的反解析范围内，请切换为自定义模式手动维护')
}

function isEveryStep(value: string) {
  return /^\*\/([1-9]|[1-5]\d)$/.test(value)
}

function isNumberInRange(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) {
    return false
  }
  const parsed = Number(value)
  return parsed >= min && parsed <= max
}

function normalizeWeekday(value: string) {
  const normalized = value.toUpperCase()
  if (weekdayOptions.some(option => option.value === normalized)) {
    return normalized
  }

  const numericMap: Record<string, string> = {
    '0': 'SUN',
    '1': 'MON',
    '2': 'TUE',
    '3': 'WED',
    '4': 'THU',
    '5': 'FRI',
    '6': 'SAT',
    '7': 'SUN',
  }

  return numericMap[normalized] || ''
}

function getWeekdayLabel(value: string) {
  return weekdayOptions.find(option => option.value === value)?.label || value
}

function sanitizeInterval(value: number) {
  return intervalOptions.some(option => option.value === value) ? value : 5
}

function sanitizeMinuteHour(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

async function copyExpression() {
  if (!cronExpression.value.trim()) {
    ElMessage.warning('当前没有可复制的 Cron 表达式')
    return
  }

  try {
    await navigator.clipboard.writeText(cronExpression.value.trim())
    ElMessage.success('Cron 表达式已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function copyDescription() {
  if (!parseMessage.value.trim()) {
    ElMessage.warning('当前没有可复制的说明')
    return
  }

  try {
    await navigator.clipboard.writeText(parseMessage.value.trim())
    ElMessage.success('说明已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function resetAll() {
  mode.value = 'daily'
  intervalMinutes.value = 5
  minute.value = 0
  hour.value = 9
  weekday.value = 'MON'
  dayOfMonth.value = 1
  cronExpression.value = '0 0 9 * * *'
  parseMessage.value = '每天 09:00 执行'
  await removeToolboxIndexedCache(CRON_TOOL_CACHE_KEY)
}
</script>

<template>
  <div class="cron-tool-page">
    <div class="cron-tool-card">
      <header class="cron-tool-header toolbox-inline-header">
        <div>
          <h1 class="cron-tool-title">Cron 生成器</h1>
        </div>

        <div class="cron-tool-meta toolbox-inline-meta">
          <span class="meta-chip toolbox-meta-chip">Cron 生成/解析</span>
          <span class="meta-chip toolbox-meta-chip">Cron 复制</span>
          <span class="meta-chip toolbox-meta-chip">常用规则解析</span>
        </div>
      </header>

      <div class="cron-tool-toolbar toolbox-inline-toolbar">
        <div class="toolbar-actions toolbox-toolbar-group">
          <button class="action-btn primary" @click="updateExpressionFromState(true)">
            <RefreshCcw :size="14" />
            <span>生成 Cron</span>
          </button>
          <button class="action-btn" @click="parseCronIntoForm">
            <RotateCcw :size="14" />
            <span>解析 Cron</span>
          </button>
        </div>

        <div class="toolbar-secondary toolbox-toolbar-group">
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="复制 Cron" @click="copyExpression">
            <Copy :size="14" />
            <span>复制 Cron</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="复制说明" @click="copyDescription">
            <Copy :size="14" />
            <span>复制说明</span>
          </button>
          <button class="ghost-btn icon-compact toolbox-icon-compact" title="重置" @click="resetAll">
            <Eraser :size="14" />
            <span>重置</span>
          </button>
        </div>
      </div>

      <div class="cron-editor-grid">
        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">结构化规则</div>
              <div class="panel-subtitle">{{ modeDescription }}</div>
            </div>
          </div>

          <div class="form-grid">
            <label class="field-block">
              <span class="field-label">调度类型</span>
              <el-select v-model="mode">
                <el-option label="每 N 分钟" value="everyNMinutes" />
                <el-option label="每小时" value="hourly" />
                <el-option label="每天" value="daily" />
                <el-option label="每周" value="weekly" />
                <el-option label="每月" value="monthly" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </label>

            <template v-if="mode === 'everyNMinutes'">
              <label class="field-block">
                <span class="field-label">分钟间隔</span>
                <el-select v-model="intervalMinutes">
                  <el-option v-for="option in intervalOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
            </template>

            <template v-else-if="mode === 'hourly'">
              <label class="field-block">
                <span class="field-label">每小时第几分钟</span>
                <el-select v-model="minute">
                  <el-option v-for="option in minuteOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
            </template>

            <template v-else-if="mode === 'daily'">
              <label class="field-block">
                <span class="field-label">小时</span>
                <el-select v-model="hour">
                  <el-option v-for="option in hourOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
              <label class="field-block">
                <span class="field-label">分钟</span>
                <el-select v-model="minute">
                  <el-option v-for="option in minuteOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
            </template>

            <template v-else-if="mode === 'weekly'">
              <label class="field-block">
                <span class="field-label">星期</span>
                <el-select v-model="weekday">
                  <el-option v-for="option in weekdayOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
              <label class="field-block">
                <span class="field-label">小时</span>
                <el-select v-model="hour">
                  <el-option v-for="option in hourOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
              <label class="field-block">
                <span class="field-label">分钟</span>
                <el-select v-model="minute">
                  <el-option v-for="option in minuteOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
            </template>

            <template v-else-if="mode === 'monthly'">
              <label class="field-block">
                <span class="field-label">每月日期</span>
                <el-select v-model="dayOfMonth">
                  <el-option v-for="option in dayOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
              <label class="field-block">
                <span class="field-label">小时</span>
                <el-select v-model="hour">
                  <el-option v-for="option in hourOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
              <label class="field-block">
                <span class="field-label">分钟</span>
                <el-select v-model="minute">
                  <el-option v-for="option in minuteOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </label>
            </template>

            <template v-else>
              <div class="custom-hint">
                自定义模式下不会改写表达式，请直接在右侧编辑区维护完整 Cron。
              </div>
            </template>
          </div>
        </section>

        <section class="editor-panel">
          <div class="editor-panel-header">
            <div>
              <div class="panel-title">Cron 表达式</div>
              <div class="panel-subtitle">支持粘贴已有 5 段或 6 段 Cron 进行反解析</div>
            </div>
          </div>

          <textarea
            v-model="cronExpression"
            class="editor-textarea"
            spellcheck="false"
            placeholder="例如：0 0 9 * * *"
          />

          <div class="result-card">
            <div class="result-label">解析说明</div>
            <div class="result-text">{{ parseMessage }}</div>
          </div>

          <div class="tips-row">
            <span>当前优先支持常见的每分钟、每小时、每天、每周、每月表达式。</span>
            <span>复杂范围、列表和月份限制可切换到自定义模式手动维护。</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cron-tool-page {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.cron-tool-card {
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
    radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.1), transparent 24%),
    var(--content-bg-secondary);
  overflow: hidden;
}

.cron-tool-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--content-text);
}

.cron-tool-desc {
  margin: 8px 0 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--content-text-secondary);
}

.cron-tool-toolbar {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 70%, transparent 30%);
}

.action-btn,
.ghost-btn {
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

.action-btn:hover,
.ghost-btn:hover {
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

.cron-editor-grid {
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
  gap: 14px;
  padding: 18px;
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

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--content-text-secondary);
}

.custom-hint {
  grid-column: 1 / -1;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning) 14%, transparent 86%);
  color: var(--content-text-secondary);
  line-height: 1.7;
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
}

.editor-textarea::placeholder {
  color: var(--content-text-muted);
}

.result-card {
  padding: 14px 16px;
  border: 1px solid var(--content-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--content-bg-tertiary) 78%, transparent 22%);
}

.result-label {
  font-size: 12px;
  color: var(--content-text-secondary);
}

.result-text {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--content-text);
}

.tips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  font-size: 12px;
  color: var(--content-text-secondary);
}

@media (max-width: 1180px) {
  .cron-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .cron-tool-card {
    padding: 18px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .editor-textarea {
    min-height: 220px;
  }
}

</style>
