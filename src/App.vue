<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Moon, Sun, Github } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'
import { useRoute } from 'vue-router'

const themeStore = useThemeStore()
const route = useRoute()
const repoUrl = 'https://github.com/zhq734/common-tools'
const pageTitle = computed(() => (route.meta.title as string) || '工具箱')
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-brand">
        <span class="app-logo">🛠</span>
        <div class="app-brand-text">
          <strong>工具箱</strong>
          <span>常用调试与转换工具 · {{ pageTitle }}</span>
        </div>
      </div>
      <div class="app-header-actions">
        <span class="app-hint">数据仅保存在本机浏览器</span>
        <button class="header-btn" :title="themeStore.mode === 'light' ? '切换为暗色主题' : '切换为亮色主题'" @click="themeStore.toggle()">
          <Sun v-if="themeStore.mode === 'dark'" :size="16" />
          <Moon v-else :size="16" />
        </button>
        <a class="header-btn" :href="repoUrl" target="_blank" rel="noopener noreferrer" title="查看源码">
          <Github :size="16" />
        </a>
      </div>
    </header>
    <main class="app-main">
      <router-view v-if="mounted" />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--content-bg);
  color: var(--content-text);
}

.app-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--content-border);
  background: var(--content-bg-secondary);
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 10px;
  background: var(--accent);
  font-size: 18px;
}

.app-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-brand-text strong {
  font-size: 15px;
  line-height: 1.2;
}

.app-brand-text span {
  font-size: 11px;
  color: var(--content-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.app-hint {
  font-size: 11px;
  color: var(--content-text-secondary);
  white-space: nowrap;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--content-border);
  border-radius: 8px;
  background: var(--content-bg-tertiary);
  color: var(--content-text-secondary);
  cursor: pointer;
  text-decoration: none;
  transition: 150ms ease;
}

.header-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.app-main {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  padding: 16px 20px;
  display: flex;
  overflow: hidden;
}

.app-main > * {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .app-header {
    padding: 8px 12px;
  }

  .app-hint,
  .app-brand-text span {
    display: none;
  }

  .app-main {
    padding: 12px;
  }
}

@media (orientation: portrait) {
  .app-main {
    overflow: auto;
  }
}
</style>
