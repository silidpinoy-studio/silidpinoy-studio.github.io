$root = 'C:\Users\Administrator\Desktop\SilidPinoy_Studio'
$pub = 'C:\Users\Administrator\Desktop\SilidPinoy_Studio\publish'
$files = @('index.html','lesson.html','activity.html','powerpoint.html','tos.html','shared-api.js','shared-keys.js','shared-backup.js','shared-validate.js','shared-docs.js','shared-docs-ui.js','shared-file-utils.js','shared-toast.js','deped-options.js','silid pinoy logo.jpg','apple-touch-icon.png')
foreach ($f in $files) {
    $r = Join-Path $root $f
    $p = Join-Path $pub $f
    $rExists = Test-Path $r
    $pExists = Test-Path $p
    if ($rExists -and $pExists) {
        $rh = Get-FileHash $r -Algorithm SHA256
        $ph = Get-FileHash $p -Algorithm SHA256
        if ($rh.Hash -ne $ph.Hash) {
            Write-Host "DIFFERENT: $f" -ForegroundColor Red
        } else {
            Write-Host "SAME: $f" -ForegroundColor Green
        }
    } elseif ($rExists) {
        Write-Host "MISSING IN PUBLISH: $f" -ForegroundColor Yellow
    } elseif ($pExists) {
        Write-Host "EXTRA IN PUBLISH: $f" -ForegroundColor Cyan
    }
}