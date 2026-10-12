#!/usr/bin/env python3
"""Install the complete Open311 project into a private native Windmill instance."""
import argparse
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
SOURCE_ROOT = HERE.parents[2]
FOLDER = "tjlabs_open311"
SCRIPT = "f/" + FOLDER + "/workspace"
APP = "f/" + FOLDER + "/operations"
FLOW_NAMES = ("refresh", "review_delivery", "transfer")
def now():
    return datetime.now(timezone.utc).isoformat()
def write_bytes(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
def write_json(path, value):
    write_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))
def digest(value):
    return hashlib.sha256(value).hexdigest()
def includes(actual, expected):
    if isinstance(expected,dict):
        return isinstance(actual,dict) and all(k in actual and includes(actual[k],v)for k,v in expected.items())
    if isinstance(expected,list):
        return isinstance(actual,list) and len(actual)==len(expected) and all(includes(a,e)for a,e in zip(actual,expected))
    return actual==expected
def run(argv, **kwargs):
    return subprocess.run(argv, check=True, text=True, capture_output=True, **kwargs)
class Api:
    def __init__(self, base, token=None):
        parsed = urllib.parse.urlparse(base)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Commission the local instance through its loopback address.")
        self.base = base.rstrip("/")
        self.token = token
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def call(self, method, path, body=None, missing=False, timeout=180, raw=False):
        if not path.startswith("/api/"):
            raise ValueError("Use a Windmill API path.")
        headers = {"Accept": "*/*" if raw else "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=timeout) as response:
                received = response.read()
        except urllib.error.HTTPError as error:
            if missing and error.code == 404:
                return None
            detail = error.read().decode(errors="replace")
            raise RuntimeError("Windmill " + method + " " + path.split("?")[0] + ": HTTP " + str(error.code) + " " + detail[:2000]) from error
        if raw:
            return received
        text = received.decode("utf-8")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    def resume(self, url, body):
        actual, expected = urllib.parse.urlparse(url), urllib.parse.urlparse(self.base)
        if actual.scheme != expected.scheme or actual.netloc != expected.netloc or not actual.path.startswith("/api/"):
            raise ValueError("The approval belongs to another Windmill instance.")
        return self.call("POST", actual.path + ("?" + actual.query if actual.query else ""), body)
def paths(private):
    root = private.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    return root, root / "installation.json"
def compose(config, private, *args):
    return run(["docker", "compose", "--project-name", config["project"], "--env-file", str(private/"compose.env"),
                "-f", str(HERE/"compose.yaml"), *args], cwd=HERE)
def env_file(private, values):
    lines = []
    for key, value in values.items():
        value = str(value)
        if any(c in value for c in "\n\r$"):
            raise ValueError("Choose a source path and values without newlines or dollar signs.")
        lines.append(key + "=" + json.dumps(value))
    write_bytes(private/"compose.env", ("\n".join(lines)+"\n").encode("utf-8"))
def prepare(args):
    private, path = paths(args.private)
    if path.exists():
        config = read_json(path)
        if config["sourceRoot"] != str(SOURCE_ROOT) or (args.port is not None and config["port"] != args.port):
            raise RuntimeError("This private installation already has another source path or port.")
        selected_mode = args.source_mode or config.get("sourceMode", "retained")
        if "sourceMode" in config and config["sourceMode"] != selected_mode:
            raise RuntimeError("Keep this installation's original source mode; use a separate private directory for another mode.")
    else:
        identity = secrets.token_hex(6)
        port = args.port if args.port is not None else 8079
        selected_mode = args.source_mode or "retained"
        config = {"schema":"tjlabs.windmill.open311.installation.v1","id":identity,"createdAt":now(),
                  "sourceRoot":str(SOURCE_ROOT),"port":port,"base":"http://127.0.0.1:"+str(port),
                  "project":"tjlabs-open311-"+identity,"workspace":"open311_operations",
                  "postgresPassword":secrets.token_hex(32),"bootstrapSecret":secrets.token_hex(32),
                  "operatorEmail":"operator@open311.local","operatorPassword":secrets.token_hex(24)}
    config["sourceMode"] = selected_mode
    write_json(path, config)
    run(["docker","compose","version"])
    images = {"POSTGRES_IMAGE":"postgres:18","WINDMILL_IMAGE":"ghcr.io/windmill-labs/windmill:main","NODE_IMAGE":"node:24-bookworm-slim"}
    image_receipts = dict(config.get("images", {}))
    for variable, requested in images.items():
        retained = image_receipts.get(variable)
        image = retained["pinned"] if retained else requested
        info = None
        if retained:
            try:
                info = json.loads(run(["docker","image","inspect",image]).stdout)[0]
            except subprocess.CalledProcessError:
                pass
        if info is None:
            print("Pulling " + image, flush=True)
            pull = run(["docker","pull",image])
            write_bytes(private/(variable.lower()+"-pull.log"), (pull.stdout+pull.stderr).encode("utf-8"))
            info = json.loads(run(["docker","image","inspect",image]).stdout)[0]
        refs = info.get("RepoDigests") or []
        if retained:
            if image not in refs:
                raise RuntimeError("The retained Docker image digest is unavailable: " + image)
            pin = image
        else:
            name = requested.rsplit(":",1)[0]
            matches = [ref for ref in refs if ref.split("@")[0] == name]
            if not matches:
                raise RuntimeError("Docker did not provide the requested repository digest for " + requested)
            pin = matches[0]
        image_receipts[variable] = {"requested":requested,"pinned":pin,"id":info["Id"],"created":info.get("Created"),
                                    "architecture":info.get("Architecture"),"os":info.get("Os"),
                                    "pulledAt":retained["pulledAt"] if retained else now(),"verifiedAt":now()}
        # Preserve each resolved pin before another pull so a retry cannot replace an already selected image.
        config["images"] = image_receipts
        write_json(path, config)
    env_file(private, {"POSTGRES_PASSWORD":config["postgresPassword"],"WINDMILL_BOOTSTRAP_SECRET":config["bootstrapSecret"],
                      "SOURCE_ROOT":SOURCE_ROOT,"WINDMILL_PORT":config["port"],"OPEN311_SOURCE_MODE":selected_mode,
                      **{key:entry["pinned"] for key,entry in image_receipts.items()}})
    write_json(private/"images.json", image_receipts)
    print(json.dumps({"state":"PREPARED","project":config["project"],"base":config["base"],"private":str(private)}))
    return config
def configuration(args):
    private, path = paths(args.private)
    if not path.exists():
        raise RuntimeError("Run commission.py prepare first.")
    return private, read_json(path)
def up(args):
    private, config = configuration(args)
    result = compose(config,private,"up","-d")
    (private/"compose-up.log").write_text(result.stdout+result.stderr)
    api = Api(config["base"],config["bootstrapSecret"])
    deadline=time.monotonic()+180
    while True:
        try:
            workers=api.call("GET","/api/workers/list",timeout=10)
            if isinstance(workers,list) and workers:
                break
        except (RuntimeError,urllib.error.URLError,TimeoutError):
            pass
        if time.monotonic()>=deadline:
            logs=compose(config,private,"logs","--no-color")
            (private/"startup.log").write_text(logs.stdout+logs.stderr)
            raise RuntimeError("Inspect the saved native startup log; the worker has not registered yet.")
        time.sleep(2)
    write_json(private/"workers.json",workers)
    print(json.dumps({"state":"RUNNING","base":config["base"],"workers":len(workers)}))
def login(private, config):
    bootstrap=Api(config["base"],config["bootstrapSecret"])
    exists=bootstrap.call("GET","/api/users/exists/"+urllib.parse.quote(config["operatorEmail"],safe=""))
    if exists is not True:
        bootstrap.call("POST","/api/users/create",{"email":config["operatorEmail"],"password":config["operatorPassword"],
                       "super_admin":False,"name":"Open311 operator","company":"TJLabs","skip_email":True,"login_type":"password"})
    token=Api(config["base"]).call("POST","/api/auth/login",{"email":config["operatorEmail"],"password":config["operatorPassword"]})
    if not isinstance(token,str) or not token:
        raise RuntimeError("The local operator login did not return a session token.")
    config["operatorToken"]=token
    write_json(private/"installation.json",config)
    return Api(config["base"],token)
def api_for(args):
    private,config=configuration(args)
    return private,config,login(private,config)
def app_source():
    root=HERE/"workspace"/(APP+".raw_app")
    value={"files":{},"runnables":{}}
    for path in sorted(root.iterdir()):
        if path.is_file() and path.name not in ("raw_app.yaml",) and not path.name.endswith(".lock"):
            value["files"]["/"+path.name]=path.read_text(encoding="utf-8")
    triggerables={}
    for path in sorted((root/"backend").glob("*.yaml")):
        original=read_json(path)
        runnable={"type":"path","runType":original["type"],"path":original["path"],"fields":original.get("fields",{})}
        value["runnables"][path.stem]=runnable
        static={name:field["value"]for name,field in runnable["fields"].items()if field.get("type")=="static"}
        triggerables[path.stem+":"+runnable["runType"]+"/"+runnable["path"]]={"static_inputs":static,"one_of_inputs":{},"allow_user_resources":[]}
    return value,{"execution_mode":"publisher","triggerables_v2":triggerables}
def app_matches(app, value, policy):
    if not isinstance(app, dict) or app.get("raw_app") is not True:
        return False
    actual = app.get("policy", {})
    grants = actual.get("triggerables_v2")
    expected = policy["triggerables_v2"]
    if not isinstance(grants, dict) or set(grants) != set(expected):
        return False
    if any(not isinstance(grants[key], dict) or any(grants[key].get(name) != field for name, field in entry.items())
           for key, entry in expected.items()):
        return False
    return (app.get("value", {}).get("files") == value["files"]
            and app.get("value", {}).get("runnables") == value["runnables"]
            and actual.get("execution_mode") == policy["execution_mode"]
            and not actual.get("triggerables"))
def built_app(private, api, prefix, app):
    if app.get("raw_app") is not True or not app.get("versions"):
        raise RuntimeError("The deployed app has no native compiled version.")
    version = app["versions"][-1]
    if not isinstance(version, int) or version < 0:
        raise RuntimeError("Windmill returned an invalid app version.")
    secret = app.get("bundle_secret")
    if not secret:
        secret = api.call("GET", prefix+"/apps/secret_of_latest_version/"+APP)
        latest = api.call("GET", prefix+"/apps/get/p/"+APP)
        if latest.get("versions", [])[-1:] != [version]:
            raise RuntimeError("The app changed while selecting its compiled version; continue deployment to capture the current version.")
    if not isinstance(secret, str) or not secret:
        raise RuntimeError("Windmill did not return the deployed app's bundle identity.")
    directory = private/"built-app"/str(version)
    files = []
    for kind in ("js", "css"):
        body = api.call("GET", prefix+"/apps/get_data/v/"+urllib.parse.quote(secret, safe="")+"."+kind,
                        missing=kind == "css", raw=True)
        if body is None:
            continue
        if kind == "js" and not body:
            raise RuntimeError("The native app version returned an empty JavaScript bundle.")
        destination = directory/("bundle."+kind)
        write_bytes(destination, body)
        files.append({"kind":kind,"path":str(destination.relative_to(private)),"bytes":len(body),"sha256":digest(body)})
    value = app["value"]
    write_json(directory/"source.json", value)
    manifest = {"schema":"tjlabs.windmill.open311.built-app.v1","version":version,"fetchedAt":now(),
                "sourceSha256":digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")),
                "files":files}
    write_json(directory/"manifest.json", manifest)
    return manifest
def deploy(args):
    private,config,api=api_for(args)
    workspace=config["workspace"];prefix="/api/w/"+workspace
    # The workspace is created by the real local operator, so its identity owns the installed scripts and app.
    workspace_name=api.call("GET",prefix+"/workspaces/get_workspace_name",missing=True)
    if workspace_name is None:
        api.call("POST","/api/workspaces/create",{"id":workspace,"name":"Open311 service operations","username":"operator"})
    folder=api.call("GET",prefix+"/folders/get/"+FOLDER,missing=True)
    if folder is None:
        api.call("POST",prefix+"/folders/create",{"name":FOLDER,"summary":"Service operations, review and portable handover"})
    original=api.call("GET",prefix+"/scripts/get/p/"+SCRIPT,missing=True)
    source=(HERE/"workspace"/(SCRIPT+".ts")).read_text(encoding="utf-8")
    metadata=read_json(HERE/"workspace"/(SCRIPT+".script.yaml"))
    body={"path":SCRIPT,"content":source,"language":"bun","kind":"script","summary":metadata["summary"],
          "description":metadata["description"],"schema":metadata["schema"],"deployment_message":"Complete Open311 operator project","skip_draft_deletion":True}
    prior=private/"prior-deployments"/datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if original is None or original.get("content")!=source or not includes(original.get("schema"),metadata["schema"]):
        if original:
            write_json(prior/"workspace-script.json",original)
            body["parent_hash"]=original["hash"]
        api.call("POST",prefix+"/scripts/create",body)
    scripts=api.call("GET",prefix+"/scripts/get/p/"+SCRIPT)
    if scripts.get("content")!=source or not includes(scripts.get("schema"), metadata["schema"]):
        raise RuntimeError("The deployed workspace script or its input schema differs from the current source.")
    deployed_flows={}
    for name in FLOW_NAMES:
        path="f/"+FOLDER+"/"+name
        flow=read_json(HERE/"workspace"/(path+".flow")/"flow.yaml")
        original=api.call("GET",prefix+"/flows/get/"+path,missing=True)
        if original is None or any(not includes(original.get(k),flow[k])for k in ("value","schema","summary")):
            if original:
                write_json(prior/(name+"-flow.json"),original)
            api.call("POST",prefix+("/flows/create"if original is None else"/flows/update/"+path),
                     {"path":path,**flow,"deployment_message":"Complete Open311 operator project","skip_draft_deletion":True})
        deployed=api.call("GET",prefix+"/flows/get/"+path)
        if not includes(deployed["value"]["modules"],flow["value"]["modules"]):
            raise RuntimeError("The deployed flow differs from its source: "+path)
        deployed_flows[name]=deployed
    value,policy=app_source()
    original=api.call("GET",prefix+"/apps/get/p/"+APP,missing=True)
    if not app_matches(original, value, policy):
        if original:
            write_json(prior/"operations-app.json",original)
        endpoint=prefix+("/apps/create_raw_source"if original is None else"/apps/update_raw_source/"+APP)
        api.call("POST",endpoint,{"path":APP,"summary":"Service operations","value":value,"policy":policy,
                                 "deployment_message":"Complete Open311 request queue, approval, comparison and handover",
                                 "skip_draft_deletion":True},timeout=660)
    deployed_app=api.call("GET",prefix+"/apps/get/p/"+APP)
    if not app_matches(deployed_app, value, policy):
        raise RuntimeError("The native app source, kind or execution policy differs from the current fixed backend bindings.")
    compiled = built_app(private, api, prefix, deployed_app)
    try:
        source_commit=run(["git","-C",str(SOURCE_ROOT),"rev-parse","HEAD"]).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        source_commit=None
    deployment={"schema":"tjlabs.windmill.open311.deployment.v1","deployedAt":now(),"base":config["base"],
                "workspace":workspace,"sourceCommit":source_commit,"script":scripts,"flows":deployed_flows,"app":deployed_app,
                "images":config.get("images"),"sourceMode":config.get("sourceMode"),"builtApp":compiled}
    write_json(private/"deployment.json",deployment)
    print(json.dumps({"state":"DEPLOYED","app":config["base"]+"/apps/get/"+APP+"?workspace="+workspace,
                      "scriptHash":scripts["hash"],"appVersions":deployed_app["versions"],"flows":list(deployed_flows),"builtApp":compiled}))
def status(args):
    private,config=configuration(args)
    result=compose(config,private,"ps","--format","json")
    (private/"compose-status.json").write_text(result.stdout)
    print(result.stdout)
def logs(args):
    private,config=configuration(args)
    result=compose(config,private,"logs","--no-color")
    path=private/"native-services.log";path.write_text(result.stdout+result.stderr)
    print(json.dumps({"state":"LOGS_SAVED","path":str(path)}))
def stop(args):
    private,config=configuration(args)
    result=compose(config,private,"stop")
    (private/"compose-stop.log").write_text(result.stdout+result.stderr)
    print(json.dumps({"state":"STOPPED","project":config["project"]}))
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action",choices=("prepare","up","deploy","status","logs","stop"))
    parser.add_argument("--private",type=pathlib.Path,default=HERE/".private")
    parser.add_argument("--port",type=int,help="Local port for a new installation (default 8079); a resumed installation keeps its port.")
    parser.add_argument("--source-mode",choices=("retained","live"),help="Source mode for a new installation (default retained); a resumed installation keeps its mode.")
    args=parser.parse_args()
    if args.port is not None and not 1024<=args.port<=65535:
        parser.error("Choose a local port between 1024 and 65535.")
    globals()[args.action](args)
if __name__=="__main__":
    main()
