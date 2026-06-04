Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "taskkill /F /IM electron.exe", 0, False
