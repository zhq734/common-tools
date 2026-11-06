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
  assert.equal(config.bundle.linux.appimage.bundleMediaFramework, false)
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser')
  assert.deepEqual(config.bundle.windows.nsis.languages, ['SimpChinese', 'English'])

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

test('package.json 提供 Tauri 依赖与各平台桌面构建脚本', () => {
  const pkg = readRepoJson('package.json')
  assert.equal(pkg.devDependencies['@tauri-apps/cli'], '^2.12.4')
  assert.equal(pkg.dependencies['@tauri-apps/plugin-opener'], '^2.7.2')
  assert.equal(pkg.scripts.tauri, 'tauri')
  assert.equal(pkg.scripts['desktop:dev'], 'tauri dev')
  assert.equal(pkg.scripts['desktop:build:mac'], 'tauri build --bundles app,dmg')
  assert.equal(pkg.scripts['desktop:build:linux'], 'tauri build --bundles appimage,deb')
  assert.equal(pkg.scripts['desktop:build:windows'], 'tauri build --bundles nsis')

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

test('GitHub Actions 在 macOS、Linux、Windows 上构建安装包并在标签发布时创建 Release', () => {
  const workflow = readRepoText('.github/workflows/build-desktop.yml')
  assert.match(workflow, /workflow_dispatch/)
  assert.match(workflow, /tags:\s*\n\s*- 'v\*'/)
  assert.match(workflow, /branches: \[main\]/)
  for (const platform of ['macos-latest', 'ubuntu-22.04', 'windows-latest']) {
    assert.ok(workflow.includes(platform), `应包含 ${platform}`)
  }
  assert.match(workflow, /libwebkit2gtk-4\.1-dev/)
  assert.match(workflow, /libayatana-appindicator3-dev/)
  assert.match(workflow, /librsvg2-dev/)
  assert.match(workflow, /patchelf/)
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/)
  assert.match(workflow, /Swatinem\/rust-cache@v2/)
  assert.match(workflow, /npm ci/)
  assert.match(workflow, /desktop:build:mac/)
  assert.match(workflow, /desktop:build:linux/)
  assert.match(workflow, /desktop:build:windows/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(workflow, /actions\/download-artifact@v4/)
  assert.match(workflow, /softprops\/action-gh-release@v2/)
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/'\)/)
})

test('README 与忽略规则包含桌面安装、自动构建和构建产物说明', () => {
  const readme = readRepoText('README.md')
  for (const phrase of [
    '桌面安装包',
    'macOS',
    'Linux',
    'Windows',
    'GitHub Actions',
    'GitHub Releases',
    'desktop:dev',
    'desktop:build:mac',
    'desktop:build:linux',
    'desktop:build:windows',
    '未签名',
  ]) {
    assert.ok(readme.includes(phrase), `README 应包含 ${phrase}`)
  }

  const gitignore = readRepoText('.gitignore')
  assert.match(gitignore, /^src-tauri\/target\/$/m)
  assert.match(gitignore, /^dist-desktop\/$/m)
})
