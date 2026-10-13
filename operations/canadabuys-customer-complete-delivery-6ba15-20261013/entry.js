// This whole entry requires the received full carrier in CANADABUYS_CUSTOMER_JOB.
const packet=CANADABUYS_CUSTOMER_JOB;
if(packet.operationId!=="CANADABUYS-AGENT-CUSTOMER-6BA15-20261012")throw Error("Original operation differs");
const byName=new Map(packet.files.map(f=>[f.path,f]));
const hash=new Function(byName.get("sha256_utf8.js").content+"\nreturn sha256utf8;")();
for(const f of packet.files)if(unescape(encodeURIComponent(f.content)).length!==f.bytes||hash(f.content)!==f.sha256)throw Error("Full source differs: "+f.path);
const transport=JSON.parse(byName.get("transport.json").content),wire=byName.get("input.deflate.b64").content;
if(hash(wire)!==transport.wireSha256||wire.length!==transport.wireBytes)throw Error("Complete original input differs");
const bootstrap=byName.get("bootstrap.py").content,quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
store("canadabuys-customer-native-transport",transport);
store("canadabuys-customer-native-wire",wire);
store("canadabuys-customer-native-command","python3 -u -c "+quote(bootstrap));
store("canadabuys-customer-native-controller-source",byName.get("controller.js").content);
await new Function("tools","load","store","text","yield_control","return(async()=>{"+byName.get("controller.js").content+"})()")(tools,load,store,text,yield_control);
