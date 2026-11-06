import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light'
const THEME_STORAGE_KEY = 'theme'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebarCollapsed'

function getSystemTheme(): ThemeMode {
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function getSavedSidebarCollapsed(): boolean {
  // 首次进入（无缓存）默认收缩侧边栏；有缓存则按用户上次的选择
  const saved = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
  if (saved === null) return true
  return saved === 'true'
}

export const useThemeStore = defineStore('theme', () => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
  const mode = ref<ThemeMode>(saved || getSystemTheme())
  const sidebarCollapsed = ref(getSavedSidebarCollapsed())

  function applyTheme(m: ThemeMode) {
    const root = document.documentElement
    const body = document.body
    // 仅切换 .light 类，主题 token 负责同步壳层和内容区配色
    if (m === 'light') {
      root.classList.add('light')
    } else {
      root.classList.remove('light')
    }
    root.dataset.theme = m
    root.style.colorScheme = m

    if (body) {
      body.dataset.theme = m
      body.style.colorScheme = m
      body.classList.toggle('light', m === 'light')
    }
  }

  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  function setTheme(m: ThemeMode) {
    mode.value = m
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  watch(mode, (m) => {
    localStorage.setItem(THEME_STORAGE_KEY, m)
    applyTheme(m)
  }, { immediate: true })

  watch(sidebarCollapsed, (value) => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value))
  }, { immediate: true })

  // 用户未手动设置主题时，跟随系统主题变化
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      mode.value = e.matches ? 'dark' : 'light'
    }
  })

  return { mode, sidebarCollapsed, toggle, setTheme, toggleSidebar }
})
