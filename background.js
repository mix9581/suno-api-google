// 点击插件图标 → 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });


// 上次捕获的 cookie 指纹（避免重复写 storage）
let lastCapturedHash = '';

// 当 lastCookieFingerprint 被外部清除时，同步重置内存变量
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lastCookieFingerprint) {
    if (changes.lastCookieFingerprint.newValue === undefined) {
      lastCapturedHash = '';
    }
  }
});

// 监听 suno.com 请求，自动捕获 Cookie 并保存到本地（不推送到服务器）
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );

    if (cookieHeader?.value && cookieHeader.value.includes('__client=')) {
      const clientMatch = cookieHeader.value.match(/__client=([^;]{50})/);
      const fingerprint = clientMatch ? clientMatch[1] : '';

      if (fingerprint && fingerprint === lastCapturedHash) return;

      chrome.storage.local.get(['lastCookieFingerprint'], (data) => {
        if (fingerprint && fingerprint === data.lastCookieFingerprint) return;

        // Cookie 仅保存在本地，随每次请求通过 X-Suno-Cookie 头发送
        chrome.storage.local.set({
          sunoCookie: cookieHeader.value,
          capturedAt: new Date().toISOString(),
          lastCookieFingerprint: fingerprint,
        });

        lastCapturedHash = fingerprint;
      });
    }
  },
  {
    urls: [
      'https://suno.com/*',
      'https://studio-api.prod.suno.com/*',
      'https://auth.suno.com/*',
    ],
  },
  ['requestHeaders', 'extraHeaders']
);
