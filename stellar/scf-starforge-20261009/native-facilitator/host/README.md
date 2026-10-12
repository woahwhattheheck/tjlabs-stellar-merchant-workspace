# Native facilitator: Linux commissioning and receiving

This product installs and operates one original native facilitator through systemd. It joins the maintained runtime installation, selected configuration, private signer environment, service identity, original SDK readiness, graceful drain, configuration transition, rollback and portable receiving.

The original native facilitator remains responsible for verification, settlement, admission, signing-account selection, source-account slots, RPC readiness and accepted-work completion. The host controller issues no payment request and has no payment queue. Public merchant traffic continues through its existing merchant/SF58 ingress.

## Complete source and entrypoints

The maintained distribution contribution registers:

~~~sh
starforge facilitator-host --help
~~~

The direct source entry is:

~~~sh
node /ABS/maintained/source/stellar/scf-starforge-20261009/native-facilitator/host/cli.mjs --help
~~~

The source product comprises shared.mjs, plan.mjs, probe.mjs, host.mjs, cli.mjs, receiving.mjs and this guide. The native facilitator's original config.mjs, cli.mjs, runtime.mjs, server.mjs, ownership.mjs and the distribution runtime installer remain their own source.

JavaScript module APIs are:

| Module | Operation |
| --- | --- |
| plan.mjs | stage(selection), readBundle(directory), publicBundle(bundle), compareBundles(before, after), preflight(plan), serviceUnit(plan) |
| host.mjs | begin({bundle, operationId, reviewedBundleId, expectedCurrentBundleId, waitSeconds}), resume({hostDirectory, operationId, rollback, waitSeconds}), drain({hostDirectory, operationId, expectedCurrentBundleId, waitSeconds}), status({hostDirectory, operationId}), exportHandover({bundle, hostDirectory}) |
| receiving.mjs | receiveCase({input, output}) |
| probe.mjs | probe({runtime, config, state}) under the selected service UID/GID |
| cli.mjs | run(argumentArray) using the same original operations |

waitSeconds is an integer from 0 through 45. A waiting operation retains its identity and returns current original process/service observations. Resume that operation to continue it.

## Linux runtime and account preparation

Use Linux with a running systemd service manager, its unified cgroup v2 hierarchy mounted at /sys/fs/cgroup, Node.js 22.16 or newer, Python 3.11 or newer, util-linux flock/runuser, getent and systemd-analyze. The actual selected source profile may require a newer Node version. Host mutations run as the host administrator; the original facilitator runs under an existing unprivileged service account.

The maintained runtime installer requires its private installation directory to belong to the invoking operator. Install the complete selected native runtime under the service account that will run it. Do not recursively change ownership of an existing installation or shared state to make a different identity appear compatible.

Use the actual original archive, digest and selected dependency profile:

~~~sh
sudo -u scffacil -g scffacil \
  node /ABS/maintained/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs \
  prepare --dir /srv/starforge/runtimes/facilitator-01 \
  --archive /srv/starforge/downloads/original-merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --native --operator

sudo -u scffacil -g scffacil \
  node /ABS/maintained/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs \
  install --dir /srv/starforge/runtimes/facilitator-01
~~~

The parent directories and selected maintained toolkit must be traversable/readable by that account. The original runtime-install inspect operation checks the selected source archive, manifest, profile, complete dependency lock, installed imports and declared native bindings. HOST invokes that original inspection under the real service UID/GID with source verification enabled.

The maintained toolkit used to run HOST must also be readable by the selected account because the key-free inspection helper uses its maintained installer. The Node executable actually running HOST is pinned for the generated service. Its version, module ABI and full executable digest are retained.

The default tool paths are:

| Tool | Default |
| --- | --- |
| systemctl | /usr/bin/systemctl |
| systemd-analyze | /usr/bin/systemd-analyze |
| getent | /usr/bin/getent |
| runuser | /usr/sbin/runuser |
| flock | /usr/bin/flock |

A selection may replace these exact named paths through binaries. Every value must be an absolute normalized path. The original native CLI invokes flock from PATH; the generated unit uses /usr/bin:/bin.

## Private configuration and signer environment

Supply the original stellar-forge.native-facilitator.v1 JSON configuration. Its network, HTTPS RPC, allowed asset contracts/recipients/maximum amount, payment flows, public signer addresses, secretEnv names, fee limits, concurrency and readiness settings retain the original validator.

Signer values remain in a separate local environment file. The supported file deliberately has a simple exact grammar:

~~~text
# Values are supplied locally by the signer owner.
FACILITATOR_SIGNER=REPLACE_WITH_ORIGINAL_STELLAR_SECRET
~~~

Replace the placeholder with the original 56-character S-prefixed Stellar secret. Each required secretEnv appears exactly once. Blank lines and whole-line comments are supported. Names must be the selected signer or fee-bump environment names; additional variables, quoted/multiline values and duplicate names are rejected. This prevents unrelated environment overrides from changing the selected executable or native process behavior.

The input environment file must be a regular private file owned by root or the selected service UID. Stage retains its exact bytes as a root-owned 0600 signer.env in the private bundle. The original SDK performs the public-address/secret agreement check inside the service. HOST never prints the values.

The selected configuration is retained byte-for-byte as root-owned 0640 facilitator.json. It may contain a private RPC path/query, so the public handover carries the original review's RPC origin and the exact configuration digest, rather than its private contents. The environment digest stays in the private bundle; the public view gives the required names and whether two private environments differ.

## Stage one complete selection

Example selection:

~~~json
{
  "hostDirectory": "/srv/starforge/facilitator-host",
  "runtimeDirectory": "/srv/starforge/runtimes/facilitator-01",
  "config": "/srv/starforge/private/facilitator.json",
  "environmentFile": "/srv/starforge/private/facilitator.env",
  "unit": "starforge-native-facilitator.service",
  "user": "scffacil",
  "group": "scffacil",
  "port": 4020,
  "ownershipDirectory": "/var/lib/starforge-facilitator/signers",
  "createOwnershipDirectory": true,
  "enableAtBoot": true,
  "stageId": "facilitator-original"
}
~~~

hostDirectory is the original host identity/control directory. A single host directory binds one unit, OS account, network, loopback port, systemd directory and signer-ownership directory. Source/configuration editions may change while these host identities stay fixed.

ownershipDirectory is an explicit original --state selector. The original configuration bytes retain their declared path; ownershipSelection records both declared and selected paths. This permits a receiving host to select its real local state path without text replacement in the original configuration. A transition inside an existing host cannot change that selected directory.

The directory must be real, private 0700 and owned by the selected service UID. createOwnershipDirectory:true creates only a missing selected directory. Existing state is checked in place. All cooperating same-host facilitators for these signer accounts must use this same directory and OS identity.

~~~sh
sudo starforge facilitator-host stage --selection /ABS/private/host-selection.json
~~~

Stage creates an immutable bundle, performs the original key-free source/configuration/runtime inspection under the selected account, and runs the real systemd parser over the emitted unit. It does not acquire signer leases or activate the service.

A supplied stageId makes preparation resumable. Repeating the same complete selected input finishes its incomplete preparation or returns the same completed bundle. Different source/configuration/environment/account/Node input cannot reuse that ID. The complete bundle marker is written after the unit parser succeeds.

## Apply and observe

Use the returned exact bundleId. Initial commissioning expects no prior current bundle:

~~~sh
sudo starforge facilitator-host apply \
  --bundle /srv/starforge/facilitator-host/bundles/facilitator-original \
  --operation install-original \
  --reviewed-bundle RETURNED_BUNDLE_ID \
  --expected-current none \
  --wait-seconds 10
~~~

The generated unit starts the original CLI's --check as ExecStartPre, followed by its original --serve as MainPID. Both consume the selected private environment, --state and --require-ready. The signing check runs after the previous service has fully drained.

HOST observes all of the following before returning COMPLETED:

- The installed unit bytes, fragment path, effective account and shutdown/restart properties match the selected bundle; no untracked drop-in or ExecStop hook is active.
- The actual MainPID has the selected UID, executable and exact original native CLI argument array.
- The original /healthz response reports the selected network and signer account set.
- The original ownership files retain their original inodes and identify that MainPID and ownerId.
- The actual /readyz response is ready, and the process identity remains the same across observation.

The API returns its actual original readiness fields. It does not turn a loaded systemd unit or HTTP listener alone into a ready native facilitator.

~~~sh
sudo starforge facilitator-host status --host /srv/starforge/facilitator-host
~~~

The status includes current selection, active operation, unit fields, actual service-group members and original health/readiness. An unavailable observation retains an error code and the actual unit/process facts.

## Original drain behavior

The service uses Type=exec, KillMode=mixed, SIGTERM, SendSIGHUP=no, SendSIGKILL=no, TimeoutStopSec=infinity and Restart=no. The original Node process receives the first termination signal. It stops admission and drains accepted native work.

If the native grace interval expires while accepted SDK work remains, the original CLI prints WAITING_FOR_ACCEPTED_NATIVE_WORK and keeps its signing descriptors alive until that work finishes. HOST neither changes that outcome nor adds SuccessExitStatus=2. The original unsuccessful shutdown status remains visible.

The synchronous flock acquisition helper has already exited during ordinary operation. The Node parent retains the actual open-file-description lease. Lock files are never unlinked, replaced, restored over live files or cleared because a timestamp looks old.

A stop request with --no-block only enqueues the systemd job. HOST subsequently checks the original PID/start/boot identity, MainPID, ControlPID, terminal unit/job state and complete original/current cgroup before installing another selection. The cgroup v2 mount is checked explicitly; an unsupported hierarchy cannot masquerade as an empty group.

For an explicit complete drain:

~~~sh
sudo starforge facilitator-host drain \
  --host /srv/starforge/facilitator-host \
  --operation drain-original \
  --expected-current CURRENT_BUNDLE_ID \
  --wait-seconds 10
~~~

DRAINED leaves the selected service inactive, releases the host operation and retains the bundle/state/lock inodes. It preserves the selected boot-enable setting, like an ordinary service stop. A later explicit apply of that same bundle with a new operation ID starts it again.

## Configuration transition and recovery

Stage the next original configuration in the same host directory with a new stageId. Then compare the complete selections:

~~~sh
sudo starforge facilitator-host compare \
  --before /srv/starforge/facilitator-host/bundles/facilitator-original \
  --after /srv/starforge/facilitator-host/bundles/facilitator-next

sudo starforge facilitator-host apply \
  --bundle /srv/starforge/facilitator-host/bundles/facilitator-next \
  --operation transition-next \
  --reviewed-bundle NEXT_BUNDLE_ID \
  --expected-current CURRENT_BUNDLE_ID
~~~

The exact request, prior current pointer, installed unit/state, original process identity and signer custody are retained before service changes. A root-owned maintenance marker prevents boot activation through the selected unit during the stop/install portion. The candidate unit is installed with file-hash comparison and an atomic durable replacement. The marker is removed only for the selected start.

The original CLI's coded startup/shutdown messages remain in the selected unit journal. Inspect that exact unit with systemctl status and journalctl --unit UNIT --no-pager; the host result retains the effective ExecStartPre/main exit and systemd Result fields. Key-free preflight failures also return their original coded error when available.

A lost reply is recovered through the same operation:

~~~sh
sudo starforge facilitator-host resume \
  --host /srv/starforge/facilitator-host --operation transition-next
~~~

The controller retains the pre-start systemd invocation and monotonic execution fields. If the original process executed and exited before a PID poll observed it, recovery reports ORIGINAL_PROCESS_EXITED instead of treating it as an unexecuted request. A changed boot identity is reported as ORIGINAL_HOST_RESTARTED. Neither outcome causes an automatic fresh invocation.

Common returned states:

| State | Meaning |
| --- | --- |
| COMPLETED | The selected original process and ready endpoint were observed and the current pointer committed. |
| WAITING_FOR_ORIGINAL_DRAIN | Original process/group work remains; resume this operation. |
| WAITING_FOR_ORIGINAL_READINESS | The selected start is still being observed; original fields are retained. |
| ORIGINAL_START_FAILED | Systemd retained the original start failure; no automatic restart is added. |
| ORIGINAL_PROCESS_EXITED | The original invocation ran and exited; it is not silently repeated. |
| ORIGINAL_HOST_RESTARTED | The pre-start boot identity changed; inspect the actual original service outcome. |
| DRAINED | The original service/group finished, with stable signing custody retained. |
| ROLLED_BACK | The retained previous selection and its original active/inactive state were restored. |

A failed candidate may be rolled back through the same journal:

~~~sh
sudo starforge facilitator-host rollback \
  --host /srv/starforge/facilitator-host --operation transition-next
~~~

Rollback drains any actual candidate work first. It restores the exact previous generated unit and private input references, preserves the previous enable setting and active/inactive state, then observes the original service if it was active. Initial-install rollback removes only its owned generated unit. The source installations, configuration bundles, original state and lock files remain.

An older completed operation cannot roll back over a later current operation. Source/runtime/account changes, a foreign maintenance marker, a changed unit/drop-in or missing/replaced retained signer inode produce specific conflicts. They are not repaired through broad permission changes, stale-process deletion or lock-file substitution.

## Complete portable handover

~~~sh
sudo starforge facilitator-host export \
  --bundle /srv/starforge/facilitator-host/bundles/facilitator-next \
  --host /srv/starforge/facilitator-host \
  --output /ABS/new-handover
~~~

The handover contains HOST-HANDOVER.json, an exact file manifest, original unit reference, configuration template, signer-name template and receiving instructions. It includes the original source archive/profile/commit, Node and configuration identities plus actual observed host state when requested. It includes no signer value and no private RPC path/query.

Keep the original private configuration and signer environment through the operator's existing private custody. They are required to commission the same selected signing accounts. HOST does not substitute a freshly generated account during recovery.

On the receiving installation, use the maintained runtime installer for the exact archive/profile, supply those original private inputs locally and create an explicit receiving selection. Then:

~~~sh
sudo starforge facilitator-host receive \
  --handover /ABS/handover/HOST-HANDOVER.json \
  --selection /ABS/private/receiving-selection.json
~~~

Receive verifies the supplied original configuration digest and original source/archive/profile/account/network identity. It stages the new host and reports the changed account/path/endpoint selections for review. It does not activate a second signer. Apply the returned exact staged selection when the original host has completed its drain.

The original signing lease is local to its Linux host. It is not distributed coordination between two machines. Remote commissioning requires the actual old host's accepted work to finish before the same accounts are activated remotely. A copied lock file cannot establish that condition. Host receiving therefore never copies signer lock files.

## One complete original receiving programme

receiving.mjs exercises the complete original host workflow without a replacement SDK or fake RPC success. It takes one local input JSON:

~~~json
{
  "schema": "stellar-forge.native-facilitator-host-receiving.v1",
  "authoredTestnet": true,
  "operationPrefix": "native-host-receiving",
  "before": {
    "hostDirectory": "/srv/starforge/example-host",
    "runtimeDirectory": "/srv/starforge/runtimes/facilitator-01",
    "config": "/ABS/private/edition-1.json",
    "environmentFile": "/ABS/private/testnet-signers.env",
    "unit": "starforge-host-example.service",
    "user": "scffacil",
    "group": "scffacil",
    "port": 14020,
    "ownershipDirectory": "/var/lib/starforge-facilitator/example-signers",
    "createOwnershipDirectory": true,
    "enableAtBoot": false
  },
  "after": {
    "hostDirectory": "/srv/starforge/example-host",
    "runtimeDirectory": "/srv/starforge/runtimes/facilitator-01",
    "config": "/ABS/private/edition-2.json",
    "environmentFile": "/ABS/private/testnet-signers.env",
    "unit": "starforge-host-example.service",
    "user": "scffacil",
    "group": "scffacil",
    "port": 14020,
    "ownershipDirectory": "/var/lib/starforge-facilitator/example-signers",
    "enableAtBoot": false
  },
  "receiving": {
    "hostDirectory": "/srv/starforge/example-receiver",
    "runtimeDirectory": "/srv/starforge/runtimes/facilitator-01",
    "config": "/ABS/private/edition-2.json",
    "environmentFile": "/ABS/private/testnet-signers.env",
    "unit": "starforge-host-receiver.service",
    "user": "scffacil",
    "group": "scffacil",
    "port": 14021,
    "ownershipDirectory": "/var/lib/starforge-facilitator/example-signers",
    "enableAtBoot": false
  }
}
~~~

The two genuine testnet configuration editions should carry a reviewed change such as an explicit concurrency/fee limit. Both original testnet signer/config inputs are supplied by the receiving operator.

~~~sh
sudo node /ABS/source/stellar/scf-starforge-20261009/native-facilitator/host/receiving.mjs \
  --input /ABS/private/native-host-receiving.json \
  --output /ABS/new-receiving-result
~~~

The programme commissions edition 1, replays its completed request without replacing the running process, applies edition 2, deliberately selects a local HTTPS connection-refused RPC to obtain the original start failure, restores edition 2 through the same rollback, exports and independently verifies the handover, fully drains the original service, stages/activates the separate same-host receiver with the original signing directory and then fully drains that receiver. All source/configuration identities and original results are retained.

Its final result explicitly states that this is actual same-host receiving and that paymentCalls is 0. It does not claim remote-host deployment or an accepted-payment drain experiment. Source-policy review separately establishes the handling of accepted native work. Private progress/capture files let the same authored receiving case continue after interruption; the public handover captures one original observation and is never regenerated from later state during a lost-reply retry.

One retained receiving lease serializes the full case and its progress file; a concurrent invocation leaves the existing owner in place. The programme returns PENDING when its finite wait expires and retains the original operation. A later invocation with the identical input continues from its retained steps. A completed invocation returns the exact original result. The document itself is not an execution receipt: report the actual result file, process/service identities and completed status from the receiving host.

## Source references and integration

Original product sources:

- ../cli.mjs — original review/check/serve and accepted-work shutdown.
- ../ownership.mjs — actual parent-descriptor flock custody.
- ../runtime.mjs — original native SDK, admission, settlement slots and drain.
- ../server.mjs — loopback confinement and original health/readiness.
- ../../distribution/RUNTIME_INSTALL.md — complete source-selected runtime installation/recovery.
- ../../sf99-merchant-deploy/ — prior generated service, owned-file comparison and host rollback patterns.

Systemd primary documentation:

- https://github.com/systemd/systemd/blob/main/man/systemd.kill.xml
- https://github.com/systemd/systemd/blob/main/man/systemd.service.xml
- https://github.com/systemd/systemd/blob/main/man/systemctl.xml

B3909's connection/selection/reconciliation workspace and 8E0C's resource registration/discovery keep their original ownership. This host product receives a reviewed original configuration; it does not replace their merchant transition decisions or reinterpret pending payment outcomes.
