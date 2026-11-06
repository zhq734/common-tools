import { createRouter, createWebHashHistory } from 'vue-router'
import ToolboxLayout from '@/views/toolbox/Layout.vue'

/**
 * 构建工具箱独立应用路由表。
 * 采用 hash 模式以适配 GitHub Pages 静态托管下的深链接刷新。
 * @returns Vue Router 实例
 * 创建者：zhenghq
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/toolbox/http' },
    {
      path: '/toolbox',
      component: ToolboxLayout,
      children: [
        { path: '', redirect: '/toolbox/http' },
        {
          path: 'http',
          name: 'ToolboxHttp',
          meta: { title: 'HTTP 调试' },
          component: () => import('@/views/toolbox/http/Workbench.vue'),
        },
        {
          path: 'json',
          name: 'ToolboxJson',
          meta: { title: 'JSON 工具' },
          component: () => import('@/views/toolbox/json/Workbench.vue'),
        },
        {
          path: 'xml',
          name: 'ToolboxXml',
          meta: { title: 'XML 工具' },
          component: () => import('@/views/toolbox/xml/Workbench.vue'),
        },
        {
          path: 'base64',
          name: 'ToolboxBase64',
          meta: { title: 'Base64 转换' },
          component: () => import('@/views/toolbox/base64/Workbench.vue'),
        },
        {
          path: 'qrcode',
          name: 'ToolboxQrcode',
          meta: { title: '二维码' },
          component: () => import('@/views/toolbox/qrcode/Workbench.vue'),
        },
        {
          path: 'cron',
          name: 'ToolboxCron',
          meta: { title: 'Cron 生成器' },
          component: () => import('@/views/toolbox/cron/Workbench.vue'),
        },
        {
          path: 'url',
          name: 'ToolboxUrl',
          meta: { title: 'URL 编解码' },
          component: () => import('@/views/toolbox/url/Workbench.vue'),
        },
        {
          path: 'text-diff',
          name: 'ToolboxTextDiff',
          meta: { title: '文本对比' },
          component: () => import('@/views/toolbox/text-diff/Workbench.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/toolbox/http' },
  ],
})

/**
 * 路由切换后同步浏览器标题。
 * @returns void
 * 创建者：zhenghq
 */
router.afterEach(to => {
  const title = (to.meta.title as string) || ''
  document.title = title ? `${title} · 工具箱` : '工具箱'
})

export default router
