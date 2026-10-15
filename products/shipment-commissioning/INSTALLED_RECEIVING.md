# Complete shipment commissioning receiving

Use the merged product source and its source-manifest.json. The manifest is captured once, parsed and emitted from the same bytes. Every selected source member is length/hash checked before export.

## Execute maintained source

```sh
node -e 'const f=require("node:fs");const p="products/shipment-commissioning/";const m=JSON.parse(f.readFileSync(p+"source-manifest.json","utf8"));const files=Object.fromEntries(m.files.map(x=>[x.path,f.readFileSync(p+x.path,"utf8")]));files["source-manifest.json"]=f.readFileSync(p+"source-manifest.json","utf8");(async()=>{for(const course of ["portable","capacity","host"]){const r=await require("./"+p+"receiving/"+course+"-course.cjs")(files);console.log(course,r.checks)}})().catch(e=>{console.error(e);process.exitCode=1})'
node products/shipment-commissioning/native/receive-installed.mjs
```

The browser course executes the actual assembled HTML handlers with explicit DOM and transactional IndexedDB services. The capacity course injects a smaller capacity into the same session factory and verifies rejected dropdown state, complete pending download, explicit clear and continued saving. The host course executes all32 original authored commands through the actual Merchant dispatcher, exact binary intake, whole editor receipt, historical request retry/refusal and paged source observations. These source courses complement the physical native listener run.

For the rendered browser receiving, use Applications to create/open/resume the same private workspace. Open all eight sections, import an original, edit and approve a case, revise an output mapping, capture each checkpoint, review findings and compare actual effort. Open a second tab, create competing edits, explicitly adopt a branch and confirm both full preimages remain. Download the working file, editable HTML and complete handover, then reopen the working file and every attachment in a separate directory.

The authored worked example starts with32 complete journal operations,13 observed differences in the first run and zero differences in the corrected run. Its exact large numeric literal, locked consignee, late amendment, repeated delivery and phase coverage remain available in examples/course.cjs.

Keep the original private programme and commercial source in the existing account case. The installed source is generic and uses authored fixtures. Continue the original equipped receiving operation with the actual runtime/browser result and complete export identity.
