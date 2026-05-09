// 在 suno.com 页面的 Console 中运行此脚本
// 用于手动获取完整的 Cookie 字符串

(function() {
  console.log('=== Suno Cookie 提取工具 ===\n');

  // 方法 1：从 document.cookie 读取
  const cookies = document.cookie.split(';').map(c => c.trim());
  const cookieObj = {};

  cookies.forEach(c => {
    const [key, val] = c.split('=');
    if (key) cookieObj[key] = val;
  });

  console.log('📋 方法 1：document.cookie');
  console.log('找到的关键 Cookie:');

  let hasSession = false;
  let hasClient = false;

  Object.keys(cookieObj).forEach(key => {
    if (key.startsWith('__session') || key.startsWith('__client') || key === 'suno_auth') {
      console.log(`  ✓ ${key}: ${cookieObj[key].substring(0, 30)}...`);
      if (key.startsWith('__session')) hasSession = true;
      if (key.startsWith('__client')) hasClient = true;
    }
  });

  if (!hasSession) {
    console.warn('  ⚠️ 未找到 __session 或 __session_* Cookie');
  }
  if (!hasClient) {
    console.warn('  ⚠️ 未找到 __client 或 __client_* Cookie');
  }

  // 方法 2：使用 Chrome API 读取（需要在插件 content script 中运行）
  console.log('\n📋 方法 2：Chrome Cookie API');
  console.log('正在读取...');

  chrome.cookies.getAll({ domain: '.suno.com' }, (cookies) => {
    console.log(`找到 ${cookies.length} 个 Cookie:`);

    const important = cookies.filter(c =>
      c.name.startsWith('__session') ||
      c.name.startsWith('__client') ||
      c.name === 'suno_auth'
    );

    important.forEach(c => {
      const expired = c.expirationDate && c.expirationDate < Date.now() / 1000;
      console.log(`  ${expired ? '✗' : '✓'} ${c.name}: ${c.value.substring(0, 30)}... ${expired ? '(已过期)' : ''}`);
    });

    // 生成完整的 Cookie 字符串
    const cookieString = cookies
      .filter(c => !c.expirationDate || c.expirationDate > Date.now() / 1000)
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    console.log('\n📦 完整 Cookie 字符串（复制下面这行）:');
    console.log(cookieString);

    // 自动复制到剪贴板
    navigator.clipboard.writeText(cookieString).then(() => {
      console.log('\n✅ Cookie 已复制到剪贴板！');
      console.log('现在可以在插件中手动粘贴使用。');
    }).catch(() => {
      console.log('\n⚠️ 无法自动复制，请手动复制上面的 Cookie 字符串');
    });
  });

  // 方法 3：触发一个 API 请求来刷新 session
  console.log('\n📋 方法 3：触发 API 请求刷新 session');
  fetch('https://studio-api.prod.suno.com/api/billing/info/', {
    credentials: 'include'
  })
  .then(resp => {
    console.log(`  API 响应: ${resp.status}`);
    if (resp.status === 401) {
      console.error('  ✗ Session 已过期，需要重新登录');
    } else if (resp.ok) {
      console.log('  ✓ Session 有效');
      // 读取响应头中的 Set-Cookie（浏览器会自动处理）
      return resp.json();
    }
  })
  .then(data => {
    if (data) {
      console.log('  ✓ 账户信息:', data);
      console.log('  ✓ 剩余积分:', data.total_credits_left);
    }
  })
  .catch(err => {
    console.error('  ✗ 请求失败:', err.message);
  });

})();
