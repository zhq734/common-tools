; Windows NSIS 安装钩子：安装完成后使用独立 ICO 文件重建快捷方式图标。
; 用途：避免 Windows 图标缓存直接读取 EXE 资源失败时快捷方式显示默认图标。
; 参数：无；由 Tauri 生成的 installer.nsi 在 POSTINSTALL 阶段自动调用。
; 返回值：无。
; 创建者：zhenghq
!macro NSIS_HOOK_POSTINSTALL
  ; Tauri 模板使用 $DESKTOP 与 $SMPROGRAMS，按实际路径重建快捷方式图标。
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\resources\app-icon.ico" 0 "" "" "${PRODUCTNAME}"
  !if "${STARTMENUFOLDER}" != ""
    CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\resources\app-icon.ico" 0 "" "" "${PRODUCTNAME}"
  !endif
  ; 通知 Windows 资源管理器刷新图标缓存。
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
