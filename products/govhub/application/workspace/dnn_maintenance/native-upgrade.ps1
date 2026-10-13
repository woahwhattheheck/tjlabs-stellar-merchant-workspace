# Native DNN platform and extension routes. Source contracts are pinned in PRIMARY_SOURCES.json.
function Platform-Package($Step) {
    $matches=@($script:Request.packages|Where-Object {
        $_.package.kind -eq 'platform' -and (Version3 $_.package.version) -eq (Version3 $Step.to) -and $_.package.package_type -eq $Step.package_type
    })
    Require ($matches.Count -eq 1) 'The exact version hop does not select one approved native package.'
    return $matches[0]
}
function Verify-Package($Package) {
    $path=Under (Join-Path $script:InputRoot 'packages') $Package.name
    Require ([IO.File]::Exists($path) -and (Get-Item -LiteralPath $path).Length -eq $Package.bytes -and (Hash-File $path) -eq $Package.sha256) 'An approved package changed before native use.'
    Zip-Index $path
    if($Package.package.kind -eq 'platform'){
        $archive=[IO.Compression.ZipFile]::OpenRead($path)
        $temporary=Join-Path $script:Work ('assembly-version-'+$Package.sha256+'.private')
        try{
            $entry=@($archive.Entries|Where-Object {$_.FullName -ieq 'bin/DotNetNuke.dll'})
            Require ($entry.Count -eq 1) 'The selected platform package has no unique original platform assembly.'
            if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}
            $source=$entry[0].Open();$output=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew)
            try{$source.CopyTo($output);$output.Flush($true)}finally{$source.Dispose();$output.Dispose()}
            $actual=Dnn-FileVersion $temporary
            Require ((Version3 $actual.ToString()) -eq (Version3 $Package.package.version)) 'The actual DNN platform file version differs from the reviewed package filename.'
        }finally{$archive.Dispose();if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
    }
    return $path
}
function Expected-PlatformFiles($Package) {
    $path=Verify-Package $Package
    $archive=[IO.Compression.ZipFile]::OpenRead($path);$answer=@()
    try{
        # Match the selected original LocalUpgradeService: custom settings replace defaults.
        $excluded=@('App_Data/Database.mdf','Config/DotNetNuke.config','Install/InstallWizard','favicon.ico','robots.txt','web.config')
        $upgrade=@($archive.Entries|Where-Object {$_.FullName -ieq 'App_Data/Upgrade/upgrade.json'})
        if($upgrade.Count -gt 0){
            Require ($upgrade.Count -eq 1) 'The selected package has ambiguous native upgrade settings.'
            $reader=[IO.StreamReader]::new($upgrade[0].Open())
            try{$rules=Convert-Map ($reader.ReadToEnd()|ConvertFrom-Json)}finally{$reader.Dispose()}
            $excluded=@(Get-Field $rules 'upgradeExclude' @())
        }
        foreach($entry in $archive.Entries){
            if($entry.FullName.EndsWith('/')){continue}
            $isAssembly=$entry.FullName -match '(?i)^bin/[^/]+\.dll$'
            $skip=$false
            if(-not $isAssembly){
                foreach($filter in $excluded){
                    if($entry.FullName.StartsWith([string]$filter,[StringComparison]::OrdinalIgnoreCase)){$skip=$true;break}
                }
            }
            if($skip){continue}
            $stream=$entry.Open();$algorithm=[Security.Cryptography.SHA256]::Create()
            try{$sha=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$algorithm.Dispose()}
            $answer+=@{path=$entry.FullName;bytes=$entry.Length;sha256=$sha}
        }
    }finally{$archive.Dispose()}
    return ,$answer
}
function Assert-PreparedPlatform($Package) {
    foreach($file in Expected-PlatformFiles $Package){
        $target=Under $script:SiteRoot $file.path
        # DNN's installer can remove its Upgrade package/manifest after preparation. The compiled platform,
        # installer source, and all other intended files must match before an uncertain preparation is adopted.
        if($file.path -like 'App_Data/Upgrade/*'){continue}
        if(-not [IO.File]::Exists($target) -or (Get-Item -LiteralPath $target).Length -ne $file.bytes -or (Hash-File $target) -ne $file.sha256){return $false}
    }
    return $true
}
function Copy-LegacyPlatform($Step,$Package,[string]$StepId) {
    $null=Verify-Package $Package
    $expected=Expected-PlatformFiles $Package
    $null=Set-Offline
    $path=Verify-Package $Package
    $archive=[IO.Compression.ZipFile]::OpenRead($path)
    try{
        foreach($file in $expected){
            $target=Under $script:SiteRoot $file.path
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
            if([IO.File]::Exists($target) -and (Hash-File $target) -eq $file.sha256){continue}
            $entry=$archive.GetEntry($file.path)
            $temporary=$target+'.dnn-'+$script:Request.operation_id+'.pending'
            # The same original operation may recover its own partial copy, never another operator's file.
            if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}
            $input=$entry.Open();$output=[IO.FileStream]::new($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try{$input.CopyTo($output);$output.Flush($true)}finally{$input.Dispose();$output.Dispose()}
            Require ((Hash-File $temporary) -eq $file.sha256) 'The exact package member changed during file preparation.'
            if([IO.File]::Exists($target)){[IO.File]::Replace($temporary,$target,$null)}else{[IO.File]::Move($temporary,$target)}
        }
    }finally{$archive.Dispose()}
    Require (Assert-PreparedPlatform $Package) 'The original Upgrade package has not completed its native file preparation.'
    Restore-Availability
    return @{route='pre-10.2';from=$Step.from;to=$Step.to;package_sha256=$Package.sha256;files_prepared=$true}
}
function Upload-ModernPlatform($Step,$Package,[string]$StepId) {
    $path=Verify-Package $Package
    $destination=Join-Path (Join-Path $script:SiteRoot 'App_Data\Upgrade') $Package.name
    if([IO.File]::Exists($destination)){
        Require ((Hash-File $destination) -eq $Package.sha256) 'The existing DNN upgrade slot contains a different package.'
        return @{package_name=$Package.name;sha256=$Package.sha256;transport='existing-native-slot'}
    }
    if((Version3 $Step.from) -eq [version]'10.2.3'){
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))|Out-Null
        $pending=$destination+'.'+$script:Request.operation_id+'.resources'
        if([IO.File]::Exists($pending)){Require ((Hash-File $pending) -eq $Package.sha256) 'The original 10.2.3 package staging has different bytes.'}
        else{[IO.File]::Copy($path,$pending,$false)}
        [IO.File]::Move($pending,$destination)
        return @{package_name=$Package.name;sha256=$Package.sha256;transport='documented-10.2.3-App_Data-Upgrade'}
    }
    $settings=Host-Json 'GET' '/API/PersonaBar/Upgrades/GetSettings'
    if(-not (Get-Field $settings.json 'AllowDnnUpgradeUpload' $false)){
        Need-Input 'The existing DNN Host setting AllowDnnUpgradeUpload is disabled. Enable its ordinary approved upload route before resuming this original upload.'
    }
    $fileId='dnn-'+$script:Request.operation_id+'-'+$Step.to.Replace('.','-')
    $upload=Get-Field $script:Journal.uploads $StepId
    if($null -ne $upload){
        Require ($upload.file_id -ceq $fileId -and $upload.package_sha256 -ceq $Package.sha256 -and [long]$upload.total -eq [long]$Package.bytes) 'The original native upload slot selects another package.'
    }else{
        # The deterministic original slot exists in our journal BEFORE its first network write.
        $script:Journal.uploads[$StepId]=@{file_id=$fileId;position=0L;total=$Package.bytes;package_sha256=$Package.sha256;package_name=$Package.name}
        Save-Journal
    }
    $input=[IO.File]::OpenRead($path)
    try{
        # Native Upload uses OpenOrCreate and an explicit byte offset; replay only this original slot.
        $buffer=[byte[]]::new(4*1024*1024);$position=0L
        while(($count=$input.Read($buffer,0,$buffer.Length)) -gt 0){
            $chunk=[byte[]]::new($count);[Array]::Copy($buffer,$chunk,$count)
            $form=[Net.Http.MultipartFormDataContent]::new()
            $form.Add([Net.Http.ByteArrayContent]::new($chunk),'chunk','chunk.bin')
            $form.Add([Net.Http.StringContent]::new([string]$position),'start')
            $form.Add([Net.Http.StringContent]::new([string]$Package.bytes),'totalSize')
            $form.Add([Net.Http.StringContent]::new($fileId),'fileId')
            $response=Dnn-Http 'POST' '/API/PersonaBar/Upgrades/Upload' -HostHeaders -Content $form
            if($response.status -in @(401,403,302)){Need-Input 'Renew the original normal Host session before continuing the same package upload.'}
            Require ($response.status -eq 200) ('Native DNN upload returned HTTP '+$response.status+'.')
            $position+=$count
            $script:Journal.uploads[$StepId].position=$position
            Save-Journal
        }
    }finally{$input.Dispose()}
    $response=Host-Json 'POST' '/API/PersonaBar/Upgrades/UploadComplete' @{fileId=$fileId;fileName=$Package.name}
    Require ([IO.File]::Exists($destination) -and (Hash-File $destination) -eq $Package.sha256) 'DNN did not retain the complete selected Install package.'
    return @{package_name=$Package.name;sha256=$Package.sha256;transport='native-Host-upload';native_status=$response.status}
}
function Prepare-ModernPlatform($Step,$Package,[string]$StepId) {
    $nativeStep=Get-Field $script:Journal.steps ($StepId+'-native-files')
    if($null -ne $nativeStep -and $nativeStep.state -in @('started','uncertain','complete')){
        # StartUpgrade deletes its selected ZIP. Recover this dispatched step before upload/list access.
        return Invoke-Step ($StepId+'-native-files') 'write' {Uncertain 'The retained file dispatch must use its original recovery path.'} {
            param($prior)
            if(Assert-PreparedPlatform $Package){
                Restore-NativePreparationAvailability $StepId
                return @{route='post-10.2';from=$Step.from;to=$Step.to;package_sha256=$Package.sha256;files_prepared=$true;recovered_from='complete-installed-package'}
            }
            return $null
        }
    }
    $null=Invoke-Step ($StepId+'-upload') 'write' {Upload-ModernPlatform $Step $Package $StepId} {
        param($prior)
        $destination=Join-Path (Join-Path $script:SiteRoot 'App_Data\Upgrade') $Package.name
        if([IO.File]::Exists($destination) -and (Hash-File $destination) -eq $Package.sha256){return @{package_name=$Package.name;sha256=$Package.sha256;transport='original-upload-recovered'}}
        # A multipart write uses an explicit original file ID and offsets. Continue only that same upload.
        $upload=Get-Field $script:Journal.uploads $StepId
        if($null -ne $upload -and $upload.package_sha256 -eq $Package.sha256){return Upload-ModernPlatform $Step $Package $StepId}
        return $null
    }
    $list=Host-Json 'GET' '/API/PersonaBar/Upgrades/List'
    $packageStem=[IO.Path]::GetFileNameWithoutExtension($Package.name)
    $selected=@($list.json|Where-Object {$_.PackageName -ieq $packageStem})
    Require ($selected.Count -eq 1 -and $selected[0].IsValid -and $selected[0].CanInstall) 'DNN rejected the exact Install package or its installed-version compatibility.'
    Require ((Version3 ([string]$selected[0].Version)) -eq (Version3 $Package.package.version)) 'The native package stem resolves a different selected DNN version.'
    $nativePackageName=[string]$selected[0].PackageName
    $validationPath=Join-Path $script:Work ($StepId+'-native-package-validation.json')
    if(-not [IO.File]::Exists($validationPath)){Atomic-Json $validationPath @{package_name=$Package.name;package_sha256=$Package.sha256;native_package_name=$nativePackageName;native=$selected[0];observed_at=$list.observed_at} -Exclusive}
    Capture-NativePreparationAvailability $StepId
    return Invoke-Step ($StepId+'-native-files') 'write' {
        $response=Host-Json 'POST' '/API/PersonaBar/Upgrades/StartUpgrade' @{packageName=$nativePackageName}
        Require ($response.status -eq 204) 'The native DNN file preparation returned an unexpected completion status.'
        Require (Assert-PreparedPlatform $Package) 'DNN file preparation has not reached the exact approved package.'
        Restore-NativePreparationAvailability $StepId
        @{route='post-10.2';from=$Step.from;to=$Step.to;package_sha256=$Package.sha256;files_prepared=$true;native_status=$response.status}
    } {
        param($prior)
        if(Assert-PreparedPlatform $Package){Restore-NativePreparationAvailability $StepId;return @{route='post-10.2';from=$Step.from;to=$Step.to;package_sha256=$Package.sha256;files_prepared=$true;recovered_from='complete-installed-package'}}
        return $null
    }
}
function Capture-NativePreparationAvailability([string]$StepId) {
    $key=$StepId+'-native-availability'
    if($script:Journal.ContainsKey($key)){return}
    $file=Join-Path $script:SiteRoot 'App_Offline.htm'
    Require (-not [IO.File]::Exists($file)) 'Open the reviewed native Host upgrade with the site available; retain any existing app_offline.htm through the maintenance owner.'
    $templates=@()
    foreach($relative in @('Portals/_default/AppOffline/App_Offline.htm.resources','Resources/AppOffline/App_Offline.htm.resources')){
        $path=Under $script:SiteRoot $relative
        if([IO.File]::Exists($path)){$templates+=@{path=$relative;sha256=Hash-File $path}}
    }
    $script:Journal[$key]=@{original_offline=$false;templates=$templates;observed_at=[DateTime]::UtcNow.ToString('o')}
    Save-Journal
}
function Restore-NativePreparationAvailability([string]$StepId) {
    $prior=Get-Field $script:Journal ($StepId+'-native-availability')
    $file=Join-Path $script:SiteRoot 'App_Offline.htm'
    if(-not [IO.File]::Exists($file)){return}
    Require ($null -ne $prior -and -not $prior.original_offline) 'Preserve the original maintenance file until its native preparation state is reconciled.'
    $hash=Hash-File $file
    Require (@($prior.templates|Where-Object {$_.sha256 -eq $hash}).Count -gt 0) 'A different app_offline.htm is present; retain its owning maintenance operation.'
    $retained=Join-Path $script:Work ($StepId+'-native-offline-template.htm')
    if(-not [IO.File]::Exists($retained)){Atomic-Bytes $retained ([IO.File]::ReadAllBytes($file)) -Exclusive}
    [IO.File]::Delete($file)
    $prior.recovered_online_at=[DateTime]::UtcNow.ToString('o');$prior.recovered_template_sha256=$hash;Save-Journal
}
function Wizard-Account {
    $userRef=Get-Field $script:Connection 'host_username_env' ''
    $passwordRef=Get-Field $script:Connection 'host_password_env' ''
    $username=if($userRef){[Environment]::GetEnvironmentVariable($userRef)}else{''}
    $password=if($passwordRef){[Environment]::GetEnvironmentVariable($passwordRef)}else{''}
    if(-not $username -or -not $password){Need-Input 'Supply the authorized SuperUser through the two private environment references used by the original DNN upgrade wizard.'}
    return @{username=$username;password=$password;acceptTerms='Y'}
}
function Wizard-Call([string]$Method,$Body) {
    $response=Dnn-Http 'POST' ('/Install/UpgradeWizard.aspx/'+$Method) $Body
    Require ($response.status -eq 200 -and $null -ne $response.json) ('The original DNN UpgradeWizard '+$Method+' returned HTTP '+$response.status+'.')
    return Get-Field $response.json 'd' $response.json
}
function Wizard-Input {
    $page=Dnn-Http 'GET' '/Install/UpgradeWizard.aspx'
    Require ($page.status -eq 200) 'Open the original UpgradeWizard in its actual available application before native authentication.'
    $account=Wizard-Account
    $validation=Wizard-Call 'ValidateInput' @{accountInfo=$account}
    if(-not (Get-Field $validation 'Item1' $false)){Need-Input 'DNN did not authenticate the selected SuperUser for this original upgrade.'}
    $view=Wizard-Call 'GetSecurityTab' @{accountInfo=$account}
    $state=Get-Field $view 'Item3'
    Require ((Get-Field $view 'Item1' $false) -and $null -ne $state) 'The original DNN upgrade security step did not return its native decision.'
    if(-not (Get-Field $state 'CanProceed' $false)){Need-Input 'DNN requires its compatibility/security work before starting this upgrade. Open the original UpgradeWizard security step.'}
    $html=[string](Get-Field $state 'View' '')
    # Consume only the actual server-generated hidden anti-forgery value; do not persist it in any artifact.
    $token=[regex]::Match($html,'(?is)<input\b[^>]*(?:id|name)=["'']telerikAntiForgeryToken["''][^>]*value=["'']([^"'']*)["'']')
    if(-not $token.Success){$token=[regex]::Match($html,'(?is)<input\b[^>]*value=["'']([^"'']*)["''][^>]*(?:id|name)=["'']telerikAntiForgeryToken["'']')}
    if($token.Success){$account['telerikAntiForgeryToken']=[Net.WebUtility]::HtmlDecode($token.Groups[1].Value)}
    $key='telerikUninstallOption'
    if($token.Success){
        $choices=@()
        foreach($match in [regex]::Matches($html,'(?is)<input\b[^>]*>')){
            $tag=$match.Value
            if($tag -notmatch '(?i)(?:id|name)=["'']telerikUninstallOption["'']'){continue}
            $value=[regex]::Match($tag,'(?i)value=["'']([^"'']*)["'']')
            if(-not $value.Success){continue}
            $choices+=@{value=[Net.WebUtility]::HtmlDecode($value.Groups[1].Value);selected=($tag -match '(?i)\bchecked\b|\btype=["'']hidden["'']');disabled=($tag -match '(?i)\bdisabled\b')}
        }
        $selected=@($choices|Where-Object {$_.selected})
        $decision=Get-Field $script:Request.release 'telerik_decision' 'native_required'
        if($decision -eq 'remove'){
            Require (@($choices|Where-Object {$_.value -eq 'Y' -and -not $_.disabled}).Count -gt 0) 'The native Telerik security view does not offer the reviewed removal; resolve its actual dependent-extension finding.'
            $account[$key]='Y'
        }else{
            Require ($selected.Count -eq 1 -and $selected[0].value -in @('Y','N')) 'Select the actual Telerik decision in the original native security view before dispatch.'
            $account[$key]=$selected[0].value
        }
    }
    return $account
}
function Upgrade-LogMarker {
    $path=Join-Path $script:SiteRoot 'Install\upgradestat.log.resources.txt'
    if(-not [IO.File]::Exists($path)){return @{exists=$false;bytes=0;sha256=$null}}
    return @{exists=$true;bytes=(Get-Item -LiteralPath $path).Length;sha256=Hash-File $path}
}
function Read-UpgradeOutcome($Marker,[string]$Target,[string]$StepId) {
    $path=Join-Path $script:SiteRoot 'Install\upgradestat.log.resources.txt'
    if(-not [IO.File]::Exists($path)){return $null}
    $bytes=[IO.File]::ReadAllBytes($path);$currentHash=Hash-Bytes $bytes
    if($Marker.exists -and $currentHash -eq $Marker.sha256){return $null}
    $offset=[long](Get-Field $Marker 'bytes' 0)
    if($bytes.LongLength -lt $offset){Uncertain 'The original installer status log was replaced or truncated; retain this dispatch and reconcile its original native output.'}
    if($Marker.exists -and $offset -gt 0){
        $prefix=[byte[]]::new([int]$offset)
        [Array]::Copy($bytes,0,$prefix,0,[int]$offset)
        Require ((Hash-Bytes $prefix) -eq $Marker.sha256) 'The prior installer log prefix changed; an earlier completion cannot identify this run.'
    }
    if($bytes.LongLength -eq $offset){return $null}
    $content=[Text.Encoding]::UTF8.GetString($bytes,[int]$offset,$bytes.Length-[int]$offset)
    $rows=@()
    foreach($line in ($content -split '\r?\n')){
        if(-not $line.Trim()){continue}
        try{$value=Convert-Map ($line|ConvertFrom-Json);if($value -is [Collections.IDictionary]){$rows+=,$value}}catch{}
    }
    if($rows.Count -eq 0){return $null}
    $final=$rows[-1]
    if([int](Get-Field $final 'progress' 0) -lt 100){return $null}
    $a=[string](Get-Field $final 'check0' '');$b=[string](Get-Field $final 'check1' '')
    if($a -match '(?i)error|fail' -or $b -match '(?i)error|fail'){
        $failed=Join-Path $script:Work ($StepId+'-failed-upgrade-status-'+$currentHash.Substring(0,12)+'.log')
        if(-not [IO.File]::Exists($failed)){Atomic-Bytes $failed $bytes -Exclusive}
        throw 'The original DNN installer completed with errors; its complete native log is retained for paired recovery.'
    }
    if($a -notmatch '(?i)done|complete' -or $b -notmatch '(?i)done|complete'){return $null}
    $inventory=Native-Inventory
    if((Version3 $inventory.platform.database_version) -ne (Version3 $Target) -or (Version3 $inventory.platform.assembly_version) -ne (Version3 $Target)){return $null}
    $retained=Join-Path $script:Work ($StepId+'-original-upgrade-status.log')
    if(-not [IO.File]::Exists($retained)){Atomic-Bytes $retained $bytes -Exclusive}
    $script:Native.inventory=$inventory;Save-Native
    return @{completed=$true;target_version=$Target;native_status=$final;status_log=Artifact $retained 'native-installer-log';appended_after_bytes=$offset;original_prefix_sha256=$Marker.sha256;database_version=$inventory.platform.database_version;assembly_version=$inventory.platform.assembly_version}
}
function Finish-NativeUpgrade($Step,[string]$StepId) {
    $markerKey=$StepId+'-wizard-marker'
    if(-not $script:Journal.ContainsKey($markerKey)){
        $script:Journal[$markerKey]=Upgrade-LogMarker;Save-Journal
    }
    $marker=$script:Journal[$markerKey]
    $completed=Invoke-Step ($StepId+'-native-database') 'write' {
        $account=Wizard-Input
        # Authentication and the server-generated security decision are resolved before the one native RunUpgrade POST.
        $script:Journal[$StepId+'-wizard-dispatch']=@{at=[DateTime]::UtcNow.ToString('o');target_version=$Step.to;marker=$marker}
        Save-Journal
        try{$null=Wizard-Call 'RunUpgrade' @{accountInfo=$account}}
        catch{$script:Journal[$StepId+'-wizard-transport']=@{state='response-unavailable';at=[DateTime]::UtcNow.ToString('o')};Save-Journal}
        $deadline=[DateTime]::UtcNow.AddSeconds([int](Get-Field $script:Connection 'installer_wait_seconds' 600))
        do{
            $result=Read-UpgradeOutcome $marker $Step.to $StepId
            if($null -ne $result){return $result}
            Start-Sleep -Seconds 2
        }while([DateTime]::UtcNow -lt $deadline)
        Uncertain 'The original upgrade is still running or its native completion is unresolved. Resume this same request to read its status; do not start another upgrade.'
    } {
        param($prior)
        # A pre-dispatch validation failure can be resumed through the same original authentication step.
        if(-not $script:Journal.ContainsKey($StepId+'-wizard-dispatch')){
            $account=Wizard-Input
            $script:Journal[$StepId+'-wizard-dispatch']=@{at=[DateTime]::UtcNow.ToString('o');target_version=$Step.to;marker=$marker}
            Save-Journal
            try{$null=Wizard-Call 'RunUpgrade' @{accountInfo=$account}}catch{}
        }
        return Read-UpgradeOutcome $marker $Step.to $StepId
    }
    # The normal completion link deletes installer/status files. Keep the original completed log first.
    $null=Invoke-Step ($StepId+'-wizard-finish') 'write' {
        $record=Get-Field $script:Journal.steps ($StepId+'-native-database')
        Require ($null -ne $record -and $record.state -eq 'complete' -and $record.value.completed) 'Retain the actual database completion before final installer cleanup.'
        $log=Under $script:Work $record.value.status_log.path
        Require ([IO.File]::Exists($log) -and (Hash-File $log) -eq $record.value.status_log.sha256) 'The original completed installer log must survive the normal finish action.'
        $response=Dnn-Http 'GET' '/Install/UpgradeWizard.aspx?complete'
        Require ($response.status -in @(200,301,302,303,307,308,404)) 'The native finish link returned an unexpected response.'
        @{finished=$true;status=$response.status;completion_log_sha256=$record.value.status_log.sha256}
    } {
        param($prior)
        $wizard=Join-Path $script:SiteRoot 'Install\UpgradeWizard.aspx'
        $current=Native-Inventory
        if(-not [IO.File]::Exists($wizard) -and (Version3 $current.platform.database_version) -eq (Version3 $Step.to)){
            return @{finished=$true;recovered_from='original-installer-removal'}
        }
        return $null
    }
    return $completed
}
function Extension-Version([string]$Value) {
    $parts=$Value.Split('.')
    Require ($parts.Count -ge 3 -and $parts.Count -le 4 -and @($parts|Where-Object {$_ -notmatch '^\d+$'}).Count -eq 0) 'Use the actual complete numeric extension version.'
    if($parts.Count -eq 3){$parts+=,'0'}
    return [version]::new([int]$parts[0],[int]$parts[1],[int]$parts[2],[int]$parts[3])
}
function Install-Extension($Package,[string]$StepId) {
    $path=Verify-Package $Package
    $manifest=$Package.package.manifests
    $null=Invoke-Step ($StepId+'-parse') 'read' {
        $form=[Net.Http.MultipartFormDataContent]::new()
        $stream=[IO.File]::OpenRead($path);$content=[Net.Http.StreamContent]::new($stream)
        $form.Add($content,'POSTFILE',$Package.name)
        $response=Dnn-Http 'POST' '/API/PersonaBar/Extensions/ParsePackage' -HostHeaders -Content $form
        Require ($response.status -eq 200 -and (Get-Field $response.json 'Success' $false)) 'DNN did not accept the original extension package for installation.'
        $retained=Join-Path $script:Work ($StepId+'-native-extension-parse.json')
        Atomic-Json $retained @{package_sha256=$Package.sha256;native=$response.json;observed_at=$response.observed_at} -Exclusive
        @{completed=$true;native_result=Artifact $retained 'native-extension-validation'}
    }
    return Invoke-Step ($StepId+'-install') 'write' {
        $form=[Net.Http.MultipartFormDataContent]::new()
        $stream=[IO.File]::OpenRead($path);$content=[Net.Http.StreamContent]::new($stream)
        $form.Add($content,'POSTFILE',$Package.name)
        $response=Dnn-Http 'POST' '/API/PersonaBar/Extensions/InstallPackage' -HostHeaders -Content $form
        $retained=Join-Path $script:Work ($StepId+'-native-extension-install.json')
        Atomic-Json $retained @{package_sha256=$Package.sha256;status=$response.status;native=$response.json;observed_at=$response.observed_at} -Exclusive
        Require ($response.status -eq 200 -and (Get-Field $response.json 'Success' $false)) 'The original native extension installer returned a failure.'
        $inventory=Native-Inventory
        foreach($item in $manifest){
            $actual=@($inventory.packages|Where-Object {$_.name -ieq $item.name})
            Require ($actual.Count -eq 1 -and (Extension-Version $actual[0].version) -eq (Extension-Version $item.version)) 'The installed extension version does not match the selected package.'
        }
        $script:Native.inventory=$inventory;Save-Native
        @{completed=$true;package_sha256=$Package.sha256;native_result=Artifact $retained 'native-extension-installation'}
    } {
        param($prior)
        $retained=Join-Path $script:Work ($StepId+'-native-extension-install.json')
        if(-not [IO.File]::Exists($retained)){return $null}
        $response=Read-Json $retained
        if($response.package_sha256 -ne $Package.sha256 -or $response.status -ne 200 -or -not $response.native.Success){return $null}
        $inventory=Native-Inventory
        foreach($item in $manifest){$actual=@($inventory.packages|Where-Object {$_.name -ieq $item.name});if($actual.Count -ne 1 -or (Extension-Version $actual[0].version) -ne (Extension-Version $item.version)){return $null}}
        $script:Native.inventory=$inventory;Save-Native
        @{completed=$true;package_sha256=$Package.sha256;native_result=Artifact $retained 'native-extension-installation';recovered_from='original-native-result-and-installed-version'}
    }
}
function Run-Upgrade {
    Require ($null -ne $script:Request.release -and $null -ne $script:Request.review) 'The native release needs its retained exact review.'
    foreach($package in $script:Request.packages){$null=Verify-Package $package}
    $null=New-PairedBackup
    $steps=@($script:Request.release.steps)
    $index=0
    foreach($step in $steps){
        $index++;$id='platform-'+$index.ToString('D2')+'-'+$step.to.Replace('.','-')
        $package=Platform-Package $step
        $preparedKey=$id+'-prepared'
        $prepared=Get-Field $script:Journal.steps $preparedKey
        if($null -eq $prepared -or $prepared.state -ne 'complete'){
            $current=Native-Inventory
            $nativeFiles=Get-Field $script:Journal.steps ($id+'-native-files')
            if($null -eq $nativeFiles -or $nativeFiles.state -notin @('started','uncertain','complete')){
                Require ((Version3 $current.platform.database_version) -eq (Version3 $step.from)) 'This hop no longer begins at its reviewed installed DNN version.'
            }
            if((Version3 $step.from) -lt [version]'10.2.0'){
                $null=Invoke-Step $preparedKey 'write' {Copy-LegacyPlatform $step $package $id} {
                    param($prior)
                    $current=Native-Inventory
                    if((Version3 $current.platform.database_version) -ne (Version3 $step.from)){return $null}
                    return Copy-LegacyPlatform $step $package $id
                }
            }else{
                $value=Prepare-ModernPlatform $step $package $id
                $script:Journal.steps[$preparedKey]=@{state='complete';kind='write';started_at=$script:Journal.steps[$id+'-native-files'].started_at;finished_at=[DateTime]::UtcNow.ToString('o');value=$value};Save-Journal
            }
        }
        $null=Finish-NativeUpgrade $step $id
    }
    $index=0
    foreach($package in $script:Request.packages|Where-Object {$_.package.kind -eq 'extension'}){
        $index++;$null=Install-Extension $package ('extension-'+$index.ToString('D2'))
    }
    $script:Native.inventory=Native-Inventory
    Require ((Version3 $script:Native.inventory.platform.database_version) -eq (Version3 $script:Request.release.target_version)) 'The native database has not reached the selected maintenance target.'
    Require ((Version3 $script:Native.inventory.platform.assembly_version) -eq (Version3 $script:Request.release.target_version)) 'The native platform files have not reached the selected maintenance target.'
    $script:Native.upgrade_completed=$true;Save-Native
    $null=Http-Checks
    return @{completed=$true;platform_hops=$steps.Count;finished_at=[DateTime]::UtcNow.ToString('o')}
}
