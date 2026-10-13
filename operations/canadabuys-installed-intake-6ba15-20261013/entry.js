// Execute the complete original installed-intake carrier in one retained functions cell.
const packet=CANADABUYS_INTAKE_JOB;
if(packet.operationId!=="CANADABUYS-INSTALLED-INTAKE-6BA15-20261013")throw Error("Original intake operation differs");
const byName=new Map(packet.files.map(f=>[f.path,f]));
const hash=new Function(byName.get("sha256_utf8.js").content+"\nreturn sha256utf8;")();
for(const f of packet.files)if(unescape(encodeURIComponent(f.content)).length!==f.bytes||hash(f.content)!==f.sha256)throw Error("Complete source differs: "+f.path);
const wire=byName.get("input.json").content,pin=packet.input;
if(unescape(encodeURIComponent(wire)).length!==pin.bytes||hash(wire)!==pin.sha256)throw Error("Exact original input differs");
const transport={inputBytes:pin.bytes,inputSha256:pin.sha256,wireBytes:pin.bytes,wireSha256:pin.sha256,encoding:"UTF-8"};
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
store("canadabuys-intake-native-transport",transport);
store("canadabuys-intake-native-wire",wire);
store("canadabuys-intake-native-command",'exec "${CODEX_PRIMARY_RUNTIME_PYTHON:-python3}" -u -B -c '+quote(byName.get("bootstrap.py").content));
store("canadabuys-intake-native-controller-source",byName.get("controller.js").content);
await new Function("tools","load","store","text","yield_control","return(async()=>{"+byName.get("controller.js").content+"})()")(tools,load,store,text,yield_control);
