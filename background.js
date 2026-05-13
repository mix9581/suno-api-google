// 点击插件图标 -> 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let lastPushedCookieHash = '';
let pendingCookiePush = null;
let cookiePushTimer = null;

function parseCookieString(cookieValue) {
  const parsed = new Map();
  (cookieValue || '').split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    parsed.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  });
  return parsed;
}

function serializeCookieMap(cookieMap) {
  return Array.from(cookieMap.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function hasSunoAuthCookie(cookieValue) {
  return /(?:^|;\s*)__client(?:_[^=;]+)?=/.test(cookieValue || '') ||
    /(?:^|;\s*)__session(?:_[^=;]+)?=/.test(cookieValue || '');
}

function cookieFingerprint(cookieValue) {
  const cookies = parseCookieString(cookieValue);
  const authParts = Array.from(cookies.entries())
    .filter(([key]) => key === '__client' || key.startsWith('__client_') || key === '__session' || key.startsWith('__session_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value.slice(0, 80)}`);
  return authParts.join('|');
}

async function pushCookieIfLoggedIn(cookieValue, fingerprint) {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'lastCookieFingerprint']);
  if (!data.apiKey || !data.apiUrl) return;
  if (fingerprint && fingerprint === data.lastCookieFingerprint) return;

  await chrome.storage.local.set({ lastCookieFingerprint: fingerprint });

  try {
    const resp = await fetch(`${data.apiUrl.replace(/\/+$/, '')}/api/auth/bind_cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': data.apiKey,
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({ cookie: cookieValue }),
    });
    const result = await resp.json();
    await chrome.storage.local.set({
      cookiePushStatus: result.success ? 'ok' : 'error',
      cookiePushTime: new Date().toISOString(),
      cookiePushError: result.success ? '' : (result.error || result.cookie_error || `HTTP ${resp.status}`),
    });
  } catch (e) {
    await chrome.storage.local.set({
      cookiePushStatus: 'error',
      cookiePushTime: new Date().toISOString(),
      cookiePushError: e.message || String(e),
    });
  }
}

function scheduleCookiePush(cookieValue, fingerprint) {
  pendingCookiePush = { cookieValue, fingerprint };
  if (cookiePushTimer) clearTimeout(cookiePushTimer);

  cookiePushTimer = setTimeout(() => {
    const pending = pendingCookiePush;
    pendingCookiePush = null;
    cookiePushTimer = null;
    if (!pending) return;
    pushCookieIfLoggedIn(pending.cookieValue, pending.fingerprint);
  }, 1500);
}

// 监听 Suno/Clerk 请求。优先保存浏览器实际发给 Suno 的 Cookie header，
// 这比从 cookie store 合并更能代表当前浏览器正在登录的 Suno 账号。
chrome.webRequest.onSendHeaders.addListener(
  async (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );

    if (!hasSunoAuthCookie(cookieHeader?.value)) return;

    const requestCookie = cookieHeader.value;
    const stored = await chrome.storage.local.get(['sunoCookie']);
    const merged = parseCookieString(stored.sunoCookie || '');
    const incoming = parseCookieString(requestCookie);
    for (const [key, value] of incoming) merged.set(key, value);

    const mergedCookie = serializeCookieMap(merged);
    const fingerprint = cookieFingerprint(requestCookie);
    if (fingerprint && fingerprint === lastPushedCookieHash) return;
    lastPushedCookieHash = fingerprint;

    await chrome.storage.local.set({
      lastSunoRequestCookie: requestCookie,
      lastSunoRequestAt: new Date().toISOString(),
      sunoCookie: mergedCookie,
      capturedAt: new Date().toISOString(),
    });

    scheduleCookiePush(requestCookie, fingerprint);
  },
  {
    urls: [
      'https://suno.com/*',
      'https://*.suno.com/*',
      'https://studio-api.prod.suno.com/*',
      'https://auth.suno.com/*',
    ],
  },
  ['requestHeaders', 'extraHeaders']
);
