const Auth = {
  getToken: () => localStorage.getItem('ham_token'),
  getUser: () => JSON.parse(localStorage.getItem('ham_user') || 'null'),
  setSession: (token, user) => {
    localStorage.setItem('ham_token', token);
    localStorage.setItem('ham_user', JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem('ham_token');
    localStorage.removeItem('ham_user');
  }
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function requireRoleOrRedirect(role) {
  const user = Auth.getUser();
  if (!user || user.role !== role) {
    window.location.href = '/index.html';
  }
  return user;
}

function pillClassForUrgency(level) {
  return { Low: 'pill low', Medium: 'pill medium', High: 'pill high' }[level] || 'pill medium';
}

function pillClassForStatus(status) {
  return `pill status-${status}`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function pulseDivider() {
  const wrap = document.createElement('div');
  wrap.className = 'divider-pulse';
  wrap.innerHTML = `<svg width="100%" height="20" viewBox="0 0 400 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="0,10 140,10 155,2 170,18 185,10 220,10 232,10 244,2 256,18 268,10 400,10"
      fill="none" stroke="#0B4F4A" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
  return wrap;
}
