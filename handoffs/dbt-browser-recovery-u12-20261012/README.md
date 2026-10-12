# Original dbt browser recovery — complete source handoff

ASTRA-U12 joins SCF-DBT-PROJECT-OPERATIONS-814B-20261012. ASTRA-DBT-FINISH12 remains the cumulative product publisher; ASTRA-DBT-INTEGRATION owns its complementary managed HTTP/client composition. The original Slack delivery is https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791820090781269 .

This source carrier pins all nine complete UTF-8 postimages (97,625 source bytes), exact original preimage identities, the operating guide and complete native recovery exercise. It does not modify the product paths on this handoff branch. Compose the resulting source postimages into the existing cumulative dbt release, preserving newer SQL publisher/client/Applications/installer work and joining the additive BrowserDrafts HTTP routes with the current HTTP owner.

The source index documents the exact four native Git blobs. Locally, recover the full files[].content packet using Python standard libraries:

```python
import base64, hashlib, json, lzma
from pathlib import Path
root = Path('handoffs/dbt-browser-recovery-u12-20261012')
index = json.loads((root / 'source-index.json').read_text())
parts = []
for item in index['chunks']:
    data = (root / f"source-{item['position']}.txt").read_bytes()
    assert len(data) == item['characters']
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert actual == item['git_blob']
    parts.append(data)
decoded = lzma.decompress(base64.b64decode(b''.join(parts), validate=True))
assert len(decoded) == index['decoded_bytes']
assert hashlib.sha256(decoded).hexdigest() == index['decoded_sha256']
packet = json.loads(decoded)
assert len(packet['files']) == index['files']
for item in packet['files']:
    assert hashlib.sha256(item['content'].encode()).hexdigest() == item['sha256']
# Each entry supplies path, full content, preimage_sha256 and preimage_git_blob.
# Apply these postimages in the existing owner's source composition.
```

The original native source/edition/review/export/delete-sender/receive/edit exercise passed. The joined native HTTP recovery also passed working-copy reopen, competing edit preservation, lost response followed by two submissions sharing one original operation ID and only one new review revision, complete JSON/CSV/HTML output, full ZIP export and editable independent receiving. Desktop1440/mobile390 offline Chromium DOM separately passed restored working copies, unsaved resource editors, response ordering and zero page errors/overflow. Normal localhost navigation returned ERR_BLOCKED_BY_ADMINISTRATOR; native Node-to-Python HTTP execution and offline DOM rendering are distinguished in the capsule's execution records.

The complete operator and repeatable native command are supplied in the included BROWSER_RECOVERY.md. No GitHub Actions workflow is added.
