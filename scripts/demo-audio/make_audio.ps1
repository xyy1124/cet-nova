param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [string]$Voice = "Microsoft Zira Desktop"
)
Add-Type -AssemblyName System.Speech
$lines = Get-Content -Path $InputFile -Encoding UTF8
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem -Path $OutDir -Filter "s*.wav" | Remove-Item -Force
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($Voice) } catch { Write-Warning "voice fallback: $($_.Exception.Message)" }
$synth.Rate = -2
$i = 0
foreach ($line in $lines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $i++
  $path = Join-Path $OutDir ("s{0:D3}.wav" -f $i)
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($line.Trim())
  $synth.SetOutputToNull()
}
$synth.Dispose()
Write-Output "generated $i wav files"
