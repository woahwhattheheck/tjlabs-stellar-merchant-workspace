"""Native Python client for the original local scenario HTTP operator."""
from __future__ import annotations
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from .scenario_types import encode, fail, file_digest

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        fail('The original local server returned a redirect.')

class ScenarioClient:
    def __init__(self, base_url: str, token: str, *, timeout: float = 900):
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/') or not parsed.port:
            fail('Use an original loopback scenario connection.')
        if not isinstance(token, str) or not token or '\r' in token or '\n' in token:
            fail('The local access token is invalid.')
        self.base_url, self.token, self.timeout = base_url.rstrip('/'), token, timeout
        # Local credentials never use an ambient HTTP proxy or cross-host redirect.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())

    @classmethod
    def from_file(cls, path, **kwargs):
        path = Path(path)
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            fail('Use the private original local connection file.')
        value = json.loads(path.read_text())
        return cls(value['base_url'], value['token'], **kwargs)

    def call(self, operation: str, value=None, **query):
        if operation not in ('context', 'query', 'definitions', 'definition', 'plan', 'runs', 'run', 'resume', 'cancel', 'rows', 'comparison', 'review', 'reviews', 'export', 'package'):
            fail('Select an original scenario operation.')
        url = self.base_url + '/api/' + operation
        if query:
            url += '?' + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        request = urllib.request.Request(url, data=encode(value).encode() if value is not None else None,
                  headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            try:
                body = json.loads(error.read(1024**2))
                message = body.get('error', 'The local operation was rejected.')
            except (ValueError, UnicodeError):
                message = 'The local operation was rejected.'
            fail(message)

    def pages(self, operation, *, limit=100, **query):
        if operation not in ('definitions', 'runs', 'rows', 'comparison', 'reviews'):
            fail('This operation does not provide retained pages.')
        after = query.pop('after', 0)
        while True:
            result = self.call(operation, after=after, limit=limit, **query)
            yield result
            following = result['next_after']
            if following is None:
                return
            if following <= after:
                fail('The local page cursor did not advance.')
            after = following

    def download(self, export, destination):
        """Stream one immutable complete export into a create-only local file."""
        import hashlib, os, tempfile
        from .scenario_types import identifier
        operation = identifier(export.get('id'))
        destination = Path(destination).expanduser().absolute()
        if destination.exists() or destination.is_symlink():
            fail('The download destination already exists.')
        fd, temporary = tempfile.mkstemp(prefix='.scenario-download-', dir=destination.parent)
        request = urllib.request.Request(self.base_url + '/api/download?id=' + operation,
                                        headers={'Authorization': 'Bearer ' + self.token})
        digest, count = hashlib.sha256(), 0
        try:
            with os.fdopen(fd, 'wb') as output, self.opener.open(request, timeout=self.timeout) as response:
                if response.status != 200 or response.headers.get('ETag') != '"' + export['sha256'] + '"':
                    fail('The selected export identity changed.')
                for block in iter(lambda: response.read(1024**2), b''):
                    output.write(block); digest.update(block); count += len(block)
                output.flush(); os.fsync(output.fileno())
            if count != export['bytes'] or digest.hexdigest() != export['sha256']:
                fail('The complete downloaded file does not match its saved export.')
            os.link(temporary, destination)
            return {'path': str(destination), 'bytes': count, 'sha256': digest.hexdigest()}
        finally:
            Path(temporary).unlink(missing_ok=True)
