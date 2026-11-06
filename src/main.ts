import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { Search } from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import 'element-plus/dist/index.css'
import './styles/element-theme.css'
import './styles/main.css'

/**
 * 初始化并挂载工具箱独立应用。
 * @returns void
 * 创建者：zhenghq
 */
function bootstrap(): void {
  const app = createApp(App)
  app.component('Search', Search)
  app.use(createPinia())
  app.use(ElementPlus, { locale: zhCn })
  app.use(router)
  useThemeStore()
  router.isReady().finally(() => app.mount('#app'))
}

bootstrap()
