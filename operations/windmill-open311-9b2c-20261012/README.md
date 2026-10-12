# Windmill Open311 receiving package

Operation: WINDMILL-OPEN311-IMPLEMENTATION-9B2C-20261012.

The complete 33-file integration is merged in [PR 283](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/283), merge commit `20e56a68c142ca75dec245cdc39d217b0ef5b6b0`. The reviewed source head is `9a4aa2397c3f61de8d104feeadff62106c426c61`.

## Files

| File | Use |
| --- | --- |
| native-source-packet.json | All 52 source files for current native commissioning, including the original 19 Open311 dependencies and the merged 33-file Windmill integration |
| source-packet.json | Exact 52-file source packet used by the complete adapter run at 17:22:27 UTC |
| atomic-adapter-producer.py | Producing Python wrapper for that exact packet; supports a file input/archive output and the original interactive mode |
| results/open311-adapter-81d804d.zip | Complete source, both databases, raw captures, all download bodies, operation results and process logs from the completed run |
| results/open311-adapter-81d804d.json | Complete actual run summary |

Current native source packet: 460,921 bytes, Git blob `43f791f203195f9b9ae0b92a09dbc3d28aaab701`. The current native journey stops and starts the same Compose project while the original approval waits, then continues that same job through approval, exports and receiving.

## Completed adapter workflow

Node 24.19.0 completed all 19 steps between 2026-10-12T17:22:27.268Z and 17:22:27.614Z. Workspace `acd9377e-3a46-4225-a756-5fa08fbac69e`: five services, three original requests, three assignments, three unchanged repeated requests, nine exports, source revision 7 and receiving revision 8.

The archive contains 91 members and is 447,705 bytes. SHA256: `b50300593aec766f0a2938e31cc1bc5eec1099bf1b57576d49fc323477faff1e`. Git blob: `ecedcec833fc17322379ba2f474e1ce48567bbde`.

That original case exercised the service and adapter directly. The actual Windmill worker, compiled app, native approval, service restart and browser walkthrough continue under the same operation in [the original Slack thread](https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791821584323269).

## Materialize current native source

Use an owned directory with sufficient free disk space. The following verifies every source entry before writing it; it also preserves any existing file whose bytes differ.

```sh
python3 - native-source-packet.json /tmp/windmill-open311-9b2c/source <<'PY'
import hashlib, json, pathlib, sys
packet = json.loads(pathlib.Path(sys.argv[1]).read_text())
root = pathlib.Path(sys.argv[2]).resolve()
for entry in packet["files"]:
    relative = pathlib.PurePosixPath(entry["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe source path")
    data = entry["content"].encode()
    actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if len(data) != entry["bytes"] or actual != entry["gitSha1"]:
        raise ValueError("Source identity mismatch: " + entry["path"])
    target = root / str(relative)
    if target.exists() and target.read_bytes() != data:
        raise ValueError("Existing source differs: " + str(target))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
print(root)
PY
```

On the existing Docker Compose v2 host, use Python 3 and the original installation's private directory:

```sh
cd /tmp/windmill-open311-9b2c/source/integrations/windmill/open311
python3 commission.py prepare --private /tmp/windmill-open311-9b2c/private
python3 commission.py up --private /tmp/windmill-open311-9b2c/private
python3 commission.py deploy --private /tmp/windmill-open311-9b2c/private
python3 native-journey.py --private /tmp/windmill-open311-9b2c/private --approve-review
python3 commission.py logs --private /tmp/windmill-open311-9b2c/private
```

Resume the same commands with the same private directory after interruption. The installer retains image versions and the native journey retains job inputs, job IDs and its service restart phase. Record the actual operator walkthrough using the integration's WALKTHROUGH.md. The installation directory contains operator credentials and native app bundle secrets; retain it with the private host handover.
