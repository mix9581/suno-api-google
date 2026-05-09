// 在 suno.com 页面的 Console 中运行此脚本
// 完整的 Cookie 诊断工具

(async function() {
  console.clear();
  console.log('%c🍪 Suno Cookie 诊断工具', 'font-size:20px;color:#ff7a00;font-weight:bold');
  console.log('');

  // ========== 测试 1: document.cookie ==========
  console.log('%c📋 测试 1: document.cookie', 'font-size:16px;color:#00bfff;font-weight:bold');

  const cookies = document.cookie.split(';').map(c => c.trim());
  console.log(`找到 ${cookies.length} 个 Cookie`);

  const cookieObj = {};
  cookies.forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) {
      cookieObj[c.substring(0, idx)] = c.substring(idx + 1);
    }
  });

  let hasSession1 = false;
  let hasClient1 = false;

  Object.keys(cookieObj).forEach(key => {
    if (key.startsWith('__session') || key.startsWith('__client') || key === 'suno_auth') {
      console.log(`  ✓ ${key}: ${cookieObj[key].substring(0, 30)}...`);
      if (key.startsWith('__session')) hasSession1 = true;
      if (key.startsWith('__client')) hasClient1 = true;
    }
  });

  if (!hasSession1) console.warn('  ⚠️ 未找到 __session* (可能是 HttpOnly)');
  if (!hasClient1) console.warn('  ⚠️ 未找到 __client*');

  console.log('');

  // ========== 测试 2: Chrome Cookie API ==========
  console.log('%c📋 测试 2: Chrome Cookie API', 'font-size:16px;color:#00bfff;font-weight:bold');

  let allCookies = [];
  let fullCookieString = '';

  try {
    allCookies = await chrome.cookies.getAll({ domain: '.suno.com' });
    console.log(`找到 ${allCookies.length} 个 Cookie`);

    const now = Date.now() / 1000;
    const important = allCookies.filter(c =>
      c.name.startsWith('__session') ||
      c.name.startsWith('__client') ||
      c.name.startsWith('__refresh') ||
      c.name === 'suno_auth'
    );

    console.log(`其中 ${important.length} 个是关键 Cookie:`);

    important.forEach(c => {
      const expired = c.expirationDate && c.expirationDate < now;
      const status = expired ? '❌ 已过期' : '✅ 有效';
      console.log(`  ${status} ${c.name}: ${c.value.substring(0, 30)}...`);

      if (expired) {
        console.warn(`    过期时间: ${new Date(c.expirationDate * 1000).toLocaleString()}`);
      }
    });

    // 生成完整 Cookie 字符串
    fullCookieString = allCookies
      .filter(c => !c.expirationDate || c.expirationDate > now)
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    console.log(`✓ 完整 Cookie 长度: ${fullCookieString.length} 字符`);
  } catch (err) {
    console.error(`✗ Chrome Cookie API 失败: ${err.message}`);
  }

  console.log('');

  // ========== 测试 3: 网络请求验证 ==========
  console.log('%c📋 测试 3: 网络请求验证', 'font-size:16px;color:#00bfff;font-weight:bold');

  try {
    const resp = await fetch('https://studio-api.prod.suno.com/api/billing/info/', {
      credentials: 'include'
    });

    console.log(`HTTP 状态: ${resp.status}`);

    if (resp.status === 401) {
      console.error('❌ Session 已过期，必须重新登录！');
    } else if (resp.ok) {
      const data = await resp.json();
      console.log('✅ Session 有效！');
      console.log(`  剩余积分: ${data.total_credits_left}`);
      console.log(`  月度限额: ${data.monthly_limit}`);
      console.log(`  已使用: ${data.monthly_usage}`);
    }
  } catch (err) {
    console.error(`✗ 请求失败: ${err.message}`);
  }

  console.log('');

  // ========== 测试 4: JWT Token 验证 ==========
  console.log('%c📋 测试 4: JWT Token 验证', 'font-size:16px;color:#00bfff;font-weight:bold');

  const sessionCookies = allCookies.filter(c => c.name.startsWith('__session'));

  if (sessionCookies.length === 0) {
    console.error('✗ 未找到 __session* Cookie');
  } else {
    console.log(`找到 ${sessionCookies.length} 个 session Cookie`);

    sessionCookies.forEach(c => {
      try {
        const parts = c.value.split('.');
        if (parts.length === 3) {
          const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
          const payload = JSON.parse(atob(padded));

          const exp = payload.exp;
          const now = Math.floor(Date.now() / 1000);
          const remaining = exp - now;

          if (remaining > 0) {
            console.log(`✅ ${c.name} 有效，剩余 ${Math.floor(remaining / 60)} 分钟`);
            console.log(`  过期时间: ${new Date(exp * 1000).toLocaleString()}`);
          } else {
            console.error(`❌ ${c.name} 已过期 ${Math.floor(-remaining / 60)} 分钟`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ 无法解析 ${c.name}: ${err.message}`);
      }
    });
  }

  console.log('');

  // ========== 测试 5: 插件存储检查 ==========
  console.log('%c📋 测试 5: 插件存储检查', 'font-size:16px;color:#00bfff;font-weight:bold');

  try {
    const data = await chrome.storage.local.get(['sunoCookie', 'capturedAt', 'apiKey']);

    if (data.sunoCookie) {
      console.log(`✅ 插件已存储 Cookie (长度: ${data.sunoCookie.length})`);
      console.log(`  捕获时间: ${data.capturedAt || '未知'}`);

      const hasSession = data.sunoCookie.includes('__session');
      const hasClient = data.sunoCookie.includes('__client');

      console.log(`  包含 __session: ${hasSession ? '✅' : '❌'}`);
      console.log(`  包含 __client: ${hasClient ? '✅' : '❌'}`);
    } else {
      console.error('❌ 插件未存储 Cookie');
    }

    if (data.apiKey) {
      console.log(`✅ 已保存 API Key: ${data.apiKey.substring(0, 15)}...`);
    } else {
      console.warn('⚠️ 未保存 API Key');
    }
  } catch (err) {
    console.error(`✗ 无法访问插件存储: ${err.message}`);
  }

  console.log('');

  // ========== 复制 Cookie ==========
  console.log('%c📦 完整 Cookie 字符串', 'font-size:16px;color:#00bfff;font-weight:bold');

  if (fullCookieString) {
    console.log(fullCookieString);

    try {
      await navigator.clipboard.writeText(fullCookieString);
      console.log('%c✅ Cookie 已复制到剪贴板！', 'color:#0f0;font-weight:bold');
    } catch (err) {
      console.warn('⚠️ 无法自动复制，请手动复制上面的 Cookie 字符串');
    }
  }

  console.log('');
  console.log('%c✅ 测试完成！请截图整个 Console 发给开发者', 'font-size:16px;color:#0f0;font-weight:bold');

})();
