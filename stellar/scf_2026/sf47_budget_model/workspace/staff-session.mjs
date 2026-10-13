// The browser keeps only the CSRF value and public profile in memory.
let current = null;
export const currentStaffSession = () => current;

async function decoded(response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.error?.message || value.error || value.message || 'The workspace request could not finish.');
    error.code = value.code || value.error?.code;
    error.status = response.status;
    if (response.status === 401) current = null;
    throw error;
  }
  return value;
}

export async function readStaffSession() {
  current = await decoded(await fetch('/api/staff/session', {credentials:'same-origin',cache:'no-store'}));
  return current;
}

export async function staffRequest(path, body, options = {}) {
  const headers = {...options.headers};
  if (body !== undefined && !options.raw) headers['content-type'] = 'application/json';
  if (body !== undefined && current?.csrfToken) headers['X-CSRF-Token'] = current.csrfToken;
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials:'same-origin', cache:'no-store', headers, signal:options.signal,
    body: body === undefined ? undefined : options.raw ? body : JSON.stringify(body)
  });
  if (options.download && response.ok) return response;
  return decoded(response);
}

export async function signInStaff(staffId, accessCode) {
  current = await staffRequest('/api/staff/login', {staffId, accessCode});
  return current;
}

export async function signInOwner(token) {
  current = await decoded(await fetch('/api/staff/owner-session', {
    method:'POST', credentials:'same-origin', cache:'no-store',
    headers:{authorization:'Bearer '+token, 'content-type':'application/json'}, body:'{}'
  }));
  try { sessionStorage.removeItem('sf47.access'); } catch {}
  return current;
}

export async function signOutStaff() {
  try { await staffRequest('/api/staff/logout', {}); }
  finally { current = null; }
}
