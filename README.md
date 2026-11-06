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

应用使用 Tauri v2 打包为原生桌面应用，无需额外后端。窗口可自由调整大小，并继续支持明暗主题与页面状态缓存。macOS 与 Windows 分别提供 x64、arm64 双架构安装包，Linux 提供 x64 安装包。

### 本地开发与构建

首次开发桌面版时，请先按 [Tauri v2 环境要求](https://v2.tauri.app/start/prerequisites/) 安装 Rust 及对应平台的系统依赖，然后执行：

```bash
npm install
npm run desktop:dev
```

各平台构建命令：

```bash
# macOS Apple Silicon（arm64）：生成 .app 与 .dmg
npm run desktop:build:mac:arm64

# macOS Intel（x64）：生成 .app 与 .dmg
npm run desktop:build:mac:x64

# Windows x64：生成 NSIS .exe 安装程序
npm run desktop:build:windows:x64

# Windows arm64：生成 NSIS .exe 安装程序
npm run desktop:build:windows:arm64

# Linux x64：生成 .AppImage 与 .deb
npm run desktop:build:linux
```

本地双架构构建需先执行 `rustup target add` 安装对应的 Rust target，GitHub Actions 会自动完成这一步。构建产物位于 `src-tauri/target/<target-triple>/release/bundle/`，未指定 target 的 Linux 构建位于 `src-tauri/target/release/bundle/`。Linux 打包 AppImage 需要 `patchelf`、WebKitGTK 4.1 与 AppIndicator 等系统库；Windows arm64 构建需要 Visual Studio 的「MSVC ARM64 生成工具」，GitHub Actions 的 `windows-2025` runner 已预装。Windows NSIS 安装向导支持选择安装目录、开始菜单与桌面快捷方式，并可在安装完成后直接启动应用；安装钩子会用独立 ICO 文件重建快捷方式图标，避免图标缓存显示默认图标。

### 版本号

`src-tauri/tauri.conf.json` 的 `version` 指向 `package.json`，版本号统一由 `package.json` 管理。推送 `v*` 标签或手动运行时传入版本号，GitHub Actions 会执行 `npm version` 同步 `package.json` 与 `package-lock.json`，确保安装包文件名、应用元数据与 Release 标签一致。

### macOS 签名与公证

对齐常见 electron-builder 发布流程，GitHub Actions 会根据仓库 Secrets 自动切换两种模式：

- **凭据齐全**：配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_API_KEY_P8`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 五个 Secret 后，使用 Developer ID Application 证书签名，通过 App Store Connect API 提交 Apple 公证并 staple，最后执行 `codesign --verify`、`xcrun stapler validate` 与 `spctl --assess` 验证 Gatekeeper 状态。
- **全部缺失**：显式关闭证书自动发现并使用 ad-hoc 签名生成未签名安装包，同时在 workflow summary 中标注降级原因；产物仍可发布与手动安装。
- **只配置部分**：流水线直接失败并列出缺失项，避免误把错误配置当成已签名发布。

未签名包首次打开可能提示「未知开发者」或「应用已损坏」，确认来源可信后可在终端执行 `xattr -dr com.apple.quarantine "/Applications/CommonTools.app"`，或在「系统设置 → 隐私与安全性」中允许。Windows 安装包未做代码签名，可能出现 SmartScreen 提示；这是未签名应用的正常现象。

### 自动构建与下载

`.github/workflows/build-desktop.yml` 先运行 `npm test` 与 `npm run typecheck`，再在 5 个矩阵任务上并行构建：

| 平台 | Runner | Rust target | 产物 |
| --- | --- | --- | --- |
| macOS x64 | `macos-15-intel` | `x86_64-apple-darwin` | `CommonTools-macos-x64.dmg`、`CommonTools.app-macos-x64.zip` |
| macOS arm64 | `macos-15` | `aarch64-apple-darwin` | `CommonTools-macos-arm64.dmg`、`CommonTools.app-macos-arm64.zip` |
| Linux x64 | `ubuntu-22.04` | 本机 target | `.AppImage`、`.deb` |
| Windows x64 | `windows-2025` | `x86_64-pc-windows-msvc` | `CommonTools-windows-x64-setup.exe` |
| Windows arm64 | `windows-2025` | `aarch64-pc-windows-msvc` | `CommonTools-windows-arm64-setup.exe` |

- 推送到 `main` 分支或手动运行：各架构安装包上传为独立工作流 artifacts。
- 推送 `v*` 标签：全部安装包自动创建或更新 GitHub Release，并附带 `SHA256SUMS` 校验和文件。

在线版仍发布在 GitHub Pages；桌面安装包请到仓库的 GitHub Releases 页面下载，下载后可用 `sha256sum -c SHA256SUMS` 校验完整性。

## 部署

推送到 `main` 分支后：

- `.github/workflows/deploy-pages.yml` 自动构建并发布到 GitHub Pages；
- `.github/workflows/build-desktop.yml` 自动构建 macOS / Windows 双架构与 Linux 安装包并上传 artifacts。

推送 `v*` 标签还会创建包含全部架构安装包与 `SHA256SUMS` 的 GitHub Release。

## 说明

- 原项目工具箱页面与样式完整保留；HTTP 调试台后端能力改为浏览器端实现：请求/分组/历史保存在 `localStorage`，通过 `fetch` 直连目标地址。
- 浏览器受 CORS 限制：目标接口需允许跨域，否则响应体与大部分响应头不可读取。
- 在线版数据保存在浏览器存储中，桌面版数据保存在 WebView 存储中；两者数据相互独立。
- 支持明暗双主题、页面状态缓存（`keep-alive` + localStorage / IndexedDB）与响应式布局。
- 桌面端点击顶部 GitHub 图标会调用系统默认浏览器，网页端仍在新标签页打开。
