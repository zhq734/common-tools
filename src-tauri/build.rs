/**
 * 执行 Tauri 构建脚本并生成应用上下文资源。
 * @returns 无返回值；构建失败时终止编译
 * 创建者：zhenghq
 */
fn main() {
    tauri_build::build()
}
