$WshShell = New-Object -ComObject WScript.Shell
$lnk = Join-Path $env:USERPROFILE "Desktop\StudyParlor-stop.lnk"
$shortcut = $WshShell.CreateShortcut($lnk)
$shortcut.TargetPath = "C:\Users\86468\Desktop\Study tutor\stop-dev.vbs"
$shortcut.WorkingDirectory = "C:\Users\86468\Desktop\Study tutor"
$shortcut.IconLocation = "shell32.dll,28"
$shortcut.Description = "Stop Study Parlor Dev Mode"
$shortcut.Save()
Write-Output "Done: $lnk"
