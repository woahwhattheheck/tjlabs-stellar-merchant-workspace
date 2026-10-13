# DNN Maintenance Desk native host primitives. Windows PowerShell 5.1 or PowerShell 7 on Windows.
# The request and retained journal contain references and observed identities; secrets stay in this process.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Net.Http

function Get-Field($Object,[string]$Name,$Default=$null) {
    if($null -eq $Object){return $Default}
    if($Object -is [System.Collections.IDictionary]) {if($Object.Contains($Name)){return $Object[$Name]};return $Default}
    $property=$Object.PSObject.Properties[$Name]
    if($null -ne $property){return $property.Value}
    return $Default
}
function Convert-Map($Value) {
    if($null -eq $Value){return $null}
    if($Value -is [System.Collections.IDictionary]){
        $answer=@{};foreach($key in $Value.Keys){$answer[$key]=Convert-Map $Value[$key]};return $answer
    }
    if($Value -is [pscustomobject]){
        $answer=@{};foreach($p in $Value.PSObject.Properties){$answer[$p.Name]=Convert-Map $p.Value};return $answer
    }
    if(($Value -is [System.Collections.IEnumerable]) -and -not ($Value -is [string])){
        return ,@($Value | ForEach-Object {Convert-Map $_})
    }
    return $Value
}
function Read-Json([string]$Path) {
    return Convert-Map ([IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8) | ConvertFrom-Json)
}
function Json-Bytes($Value) {
    return [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 100 -Compress))
}
function Hash-Bytes([byte[]]$Bytes) {
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($algorithm.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}
}
function Hash-File([string]$Path) {return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Atomic-Bytes([string]$Path,[byte[]]$Bytes,[switch]$Exclusive) {
    $temporary=$Path+'.pending-'+[guid]::NewGuid().ToString('N')
    $stream=$null
    try{
        $stream=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true);$stream.Dispose();$stream=$null
        if([IO.File]::Exists($Path)){
            if($Exclusive){if((Hash-File $Path) -ne (Hash-Bytes $Bytes)){throw 'The immutable original output already contains different bytes.'};return}
            [IO.File]::Replace($temporary,$Path,$null)
        }else{[IO.File]::Move($temporary,$Path)}
    }finally{if($null -ne $stream){$stream.Dispose()};if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
}
function Atomic-Json([string]$Path,$Value,[switch]$Exclusive) {Atomic-Bytes $Path (Json-Bytes $Value) -Exclusive:$Exclusive}
function Save-Journal {
    $script:Journal.updated_at=[DateTime]::UtcNow.ToString('o')
    Atomic-Json (Join-Path $script:Work 'journal.json') $script:Journal
}
function Require([bool]$Condition,[string]$Message) {if(-not $Condition){throw $Message}}
function Need-Input([string]$Message) {throw [InvalidOperationException]::new('DNN_INPUT: '+$Message)}
function Uncertain([string]$Message) {throw [InvalidOperationException]::new('DNN_UNCERTAIN: '+$Message)}
function Invoke-Step([string]$Id,[string]$Kind,[scriptblock]$Run,[scriptblock]$Recover=$null) {
    $prior=Get-Field $script:Journal.steps $Id
    if($null -ne $prior -and $prior.state -eq 'complete'){return $prior.value}
    if($null -ne $prior -and $Kind -eq 'write' -and $prior.state -in @('started','uncertain')){
        if($null -eq $Recover){Uncertain ("Step "+$Id+" was dispatched. Inspect its original native outcome before another mutation.")}
        $recovered=& $Recover $prior
        if($null -eq $recovered){Uncertain ("The original outcome of step "+$Id+" is unresolved.")}
        $script:Journal.steps[$Id]=@{state='complete';kind=$Kind;started_at=$prior.started_at;finished_at=[DateTime]::UtcNow.ToString('o');recovered=$true;value=$recovered}
        Save-Journal
        return $recovered
    }
    $script:Journal.steps[$Id]=@{state='started';kind=$Kind;started_at=[DateTime]::UtcNow.ToString('o')}
    Save-Journal
    try{
        $value=& $Run
        $script:Journal.steps[$Id].state='complete'
        $script:Journal.steps[$Id].finished_at=[DateTime]::UtcNow.ToString('o')
        $script:Journal.steps[$Id].value=$value
        Save-Journal
        return $value
    }catch{
        $script:Journal.steps[$Id].state=if($Kind -eq 'write'){'uncertain'}else{'failed'}
        $script:Journal.steps[$Id].finished_at=[DateTime]::UtcNow.ToString('o')
        # Errors can include provider text; never retain connection strings, headers or accountInfo.
        $script:Journal.steps[$Id].error_type=$_.Exception.GetType().FullName
        Save-Journal
        throw
    }
}
function Under([string]$Root,[string]$Relative) {
    Require (-not [string]::IsNullOrWhiteSpace($Relative)) 'An archive member has an empty path.'
    Require ($Relative -notmatch '(^[/\\]|\\|:|\x00)' -and $Relative -notmatch '(^|/)\.\.?(/|$)') 'An archive member escapes its selected directory.'
    foreach($part in $Relative.Split('/')){
        Require ($part -ne '' -and $part -notmatch '[. ]$' -and $part -notmatch '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') 'An archive member is ambiguous on Windows.'
    }
    $base=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
    $resolved=[IO.Path]::GetFullPath((Join-Path $Root $Relative.Replace('/','\')))
    Require ($resolved.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) 'An archive member escapes its selected directory.'
    return $resolved
}
function Assert-NoReparse([string]$Path) {
    $item=Get-Item -LiteralPath $Path -Force
    Require (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) ('Resolve the actual filesystem object before using '+$item.Name+'.')
}
function Zip-Index([string]$Path) {
    $archive=[IO.Compression.ZipFile]::OpenRead($Path);$seen=@{};$total=0L
    try{
        foreach($entry in $archive.Entries){
            if($entry.FullName.EndsWith('/')){continue}
            $null=Under $script:Work $entry.FullName
            $key=$entry.FullName.ToLowerInvariant()
            Require (-not $seen.ContainsKey($key)) 'Archive entries alias the same Windows path.'
            $seen[$key]=$true;$total+=$entry.Length
            Require ($seen.Count -le 100000 -and $total -le 137438953472) 'Archive exceeds the declared native receiver capacity.'
            $mode=($entry.ExternalAttributes -shr 16) -band 0xF000
            Require ($mode -eq 0 -or $mode -eq 0x8000) 'Archive contains a link or special file.'
        }
    }finally{$archive.Dispose()}
}
function Extract-Verified([string]$Zip,[string]$Destination,$Manifest) {
    Zip-Index $Zip
    [IO.Directory]::CreateDirectory($Destination)|Out-Null
    Assert-NoReparse $Destination
    $expected=@{};foreach($item in $Manifest.files){$expected[$item.path.ToLowerInvariant()]=$item}
    $archive=[IO.Compression.ZipFile]::OpenRead($Zip)
    try{
        foreach($entry in $archive.Entries){
            if($entry.FullName.EndsWith('/')){continue}
            $item=$expected[$entry.FullName.ToLowerInvariant()]
            Require ($null -ne $item) 'An extraction member is outside the original generation.'
            $target=Under $Destination $entry.FullName
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
            Assert-NoReparse ([IO.Path]::GetDirectoryName($target))
            if([IO.File]::Exists($target)){
                Assert-NoReparse $target
                Require ((Get-Item -LiteralPath $target).Length -eq $item.bytes -and (Hash-File $target) -eq $item.sha256) 'An already published restored member changed; preserve it for the original operation.'
                continue
            }
            $temporary=$target+'.dnn-'+$script:Request.operation_id+'.pending'
            Require (-not $expected.ContainsKey(($entry.FullName+'.dnn-'+$script:Request.operation_id+'.pending').ToLowerInvariant())) 'The original archive aliases a receiver staging filename.'
            if([IO.File]::Exists($temporary)){Assert-NoReparse $temporary;[IO.File]::Delete($temporary)}
            $input=$entry.Open();$out=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try{$input.CopyTo($out);$out.Flush($true)}finally{$input.Dispose();$out.Dispose()}
            Require ((Get-Item -LiteralPath $temporary).Length -eq $item.bytes -and (Hash-File $temporary) -eq $item.sha256) 'The original restored member did not arrive completely.'
            [IO.File]::Move($temporary,$target)
        }
        foreach($directory in $Manifest.directories){[IO.Directory]::CreateDirectory((Under $Destination $directory.path))|Out-Null}
    }finally{$archive.Dispose()}
}
function Quote-SqlName([string]$Name) {return '['+$Name.Replace(']',']]')+']'}
function Quote-SqlText([string]$Value) {return "N'"+$Value.Replace("'","''")+"'"} 
function Sql([string]$Query,[switch]$NonQuery,[switch]$Master) {
    $builder=[Data.SqlClient.SqlConnectionStringBuilder]::new($script:SqlConnection)
    if($Master){$builder.InitialCatalog='master'}
    $connection=[Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
    try{
        $connection.Open();$command=$connection.CreateCommand();$command.CommandText=$Query
        $command.CommandTimeout=[int](Get-Field $script:Connection 'sql_timeout_seconds' 3600)
        if($NonQuery){$null=$command.ExecuteNonQuery();return}
        $reader=$command.ExecuteReader()
        $rows=[Collections.Generic.List[object]]::new()
        try{
            do{
                while($reader.Read()){
                    $row=@{}
                    for($i=0;$i -lt $reader.FieldCount;$i++){
                        $value=$reader.GetValue($i)
                        $row[$reader.GetName($i)]=if($value -is [DBNull]){$null}else{$value}
                    }
                    $rows.Add($row)
                }
            }while($reader.NextResult())
        }finally{$reader.Dispose()}
        return ,$rows.ToArray()
    }finally{$connection.Dispose()}
}
function Read-DnnTable([string]$Name,[string[]]$Columns) {
    $table=$script:ObjectQualifier+$Name
    $present=Sql ('SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='+ (Quote-SqlText $script:DatabaseOwner)+' AND TABLE_NAME='+(Quote-SqlText $table))
    if([int]$present[0].n -eq 0){return ,@()}
    $rows=Sql ('SELECT * FROM '+(Quote-SqlName $script:DatabaseOwner)+'.'+(Quote-SqlName $table))
    return ,@($rows | ForEach-Object{$row=@{};foreach($key in $Columns){if($_.ContainsKey($key)){$row[$key]=$_[$key]}};$row})
}
function Bind-Host {
    Require ($env:OS -eq 'Windows_NT') 'Run this original receiver on the agreed Windows IIS/SQL operator host.'
    Add-Type -Path (Join-Path $env:windir 'System32\inetsrv\Microsoft.Web.Administration.dll')
    foreach($key in @('site_id','environment_id','iis_site','application_path','url')){
        Require ((Get-Field $script:Connection $key) -ceq (Get-Field $script:Request.target $key)) ('The private connection does not select the original '+$key+'.')
    }
    $manager=[Microsoft.Web.Administration.ServerManager]::new()
    try{
        $site=$manager.Sites[$script:Request.target.iis_site]
        Require ($null -ne $site) 'The exact IIS site is absent on this host.'
        $application=$site.Applications[$script:Request.target.application_path]
        Require ($null -ne $application) 'The exact IIS application is absent on this host.'
        $script:SiteRoot=[IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($application.VirtualDirectories['/'].PhysicalPath)).TrimEnd('\')
        if([IO.Directory]::Exists($script:SiteRoot)){Assert-NoReparse $script:SiteRoot}
        else{
            # A same-operation interruption may occur between the two original directory renames.
            $swap=Get-Field $script:Journal.steps 'restore-files'
            Require ($script:Request.action -eq 'restore' -and $null -ne $swap -and $swap.state -in @('started','uncertain')) 'The selected IIS application root is absent outside its recorded restore transition.'
            $failed=$script:SiteRoot+'.before-'+$script:Request.operation_id
            $received=$script:SiteRoot+'.restore-'+$script:Request.operation_id
            Require ([IO.Directory]::Exists($failed) -and [IO.Directory]::Exists($received)) 'The original restore does not retain both sides of its directory transition.'
            Assert-NoReparse ([IO.Path]::GetDirectoryName($script:SiteRoot));Assert-NoReparse $failed;Assert-NoReparse $received
        }
        $script:PoolName=$application.ApplicationPoolName
        $pool=$manager.ApplicationPools[$script:PoolName]
        $sharing=@()
        foreach($s in $manager.Sites){foreach($a in $s.Applications){if($a.ApplicationPoolName -eq $script:PoolName){$sharing+=@{site=$s.Name;application=$a.Path}}}}
        $script:Iis=@{site=$site.Name;application=$application.Path;application_pool=$script:PoolName;pool_state=$pool.State.ToString();managed_runtime_version=$pool.ManagedRuntimeVersion;pipeline=$pool.ManagedPipelineMode.ToString();enable_32_bit=$pool.Enable32BitAppOnWin64;pool_applications=$sharing;bindings=@($site.Bindings|ForEach-Object{@{protocol=$_.Protocol;binding_information=$_.BindingInformation}})}
    }finally{$manager.Dispose()}
    foreach($privatePath in @($script:Work,$script:InputRoot,$OutputDirectory,[IO.Path]::GetFullPath($ConnectionPath))){
        $full=[IO.Path]::GetFullPath($privatePath).TrimEnd('\')
        Require ($full -ine $script:SiteRoot -and -not $full.StartsWith($script:SiteRoot+'\',[StringComparison]::OrdinalIgnoreCase)) 'Keep the original private request, connection, journal and return outside the website root.'
    }
    $configPath=Join-Path $script:SiteRoot 'web.config'
    if($script:Request.action -eq 'restore'){
        # Preserve the receiving SQL target before any source tree can replace its configuration.
        $savedConfig=Join-Path $script:Work 'receiving-target-web.config.private'
        $saved=Get-Field $script:Journal 'restore_target_config'
        if($null -eq $saved){
            Require ([IO.File]::Exists($configPath)) 'The original receiving configuration is required before a new restore.'
            $bytes=[IO.File]::ReadAllBytes($configPath);Atomic-Bytes $savedConfig $bytes -Exclusive
            $script:Journal.restore_target_config=@{sha256=Hash-Bytes $bytes;captured_at=[DateTime]::UtcNow.ToString('o')}
            Save-Journal
        }else{
            Require ([IO.File]::Exists($savedConfig) -and (Hash-File $savedConfig) -eq $saved.sha256) 'The original receiving configuration changed after its retained restore binding.'
        }
        $configPath=$savedConfig
    }
    $script:BindingConfigPath=$configPath
    $xml=[xml][IO.File]::ReadAllText($configPath)
    $envName=Get-Field $script:Connection 'sql_connection_string_env' ''
    $script:SqlConnection=if($envName){[Environment]::GetEnvironmentVariable($envName)}else{''}
    if(-not $script:SqlConnection){
        $entry=@($xml.configuration.connectionStrings.add)|Where-Object {$_.name -eq 'SiteSqlServer'}|Select-Object -First 1
        if($entry){$script:SqlConnection=[string]$entry.connectionString}
    }
    Require (-not [string]::IsNullOrWhiteSpace($script:SqlConnection)) 'Supply the approved private SQL connection reference for this protected DNN configuration.'
    $builder=[Data.SqlClient.SqlConnectionStringBuilder]::new($script:SqlConnection)
    Require (-not [string]::IsNullOrWhiteSpace($builder.InitialCatalog)) 'The SQL connection must select an explicit existing database.'
    $script:Database=$builder.InitialCatalog
    $provider=@($xml.configuration.dotnetnuke.data.providers.add)|Where-Object {$_.name -eq 'SqlDataProvider'}|Select-Object -First 1
    $script:DatabaseOwner=if($provider){[string]$provider.databaseOwner}else{'dbo'}
    $script:ObjectQualifier=if($provider){[string]$provider.objectQualifier}else{''}
    $script:DatabaseOwner=$script:DatabaseOwner.TrimEnd('.')
    Require ($script:DatabaseOwner -match '^[A-Za-z_][A-Za-z0-9_]*$' -and $script:ObjectQualifier -match '^[A-Za-z0-9_]*$') 'The actual DNN owner/qualifier requires an explicit supported SQL identifier.'
    $script:BaselineConnectionBuilder=$builder
    $binding=@{site_root=$script:SiteRoot.ToLowerInvariant();server=$builder.DataSource.ToLowerInvariant();database=$builder.InitialCatalog.ToLowerInvariant();database_owner=$script:DatabaseOwner;object_qualifier=$script:ObjectQualifier;iis_site=$script:Request.target.iis_site;application_path=$script:Request.target.application_path}
    if($script:Journal.ContainsKey('bound_host')){
        foreach($key in $binding.Keys){Require ($binding[$key] -ceq $script:Journal.bound_host[$key]) ('The original receiver resolved a different '+$key+'.')}
    }else{$script:Journal.bound_host=$binding;Save-Journal}
}
function Version3([string]$Value) {
    $match=[regex]::Match($Value,'^(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$')
    Require $match.Success ('The observed version is not a DNN three-part version: '+$Value)
    return [version]::new([int]$match.Groups[1].Value,[int]$match.Groups[2].Value,[int]$match.Groups[3].Value)
}
function Dnn-FileVersion([string]$Path) {
    # DNN Application.Version and native package validation use FILE metadata, not AssemblyName.Version.
    $info=[Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    $parsed=[version]::new(0,0,0,0)
    if(-not [version]::TryParse([string]$info.FileVersion,[ref]$parsed)){
        $parsed=[version]::new($info.FileMajorPart,$info.FileMinorPart,$info.FileBuildPart,$info.FilePrivatePart)
    }
    return $parsed
}
function Native-Inventory {
    $db=Sql "SELECT DB_NAME() AS database_name, CAST(SERVERPROPERTY('ServerName') AS nvarchar(256)) AS server_name, CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS product_version, CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition, CAST(SERVERPROPERTY('EngineEdition') AS int) AS engine_edition"
    $versions=Read-DnnTable 'Version' @('VersionId','Major','Minor','Build','CreatedDate')
    Require ($versions.Count -gt 0) 'The selected database has no original DNN version record.'
    $latest=$versions|Sort-Object -Property @{Expression={[int]$_.VersionId};Descending=$true}|Select-Object -First 1
    $databaseVersion=([int]$latest.Major).ToString()+'.'+([int]$latest.Minor).ToString()+'.'+([int]$latest.Build).ToString()
    $assemblyPath=Join-Path $script:SiteRoot 'bin\DotNetNuke.dll'
    $assemblyVersion=[Reflection.AssemblyName]::GetAssemblyName($assemblyPath).Version
    $fileVersion=Dnn-FileVersion $assemblyPath
    $platform=@{assembly_version=('{0}.{1}.{2}' -f $fileVersion.Major,$fileVersion.Minor,$fileVersion.Build);file_version=$fileVersion.ToString();version_source='DotNetNuke.dll FileVersionInfo';assembly_manifest_version=$assemblyVersion.ToString();assembly_sha256=Hash-File $assemblyPath;database_version=$databaseVersion;database_version_record=$latest}
    $packages=@(Read-DnnTable 'Packages' @('PackageID','Name','FriendlyName','PackageType','Version','Owner','Organization','Url','IsSystemPackage')|ForEach-Object{
        @{id=$_.PackageID;name=$_.Name;label=(Get-Field $_ 'FriendlyName' $_.Name);package_type=$_.PackageType;version=$_.Version;publisher=(Get-Field $_ 'Organization' '');system_package=(Get-Field $_ 'IsSystemPackage' $false)}
    })
    $assemblies=@();$telerik=@()
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $script:SiteRoot 'bin') -Filter '*.dll' -File){
        Assert-NoReparse $file.FullName
        try{$name=[Reflection.AssemblyName]::GetAssemblyName($file.FullName);$assemblies+=@{name=$name.Name;version=$name.Version.ToString();file=$file.Name;bytes=$file.Length}}catch{$assemblies+=@{file=$file.Name;bytes=$file.Length;managed_assembly=$false}}
        if($file.Name -match '(?i)telerik'){$telerik+=@{file=$file.Name;sha256=Hash-File $file.FullName}}
    }
    $runtimeKey='HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
    $release=if(Test-Path $runtimeKey){[int](Get-ItemProperty -LiteralPath $runtimeKey).Release}else{0}
    $serverVersion=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\InetStp').VersionString
    $target=@{}
    foreach($key in $script:Request.target.Keys){$target[$key]=$script:Request.target[$key]}
    $target.database=$db[0].database_name;$target.server=$db[0].server_name
    $target.root_identity=Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($script:SiteRoot.ToLowerInvariant()))
    $target.iis_application=$script:Request.target.application_path
    return @{observed_at=[DateTime]::UtcNow.ToString('o');target=$target;platform=$platform;iis=$script:Iis;
        runtime=@{windows=[Environment]::OSVersion.VersionString;iis=$serverVersion;net_release=$release;app_pool_consumers=@($script:Iis.pool_applications).Count;powershell=$PSVersionTable.PSVersion.ToString();processor_architecture=$env:PROCESSOR_ARCHITECTURE};
        sql=@{server=$db[0].server_name;database=$db[0].database_name;version=$db[0].product_version;major=[int]($db[0].product_version.Split('.')[0]);edition=$db[0].edition;engine_edition=$db[0].engine_edition;database_owner=$script:DatabaseOwner;object_qualifier=$script:ObjectQualifier};
        packages=$packages;assemblies=$assemblies;telerik=@{assemblies=$telerik;dependent_assemblies=@();dependency_observation='The original native UpgradeWizard security step resolves installed Telerik dependency decisions.'};
        portals=(Read-DnnTable 'Portals' @('PortalID','PortalName','HomeDirectory','PortalGroupID'));
        aliases=(Read-DnnTable 'PortalAlias' @('PortalAliasID','PortalID','HTTPAlias','IsPrimary'));
        scheduled_jobs=(Read-DnnTable 'Schedule' @('ScheduleID','TypeFullName','TimeLapse','TimeLapseMeasurement','RetryTimeLapse','RetryTimeLapseMeasurement','RetainHistoryNum','AttachToEvent','Enabled','FriendlyName','Servers'));
        integration_references=(Get-Field $script:Connection 'integration_references' @());
        backup_process=@{owner=(Get-Field $script:Connection 'backup_owner' '');reference=(Get-Field $script:Connection 'existing_backup_reference' '');retention=(Get-Field $script:Connection 'backup_retention' '')};
        credential_references=@{connection='private connection file on operator host';sql_environment=(Get-Field $script:Connection 'sql_connection_string_env' 'site web.config');host_account=(Get-Field $script:Connection 'host_username_env' '');host_session=(Get-Field $script:Connection 'host_headers_env' '')}}
}
function Assert-Baseline($Actual) {
    $baseline=Get-Field $script:Request 'baseline'
    if($null -eq $baseline){return}
    foreach($key in @('site_id','environment_id','iis_site','application_path','database','server','root_identity')){
        Require ((Get-Field $Actual.target $key) -ceq (Get-Field $baseline.target $key)) ('The actual native '+$key+' changed after the saved inventory.')
    }
    foreach($key in @('assembly_version','database_version')){
        Require ((Version3 $Actual.platform[$key]) -eq (Version3 $baseline.platform[$key])) 'The actual DNN version changed after the saved inventory.'
    }
    foreach($key in @('net_release','processor_architecture')){
        Require ((Get-Field $Actual.runtime $key) -ceq (Get-Field $baseline.runtime $key)) ('The actual '+$key+' changed after the saved inventory.')
    }
    foreach($key in @('version','engine_edition','database_owner','object_qualifier')){
        Require ((Get-Field $Actual.sql $key) -ceq (Get-Field $baseline.sql $key)) ('The actual SQL '+$key+' changed after the saved inventory.')
    }
    foreach($key in @('application_pool','managed_runtime_version','pipeline','enable_32_bit')){
        Require ((Get-Field $Actual.iis $key) -ceq (Get-Field $baseline.iis $key)) ('The actual IIS '+$key+' changed after the saved inventory.')
    }
    Require ($Actual.platform.assembly_sha256 -ceq $baseline.platform.assembly_sha256) 'The reviewed DNN platform file changed after its saved inventory.'
    $observed=@($Actual.packages|ForEach-Object{($_.name.ToLowerInvariant()+'|'+(Extension-Version $_.version).ToString()+'|'+$_.package_type.ToLowerInvariant())}|Sort-Object)
    $expected=@($baseline.packages|ForEach-Object{($_.name.ToLowerInvariant()+'|'+(Extension-Version $_.version).ToString()+'|'+$_.package_type.ToLowerInvariant())}|Sort-Object)
    Require (($observed -join [char]10) -ceq ($expected -join [char]10)) 'The installed extension set changed after the saved inventory.'
}
function Sql-VerifyBackup([string]$ServerFile) {
    $q='RESTORE VERIFYONLY FROM DISK='+(Quote-SqlText $ServerFile)+' WITH CHECKSUM;'
    Sql $q -NonQuery -Master
    return @{completed=$true;at=[DateTime]::UtcNow.ToString('o')}
}
function Artifact([string]$Path,[string]$Role='') {
    $file=Get-Item -LiteralPath $Path
    $base=[IO.Path]::GetFullPath($script:Work).TrimEnd('\')+'\'
    Require ($file.FullName.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) 'Keep native artifacts under the original operation directory.'
    return @{path=$file.FullName.Substring($base.Length).Replace('\','/');bytes=$file.Length;sha256=Hash-File $file.FullName;role=$Role}
}
function Offline-Bytes {
    $prior=Get-Field $script:Journal 'availability'
    Require ($null -ne $prior) 'Capture the original maintenance state before applying it.'
    if($prior.original_offline){
        Require ([IO.File]::Exists($prior.original_file) -and (Hash-File $prior.original_file) -eq $prior.original_sha256) 'The original maintenance page is not intact in its private retained location.'
        return ,[IO.File]::ReadAllBytes($prior.original_file)
    }
    $marker='<!doctype html><title>Scheduled maintenance</title><h1>Scheduled maintenance</h1><p>The service is being updated.</p><!-- DNN operation '+$script:Request.operation_id+' -->'
    return ,[Text.Encoding]::UTF8.GetBytes($marker)
}
function Set-Offline {
    $file=Join-Path $script:SiteRoot 'app_offline.htm'
    $prior=Get-Field $script:Journal 'availability'
    if($null -eq $prior){
        $prior=@{original_offline=[IO.File]::Exists($file);original_pool_state=$script:Iis.pool_state;pool_stopped=$false;marked_at=[DateTime]::UtcNow.ToString('o')}
        if($prior.original_offline){
            $prior.original_file=Join-Path $script:Work 'original-app-offline.htm'
            $bytes=[IO.File]::ReadAllBytes($file);Atomic-Bytes $prior.original_file $bytes -Exclusive
            $prior.original_sha256=Hash-Bytes $bytes;$prior.original_sddl=(Get-Acl -LiteralPath $file).Sddl
        }
        $script:Journal.availability=$prior;Save-Journal
    }
    $bytes=Offline-Bytes;$sha=Hash-Bytes $bytes
    if([IO.File]::Exists($file)){Require ((Hash-File $file) -eq $sha) 'Another operator changed the maintenance page; preserve that actual state.'}
    else{Atomic-Bytes $file $bytes -Exclusive}
    $prior.marker_sha256=$sha;Save-Journal
    if(@($script:Iis.pool_applications).Count -eq 1 -and $prior.original_pool_state -eq 'Started'){
        $manager=[Microsoft.Web.Administration.ServerManager]::new()
        try{$pool=$manager.ApplicationPools[$script:PoolName];if($pool.State.ToString() -eq 'Started'){$null=$pool.Stop()};$prior.pool_stopped=$true;Save-Journal}finally{$manager.Dispose()}
    }
    return $prior
}
function Restore-Availability {
    $prior=Get-Field $script:Journal 'availability'
    if($null -eq $prior){return}
    $file=Join-Path $script:SiteRoot 'app_offline.htm'
    if($prior.original_offline){
        $bytes=Offline-Bytes
        if([IO.File]::Exists($file)){Require ((Hash-File $file) -eq $prior.marker_sha256) 'Another operator changed app_offline.htm; retain that maintenance page for review.'}
        Atomic-Bytes $file $bytes
        if(Get-Field $prior 'original_sddl'){
            $acl=Get-Acl -LiteralPath $file;$acl.SetSecurityDescriptorSddlForm($prior.original_sddl);Set-Acl -LiteralPath $file -AclObject $acl
        }
    }elseif([IO.File]::Exists($file)){
        Require ((Hash-File $file) -eq $prior.marker_sha256) 'Another operator changed app_offline.htm; retain the actual maintenance state for review.'
        [IO.File]::Delete($file)
    }
    if($prior.pool_stopped -and $prior.original_pool_state -eq 'Started'){
        $manager=[Microsoft.Web.Administration.ServerManager]::new()
        try{$pool=$manager.ApplicationPools[$script:PoolName];if($pool.State.ToString() -eq 'Stopped'){$null=$pool.Start()}}finally{$manager.Dispose()}
    }
    $prior.restored_at=[DateTime]::UtcNow.ToString('o');Save-Journal
}
function New-PairedBackup {
    # Later release phases own the current maintenance state. Reopening their original
    # backup must never bring a partially prepared application online or replace DNN's
    # native upgrade marker before the recorded installer phase can reconcile it.
    $releaseContinued=($script:Request.action -eq 'upgrade' -and @($script:Journal.steps.Keys|Where-Object {$_ -match '^(platform|extension)-[0-9]{2}-'}).Count -gt 0)
    if($releaseContinued){
        foreach($key in @('backup-offline','backup-sql','backup-files')){
            $retained=Get-Field $script:Journal.steps $key
            Require ($null -ne $retained -and $retained.state -eq 'complete') 'The continued release must retain its completed original paired backup.'
        }
    }
    $folder=Join-Path $script:Work 'backup';[IO.Directory]::CreateDirectory($folder)|Out-Null
    $pair=$script:Request.operation_id
    $initial=$script:Journal.steps['initial-inventory'].value
    Require ($null -ne $initial.platform -and $null -ne $initial.target) 'The paired generation needs its original pre-mutation native inventory.'

    $serverDirectory=Get-Field $script:Connection 'sql_backup_directory' ''
    $readerDirectory=Get-Field $script:Connection 'sql_backup_read_directory' $serverDirectory
    Require (-not [string]::IsNullOrWhiteSpace($serverDirectory)) 'Set the approved SQL Server backup path and its readable operator-host counterpart.'
    Require ($script:Native.inventory.sql.engine_edition -notin @(5,8)) 'This native SQL backup route requires SQL Server BACKUP/RESTORE support; select the approved provider backup adapter for this database service.'
    $nativeName='dnn-'+$pair+'.bak';$serverFile=Join-Path $serverDirectory $nativeName;$readerFile=Join-Path $readerDirectory $nativeName
    $state=Invoke-Step 'backup-offline' 'write' {Set-Offline} {param($prior) Set-Offline}
    $database=Invoke-Step 'backup-sql' 'write' {
        Require (-not [IO.File]::Exists($readerFile)) 'The selected new SQL backup path already exists.'
        $compression=if(Get-Field $script:Connection 'sql_compression' $false){', COMPRESSION'}else{''}
        Sql ('BACKUP DATABASE '+(Quote-SqlName $script:Database)+' TO DISK='+(Quote-SqlText $serverFile)+' WITH COPY_ONLY, CHECKSUM'+$compression+';') -NonQuery
        $verify=Sql-VerifyBackup $serverFile
        Require ([IO.File]::Exists($readerFile)) 'SQL backup completed but the configured operator read path does not resolve its output.'
        $dest=Join-Path $folder 'database.bak';[IO.File]::Copy($readerFile,$dest,$false)
        @{file=Artifact $dest 'database';verify=$verify;header=(Sql ('RESTORE HEADERONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master);files=(Sql ('RESTORE FILELISTONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master)}
    } {
        param($prior)
        Require ([IO.File]::Exists($readerFile)) 'The original SQL backup has no returned file; inspect its original server request.'
        $running=Sql "SELECT session_id FROM sys.dm_exec_requests WHERE command LIKE 'BACKUP%' AND database_id=DB_ID()"
        if($running.Count -gt 0){Uncertain 'The original native SQL backup is still executing.'}
        $verify=Sql-VerifyBackup $serverFile
        $dest=Join-Path $folder 'database.bak'
        if([IO.File]::Exists($dest)){Require ((Hash-File $dest) -eq (Hash-File $readerFile)) 'The retained backup copy differs from the original SQL output.'}else{[IO.File]::Copy($readerFile,$dest,$false)}
        @{file=Artifact $dest 'database';verify=$verify;header=(Sql ('RESTORE HEADERONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master);files=(Sql ('RESTORE FILELISTONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master)}
    }
    $files=Invoke-Step 'backup-files' 'write' {
        $manifest=@{schema='commons.dnn-files-generation/v1';pair_id=$pair;site_id=$script:Request.target.site_id;source_target=$initial.target;database=$initial.sql;database_version=$initial.platform.database_version;created_at=[DateTime]::UtcNow.ToString('o');root_sddl=(Get-Acl -LiteralPath $script:SiteRoot).Sddl;files=@();directories=@()}
        $zip=Join-Path $folder 'files.zip';$pending=$zip+'.pending'
        Require (-not [IO.File]::Exists($zip) -and -not [IO.File]::Exists($pending)) 'The original file-backup step has retained output; reopen that step.'
        $archive=[IO.Compression.ZipFile]::Open($pending,[IO.Compression.ZipArchiveMode]::Create)
        try{
            foreach($item in Get-ChildItem -LiteralPath $script:SiteRoot -Recurse -Force){
                Assert-NoReparse $item.FullName
                $relative=$item.FullName.Substring($script:SiteRoot.Length+1).Replace('\','/')
                if($relative -eq 'app_offline.htm' -and -not $script:Journal.availability.original_offline){continue}
                if($item.PSIsContainer){$manifest.directories+=@{path=$relative;sddl=(Get-Acl -LiteralPath $item.FullName).Sddl};continue}
                $before=@{bytes=$item.Length;mtime=$item.LastWriteTimeUtc.ToString('o');sha256=Hash-File $item.FullName}
                $entry=$archive.CreateEntry($relative,[IO.Compression.CompressionLevel]::Fastest)
                $input=[IO.File]::OpenRead($item.FullName);$out=$entry.Open()
                try{$input.CopyTo($out)}finally{$input.Dispose();$out.Dispose()}
                $after=Get-Item -LiteralPath $item.FullName
                Require ($after.Length -eq $before.bytes -and (Hash-File $item.FullName) -eq $before.sha256) 'A website file changed while its paired generation was captured.'
                $manifest.files+=@{path=$relative;bytes=$before.bytes;sha256=$before.sha256;last_write_utc=$before.mtime;sddl=(Get-Acl -LiteralPath $item.FullName).Sddl}
            }
        }finally{$archive.Dispose()}
        $manifestPath=Join-Path $folder 'manifest.json';Atomic-Json $manifestPath $manifest -Exclusive
        [IO.File]::Move($pending,$zip)
        @{files=Artifact $zip 'website-files';manifest=Artifact $manifestPath 'file-manifest'}
    } {
        param($prior)
        $zip=Join-Path $folder 'files.zip';$manifestPath=Join-Path $folder 'manifest.json'
        if(-not [IO.File]::Exists($manifestPath)){Uncertain 'The original file backup has no complete manifest; retain its same-operation generation for recovery.'}
        $pending=$zip+'.pending'
        if(-not [IO.File]::Exists($zip) -and [IO.File]::Exists($pending)){
            # The original ZIP can finish before its final rename; validate that exact generation first.
            Assert-FilesZip $pending (Read-Json $manifestPath)
            [IO.File]::Move($pending,$zip)
        }
        if(-not [IO.File]::Exists($zip)){Uncertain 'The original file backup did not publish its complete generation; preserve its output and use the recorded recovery path.'}
        Assert-FilesZip $zip (Read-Json $manifestPath)
        @{files=Artifact $zip 'website-files';manifest=Artifact $manifestPath 'file-manifest'}
    }
    $pairResult=@{pair_id=$pair;files=$files.files;database=$database.file;manifest=$files.manifest;verifyonly_complete=$true;database_version=$initial.platform.database_version;created_at=$script:Journal.steps['backup-offline'].started_at;sql_header=$database.header;sql_files=$database.files}
    $script:Native.backup=$pairResult;Save-Native
    if(-not $releaseContinued){Restore-Availability}
    return $pairResult
}
function Assert-FilesZip([string]$Zip,$Manifest) {
    Zip-Index $Zip
    $expected=@{};foreach($file in $Manifest.files){Require (-not $expected.ContainsKey($file.path.ToLowerInvariant())) 'Duplicate original file manifest path.';$expected[$file.path.ToLowerInvariant()]=$file}
    $archive=[IO.Compression.ZipFile]::OpenRead($Zip);$found=@{}
    try{
        foreach($entry in $archive.Entries){
            if($entry.FullName.EndsWith('/')){continue}
            $key=$entry.FullName.ToLowerInvariant();Require ($expected.ContainsKey($key)) 'Backup ZIP contains an unmanifested file.'
            $algorithm=[Security.Cryptography.SHA256]::Create();$stream=$entry.Open()
            try{$sha=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$algorithm.Dispose()}
            Require ($entry.Length -eq $expected[$key].bytes -and $sha -eq $expected[$key].sha256) 'Backup member differs from its original paired manifest.'
            $found[$key]=$true
        }
    }finally{$archive.Dispose()}
    Require ($found.Count -eq $expected.Count) 'Backup ZIP omits original website files.'
}
function Save-Native {Atomic-Json (Join-Path $script:Work 'native.json') $script:Native}

function Assert-StagingBindings($BackupManifest) {
    if(-not (Get-Field $script:Request.backup 'staging_copy' $false)){return}
    Require ($script:Request.target.environment -eq 'staging') 'Cross-installation restore requires the selected isolated staging target.'
    Require ($script:Request.target.site_id -ne $BackupManifest.site_id) 'The source and staging receiving site are the same.'
    $sourceTarget=$BackupManifest.source_target
    Require ($script:Native.inventory.target.root_identity -ne $sourceTarget.root_identity) 'The staging receiver resolves to the original production website root.'
    Require (($script:Native.inventory.sql.database -ine $BackupManifest.database.database) -or ($script:Native.inventory.sql.server -ine $BackupManifest.database.server)) 'The staging receiver resolves to the original production database.'
    $bindings=Get-Field $script:Request.backup 'staging_bindings'
    Require ($null -ne $bindings -and @($bindings.portal_aliases).Count -gt 0) 'Supply the reviewed mapping from each original PortalAliasID to its isolated staging alias.'
    Require (-not [string]::IsNullOrWhiteSpace((Get-Field $bindings 'data_handling_note' ''))) 'Record the approved staging-data handling method.'
    foreach($row in $bindings.portal_aliases){
        Require ([int]$row.portal_alias_id -ge 0 -and $row.alias -match '^[A-Za-z0-9.-]+(?::[0-9]+)?(?:/[A-Za-z0-9_./-]*)?$') 'Each staging alias needs an actual original PortalAliasID and a host/path without a scheme or credentials.'
    }
    $targetConfig=[xml][IO.File]::ReadAllText($script:BindingConfigPath)
    Require ($null -ne $targetConfig.configuration.connectionStrings -and $null -eq $targetConfig.configuration.connectionStrings.EncryptedData) 'Use the approved readable staging connection section for this paired restore; retain its external credential custody.'
    Require (-not $targetConfig.configuration.connectionStrings.configSource) 'Resolve the staging connection configSource into the approved receiver before this restore.'
}
function Assert-RestoredGeneration([string]$Root,$Manifest,[switch]$Maintenance,[switch]$StagingConfig) {
    Require ([IO.Directory]::Exists($Root)) 'The original restored tree is absent.'
    Assert-NoReparse $Root
    foreach($entry in $Manifest.files){
        if($Maintenance -and $entry.path -ieq 'app_offline.htm'){continue}
        if($StagingConfig -and $entry.path -ieq 'web.config'){continue}
        $file=Under $Root $entry.path
        Require ([IO.File]::Exists($file)) 'The original restored generation is incomplete.'
        Assert-NoReparse $file
        Require ((Get-Item -LiteralPath $file).Length -eq $entry.bytes -and (Hash-File $file) -eq $entry.sha256) 'A restored website member differs from its original generation.'
    }
    if($Maintenance){
        $file=Join-Path $Root 'app_offline.htm'
        Require ([IO.File]::Exists($file) -and (Hash-File $file) -eq (Hash-Bytes (Offline-Bytes))) 'The original restore tree is not protected by its retained receiving maintenance state.'
    }
}
function Stage-RestoreMaintenance([string]$Root,$Manifest) {
    # The completed extract step proves the original full generation before its one deliberate override.
    Require ($script:Journal.steps['restore-extract'].state -eq 'complete') 'Verify the original generation before placing its receiving maintenance state.'
    foreach($entry in $Manifest.files){
        if($entry.path -ieq 'app_offline.htm'){continue}
        $file=Under $Root $entry.path
        Require ([IO.File]::Exists($file) -and (Hash-File $file) -eq $entry.sha256) 'The original received generation changed before its directory transition.'
    }
    $file=Join-Path $Root 'app_offline.htm';$bytes=Offline-Bytes;$desired=Hash-Bytes $bytes
    $sourceMarker=@($Manifest.files|Where-Object {$_.path -ieq 'app_offline.htm'})
    if([IO.File]::Exists($file)){
        $actual=Hash-File $file
        Require ($actual -eq $desired -or ($sourceMarker.Count -eq 1 -and $actual -eq $sourceMarker[0].sha256)) 'The incoming maintenance page is neither its source generation nor this original receiving state.'
    }else{Require ($sourceMarker.Count -eq 0) 'The source generation lost its original maintenance page before receiving.'}
    Atomic-Bytes $file $bytes
    $script:Journal.restore_maintenance=@{receiving_sha256=$desired;receiving_original_offline=$script:Journal.availability.original_offline;source_file=if($sourceMarker.Count){$sourceMarker[0]}else{$null};staged_before_swap=$true}
    Save-Journal
    Assert-RestoredGeneration $Root $Manifest -Maintenance
}
function Apply-RestorePermissions($Manifest) {
    $rootAcl=Get-Acl -LiteralPath $script:SiteRoot;$rootAcl.SetSecurityDescriptorSddlForm($Manifest.root_sddl);Set-Acl -LiteralPath $script:SiteRoot -AclObject $rootAcl
    foreach($entry in @($Manifest.directories)+@($Manifest.files)){
        $file=Under $script:SiteRoot $entry.path
        if(-not (Test-Path -LiteralPath $file)){[IO.Directory]::CreateDirectory($file)|Out-Null}
        $acl=Get-Acl -LiteralPath $file;$acl.SetSecurityDescriptorSddlForm($entry.sddl);Set-Acl -LiteralPath $file -AclObject $acl
        if([IO.File]::Exists($file) -and (Get-Field $entry 'last_write_utc')){[IO.File]::SetLastWriteTimeUtc($file,[DateTime]::Parse($entry.last_write_utc).ToUniversalTime())}
    }
    return @{completed=$true}
}
function Restore-PairedBackup {
    $input=Join-Path $script:InputRoot 'backup'
    $manifestPath=Join-Path $input 'manifest.json';$filesZip=Join-Path $input 'files.zip';$databaseFile=Join-Path $input 'database.bak'
    foreach($pair in @(@('manifest',$manifestPath),@('files',$filesZip),@('database',$databaseFile))){
        $expected=$script:Request.backup[$pair[0]]
        Require ((Hash-File $pair[1]) -eq $expected.sha256 -and (Get-Item -LiteralPath $pair[1]).Length -eq $expected.bytes) 'The selected paired restore input changed.'
    }
    $manifest=Read-Json $manifestPath
    Require ($manifest.pair_id -eq $script:Request.backup.pair_id) 'The website files belong to another backup generation.'
    Assert-FilesZip $filesZip $manifest
    Assert-StagingBindings $manifest
    $restoreFolder=Join-Path $script:Work 'restore';[IO.Directory]::CreateDirectory($restoreFolder)|Out-Null
    $received=$script:SiteRoot+'.restore-'+$script:Request.operation_id
    $savedConfig=Join-Path $script:Work 'receiving-target-web.config.private'
    Require ([IO.File]::Exists($savedConfig) -and (Hash-File $savedConfig) -eq $script:Journal.restore_target_config.sha256) 'The original private receiving configuration is not intact.'
    $sourceOwner=[string]$manifest.database.database_owner;$sourceQualifier=[string]$manifest.database.object_qualifier
    Require ($sourceOwner -match '^[A-Za-z_][A-Za-z0-9_]*$' -and $sourceQualifier -match '^[A-Za-z0-9_]*$') 'The exact backup database needs its original supported owner and object qualifier.'
    $generation=@{pair_id=$manifest.pair_id;manifest_sha256=Hash-File $manifestPath;files_sha256=Hash-File $filesZip;received_path=$received;database_owner=$sourceOwner;object_qualifier=$sourceQualifier;receiving_config_sha256=$script:Journal.restore_target_config.sha256}
    if($script:Journal.ContainsKey('restore_generation')){
        foreach($key in $generation.Keys){Require ($generation[$key] -ceq $script:Journal.restore_generation[$key]) 'The original restore generation or receiving binding changed.'}
    }else{$script:Journal.restore_generation=$generation;Save-Journal}
    $databaseFiles=Sql 'SELECT name,physical_name,type_desc FROM sys.database_files ORDER BY file_id'
    $fileMap=@{}
    foreach($row in $databaseFiles){$fileMap[$row.name]=[string]$row.physical_name}
    $configured=Get-Field $script:Connection 'restore_files' @()
    foreach($row in $configured){
        Require (-not [string]::IsNullOrWhiteSpace($row.logical_name) -and [IO.Path]::IsPathRooted($row.physical_path)) 'Every configured SQL restore file requires its actual absolute destination.'
        $fileMap[$row.logical_name]=$row.physical_path
    }
    $serverDir=Get-Field $script:Connection 'sql_restore_directory' (Get-Field $script:Connection 'sql_backup_directory' '')
    $readDir=Get-Field $script:Connection 'sql_restore_read_directory' (Get-Field $script:Connection 'sql_backup_read_directory' $serverDir)
    Require (-not [string]::IsNullOrWhiteSpace($serverDir)) 'Select the existing SQL restore-readable directory.'
    $name='restore-dnn-'+$script:Request.operation_id+'.bak';$serverFile=Join-Path $serverDir $name;$readFile=Join-Path $readDir $name
    if([IO.File]::Exists($readFile)){Require ((Hash-File $readFile) -eq (Hash-File $databaseFile)) 'The original receiving backup path contains another generation.'}
    else{[IO.File]::Copy($databaseFile,$readFile,$false)}
    $null=Sql-VerifyBackup $serverFile
    $nativeFiles=Sql ('RESTORE FILELISTONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master
    $moves=@()
    foreach($file in $nativeFiles){
        Require ($fileMap.ContainsKey($file.LogicalName)) ('Provide the receiving SQL file destination for '+$file.LogicalName+'.')
        $moves+=('MOVE '+(Quote-SqlText $file.LogicalName)+' TO '+(Quote-SqlText $fileMap[$file.LogicalName]))
    }
    $null=Invoke-Step 'restore-extract' 'read' {
        Extract-Verified $filesZip $received $manifest
        Assert-RestoredGeneration $received $manifest
        @{path=$received;pair_id=$manifest.pair_id}
    }
    $null=Invoke-Step 'restore-offline' 'write' {Set-Offline} {param($prior) Set-Offline}
    # Preserve the failed tree beside the selected root. Never overlay a backup over failed files.
    $failed=$script:SiteRoot+'.before-'+$script:Request.operation_id
    $null=Invoke-Step 'restore-files' 'write' {
        Require (-not [IO.Directory]::Exists($failed)) 'The retained failed site tree already exists; reopen this original restore.'
        Stage-RestoreMaintenance $received $manifest
        [IO.Directory]::Move($script:SiteRoot,$failed)
        [IO.Directory]::Move($received,$script:SiteRoot)
        Assert-RestoredGeneration $script:SiteRoot $manifest -Maintenance
        @{failed_tree=$failed;pair_id=$manifest.pair_id;maintenance_staged_before_swap=$true}
    } {
        param($prior)
        if(-not [IO.Directory]::Exists($failed) -and [IO.Directory]::Exists($script:SiteRoot) -and [IO.Directory]::Exists($received)){
            Stage-RestoreMaintenance $received $manifest
            [IO.Directory]::Move($script:SiteRoot,$failed)
        }
        if([IO.Directory]::Exists($failed) -and -not [IO.Directory]::Exists($script:SiteRoot) -and [IO.Directory]::Exists($received)){
            Assert-RestoredGeneration $received $manifest -Maintenance
            [IO.Directory]::Move($received,$script:SiteRoot)
        }
        if(-not [IO.Directory]::Exists($failed) -or -not [IO.Directory]::Exists($script:SiteRoot) -or [IO.Directory]::Exists($received)){return $null}
        Assert-RestoredGeneration $script:SiteRoot $manifest -Maintenance
        @{failed_tree=$failed;pair_id=$manifest.pair_id;maintenance_staged_before_swap=$true}
    }
    $null=Set-Offline
    $null=Invoke-Step 'restore-permissions' 'write' {
        Apply-RestorePermissions $manifest
    } {
        param($prior)
        Assert-RestoredGeneration $script:SiteRoot $manifest -Maintenance
        # Reapply only the exact original generation's ACL values; no second file/SQL restore.
        Apply-RestorePermissions $manifest
    }
    $sqlRestore=Invoke-Step 'restore-sql' 'write' {
        Sql ('ALTER DATABASE '+(Quote-SqlName $script:Database)+' SET SINGLE_USER WITH ROLLBACK IMMEDIATE;') -NonQuery -Master
        try{
            Sql ('RESTORE DATABASE '+(Quote-SqlName $script:Database)+' FROM DISK='+(Quote-SqlText $serverFile)+' WITH REPLACE, RECOVERY, CHECKSUM, '+($moves -join ', ')+';') -NonQuery -Master
        }finally{Sql ('ALTER DATABASE '+(Quote-SqlName $script:Database)+' SET MULTI_USER;') -NonQuery -Master}
        @{completed=$true;at=[DateTime]::UtcNow.ToString('o');pair_id=$manifest.pair_id}
    } {
        param($prior)
        $running=Sql ("SELECT session_id FROM sys.dm_exec_requests WHERE command LIKE 'RESTORE%' AND database_id=DB_ID("+(Quote-SqlText $script:Database)+")") -Master
        if($running.Count -gt 0){Uncertain 'The original SQL restore is still executing.'}
        # A matching recent native restorehistory backup UUID identifies this restore, not just its resulting version.
        $history=Sql ("SELECT TOP(1) rh.restore_date,bs.backup_set_uuid FROM msdb.dbo.restorehistory rh JOIN msdb.dbo.backupset bs ON bs.backup_set_id=rh.backup_set_id WHERE rh.destination_database_name="+(Quote-SqlText $script:Database)+" ORDER BY rh.restore_history_id DESC") -Master
        $header=Sql ('RESTORE HEADERONLY FROM DISK='+(Quote-SqlText $serverFile)) -Master
        if($history.Count -eq 0 -or $header.Count -ne 1){return $null}
        if([guid]$history[0].backup_set_uuid -ne [guid]$header[0].BackupSetGUID -or [DateTime]$history[0].restore_date -lt ([DateTime]$prior.started_at).ToLocalTime().AddSeconds(-2)){return $null}
        Sql ('ALTER DATABASE '+(Quote-SqlName $script:Database)+' SET MULTI_USER;') -NonQuery -Master
        @{completed=$true;recovered_from='msdb.restorehistory';pair_id=$manifest.pair_id;backup_set_uuid=$history[0].backup_set_uuid}
    }
    # SQL target remains the original receiving server/database. Its restored DNN table prefix comes from the selected source generation.
    $script:DatabaseOwner=$sourceOwner;$script:ObjectQualifier=$sourceQualifier
    $stagingApplied=$false
    if(Get-Field $script:Request.backup 'staging_copy' $false){
        $stagingApplied=Invoke-Step 'restore-staging-bindings' 'write' {
            $config=[xml][IO.File]::ReadAllText((Join-Path $script:SiteRoot 'web.config'))
            $target=[xml][IO.File]::ReadAllText($savedConfig)
            $replacement=$config.ImportNode($target.configuration.connectionStrings,$true)
            $null=$config.configuration.ReplaceChild($replacement,$config.configuration.connectionStrings)
            $targetMachine=$target.SelectSingleNode('/configuration/system.web/machineKey')
            if($null -ne $targetMachine){
                $old=$config.SelectSingleNode('/configuration/system.web/machineKey')
                $new=$config.ImportNode($targetMachine,$true)
                if($old){$null=$old.ParentNode.ReplaceChild($new,$old)}else{$null=$config.SelectSingleNode('/configuration/system.web').AppendChild($new)}
            }
            $oldLegacy=$config.SelectSingleNode('/configuration/appSettings/add[@key="SiteSqlServer"]')
            $newLegacy=$target.SelectSingleNode('/configuration/appSettings/add[@key="SiteSqlServer"]')
            if($oldLegacy -and $newLegacy){$oldLegacy.SetAttribute('value',$newLegacy.GetAttribute('value'))}
            $temporary=Join-Path $script:Work 'staging-web.config.private'
            $config.Save($temporary);Atomic-Bytes (Join-Path $script:SiteRoot 'web.config') ([IO.File]::ReadAllBytes($temporary))
            $aliases=Read-DnnTable 'PortalAlias' @('PortalAliasID','PortalID','HTTPAlias')
            $map=@{};foreach($entry in $script:Request.backup.staging_bindings.portal_aliases){Require (-not $map.ContainsKey([int]$entry.portal_alias_id)) 'A staged alias is mapped twice.';$map[[int]$entry.portal_alias_id]=$entry.alias}
            Require ($map.Count -eq $aliases.Count) 'Map every original portal alias before opening the staged copy.'
            $table=(Quote-SqlName $script:DatabaseOwner)+'.'+(Quote-SqlName ($script:ObjectQualifier+'PortalAlias'))
            $query='BEGIN TRANSACTION;'
            foreach($row in $aliases){
                Require ($map.ContainsKey([int]$row.PortalAliasID)) 'A source portal alias has no reviewed staging mapping.'
                Require ($map[[int]$row.PortalAliasID] -ine $row.HTTPAlias) 'A staging alias still selects the original source host.'
                $query+='UPDATE '+$table+' SET HTTPAlias='+(Quote-SqlText $map[[int]$row.PortalAliasID])+' WHERE PortalAliasID='+([int]$row.PortalAliasID)+';'
            }
            $query+='COMMIT;';Sql $query -NonQuery
            @{completed=$true;config_sha256=Hash-File (Join-Path $script:SiteRoot 'web.config');portal_aliases=(Read-DnnTable 'PortalAlias' @('PortalAliasID','PortalID','HTTPAlias'));data_handling_note=$script:Request.backup.staging_bindings.data_handling_note}
        } {
            param($prior)
            $saved=Join-Path $script:Work 'staging-web.config.private'
            if(-not [IO.File]::Exists($saved) -or (Hash-File $saved) -ne (Hash-File (Join-Path $script:SiteRoot 'web.config'))){return $null}
            $actual=Read-DnnTable 'PortalAlias' @('PortalAliasID','HTTPAlias')
            foreach($entry in $script:Request.backup.staging_bindings.portal_aliases){
                $row=@($actual|Where-Object {[int]$_.PortalAliasID -eq [int]$entry.portal_alias_id})
                if($row.Count -ne 1 -or $row[0].HTTPAlias -cne $entry.alias){return $null}
            }
            @{completed=$true;config_sha256=Hash-File $saved;portal_aliases=$actual;data_handling_note=$script:Request.backup.staging_bindings.data_handling_note}
        }
    }
    Assert-RestoredGeneration $script:SiteRoot $manifest -Maintenance -StagingConfig:([bool]$stagingApplied)
    $script:Native.restore=@{pair_id=$manifest.pair_id;files_verified=$true;database_restored=$sqlRestore.completed;staging_bindings_applied=[bool]$stagingApplied;bindings=$stagingApplied;failed_tree_retained=$true;source_site_id=$manifest.site_id;availability_override=$script:Journal.restore_maintenance;database_binding=@{database_owner=$sourceOwner;object_qualifier=$sourceQualifier;receiving_database=$script:Database};finished_at=[DateTime]::UtcNow.ToString('o')}
    Save-Native
    Restore-Availability
    return $script:Native.restore
}
function New-HttpClient {
    $handler=[Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect=$false
    $client=[Net.Http.HttpClient]::new($handler)
    $client.Timeout=[TimeSpan]::FromSeconds([int](Get-Field $script:Connection 'http_timeout_seconds' 180))
    return $client
}
function Dnn-Http([string]$Method,[string]$Relative,$Body=$null,[switch]$HostHeaders,[Net.Http.HttpContent]$Content=$null) {
    $base=[Uri]($script:Request.target.url.TrimEnd('/')+'/')
    Require ($Relative.StartsWith('/') -and -not $Relative.StartsWith('//') -and $Relative -notmatch '[\x00-\x1f\\]') 'Use a site-relative native route.'
    # An installation below a virtual application keeps that application path.
    $uri=[Uri]($script:Request.target.url.TrimEnd('/')+$Relative)
    Require ($uri.Scheme -eq $base.Scheme -and $uri.Host -eq $base.Host -and $uri.Port -eq $base.Port) 'The native request leaves the approved site origin.'
    $client=New-HttpClient
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),$uri)
    try{
        if($HostHeaders){
            $reference=Get-Field $script:Connection 'host_headers_env' ''
            $value=if($reference){[Environment]::GetEnvironmentVariable($reference)}else{''}
            if(-not $value){Need-Input 'Supply the existing authorized DNN Host session headers through the private environment reference.'}
            $headers=Convert-Map ($value|ConvertFrom-Json)
            foreach($key in $headers.Keys){
                Require ($key -notmatch '^(?i:Host|Content-Length|Content-Type|Connection|Transfer-Encoding)$') 'The Host session reference includes a transport header that this client owns.'
                $null=$request.Headers.TryAddWithoutValidation($key,[string]$headers[$key])
            }
        }
        if($null -ne $Content){$request.Content=$Content}
        elseif($null -ne $Body){$request.Content=[Net.Http.StringContent]::new(($Body|ConvertTo-Json -Depth 100 -Compress),[Text.Encoding]::UTF8,'application/json')}
        $response=$client.SendAsync($request).GetAwaiter().GetResult()
        try{
            $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            Require ($text.Length -le 16777216) 'The native HTTP response exceeds the receiver limit.'
            $json=$null
            if($text){try{$json=Convert-Map ($text|ConvertFrom-Json)}catch{}}
            return @{status=[int]$response.StatusCode;body=$text;json=$json;location=[string]$response.Headers.Location;content_type=[string]$response.Content.Headers.ContentType;observed_at=[DateTime]::UtcNow.ToString('o')}
        }finally{$response.Dispose()}
    }finally{$request.Dispose();$client.Dispose()}
}
function Host-Json([string]$Method,[string]$Route,$Body=$null) {
    $response=Dnn-Http $Method $Route $Body -HostHeaders
    if($response.status -in @(401,403,302)){Need-Input ('The original DNN Host session needs its normal login/permission renewal for '+$Route+'.')}
    Require ($response.status -ge 200 -and $response.status -lt 300) ('The native DNN endpoint returned HTTP '+$response.status+' for '+$Route+'.')
    return $response
}
function Http-Checks {
    $checks=Get-Field $script:Request 'checks' (Get-Field (Get-Field $script:Request 'release') 'checks' @())
    $answer=@()
    foreach($check in $checks){
        $response=Dnn-Http 'GET' $check.path
        $passed=$response.status -eq [int]$check.status
        if($check.contains){$passed=$passed -and $response.body.Contains($check.contains)}
        $answer+=@{label=$check.label;path=$check.path;expected_status=[int]$check.status;observed_status=$response.status;contains_requested=[bool]$check.contains;passed=$passed;response_sha256=Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($response.body));observed_at=$response.observed_at}
    }
    $script:Native.checks=$answer;Save-Native
    Require (@($answer|Where-Object {-not $_.passed}).Count -eq 0) 'An actual requested service check failed; inspect the retained result.'
    return ,$answer
}
