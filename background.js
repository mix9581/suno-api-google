// 点击插件图标 → 打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 监听 suno.com 请求，实时更新本地 Cookie
// 合并 Cookie，确保同时捕获 __session 和 __client
chrome.webRequest.onSendHeaders.addListener(
  async (details) => {
    const cookieHeader = details.requestHeaders?.find(
      (h) => h.name.toLowerCase() === 'cookie'
    );

    if (!cookieHeader?.value) return;

    // 只处理包含 Suno 关键 Cookie 的请求
    const hasClient = cookieHeader.value.includes('__client');
    const hasSession = cookieHeader.value.includes('__session');

    if (!hasClient && !hasSession) return;

    // 读取现有 Cookie
    const stored = await chrome.storage.local.get(['sunoCookie']);
    const existingCookie = stored.sunoCookie || '';

    // 解析现有和新的 Cookie
    const existingMap = new Map();
    existingCookie.split(';').forEach(c => {
      const [key, val] = c.trim().split('=');
      if (key) existingMap.set(key, val);
    });

    const newMap = new Map();
    cookieHeader.value.split(';').forEach(c => {
      const [key, val] = c.trim().split('=');
      if (key) newMap.set(key, val);
    });

    // 合并：新 Cookie 覆盖旧的
    for (const [key, val] of newMap) {
      existingMap.set(key, val);
    }

    // 重新组装 Cookie 字符串
    const mergedCookie = Array.from(existingMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    // 保存合并后的 Cookie
    await chrome.storage.local.set({
      sunoCookie: mergedCookie,
      capturedAt: new Date().toISOString(),
    });

    console.log('[Background] Cookie updated:', {
      hasSession: mergedCookie.includes('__session'),
      hasClient: mergedCookie.includes('__client'),
      length: mergedCookie.length
    });
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
