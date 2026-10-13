#!/usr/bin/env python3
"""MIT. Original 8b08 builder source for the same E49 receiving operation.

Reuses the retained original Commons private-Git/bootstrap implementation in
campaign-source.py. It prepares exact source; RuntimeWorkspace owns the build,
runtime preparation and offline installation.
"""
import importlib.util,json,os,pathlib,sys
OPERATION="SCF-MANAGED-SF98-DELIVERY-E49D-20261012"
PRODUCT="8b08a9333af070df0e96b6f09f6612eb07eab1ad"
PINNED={
  "stellar/scf-starforge-20261009/distribution/build.mjs": "4eed9f08057ff8e28f41c39609cc6926c7d346bb",
  "stellar/scf-starforge-20261009/distribution/runtime-profile.mjs": "dd2ecfa155a5806dec9feed4f4d9a5bd15005d95",
  "stellar/scf-starforge-20261009/distribution/runtime-install.mjs": "6d9374932166d7c597fb55148912be193116fa7b",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs": "9ba69b5e83693a5bbad8aff6677673991f5fe70b",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/source-build-workspace.mjs": "98ebf3dd01d30a9f671184ef6d1c3bf803ee3c8f",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs": "ad324ba35f477871856a8fab8f18a7c873004201",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/worker.mjs": "f5cbef83727e4fb96ea706d4e0ababc51c9c3880",
  "stellar/scf-starforge-20261009/distribution/selections/merchant-delivery.json": "9bf767d075458bd9fa61d8ab3b4133dfdfcbcac7"
}
ENTRIES=[
  "stellar/scf-starforge-20261009/distribution/build.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-profile.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-install.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/source-build-workspace.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/worker.mjs"
]
def main():
    if len(sys.argv)!=2:
        raise ValueError("Supply the original private installation-source context.")
    os.umask(0o077)
    path=pathlib.Path(__file__).with_name("campaign-source.py")
    spec=importlib.util.spec_from_file_location("e49_original_selected_source",path)
    original=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    original.HEAD=PRODUCT
    original.PINNED=PINNED
    original.ENTRIES=ENTRIES
    original.PREFIXES=["stellar/scf-starforge-20261009/distribution/"]
    context=original.read(pathlib.Path(sys.argv[1]).resolve(strict=True))
    if context.get("operation")!=OPERATION or context.get("sourcePin")!=PRODUCT:
        raise ValueError("The installation source belongs to another operation or product.")
    root=original.private_directory(pathlib.Path(context["directory"]),True)
    for name in ("repository","node","bootstrapDependencies"):
        if not pathlib.Path(context[name]).exists():
            raise ValueError("The original selected input is absent: "+name)
    for selected in context.get("reuseSources",[]):
        original.private_directory(pathlib.Path(selected))
    offline=context.get("offlineSource",False)
    if not isinstance(offline,bool):
        raise ValueError("Select the original source's actual offline policy.")
    selected={"operation":OPERATION,"sourcePin":PRODUCT,"directory":str(root),
        "repository":context["repository"],"node":context["node"],
        "bootstrapDependencies":context["bootstrapDependencies"],
        "reuseSources":context.get("reuseSources",[]),"offlineSource":offline}
    intent=root/"installation-source-intent.json"
    if intent.exists():
        if original.read(intent)!=selected:
            raise ValueError("Preserve the original installation source selection.")
    else:
        original.save(intent,selected)
    environment=dict(os.environ,PYTHONDONTWRITEBYTECODE="1",GIT_TERMINAL_PROMPT="0")
    result=original.bootstrap(root,selected,environment)
    print(json.dumps({"phase":"installation-source-complete","operation":OPERATION,
        "sourcePin":PRODUCT,"sourceRoot":str(root/"bootstrap"),
        "repository":result["sourceRepository"],"files":len(result["bootstrap"]),
        "bytes":result["sourceBytes"],
        "sameByteSourcesReused":sum(bool(r.get("sharedOriginal")) for r in result["bootstrap"])}),flush=True)
    return 0
if __name__=="__main__":
    raise SystemExit(main())
