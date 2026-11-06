# 工具箱（Common Tools）

从 `data-collect` 项目中独立拆出的工具箱应用，部署在 GitHub Pages 上，无需后端即可使用。

## 功能

- HTTP 调试台：分组管理、请求编辑/保存、发送、响应查看、curl 生成、执行历史
- JSON 工具：格式化、压缩、转义/去转义
- XML 工具：格式化、压缩、转义/去转义
- Base64 转换：文本与图片互转、下载
- 二维码：生成、识别、下载
- Cron 生成器：可视化生成与解释
- URL 编解码：整段编码与查询值编码
- 文本对比：双栏差异、行内差异、撤销重做

## 本地开发

```bash
npm install
npm run dev
npm run build
```

## 部署

推送到 `main` 分支后，`.github/workflows/deploy-pages.yml` 自动构建并发布到 GitHub Pages。

## 说明

- 原项目工具箱页面与样式完整保留；HTTP 调试台后端能力改为浏览器端实现：请求/分组/历史保存在 `localStorage`，通过 `fetch` 直连目标地址。
- 浏览器受 CORS 限制：目标接口需允许跨域，否则响应体与大部分响应头不可读取。
- 支持明暗双主题、页面状态缓存（`keep-alive` + localStorage / IndexedDB）与响应式布局。
