// 点击插件图标 -> 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let lastPushedCookieHash = '';

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

// 监听 Suno/Clerk 请求，合并 __client/__session 及其 suffixed cookie。
chrome.webRequest.onSendHeaders.addListener(
  async (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );

    if (!hasSunoAuthCookie(cookieHeader?.value)) return;

    const stored = await chrome.storage.local.get(['sunoCookie']);
    const merged = parseCookieString(stored.sunoCookie || '');
    const incoming = parseCookieString(cookieHeader.value);
    for (const [key, value] of incoming) merged.set(key, value);

    const mergedCookie = serializeCookieMap(merged);
    const fingerprint = cookieFingerprint(mergedCookie);
    if (fingerprint && fingerprint === lastPushedCookieHash) return;
    lastPushedCookieHash = fingerprint;

    await chrome.storage.local.set({
      sunoCookie: mergedCookie,
      capturedAt: new Date().toISOString(),
    });

    await pushCookieIfLoggedIn(mergedCookie, fingerprint);
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
