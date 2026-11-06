import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/**
 * 生成 Vite 构建配置。
 * base 使用相对路径，保证 GitHub Pages 项目页与自定义域名下资源均可加载。
 * @returns Vite 配置对象
 * 创建者：zhenghq
 */
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    sourcemap: false,
    target: ['es2022', 'safari15'],
  },
  server: {
    port: 3123,
    strictPort: true,
  },
})
