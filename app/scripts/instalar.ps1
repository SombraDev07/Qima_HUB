# Instala as dependências do app com o node_modules FORA do OneDrive (a pasta do projeto está sincronizada e o node_modules
# do React Native tem centenas de milhares de arquivos). O npm recria node_modules como pasta comum a cada instalação;
# este script move o resultado para C:\QIMAHub-app\node_modules e deixa uma junção no lugar.
# Uso (dentro de app/):   powershell -File scripts\instalar.ps1 [argumentos do npm, ex.: install]
param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $ArgsNpm)
$alvo = 'C:\QIMAHub-app\node_modules'
New-Item -ItemType Directory -Force $alvo | Out-Null
if ($ArgsNpm.Count -eq 0) { $ArgsNpm = @('install') }
& npm.cmd @ArgsNpm
if ((Test-Path node_modules) -and -not (Get-Item node_modules -Force).LinkType) {
  robocopy node_modules $alvo /E /MOVE /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
}
if (-not (Test-Path node_modules)) { New-Item -ItemType Junction -Path node_modules -Target $alvo | Out-Null }
Write-Host 'node_modules fora do OneDrive:' (Get-Item node_modules -Force).LinkType
