import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 读取仓库内文本文件。
 * @param {string} relativePath 相对仓库根目录的路径
 * @returns {string} 文件内容
 * 创建者：zhenghq
 */
function readRepoText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

/**
 * 读取仓库内 JSON 文件并解析。
 * @param {string} relativePath 相对仓库根目录的路径
 * @returns {object} 解析后的 JSON 对象
 * 创建者：zhenghq
 */
function readRepoJson(relativePath) {
  return JSON.parse(readRepoText(relativePath))
}

test('桌面应用具备 Tauri 配置与最小 Rust 入口', () => {
  for (const file of [
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
    'src-tauri/build.rs',
    'src-tauri/tauri.conf.json',
    'src-tauri/capabilities/default.json',
    'src-tauri/src/main.rs',
    'src-tauri/src/lib.rs',
    'src-tauri/icons/32x32.png',
    'src-tauri/icons/128x128.png',
    'src-tauri/icons/128x128@2x.png',
    'src-tauri/icons/icon.icns',
    'src-tauri/icons/icon.ico',
    'src-tauri/icons/icon.png',
  ]) {
    assert.ok(existsSync(resolve(repoRoot, file)), `${file} 应存在`)
  }

  const config = readRepoJson('src-tauri/tauri.conf.json')
  assert.equal(config.productName, 'CommonTools')
  assert.equal(config.identifier, 'com.zhenghq.commontools')
  assert.equal(config.build.frontendDist, '../dist')
  assert.equal(config.build.beforeBuildCommand, 'npm run build')
  assert.equal(config.app.security.csp, null)
  assert.deepEqual(config.app.windows, [{
    label: 'main',
    title: '工具箱 · Common Tools',
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    center: true,
  }])
  assert.equal(config.bundle.active, true)
  assert.deepEqual(config.bundle.targets, ['app', 'dmg', 'appimage', 'deb', 'nsis'])
  assert.equal(config.bundle.macOS.minimumSystemVersion, '12.0')
  assert.equal(config.bundle.macOS.signingIdentity, '-')
  assert.equal(config.bundle.macOS.hardenedRuntime, true, '签名公证需要 hardened runtime')
  assert.equal(config.bundle.linux.appimage.bundleMediaFramework, false)
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser')
  assert.deepEqual(config.bundle.windows.nsis.languages, ['SimpChinese', 'English'])
  assert.equal(config.bundle.windows.nsis.installerHooks, './windows/hooks.nsh')

  const cargo = readRepoText('src-tauri/Cargo.toml')
  assert.match(cargo, /\[package\]\s+name = "common-tools-tauri"/)
  assert.match(cargo, /\[lib\]\s+name = "common_tools_lib"/)
  assert.match(cargo, /tauri = \{ version = "2"/)
  assert.match(cargo, /tauri-plugin-opener = "2"/)
  assert.match(cargo, /tauri-build = \{ version = "2"/)
  assert.match(readRepoText('src-tauri/src/main.rs'), /common_tools_lib::run\(\)/)
  assert.match(readRepoText('src-tauri/src/lib.rs'), /tauri_plugin_opener::init\(\)/)
  assert.match(readRepoText('src-tauri/src/lib.rs'), /tauri::generate_context!\(/)
  assert.match(readRepoText('src-tauri/build.rs'), /tauri_build::build\(\)/)

  const capabilities = readRepoJson('src-tauri/capabilities/default.json')
  assert.equal(capabilities.identifier, 'default')
  assert.deepEqual(capabilities.windows, ['main'])
  assert.ok(capabilities.permissions.includes('core:default'))
  const openerPermission = capabilities.permissions.find(
    permission => typeof permission === 'object' && permission.identifier === 'opener:allow-open-url',
  )
  assert.ok(openerPermission, '应声明 opener:allow-open-url 权限')
  assert.deepEqual(openerPermission.allow, [{ url: 'https://github.com/zhq734/common-tools' }])
})

test('应用版本统一从 package.json 读取，便于标签构建时同步版本号', () => {
  const config = readRepoJson('src-tauri/tauri.conf.json')
  assert.equal(config.version, '../package.json', 'Tauri 版本应指向 package.json')
  const pkg = readRepoJson('package.json')
  assert.equal(pkg.version, '1.0.0')
})

test('Windows NSIS 使用安装钩子修复独立 ICO 快捷方式图标', () => {
  const hooks = readRepoText('src-tauri/windows/hooks.nsh')
  assert.match(hooks, /创建者：zhenghq/)
  assert.match(hooks, /!macro NSIS_HOOK_POSTINSTALL/)
  assert.match(hooks, /CreateShortCut/)
  assert.match(hooks, /\$\{If\} \$\{FileExists\}/)
  assert.match(hooks, /仅修正已存在的快捷方式/)
  assert.match(hooks, /resources\\app-icon\.ico/)
  assert.match(hooks, /SHChangeNotify/)

  const config = readRepoJson('src-tauri/tauri.conf.json')
  assert.deepEqual(config.bundle.resources, { 'icons/icon.ico': 'resources/app-icon.ico' })
})

test('package.json 提供 Tauri 依赖与各平台双架构桌面构建脚本', () => {
  const pkg = readRepoJson('package.json')
  assert.equal(pkg.devDependencies['@tauri-apps/cli'], '^2.12.4')
  assert.equal(pkg.dependencies['@tauri-apps/plugin-opener'], '^2.7.2')
  assert.equal(pkg.scripts.tauri, 'tauri')
  assert.equal(pkg.scripts['desktop:dev'], 'tauri dev')
  assert.equal(
    pkg.scripts['desktop:build:mac:arm64'],
    'tauri build --target aarch64-apple-darwin --bundles app,dmg',
  )
  assert.equal(
    pkg.scripts['desktop:build:mac:x64'],
    'tauri build --target x86_64-apple-darwin --bundles app,dmg',
  )
  assert.equal(
    pkg.scripts['desktop:build:mac:arm64:unsigned'],
    'tauri build --target aarch64-apple-darwin --bundles app,dmg --config src-tauri/tauri.unsigned.conf.json',
  )
  assert.equal(
    pkg.scripts['desktop:build:mac:x64:unsigned'],
    'tauri build --target x86_64-apple-darwin --bundles app,dmg --config src-tauri/tauri.unsigned.conf.json',
  )
  assert.equal(
    pkg.scripts['desktop:build:windows:x64'],
    'tauri build --target x86_64-pc-windows-msvc --bundles nsis',
  )
  assert.equal(
    pkg.scripts['desktop:build:windows:arm64'],
    'tauri build --target aarch64-pc-windows-msvc --bundles nsis',
  )
  assert.equal(pkg.scripts['desktop:build:linux'], 'tauri build --bundles appimage,deb')

  const lock = readRepoJson('package-lock.json')
  assert.ok(lock.packages['node_modules/@tauri-apps/cli'])
  assert.ok(lock.packages['node_modules/@tauri-apps/plugin-opener'])
})

test('顶部源码链接在桌面端通过 opener 插件打开，在网页端回退到新标签页', () => {
  const app = readRepoText('src/App.vue')
  assert.match(app, /@tauri-apps\/plugin-opener/)
  assert.match(app, /openUrl\(repoUrl\)/)
  assert.match(app, /window\.open\(repoUrl/)
  assert.match(app, /@click\.prevent="openRepo"/)
  assert.match(app, /创建者：zhenghq/)
})

test('未签名 macOS 使用独立覆盖配置关闭公证所需的 hardened runtime', () => {
  const unsigned = readRepoJson('src-tauri/tauri.unsigned.conf.json')
  assert.equal(unsigned.bundle.macOS.signingIdentity, '-')
  assert.equal(unsigned.bundle.macOS.hardenedRuntime, false)
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  assert.match(workflow, /unsigned_command: desktop:build:mac:x64:unsigned/)
  assert.match(workflow, /unsigned_command: desktop:build:mac:arm64:unsigned/)
  assert.match(workflow, /matrix\.unsigned_command/)
})

test('GitHub Actions 按架构矩阵构建 macOS 与 Windows 桌面安装包', () => {
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  assert.match(workflow, /workflow_dispatch/)
  assert.match(workflow, /tags:\s*\n\s*- 'v\*'/)
  assert.match(workflow, /branches: \[main\]/)
  assert.match(workflow, /npm version "\$VERSION" --no-git-tag-version --allow-same-version/)
  for (const runner of ['macos-15-intel', 'macos-15', 'windows-2025', 'ubuntu-22.04']) {
    assert.ok(workflow.includes(runner), `应包含 ${runner}`)
  }
  assert.match(workflow, /aarch64-apple-darwin/)
  assert.match(workflow, /x86_64-apple-darwin/)
  assert.match(workflow, /x86_64-pc-windows-msvc/)
  assert.match(workflow, /aarch64-pc-windows-msvc/)
  assert.match(workflow, /rustup target add/)
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/)
  assert.match(workflow, /libayatana-appindicator3-dev/)
  assert.match(workflow, /librsvg2-dev/)
  assert.match(workflow, /patchelf/)
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/)
  assert.match(workflow, /Swatinem\/rust-cache@v2/)
  assert.match(workflow, /npm ci/)
  assert.match(workflow, /desktop:build:mac:arm64/)
  assert.match(workflow, /desktop:build:mac:x64/)
  assert.match(workflow, /desktop:build:windows:x64/)
  assert.match(workflow, /desktop:build:windows:arm64/)
  assert.match(workflow, /desktop:build:linux/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(workflow, /actions\/download-artifact@v4/)
  assert.match(workflow, /SHA256SUMS/)
  assert.match(workflow, /gh release create/)
  assert.match(workflow, /gh release upload/)
  assert.match(workflow, /--generate-notes/)
  assert.match(workflow, /--clobber/)
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/'\)/)
})

test('GitHub Actions 在 Apple 凭据齐全时签名公证，缺失时明确降级为未签名包', () => {
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  for (const secret of [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_API_KEY_P8',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
  ]) {
    assert.ok(workflow.includes(`secrets.${secret}`), `应读取 ${secret}`)
  }
  assert.match(workflow, /APPLE_SIGNING_IDENTITY/)
  assert.match(workflow, /APPLE_API_KEY_PATH/)
  assert.match(workflow, /APPLE_API_KEY\b/)
  assert.match(workflow, /APPLE_API_ISSUER/)
  assert.match(workflow, /macos_signing\.outputs\.enabled == 'true'/)
  assert.match(workflow, /macos_signing\.outputs\.enabled == 'false'/)
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/)
  assert.match(workflow, /codesign --verify --deep --strict/)
  assert.match(workflow, /xcrun stapler validate/)
  assert.match(workflow, /spctl --assess --type execute/)
  assert.match(workflow, /Developer ID Application/)
  assert.match(workflow, /未签名/)
})

test('构建产物按架构命名并带校验和，避免多架构产物互相覆盖', () => {
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  for (const name of [
    'CommonTools-macos-${{ matrix.arch }}.dmg',
    'CommonTools.app-macos-${{ matrix.arch }}.zip',
    'CommonTools-windows-${{ matrix.arch }}-setup.exe',
  ]) {
    assert.ok(workflow.includes(name), `产物收集应生成 ${name}`)
  }
  for (const arch of ['x64', 'arm64']) {
    assert.ok(workflow.includes(`arch: ${arch}`), `应声明 ${arch} 架构矩阵`)
  }
  assert.match(workflow, /CommonTools_.*\.AppImage|basename "\$appimage_path"/)
  assert.match(workflow, /sha256sum/)
  assert.match(workflow, /SHA256SUMS/)
  assert.match(workflow, /if-no-files-found: error/)
})

test('GitHub Release 任务显式检出仓库并指定目标仓库，避免 gh 依赖缺失的 git 上下文', () => {
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  const releaseJob = workflow.slice(workflow.indexOf('  release:'))
  assert.match(releaseJob, /actions\/checkout@v4/, 'Release 任务应检出仓库')
  assert.match(releaseJob, /fetch-depth: 0/, 'Release 任务应获取完整标签信息')
  assert.match(
    releaseJob,
    /GH_REPO: \$\{\{ github\.repository \}\}/,
    'Release 任务应显式指定目标仓库',
  )
  assert.ok(
    releaseJob.indexOf('actions/checkout@v4') < releaseJob.indexOf('下载全部安装包'),
    '检出仓库应在下载产物之前执行',
  )
})

test('README 与忽略规则包含双架构安装、签名模式和构建产物说明', () => {
  const readme = readRepoText('README.md')
  for (const phrase of [
    '桌面安装包',
    'macOS',
    'Linux',
    'Windows',
    'GitHub Actions',
    'GitHub Releases',
    'desktop:dev',
    'desktop:build:mac:x64',
    'desktop:build:mac:arm64',
    'desktop:build:windows:x64',
    'desktop:build:windows:arm64',
    'desktop:build:linux',
    'Apple',
    '公证',
    'SHA256SUMS',
    '未签名',
  ]) {
    assert.ok(readme.includes(phrase), `README 应包含 ${phrase}`)
  }

  const gitignore = readRepoText('.gitignore')
  assert.match(gitignore, /^src-tauri\/target\/$/m)
  assert.match(gitignore, /^dist-desktop\/$/m)
})
