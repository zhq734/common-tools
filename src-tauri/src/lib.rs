/**
 * 初始化并运行 Tauri 应用，注册使用系统默认程序打开外链的插件。
 * @returns 无返回值；应用启动失败时输出错误并退出
 * 创建者：zhenghq
 */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("启动工具箱桌面应用失败");
}
