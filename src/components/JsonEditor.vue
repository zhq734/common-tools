<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, AlertCircle, Minimize2, Maximize2 } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: string
  rows?: number
  readonly?: boolean
  placeholder?: string
}>(), {
  rows: 10,
  readonly: false,
  placeholder: '输入 JSON...',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const error = ref('')
const formatted = ref(false)

const isValid = computed(() => {
  if (!props.modelValue.trim()) {
    error.value = ''
    return null // neutral
  }
  try {
    JSON.parse(props.modelValue)
    error.value = ''
    return true
  } catch (e: any) {
    error.value = e.message
    return false
  }
})

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  formatted.value = false
}

function formatJson() {
  try {
    const parsed = JSON.parse(props.modelValue)
    const pretty = JSON.stringify(parsed, null, 2)
    emit('update:modelValue', pretty)
    formatted.value = true
  } catch {
    // ignore
  }
}

function compressJson() {
  try {
    const parsed = JSON.parse(props.modelValue)
    emit('update:modelValue', JSON.stringify(parsed))
    formatted.value = false
  } catch {
    // ignore
  }
}
</script>

<template>
  <div class="json-editor" :class="{ 'has-error': isValid === false, 'is-valid': isValid === true }">
    <div class="json-toolbar">
      <div class="json-status">
        <template v-if="isValid === true">
          <Check :size="12" class="status-icon valid" />
          <span class="status-text valid">JSON 有效</span>
        </template>
        <template v-else-if="isValid === false">
          <AlertCircle :size="12" class="status-icon invalid" />
          <span class="status-text invalid">{{ error }}</span>
        </template>
        <span v-else class="status-text neutral">输入 JSON 内容</span>
      </div>
      <div class="json-actions">
        <button class="json-btn" @click="formatJson" title="格式化" :disabled="readonly">
          <Minimize2 :size="13" />
          <span>格式化</span>
        </button>
        <button class="json-btn" @click="compressJson" title="压缩" :disabled="readonly">
          <Maximize2 :size="13" />
          <span>压缩</span>
        </button>
      </div>
    </div>
    <textarea
      :value="modelValue"
      @input="onInput"
      :rows="rows"
      :readonly="readonly"
      :placeholder="placeholder"
      class="json-textarea"
      spellcheck="false"
    />
  </div>
</template>

<style scoped>
.json-editor {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color 150ms;
}
.json-editor:focus-within {
  border-color: var(--accent);
}
.json-editor.has-error {
  border-color: var(--destructive);
}
.json-editor.is-valid:focus-within {
  border-color: var(--accent);
}

.json-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11px;
}

.json-status {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.status-icon.valid { color: var(--accent); }
.status-icon.invalid { color: var(--destructive); flex-shrink: 0; }

.status-text.valid { color: var(--accent); }
.status-text.invalid {
  color: var(--destructive);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-text.neutral { color: var(--text-muted); }

.json-actions {
  display: flex;
  gap: 4px;
}

.json-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  font-family: var(--font-sans);
}
.json-btn:hover:not(:disabled) {
  background: var(--bg-primary);
  color: var(--text-primary);
}
.json-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.json-textarea {
  width: 100%;
  padding: 10px;
  border: none;
  outline: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  tab-size: 2;
}
.json-textarea::placeholder {
  color: var(--text-muted);
}
</style>
