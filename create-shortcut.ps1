$WshShell = New-Object -ComObject WScript.Shell
$lnk = Join-Path $env:USERPROFILE "Desktop\StudyParlor-dev.lnk"
$shortcut = $WshShell.CreateShortcut($lnk)
$shortcut.TargetPath = "C:\Users\86468\Desktop\Study tutor\dev-launcher.vbs"
$shortcut.WorkingDirectory = "C:\Users\86468\Desktop\Study tutor"
$shortcut.IconLocation = "shell32.dll,14"
$shortcut.Description = "Study Parlor Dev Mode"
$shortcut.Save()
Write-Output "Done: $lnk"
