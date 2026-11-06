# 工具箱（Common Tools）

从 `data-collect` 项目中独立拆出的工具箱应用，支持 GitHub Pages 在线访问与 macOS / Linux / Windows 桌面安装，无需后端即可使用。

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

## 桌面安装包

应用使用 Tauri v2 打包为原生桌面应用，无需额外后端。窗口可自由调整大小，并继续支持明暗主题与页面状态缓存。

### 本地开发与构建

首次开发桌面版时，请先按 [Tauri v2 环境要求](https://v2.tauri.app/start/prerequisites/) 安装 Rust 及对应平台的系统依赖，然后执行：

```bash
npm install
npm run desktop:dev
```

各平台构建命令：

```bash
# macOS：生成 .app 与 .dmg
npm run desktop:build:mac

# Linux：生成 .AppImage 与 .deb
npm run desktop:build:linux

# Windows：生成 NSIS .exe 安装程序
npm run desktop:build:windows
```

构建产物默认位于 `src-tauri/target/release/bundle/`。Linux 打包 AppImage 需要 `patchelf`、WebKitGTK 4.1 与 AppIndicator 等系统库；Windows 打包 NSIS 安装包由 Tauri 自动下载构建工具。

### 自动构建与下载

`.github/workflows/build-desktop.yml` 使用 GitHub Actions 在 macOS、Linux、Windows 上并行构建：

- 推送到 `main` 分支或手动运行：三平台安装包上传为工作流 artifacts。
- 推送 `v*` 标签：三平台安装包同时上传为工作流 artifacts，并自动创建 GitHub Releases 附件。

在线版仍发布在 GitHub Pages；桌面安装包请到仓库的 GitHub Releases 页面下载：

- **macOS**：`.dmg` 安装镜像与 `.app.zip` 应用压缩包
- **Linux**：`.AppImage` 便携版与 `.deb` Debian/Ubuntu 安装包
- **Windows**：NSIS `.exe` 安装程序

当前自动构建未配置 Apple 公证或 Windows 代码签名，因此 macOS 可能提示“未知开发者”，Windows 可能出现 SmartScreen 提示；这是未签名应用的正常现象。

## 部署

推送到 `main` 分支后：

- `.github/workflows/deploy-pages.yml` 自动构建并发布到 GitHub Pages；
- `.github/workflows/build-desktop.yml` 自动构建三平台桌面安装包并上传 artifacts。

推送 `v*` 标签还会创建包含桌面安装包的 GitHub Release。

## 说明

- 原项目工具箱页面与样式完整保留；HTTP 调试台后端能力改为浏览器端实现：请求/分组/历史保存在 `localStorage`，通过 `fetch` 直连目标地址。
- 浏览器受 CORS 限制：目标接口需允许跨域，否则响应体与大部分响应头不可读取。
- 在线版数据保存在浏览器存储中，桌面版数据保存在 WebView 存储中；两者数据相互独立。
- 支持明暗双主题、页面状态缓存（`keep-alive` + localStorage / IndexedDB）与响应式布局。
- 桌面端点击顶部 GitHub 图标会调用系统默认浏览器，网页端仍在新标签页打开。
