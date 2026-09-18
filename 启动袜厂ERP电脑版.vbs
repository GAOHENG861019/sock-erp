' 袜厂进销存ERP 电脑版启动器（无控制台黑框）
' 自动启动后台服务（含看门狗）并以独立应用窗口打开
Option Explicit
Dim sh, fso, scriptDir, nodeExe
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = scriptDir & "\runtime\node.exe"
If Not fso.FileExists(nodeExe) Then nodeExe = "node"
sh.CurrentDirectory = scriptDir
sh.Run """" & nodeExe & """ """ & scriptDir & "\scripts\desktop-app.mjs""", 0, False