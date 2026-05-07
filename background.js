// 点击插件图标 → 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 监听 suno.com 请求，实时更新本地 Cookie
// 不做去重 —— 始终保存最新的 cookie，确保多账号切换时立即生效
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );
    if (cookieHeader?.value && cookieHeader.value.includes('__client=')) {
      chrome.storage.local.set({
        sunoCookie: cookieHeader.value,
        capturedAt: new Date().toISOString(),
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
