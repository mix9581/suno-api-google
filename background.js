// 点击插件图标 → 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 上次推送的 cookie 指纹（避免重复推送同一个 cookie）
let lastPushedCookieHash = '';

// 监听 suno.com 请求，自动捕获 Cookie
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );

    if (cookieHeader?.value && cookieHeader.value.includes('__client=')) {
      // 用 __client token 的前 50 字符做去重指纹
      const clientMatch = cookieHeader.value.match(/__client=([^;]{50})/);
      const fingerprint = clientMatch ? clientMatch[1] : '';

      // 跟上次一样的 cookie 就不重复处理
      if (fingerprint && fingerprint === lastPushedCookieHash) return;

      chrome.storage.local.get(['apiKey', 'apiUrl', 'lastCookieFingerprint'], async (data) => {
        // 跟已存的指纹一样也跳过
        if (fingerprint && fingerprint === data.lastCookieFingerprint) return;

        // 保存 cookie 到本地
        chrome.storage.local.set({
          sunoCookie: cookieHeader.value,
          capturedAt: new Date().toISOString(),
          lastCookieFingerprint: fingerprint,
        });

        lastPushedCookieHash = fingerprint;

        // 如果已登录，自动推送 Cookie 到服务器
        if (data.apiKey && data.apiUrl) {
          try {
            const resp = await fetch(`${data.apiUrl.replace(/\/+$/, '')}/api/auth/bind_cookie`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': data.apiKey,
                'ngrok-skip-browser-warning': '1',
              },
              body: JSON.stringify({ cookie: cookieHeader.value }),
            });
            const result = await resp.json();
            if (result.success) {
              chrome.storage.local.set({
                cookiePushStatus: 'ok',
                cookiePushTime: new Date().toISOString(),
              });
            }
          } catch (e) {
            // 静默失败
          }
        }
      });
    }
  },
  {
    urls: [
      'https://studio-api.prod.suno.com/*',
      'https://auth.suno.com/*',
    ],
  },
  ['requestHeaders', 'extraHeaders']
);
