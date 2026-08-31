<#
.SYNOPSIS
    이미지 파일을 안드로이드 에뮬레이터/기기 갤러리에 넣는다.

.DESCRIPTION
    파일을 /sdcard/Pictures 로 push 한 뒤 MediaStore 스캔을 호출해서
    갤러리·사진 선택기(DocumentPicker)에 바로 뜨게 만든다.
    스캔을 안 하면 파일은 있어도 갤러리 목록에 안 나온다.

.EXAMPLE
    .\scripts\push-to-gallery.ps1 C:\Users\LG\Downloads\skin.png
    .\scripts\push-to-gallery.ps1 C:\test\*.jpg
#>
param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$Path
)

$ErrorActionPreference = 'Stop'

$files = @()
foreach ($p in $Path) { $files += Get-ChildItem -Path $p -File }
if ($files.Count -eq 0) { Write-Error "파일을 찾을 수 없습니다: $Path" }

# 연결된 기기 확인
$devices = (adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if (-not $devices) { Write-Error "연결된 기기가 없습니다. 에뮬레이터를 먼저 켜주세요." }

foreach ($f in $files) {
    # 한글/공백 파일명은 MediaStore에서 문제가 될 수 있어 ASCII로 정리
    $safe = [System.IO.Path]::GetFileName($f.Name) -replace '[^\w.\-]', '_'
    $remote = "/sdcard/Pictures/$safe"

    adb push "$($f.FullName)" $remote | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "push 실패: $($f.Name)" }

    # MediaStore에 등록 (이게 있어야 갤러리에 보인다)
    adb shell content call --uri content://media/external/file --method scan_file --arg $remote | Out-Null

    Write-Host "  OK  $($f.Name)  ->  $remote" -ForegroundColor Green
}

Write-Host "`n갤러리 등록된 이미지:" -ForegroundColor Cyan
adb shell "content query --uri content://media/external/images/media --projection _display_name:_size"
