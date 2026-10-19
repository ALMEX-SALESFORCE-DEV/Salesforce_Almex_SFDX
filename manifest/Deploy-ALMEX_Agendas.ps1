param(
    [string]$TargetOrg = 'ALMEX-Sandboxcp',
    [switch]$ValidateOnly
)

# Deploy only Agendas permissions, retaining full profiles in source control.
# No existing users, business records, or credentials are changed by this script.
$ErrorActionPreference = 'Stop'
$agendaProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$agendaManifest = Join-Path $PSScriptRoot 'ALMEX_Agendas.xml'
$agendaTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$agendaTempRoot = Join-Path $agendaTempBase ('ALMEX_Agendas_Deploy_' + [guid]::NewGuid().ToString('N'))
$agendaMetadataRoot = Join-Path $agendaTempRoot 'metadata'
New-Item -ItemType Directory -Path $agendaTempRoot | Out-Null
Push-Location $agendaProjectRoot

try {
    $agendaConversion = sf project convert source --manifest $agendaManifest --output-dir $agendaMetadataRoot --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw ('Source conversion failed: ' + $agendaConversion.message) }

    foreach ($agendaProfileFile in (Get-ChildItem -LiteralPath (Join-Path $agendaMetadataRoot 'profiles') -File)) {
        $agendaOriginalProfile = New-Object System.Xml.XmlDocument
        $agendaOriginalProfile.Load($agendaProfileFile.FullName)
        $agendaScopedProfile = New-Object System.Xml.XmlDocument
        $agendaScopedProfile.LoadXml('<?xml version="1.0" encoding="UTF-8"?><Profile xmlns="http://soap.sforce.com/2006/04/metadata"/>')

        foreach ($agendaNode in $agendaOriginalProfile.DocumentElement.ChildNodes) {
            $agendaKeep = switch ($agendaNode.LocalName) {
                'classAccesses' { $agendaNode.apexClass -eq 'ALMEX_AgendaDataController' }
                'customPermissions' { $agendaNode.name -eq 'ALMEX_Agendas_IA' }
                'fieldPermissions' {
                    $agendaNode.field -like 'Actividad_de_Agenda__c.*' -or
                    $agendaNode.field -eq 'Sucursal__c.Frecuencia_visitas__c'
                }
                'objectPermissions' { $agendaNode.object -eq 'Actividad_de_Agenda__c' }
                'tabVisibilities' { $agendaNode.tab -eq 'ALMEX_Agendas' }
                default { $false }
            }
            if ($agendaKeep) {
                [void]$agendaScopedProfile.DocumentElement.AppendChild($agendaScopedProfile.ImportNode($agendaNode, $true))
            }
        }
        if ($agendaScopedProfile.DocumentElement.ChildNodes.Count -ne 20) {
            throw ('Unexpected Agendas permission count in ' + $agendaProfileFile.Name)
        }
        $agendaScopedProfile.Save($agendaProfileFile.FullName)
    }

    $agendaArguments = @('project', 'deploy', 'start', '--metadata-dir', $agendaMetadataRoot,
        '--target-org', $TargetOrg, '--test-level', 'RunSpecifiedTests',
        '--tests', 'ALMEX_AgendaDataControllerTest', '--wait', '30', '--json')
    if ($ValidateOnly) { $agendaArguments += '--dry-run' }
    $agendaDeployment = & sf @agendaArguments | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        $agendaDeployment.result.details.componentFailures | Format-List
        $agendaDeployment.result.details.runTestResult.failures | Format-List
        throw ('Agendas deployment failed: ' + $agendaDeployment.message)
    }
    $agendaDeployment.result | Select-Object id, status, checkOnly,
        numberComponentsDeployed, numberTestsCompleted, numberTestErrors
} finally {
    Pop-Location
    # Delete only this script's generated directory, never a project directory.
    $agendaResolvedTemp = [IO.Path]::GetFullPath($agendaTempRoot)
    if ($agendaResolvedTemp.StartsWith($agendaTempBase, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $agendaResolvedTemp).StartsWith('ALMEX_Agendas_Deploy_') -and
        (Test-Path -LiteralPath $agendaResolvedTemp)) {
        Remove-Item -LiteralPath $agendaResolvedTemp -Recurse -Force
    }
}
