[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RequestDirectory,
    [Parameter(Mandatory=$true)][string]$ConnectionPath,
    [string]$OutputDirectory,
    [switch]$Resume
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-host.ps1')
. (Join-Path $PSScriptRoot 'native-upgrade.ps1')
$script:InputRoot=[IO.Path]::GetFullPath($RequestDirectory)
$script:Connection=Read-Json ([IO.Path]::GetFullPath($ConnectionPath))
Require ($script:Connection.schema -eq 'commons.dnn-connection/v1') 'Use this receiver version of the private connection file.'
$requestPath=Join-Path $script:InputRoot 'request.json'
$raw=[IO.File]::ReadAllBytes($requestPath)
$script:Request=Read-Json $requestPath
$script:RequestHash=Hash-Bytes $raw
$expected=[IO.File]::ReadAllText((Join-Path $script:InputRoot 'request.sha256')).Trim()
Require ($script:RequestHash -eq $expected) 'The native request differs from its original approved bytes.'
Require ($script:Request.schema -eq 'commons.dnn-native/v1') 'Use the matching DNN request schema.'
$operation=[guid]::Empty
Require ([guid]::TryParse($script:Request.operation_id,[ref]$operation)) 'The native request has no original operation UUID.'
Require ([IO.Path]::IsPathRooted([string]$script:Connection.state_directory)) 'Set an absolute private state directory outside the website.'
$stateRoot=[IO.Path]::GetFullPath([string]$script:Connection.state_directory)
Require ([IO.Path]::IsPathRooted($stateRoot)) 'Set an absolute private state directory outside the website.'
[IO.Directory]::CreateDirectory($stateRoot)|Out-Null
$script:Work=Join-Path $stateRoot $operation.ToString()
[IO.Directory]::CreateDirectory($script:Work)|Out-Null
Assert-NoReparse $stateRoot
Assert-NoReparse $script:Work
if(-not $OutputDirectory){$OutputDirectory=$script:Work}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory)|Out-Null
$script:OperationLease=$null
try{$script:OperationLease=[IO.FileStream]::new((Join-Path $script:Work 'operation.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
catch{throw 'The original operation is already executing; read its existing journal and return locator.'}
$journalPath=Join-Path $script:Work 'journal.json'
$priorExists=[IO.File]::Exists($journalPath)
if($priorExists){
    $script:Journal=Read-Json $journalPath
    Require ($script:Journal.operation_id -eq $script:Request.operation_id -and $script:Journal.request_sha256 -eq $script:RequestHash) 'The original native operation directory belongs to another request.'
    Require ($Resume -or $script:Journal.state -eq 'complete') 'Use -Resume to continue this original operation and read its retained outcomes.'
}else{
    $script:Journal=@{schema='commons.dnn-native-journal/v1';operation_id=$script:Request.operation_id;request_sha256=$script:RequestHash;state='prepared';created_at=[DateTime]::UtcNow.ToString('o');steps=@{};uploads=@{};source=@{}}
    foreach($file in @('native.ps1','native-host.ps1','native-upgrade.ps1')){
        $script:Journal.source[$file]=Hash-File (Join-Path $PSScriptRoot $file)
    }
    Atomic-Bytes (Join-Path $script:Work 'request.json') $raw -Exclusive
    Save-Journal
}
$nativePath=Join-Path $script:Work 'native.json'
$script:Native=if([IO.File]::Exists($nativePath)){Read-Json $nativePath}else{@{}}
$started=$script:Journal.created_at
$script:Lease=$null
$status='failed';$message=''
function Native-ErrorText($ErrorRecord) {
    $text=[string]$ErrorRecord.Exception.Message
    foreach($key in @('sql_connection_string_env','host_username_env','host_password_env','host_headers_env')){
        $reference=Get-Field $script:Connection $key ''
        if($reference){$secret=[Environment]::GetEnvironmentVariable($reference);if($secret){$text=$text.Replace($secret,'[private reference]')}}
    }
    if((Get-Variable -Name SqlConnection -Scope Script -ErrorAction SilentlyContinue) -and $script:SqlConnection){$text=$text.Replace($script:SqlConnection,'[private SQL reference]')}
    return $text
}
function Publish-Return([string]$State,[string]$Message) {
    Save-Native
    $artifacts=@()
    # Private connection/configuration binding files never enter the return package.
    foreach($file in Get-ChildItem -LiteralPath $script:Work -File -Recurse){
        $relative=$file.FullName.Substring($script:Work.Length+1).Replace('\','/')
        if($relative -match '(^|/)(?:result[^/]*\.json|(?:DNN_)?return[^/]*\.zip|.*\.lock|.*\.private|.*\.pending(?:-.*)?|original-app-offline\.htm)$'){continue}
        if($relative.StartsWith('restore/received-tree/')){continue}
        if($relative -eq 'connection.json'){continue}
        $artifacts+=Artifact $file.FullName
    }
    $result=@{schema='commons.dnn-native/v1';operation_id=$script:Request.operation_id;request_sha256=$script:RequestHash;status=$State;started_at=$started;finished_at=[DateTime]::UtcNow.ToString('o');message=$Message;native=$script:Native;artifacts=$artifacts}
    $resultBytes=Json-Bytes $result
    $generation=Hash-Bytes $resultBytes
    $resultPath=Join-Path $script:Work ('result-'+$generation+'.json')
    Atomic-Bytes $resultPath $resultBytes -Exclusive
    $name='DNN_Return_'+$operation.ToString()+'_'+$generation.Substring(0,12)+'.zip'
    $zipPath=Join-Path $OutputDirectory $name
    if(-not [IO.File]::Exists($zipPath)){
        $temporary=$zipPath+'.pending-'+[guid]::NewGuid().ToString('N')
        $archive=$null
        try{
            $archive=[IO.Compression.ZipFile]::Open($temporary,[IO.Compression.ZipArchiveMode]::Create)
            $entry=$archive.CreateEntry('result.json',[IO.Compression.CompressionLevel]::Optimal)
            $out=$entry.Open();try{$out.Write($resultBytes,0,$resultBytes.Length)}finally{$out.Dispose()}
            foreach($artifact in $artifacts){
                $file=Under $script:Work $artifact.path
                Require ((Get-Item -LiteralPath $file).Length -eq $artifact.bytes -and (Hash-File $file) -eq $artifact.sha256) 'A retained native artifact changed before publication.'
                $entry=$archive.CreateEntry($artifact.path,[IO.Compression.CompressionLevel]::Fastest)
                $input=[IO.File]::OpenRead($file);$out=$entry.Open()
                try{$input.CopyTo($out)}finally{$input.Dispose();$out.Dispose()}
            }
            $archive.Dispose();$archive=$null
            [IO.File]::Move($temporary,$zipPath)
        }finally{if($null -ne $archive){$archive.Dispose()};if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
    }
    $summary=@{schema='commons.dnn-native-return/v1';operation_id=$script:Request.operation_id;request_sha256=$script:RequestHash;state=$State;path=$zipPath;bytes=(Get-Item -LiteralPath $zipPath).Length;sha256=Hash-File $zipPath;message=$Message}
    Atomic-Json (Join-Path $script:Work 'return-locator.json') $summary
    return $summary
}
try{
    # The original request gets a process lease before mutable journal/native records are reused.
    foreach($file in $script:Journal.source.Keys){
        Require ((Hash-File (Join-Path $PSScriptRoot $file)) -eq $script:Journal.source[$file]) 'Resume with the same original native receiver source. Receive the prior result before preparing a revised operation.'
    }
    Bind-Host
    $targetLock=Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($script:SiteRoot.ToLowerInvariant()))
    $script:Lease=[IO.FileStream]::new((Join-Path $stateRoot ('site-'+$targetLock+'.lock')),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    if($script:Journal.state -eq 'complete'){
        $savedLocator=Join-Path $script:Work 'return-locator.json'
        $locator=if([IO.File]::Exists($savedLocator)){Read-Json $savedLocator}else{$null}
        if($null -eq $locator -or $locator.state -ne 'complete'){
            $locator=Publish-Return 'complete' 'The original completed native action was recovered before its return publication.'
        }
        Require ([IO.File]::Exists($locator.path) -and (Hash-File $locator.path) -eq $locator.sha256) 'Reopen the original completed return archive from its retained location.'
        $locator|ConvertTo-Json -Depth 20 -Compress
        if($null -ne $script:Lease){$script:Lease.Dispose()}
        $script:OperationLease.Dispose()
        exit 0
    }
    if(-not $script:Journal.steps.ContainsKey('initial-inventory')){
        $inventory=Native-Inventory
        Assert-Baseline $inventory
        $script:Native.inventory=$inventory
        $script:Journal.steps['initial-inventory']=@{state='complete';kind='read';started_at=[DateTime]::UtcNow.ToString('o');value=@{platform=$inventory.platform;target=$inventory.target;sql=$inventory.sql}}
        Save-Journal;Save-Native
    }elseif(-not $script:Native.ContainsKey('inventory')){
        $script:Native.inventory=Native-Inventory;Save-Native
    }
    $script:Journal.state='running';Save-Journal
    switch($script:Request.action){
        'inventory' {$script:Native.inventory=Native-Inventory;Save-Native}
        'backup' {$null=New-PairedBackup;$script:Native.inventory=Native-Inventory;Save-Native}
        'upgrade' {$null=Run-Upgrade}
        'restore' {$null=Restore-PairedBackup;$script:Native.inventory=Native-Inventory;Save-Native;$null=Http-Checks}
        'verify' {$script:Native.inventory=Native-Inventory;Save-Native;$null=Http-Checks}
        default {throw 'The original request selects an unknown native operation.'}
    }
    $status='complete';$message='The original native action and its requested checks completed.'
    $script:Journal.state='complete';Save-Journal
}catch{
    $message=Native-ErrorText $_
    $uncertain=@($script:Journal.steps.Values|Where-Object {$_.kind -eq 'write' -and $_.state -in @('started','uncertain')})
    $status=if($message.StartsWith('DNN_INPUT:')){'waiting'}elseif($uncertain.Count -gt 0 -or $message.StartsWith('DNN_UNCERTAIN:')){'uncertain'}else{'failed'}
    $script:Journal.state=$status
    if($null -ne $script:OperationLease){Save-Journal}
    # Keep the selected site in its actual maintenance state after an uncertain mutation.
}
try{
    $summary=Publish-Return $status $message
    $summary|ConvertTo-Json -Depth 20 -Compress
}finally{
    if($null -ne $script:Lease){$script:Lease.Dispose()}
    if($null -ne $script:OperationLease){$script:OperationLease.Dispose()}
}
if($status -eq 'complete'){exit 0}else{exit 2}
