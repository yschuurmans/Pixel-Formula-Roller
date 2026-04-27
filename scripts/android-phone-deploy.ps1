param(
    [ValidateSet('check-device', 'full-deploy', 'install-debug', 'logcat')]
    [string]$Mode = 'check-device',

    [string]$DeviceId,

    [string]$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot',

    [string]$AndroidSdkRoot = 'C:\AndroidSdk'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

function Set-DeployEnvironment {
    param(
        [string]$ResolvedJavaHome,
        [string]$ResolvedAndroidSdkRoot
    )

    $env:JAVA_HOME = $ResolvedJavaHome
    if (-not ($env:Path -split ';' | Where-Object { $_ -eq "$ResolvedJavaHome\bin" })) {
        $env:Path = "$ResolvedJavaHome\bin;$env:Path"
    }

    $env:ANDROID_HOME = $ResolvedAndroidSdkRoot
    $env:ANDROID_SDK_ROOT = $ResolvedAndroidSdkRoot
}

function Assert-CommandAvailable {
    param([string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command '$CommandName' was not found on PATH."
    }
}

function Assert-PathExists {
    param(
        [string]$PathToCheck,
        [string]$Label
    )

    if (-not (Test-Path $PathToCheck)) {
        throw "$Label was not found at '$PathToCheck'."
    }
}

function Invoke-InRepoRoot {
    param([scriptblock]$ScriptBlock)

    Push-Location $repoRoot
    try {
        & $ScriptBlock
    }
    finally {
        Pop-Location
    }
}

Set-DeployEnvironment -ResolvedJavaHome $JavaHome -ResolvedAndroidSdkRoot $AndroidSdkRoot
Assert-PathExists -PathToCheck $env:JAVA_HOME -Label 'JAVA_HOME'
Assert-PathExists -PathToCheck $env:ANDROID_SDK_ROOT -Label 'ANDROID_SDK_ROOT'
Assert-CommandAvailable -CommandName 'adb'

switch ($Mode) {
    'check-device' {
        & adb devices -l
    }

    'full-deploy' {
        Assert-CommandAvailable -CommandName 'npm'
        Assert-CommandAvailable -CommandName 'npx'

        Invoke-InRepoRoot {
            & npm run build
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

            & npx cap sync android
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

            & adb devices -l
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

            if ([string]::IsNullOrWhiteSpace($DeviceId)) {
                & npx cap run android
            }
            else {
                & npx cap run android --target $DeviceId
            }

            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    }

    'install-debug' {
        $androidDir = Join-Path $repoRoot 'android'
        Assert-PathExists -PathToCheck $androidDir -Label 'Android project directory'

        Push-Location $androidDir
        try {
            & .\gradlew.bat app:installDebug
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        finally {
            Pop-Location
        }
    }

    'logcat' {
        & adb logcat -c
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        & adb logcat -s PixelsBle *:S
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}