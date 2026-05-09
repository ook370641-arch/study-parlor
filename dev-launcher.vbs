Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\86468\Desktop\Study tutor"
WshShell.Run "cmd /c npm run dev", 0, False
