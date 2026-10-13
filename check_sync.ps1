$r = [System.IO.File]::ReadAllText('C:\Users\Administrator\Desktop\SilidPinoy_Studio\index.html')
$p = [System.IO.File]::ReadAllText('C:\Users\Administrator\Desktop\SilidPinoy_Studio\publish\index.html')
if ($r -eq $p) { Write-Host 'SAME' } else { Write-Host 'DIFFERENT' }