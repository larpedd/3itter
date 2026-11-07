// Fetch wrapper for the 3itter JSON API.
// The Android app tells the server so posts can say "3itter for Android".
const appClient = () => { try { return localStorage.getItem('3itter-client'); } catch { return null; } };

export async function api(path, { method = 'GET', body } = {}) {
  const client = appClient();
  const opts = { method, credentials: 'same-origin', headers: client ? { 'X-3itter-Client': client } : {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
