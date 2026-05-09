// Cookie Test Tool - Main Script

const output = document.getElementById('output');
let fullCookieString = '';

function log(msg, type = 'info') {
  const div = document.createElement('div');
  div.style.margin = '5px 0';

  if (type === 'ok') div.className = 'ok';
  else if (type === 'err') div.className = 'err';
  else if (type === 'warn') div.className = 'warn';

  div.textContent = msg;
  output.appendChild(div);
}

function logSection(title) {
  const h3 = document.createElement('h3');
  h3.textContent = title;
  h3.style.color = '#00bfff';
  h3.style.marginTop = '20px';
  output.appendChild(h3);
}

function logCookie(name, value, expired = false) {
  const div = document.createElement('div');
  div.className = 'cookie-item';

  const status = expired ?
    '<span class="status expired">已过期</span>' :
    '<span class="status valid">有效</span>';

  div.innerHTML = `
    <strong>${name}</strong> ${status}<br>
    <code style="color:#888;font-size:11px;">${value.substring(0, 80)}${value.length > 80 ? '...' : ''}</code>
  `;
  output.appendChild(div);
}

function clearOutput() {
  output.innerHTML = '';
}

async function runAllTests() {
  clearOutput();
  logSection('🔍 开始完整测试');

  await test1_DocumentCookie();
  await test2_ChromeCookieAPI();
  await test3_NetworkRequest();
  await test4_ValidateSession();
  await test5_StorageCheck();

  logSection('✅ 测试完成');
}

function test1_DocumentCookie() {
  logSection('📋 测试 1: document.cookie');

  const cookies = document.cookie.split(';').map(c => c.trim());
  log(`找到 ${cookies.length} 个 Cookie`, 'info');

  const cookieObj = {};
  cookies.forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) {
      const key = c.substring(0, idx);
      const val = c.substring(idx + 1);
      cookieObj[key] = val;
    }
  });

  let hasSession = false;
  let hasClient = false;

  Object.keys(cookieObj).forEach(key => {
    if (key.startsWith('__session') || key.startsWith('__client') || key === 'suno_auth') {
      logCookie(key, cookieObj[key]);
      if (key.startsWith('__session')) hasSession = true;
      if (key.startsWith('__client')) hasClient = true;
    }
  });

  if (!hasSession) {
    log('⚠️ 未找到 __session* Cookie（可能是 HttpOnly）', 'warn');
  }
  if (!hasClient) {
    log('⚠️ 未找到 __client* Cookie', 'warn');
  }

  fullCookieString = document.cookie;

  return { hasSession, hasClient, cookieObj };
}

async function test2_ChromeCookieAPI() {
  logSection('📋 测试 2: Chrome Cookie API');

  try {
    const cookies = await chrome.cookies.getAll({ domain: '.suno.com' });
    log(`找到 ${cookies.length} 个 Cookie`, 'info');

    const now = Date.now() / 1000;
    const important = cookies.filter(c =>
      c.name.startsWith('__session') ||
      c.name.startsWith('__client') ||
      c.name.startsWith('__refresh') ||
      c.name === 'suno_auth'
    );

    log(`其中 ${important.length} 个是关键 Cookie:`, 'info');

    important.forEach(c => {
      const expired = c.expirationDate && c.expirationDate < now;
      logCookie(c.name, c.value, expired);

      if (expired) {
        log(`  ⚠️ ${c.name} 已过期 (${new Date(c.expirationDate * 1000).toLocaleString()})`, 'warn');
      }
    });

    // 生成完整 Cookie 字符串
    fullCookieString = cookies
      .filter(c => !c.expirationDate || c.expirationDate > now)
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    log(`✓ 完整 Cookie 长度: ${fullCookieString.length} 字符`, 'ok');

    return { cookies, important };
  } catch (err) {
    log(`✗ Chrome Cookie API 失败: ${err.message}`, 'err');
    return null;
  }
}

async function test3_NetworkRequest() {
  logSection('📋 测试 3: 触发网络请求');

  log('正在发送请求到 studio-api.prod.suno.com...', 'info');

  try {
    const resp = await fetch('https://studio-api.prod.suno.com/api/billing/info/', {
      credentials: 'include'
    });

    log(`HTTP 状态: ${resp.status}`, resp.ok ? 'ok' : 'err');

    if (resp.status === 401) {
      log('✗ Session 已过期，需要重新登录', 'err');
      return { valid: false };
    }

    if (resp.ok) {
      const data = await resp.json();
      log(`✓ Session 有效`, 'ok');
      log(`  账户积分: ${data.total_credits_left}`, 'info');
      log(`  月度限额: ${data.monthly_limit}`, 'info');
      log(`  已使用: ${data.monthly_usage}`, 'info');
      return { valid: true, data };
    }

    return { valid: false };
  } catch (err) {
    log(`✗ 请求失败: ${err.message}`, 'err');
    return { valid: false, error: err.message };
  }
}

async function test4_ValidateSession() {
  logSection('📋 测试 4: 验证 Session Token');

  // 从 Cookie 中提取 __session* JWT
  const cookies = fullCookieString.split(';').map(c => c.trim());
  const sessionCookies = cookies.filter(c => c.startsWith('__session'));

  if (sessionCookies.length === 0) {
    log('✗ 未找到 __session* Cookie', 'err');
    return { valid: false };
  }

  log(`找到 ${sessionCookies.length} 个 session Cookie`, 'info');

  sessionCookies.forEach(c => {
    const [key, val] = c.split('=');

    // 解码 JWT payload
    try {
      const parts = val.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        const exp = payload.exp;
        const now = Math.floor(Date.now() / 1000);
        const remaining = exp - now;

        if (remaining > 0) {
          log(`✓ ${key} 有效，剩余 ${Math.floor(remaining / 60)} 分钟`, 'ok');
          log(`  过期时间: ${new Date(exp * 1000).toLocaleString()}`, 'info');
        } else {
          log(`✗ ${key} 已过期 ${Math.floor(-remaining / 60)} 分钟`, 'err');
        }
      }
    } catch (err) {
      log(`⚠️ 无法解析 ${key}: ${err.message}`, 'warn');
    }
  });

  return { valid: true };
}

async function test5_StorageCheck() {
  logSection('📋 测试 5: 检查插件存储');

  try {
    const data = await chrome.storage.local.get(['sunoCookie', 'capturedAt', 'apiKey']);

    if (data.sunoCookie) {
      log(`✓ 插件已存储 Cookie (长度: ${data.sunoCookie.length})`, 'ok');
      log(`  捕获时间: ${data.capturedAt || '未知'}`, 'info');

      const hasSession = data.sunoCookie.includes('__session');
      const hasClient = data.sunoCookie.includes('__client');

      log(`  包含 __session: ${hasSession ? '✓' : '✗'}`, hasSession ? 'ok' : 'err');
      log(`  包含 __client: ${hasClient ? '✓' : '✗'}`, hasClient ? 'ok' : 'err');
    } else {
      log('✗ 插件未存储 Cookie', 'err');
    }

    if (data.apiKey) {
      log(`✓ 已保存 API Key: ${data.apiKey.substring(0, 15)}...`, 'ok');
    } else {
      log('⚠️ 未保存 API Key', 'warn');
    }

    return data;
  } catch (err) {
    log(`✗ 无法访问插件存储: ${err.message}`, 'err');
    return null;
  }
}

async function copyCookie() {
  if (!fullCookieString) {
    await test2_ChromeCookieAPI();
  }

  if (fullCookieString) {
    try {
      await navigator.clipboard.writeText(fullCookieString);
      alert('✅ Cookie 已复制到剪贴板！\n\n长度: ' + fullCookieString.length + ' 字符');
    } catch (err) {
      alert('❌ 复制失败: ' + err.message);
    }
  } else {
    alert('❌ 没有可复制的 Cookie');
  }
}

// Event listeners
document.getElementById('runAllBtn').addEventListener('click', runAllTests);
document.getElementById('clearBtn').addEventListener('click', clearOutput);
document.getElementById('copyBtn').addEventListener('click', copyCookie);
document.getElementById('test1Btn').addEventListener('click', test1_DocumentCookie);
document.getElementById('test2Btn').addEventListener('click', test2_ChromeCookieAPI);
document.getElementById('test3Btn').addEventListener('click', test3_NetworkRequest);
document.getElementById('test4Btn').addEventListener('click', test4_ValidateSession);
document.getElementById('test5Btn').addEventListener('click', test5_StorageCheck);

// Auto-run on load
window.addEventListener('load', () => {
  log('页面已加载，准备测试...', 'info');
  log('请点击「运行所有测试」按钮开始', 'info');
});
