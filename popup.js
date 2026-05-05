// DOM helper
const $ = (id) => document.getElementById(id);

// ======== Config ========
const API_URL = CONFIG.API_URL;

// ======== State ========
let state = {
  apiUrl: API_URL,
  apiKey: '',
  scene: 'scene1',
  // Scene 2 data
  userName: '',
  quota: 0,
  used: 0,
  cookieValid: false,
  sunoCredits: null,
  // Scene 3 data
  uploadedClipId: null,
  uploadedFileName: null,
};

// ======== Scene Navigation ========
function showScene(sceneId) {
  document.querySelectorAll('.scene').forEach((el) => el.classList.remove('active'));
  $(sceneId).classList.add('active');
  state.scene = sceneId;
}

// ======== Toast ========
function showToast(msg, type = 'ok') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ======== API Helper ========
async function api(method, path, body = null) {
  const url = `${state.apiUrl.replace(/\/+$/, '')}${path}`;
  const headers = {
    'X-API-Key': state.apiKey,
    'ngrok-skip-browser-warning': '1',
  };
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (e) {
    throw new Error(`无法连接服务器 ${state.apiUrl} — ${e.message}`);
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`服务器返回非 JSON: ${text.substring(0, 100)}`);
  }
  if (!resp.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return data;
}

// ======== Scene 1: Login ========
const loginApiKey = $('loginApiKey');
const loginBtn = $('loginBtn');
const loginError = $('loginError');
const loginErrorMsg = $('loginErrorMsg');

function showLoginError(msg) {
  loginErrorMsg.textContent = msg;
  loginError.style.display = 'flex';
}

function hideLoginError() {
  loginError.style.display = 'none';
}

async function doLogin() {
  hideLoginError();
  const keyVal = loginApiKey.value.trim();

  if (!keyVal) {
    showLoginError('请输入 API Key');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '验证中...';

  state.apiKey = keyVal;

  try {
    const data = await api('GET', '/api/auth/status');

    // Save credentials + apiUrl (background.js needs apiUrl for auto-push)
    await chrome.storage.local.set({ apiKey: keyVal, apiUrl: API_URL });

    // Update state with server response
    state.userName = data.name;
    state.quota = data.quota;
    state.used = data.used;
    state.cookieValid = data.cookie_valid;
    state.sunoCredits = data.suno_credits;

    // Auto-capture and push cookie
    await tryCaptureAndPushCookie();

    // Transition to Scene 2
    renderDashboard();
    showScene('scene2');
    startAutoRefresh();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '登录';
  }
}

loginBtn.addEventListener('click', doLogin);

// Enter key support
loginApiKey.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

// ======== One-click Cookie Capture ========
$('captureCookieBtn').addEventListener('click', () => {
  $('captureCookieBtn').textContent = '等待捕获...';
  $('captureCookieBtn').disabled = true;

  // 如果当前标签页是 suno.com，直接刷新；否则开新标签
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0]?.url || '';
    if (currentUrl.includes('suno.com')) {
      chrome.tabs.reload(tabs[0].id);
    } else {
      chrome.tabs.create({ url: 'https://suno.com' });
    }
  });
});

// ======== Cookie Capture ========
async function tryCaptureAndPushCookie() {
  try {
    // Read captured cookie from storage (set by background.js)
    const data = await chrome.storage.local.get(['sunoCookie']);
    if (!data.sunoCookie || !data.sunoCookie.includes('__client=')) {
      showToast('未检测到有效 Cookie，请先在 suno.com 登录', 'err');
      return;
    }
    const result = await api('POST', '/api/auth/bind_cookie', {
      cookie: data.sunoCookie,
    });
    if (result.success) {
      state.cookieValid = true;
      state.sunoCredits = result.credits_left;
      showToast('Cookie 绑定成功');
    } else {
      showToast('Cookie 绑定失败: ' + (result.error || '未知错误'), 'err');
    }
  } catch (e) {
    showToast('Cookie 推送失败: ' + e.message, 'err');
  }
}

// ======== Scene 2: Dashboard ========
function renderDashboard() {
  $('userName').textContent = state.userName || '';

  // Cookie status
  const cookieStatus = $('cookieStatus');
  const cookieStatusText = $('cookieStatusText');
  const captureCookieBtn = $('captureCookieBtn');
  if (state.cookieValid) {
    cookieStatus.className = 'status-card ok';
    cookieStatusText.textContent = 'Cookie 正常';
    captureCookieBtn.textContent = '刷新 Cookie';
    captureCookieBtn.disabled = false;
  } else {
    cookieStatus.className = 'status-card warn';
    cookieStatusText.textContent = 'Cookie 未绑定';
    captureCookieBtn.textContent = '获取 Cookie';
    captureCookieBtn.disabled = false;
  }

  // Quota
  const remaining = state.quota - state.used;
  $('quotaText').textContent = `${remaining} / ${state.quota}`;
  const pct = state.quota > 0 ? ((remaining / state.quota) * 100) : 0;
  $('quotaBar').style.width = `${pct}%`;
  $('sunoCredits').textContent = state.sunoCredits != null ? state.sunoCredits : '--';
  $('quotaRemaining').textContent = `剩余 ${remaining} 次`;

  // Render upload history
  renderUploadHistory();

  // Render presets
  renderPresets();

  // Render tasks
  loadTasks();
}

async function refreshStatus() {
  try {
    const data = await api('GET', '/api/auth/status');
    state.userName = data.name;
    state.quota = data.quota;
    state.used = data.used;
    state.cookieValid = data.cookie_valid;
    state.sunoCredits = data.suno_credits;
    renderDashboard();
    showToast('已刷新');
  } catch (err) {
    showToast(err.message, 'err');
  }
}

// Refresh button
$('refreshBtn').addEventListener('click', refreshStatus);

// Logout button
$('logoutBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey']);
  state.apiKey = '';
  loginApiKey.value = '';
  showScene('scene1');
});

// ======== Upload ========
const uploadArea = $('uploadArea');
const fileInput = $('fileInput');
const uploadProgress = $('uploadProgress');
const uploadProgressText = $('uploadProgressText');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragging');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragging');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragging');
  if (e.dataTransfer.files.length > 0) {
    handleUpload(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleUpload(fileInput.files[0]);
  }
});

async function handleUpload(file) {
  uploadProgress.style.display = 'flex';
  uploadProgressText.textContent = `正在上传「${file.name}」，请耐心等待...`;
  uploadArea.style.pointerEvents = 'none';
  uploadArea.style.opacity = '0.5';

  try {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${state.apiUrl.replace(/\/+$/, '')}/api/upload_audio`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-Key': state.apiKey, 'ngrok-skip-browser-warning': '1' },
      body: formData,
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || 'Upload failed');

    state.uploadedClipId = data.clip_id;
    state.uploadedFileName = file.name;

    // Save to upload history
    await saveUploadHistory(data.clip_id, file.name);

    // Update quota
    state.used += 1;
    renderDashboard();

    uploadProgress.style.display = 'none';
    showToast('上传成功');

    // Go to Scene 3
    enterScene3(data.clip_id, file.name);
  } catch (err) {
    uploadProgress.style.display = 'none';
    showToast(err.message, 'err');
  }
  uploadArea.style.pointerEvents = '';
  uploadArea.style.opacity = '';
  fileInput.value = '';
}

// ======== Upload History ========
async function saveUploadHistory(clipId, fileName) {
  const data = await chrome.storage.local.get('uploadHistory');
  const history = data.uploadHistory || [];
  // 避免重复
  if (!history.find(h => h.clip_id === clipId)) {
    history.unshift({
      clip_id: clipId,
      file_name: fileName,
      uploaded_at: new Date().toISOString(),
    });
    // 最多保留 20 条
    if (history.length > 20) history.length = 20;
    await chrome.storage.local.set({ uploadHistory: history });
  }
}

async function renderUploadHistory() {
  const container = $('uploadHistory');
  const data = await chrome.storage.local.get('uploadHistory');
  const history = data.uploadHistory || [];

  if (history.length === 0) {
    container.innerHTML = '<div class="empty">暂无上传记录</div>';
    return;
  }

  container.innerHTML = history.map((h) => {
    const time = new Date(h.uploaded_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="preset-item">
        <div>
          <div class="preset-name">${escapeHtml(h.file_name)}</div>
          <div class="preset-tags">${h.clip_id.substring(0, 12)}... | ${time}</div>
        </div>
        <div class="flex gap-4">
          <button class="btn btn-ghost btn-sm open-dl-modal" data-clip-id="${h.clip_id}">下载</button>
          <button class="btn btn-primary btn-sm" data-reuse-clip="${h.clip_id}" data-reuse-name="${escapeHtml(h.file_name)}">翻唱</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-reuse-clip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      enterScene3(btn.dataset.reuseClip, btn.dataset.reuseName);
    });
  });
  container.querySelectorAll('.open-dl-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDownloadModal(btn.dataset.clipId);
    });
  });
}

$('clearHistoryBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ uploadHistory: [] });
  renderUploadHistory();
  showToast('已清空');
});

// ======== Suno Share Link Parser ========
$('parseLinkBtn').addEventListener('click', async () => {
  const link = $('sunoShareLink').value.trim();
  if (!link) {
    showToast('请粘贴 Suno 分享链接', 'err');
    return;
  }
  if (!link.includes('suno.com')) {
    showToast('请输入有效的 suno.com 链接', 'err');
    return;
  }

  const btn = $('parseLinkBtn');
  btn.disabled = true;
  btn.textContent = '解析中...';

  try {
    const info = await api('GET', `/api/resolve_link?url=${encodeURIComponent(link)}`);
    const clipId = info.clip_id;
    const title = info.title || `Song ${clipId.substring(0, 8)}`;

    await saveUploadHistory(clipId, title);
    renderUploadHistory();
    $('sunoShareLink').value = '';
    showToast(`已解析: ${title}`);
    enterScene3(clipId, title);
  } catch (e) {
    showToast('解析失败: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '解析';
  }
});

// ======== Scene 3: Cover Config (scaffold) ========
function enterScene3(clipId, fileName) {
  state.uploadedClipId = clipId;
  state.uploadedFileName = fileName;
  $('audioInfo').textContent = `${fileName} | clip_id: ${clipId}`;
  resetStyleCards();
  showScene('scene3');
}

$('backToScene2').addEventListener('click', () => {
  showScene('scene2');
});

// Style cards
// Style cards
let styleCards = [{ tags: '', vocal_gender: '', negative_tags: '', weirdness: 50, style_weight: 50, audio_weight: 25 }];

function resetStyleCards() {
  styleCards = [{ tags: '', vocal_gender: '', negative_tags: '', weirdness: 50, style_weight: 50, audio_weight: 25 }];
  renderStyleCards();
}

function renderStyleCards() {
  const container = $('styleCards');
  container.innerHTML = '';
  $('styleCount').textContent = styleCards.length;

  styleCards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'style-card';
    div.innerHTML = `
      <div class="style-card-header">
        <span class="style-card-num">Style ${i + 1}</span>
        ${styleCards.length > 1 ? `<button class="remove-style" data-idx="${i}">&times;</button>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">风格标签</label>
        <input class="form-input style-tags" data-idx="${i}" type="text" placeholder="jazz, smooth, female vocals" value="${escapeHtml(card.tags)}" />
      </div>
      <div class="form-group">
        <label class="form-label">使用预设</label>
        <select class="form-select preset-select" data-idx="${i}">
          <option value="">-- 不使用 --</option>
        </select>
      </div>
      <button class="collapsible-toggle" data-adv-toggle="${i}">
        <span class="arrow">&#x25B6;</span> 高级参数
      </button>
      <div class="collapsible-body" data-adv-body="${i}">
        <div class="form-group">
          <label class="form-label">排除风格</label>
          <input class="form-input style-neg-tags" data-idx="${i}" type="text" placeholder="rap, screamo" value="${escapeHtml(card.negative_tags)}" />
        </div>
        <div class="form-group">
          <label class="form-label">人声性别</label>
          <select class="form-select style-gender" data-idx="${i}">
            <option value="" ${card.vocal_gender === '' ? 'selected' : ''}>自动</option>
            <option value="male" ${card.vocal_gender === 'male' ? 'selected' : ''}>男声</option>
            <option value="female" ${card.vocal_gender === 'female' ? 'selected' : ''}>女声</option>
          </select>
        </div>
        <div class="slider-group">
          <div class="slider-label"><span>Weirdness</span><span class="adv-weird-val">${card.weirdness}%</span></div>
          <input class="slider-input style-weird" data-idx="${i}" type="range" min="0" max="100" value="${card.weirdness}" />
        </div>
        <div class="slider-group">
          <div class="slider-label"><span>Style Influence</span><span class="adv-style-val">${card.style_weight}%</span></div>
          <input class="slider-input style-style-w" data-idx="${i}" type="range" min="0" max="100" value="${card.style_weight}" />
        </div>
        <div class="slider-group">
          <div class="slider-label"><span>Audio Influence</span><span class="adv-audio-val">${card.audio_weight}%</span></div>
          <input class="slider-input style-audio-w" data-idx="${i}" type="range" min="0" max="100" value="${card.audio_weight}" />
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  PresetManager.getAll().then((presets) => {
    container.querySelectorAll('.preset-select').forEach((sel) => {
      presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    });
  });

  container.querySelectorAll('.remove-style').forEach((btn) => {
    btn.addEventListener('click', () => { styleCards.splice(parseInt(btn.dataset.idx), 1); renderStyleCards(); });
  });
  container.querySelectorAll('.style-tags').forEach((el) => {
    el.addEventListener('input', () => { styleCards[parseInt(el.dataset.idx)].tags = el.value; });
  });
  container.querySelectorAll('.style-neg-tags').forEach((el) => {
    el.addEventListener('input', () => { styleCards[parseInt(el.dataset.idx)].negative_tags = el.value; });
  });
  container.querySelectorAll('.style-gender').forEach((el) => {
    el.addEventListener('change', () => { styleCards[parseInt(el.dataset.idx)].vocal_gender = el.value; });
  });
  container.querySelectorAll('.style-weird').forEach((el) => {
    el.addEventListener('input', () => {
      styleCards[parseInt(el.dataset.idx)].weirdness = parseInt(el.value);
      el.closest('.collapsible-body').querySelector('.adv-weird-val').textContent = el.value + '%';
    });
  });
  container.querySelectorAll('.style-style-w').forEach((el) => {
    el.addEventListener('input', () => {
      styleCards[parseInt(el.dataset.idx)].style_weight = parseInt(el.value);
      el.closest('.collapsible-body').querySelector('.adv-style-val').textContent = el.value + '%';
    });
  });
  container.querySelectorAll('.style-audio-w').forEach((el) => {
    el.addEventListener('input', () => {
      styleCards[parseInt(el.dataset.idx)].audio_weight = parseInt(el.value);
      el.closest('.collapsible-body').querySelector('.adv-audio-val').textContent = el.value + '%';
    });
  });
  container.querySelectorAll('.preset-select').forEach((sel) => {
    sel.addEventListener('change', () => applyPresetToStyle(parseInt(sel.dataset.idx), sel.value));
  });
  container.querySelectorAll('[data-adv-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('open');
      container.querySelector(`[data-adv-body="${btn.dataset.advToggle}"]`).classList.toggle('open');
    });
  });
}


$('addStyleBtn').addEventListener('click', () => {
  if (styleCards.length >= 5) {
    showToast('最多 5 个风格', 'err');
    return;
  }
  styleCards.push({ tags: '', vocal_gender: '', negative_tags: '', weirdness: 50, style_weight: 50, audio_weight: 25 });
  renderStyleCards();
});

// Apply preset to style card
async function applyPresetToStyle(idx, presetId) {
  if (!presetId) return; // "不使用" selected
  const presets = await PresetManager.getAll();
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return;

  styleCards[idx] = {
    tags: preset.tags || '',
    vocal_gender: preset.vocal_gender || '',
  };
  renderStyleCards();
  showToast(`已应用预设: ${preset.name}`);
}

// Submit cover
$('submitCoverBtn').addEventListener('click', async () => {
  if (!state.uploadedClipId) {
    showToast('没有已上传的音频', 'err');
    return;
  }

  const validStyles = styleCards.filter((c) => c.tags.trim());
  if (validStyles.length === 0) {
    showToast('请至少填写一个风格标签', 'err');
    return;
  }

  const submitBtn = $('submitCoverBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中...';

  const payload = {
    clip_id: state.uploadedClipId,
    title: state.uploadedFileName?.replace(/\.[^.]+$/, '') || 'Untitled',
    lyrics: $('lyricsInput').value.trim() || null,
    shared_settings: null,
    styles: validStyles.map((c) => ({
      tags: c.tags,
      vocal_gender: c.vocal_gender || null,
      negative_tags: c.negative_tags || null,
      weirdness: (c.weirdness ?? 50) / 100,
      style_weight: (c.style_weight ?? 50) / 100,
      audio_weight: (c.audio_weight ?? 25) / 100,
    })),
  };

  try {
    const data = await api('POST', '/api/batch_cover', payload);
    state.used += data.deducted || validStyles.length;
    showToast(`已提交 ${data.styles_count} 个风格`);
    showScene('scene2');
    renderDashboard();
  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '提交翻唱任务';
  }
});

// ======== Presets ========
async function renderPresets() {
  const list = $('presetList');
  const presets = await PresetManager.getAll();

  if (presets.length === 0) {
    list.innerHTML = '<div class="empty">暂无预设，点击 "新建" 添加</div>';
    return;
  }

  list.innerHTML = presets.map((p) => `
    <div class="preset-item">
      <div>
        <div class="preset-name">${escapeHtml(p.name)}</div>
        <div class="preset-tags">${escapeHtml(p.tags || '')}</div>
      </div>
      <div class="preset-actions">
        <button class="btn btn-ghost btn-sm" data-preset-edit="${p.id}">编辑</button>
        <button class="btn btn-ghost btn-sm" data-preset-export="${p.id}">导出</button>
        <button class="btn btn-danger btn-sm" data-preset-del="${p.id}">删除</button>
      </div>
    </div>
  `).join('');

  // Bind preset actions
  list.querySelectorAll('[data-preset-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPresetEditor(btn.dataset.presetEdit));
  });
  list.querySelectorAll('[data-preset-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const json = await PresetManager.exportOne(btn.dataset.presetExport);
      if (json) downloadJson(json, `preset-${Date.now()}.json`);
    });
  });
  list.querySelectorAll('[data-preset-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await PresetManager.remove(btn.dataset.presetDel);
      renderPresets();
      showToast('已删除');
    });
  });
}

// Preset editor modal
let editingPresetId = null;

function openPresetEditor(id = null) {
  editingPresetId = id;
  $('presetModalTitle').textContent = id ? '编辑预设' : '新建预设';

  if (id) {
    PresetManager.getAll().then((presets) => {
      const p = presets.find((x) => x.id === id);
      if (!p) return;
      $('presetEditName').value = p.name || '';
      $('presetEditTags').value = p.tags || '';
      $('presetEditNegTags').value = p.negative_tags || '';
      $('presetEditGender').value = p.vocal_gender || '';
      $('presetEditWeird').value = Math.round((p.weirdness || 0.5) * 100);
      $('presetWeirdVal').textContent = $('presetEditWeird').value + '%';
      $('presetEditStyle').value = Math.round((p.style_weight || 0.5) * 100);
      $('presetStyleVal').textContent = $('presetEditStyle').value + '%';
      $('presetEditAudio').value = Math.round((p.audio_weight || 0.25) * 100);
      $('presetAudioVal').textContent = $('presetEditAudio').value + '%';
    });
  } else {
    $('presetEditName').value = '';
    $('presetEditTags').value = '';
    $('presetEditNegTags').value = '';
    $('presetEditGender').value = '';
    $('presetEditWeird').value = 50;
    $('presetWeirdVal').textContent = '50%';
    $('presetEditStyle').value = 50;
    $('presetStyleVal').textContent = '50%';
    $('presetEditAudio').value = 25;
    $('presetAudioVal').textContent = '25%';
  }

  $('presetModal').style.display = 'block';
}

$('addPresetBtn').addEventListener('click', () => openPresetEditor());
$('closePresetModal').addEventListener('click', () => {
  $('presetModal').style.display = 'none';
});

// Preset modal sliders
$('presetEditWeird').addEventListener('input', (e) => {
  $('presetWeirdVal').textContent = e.target.value + '%';
});
$('presetEditStyle').addEventListener('input', (e) => {
  $('presetStyleVal').textContent = e.target.value + '%';
});
$('presetEditAudio').addEventListener('input', (e) => {
  $('presetAudioVal').textContent = e.target.value + '%';
});

$('savePresetBtn').addEventListener('click', async () => {
  const name = $('presetEditName').value.trim();
  if (!name) {
    showToast('请输入预设名称', 'err');
    return;
  }

  const preset = {
    id: editingPresetId,
    name,
    tags: $('presetEditTags').value.trim(),
    negative_tags: $('presetEditNegTags').value.trim(),
    vocal_gender: $('presetEditGender').value,
    weirdness: parseInt($('presetEditWeird').value) / 100,
    style_weight: parseInt($('presetEditStyle').value) / 100,
    audio_weight: parseInt($('presetEditAudio').value) / 100,
  };

  await PresetManager.save(preset);
  $('presetModal').style.display = 'none';
  renderPresets();
  showToast(editingPresetId ? '预设已更新' : '预设已创建');
});

// Import/Export presets
$('importPresetBtn').addEventListener('click', () => {
  $('importPresetInput').click();
});
$('importPresetInput').addEventListener('change', async () => {
  const file = $('importPresetInput').files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const added = await PresetManager.importFromJson(json);
    renderPresets();
    showToast(`导入了 ${added} 个预设`);
  } catch {
    showToast('导入失败: 文件格式错误', 'err');
  }
  $('importPresetInput').value = '';
});
$('exportAllPresetsBtn').addEventListener('click', async () => {
  const json = await PresetManager.exportAll();
  if (json.presets.length === 0) {
    showToast('暂无预设', 'err');
    return;
  }
  downloadJson(json, `presets-all-${Date.now()}.json`);
});

// ======== Tasks ========
let taskRefreshTimer = null;

async function loadTasks() {
  const list = $('taskList');
  try {
    const data = await api('GET', '/api/tasks');
    let tasks = data.tasks || [];

    // 过滤掉已隐藏的任务
    const stored = await chrome.storage.local.get('hiddenTaskIds');
    const hiddenIds = new Set(stored.hiddenTaskIds || []);
    tasks = tasks.filter(t => !hiddenIds.has(t.id));

    if (tasks.length === 0) {
      list.innerHTML = '<div class="empty">暂无任务</div>';
      return;
    }

    list.innerHTML = tasks.map((t) => `
      <div class="task-item" data-task-id="${t.id}">
        <div class="task-header">
          <span class="task-title">${escapeHtml(t.title || 'Untitled')}</span>
          <div class="flex gap-4" style="align-items:center;">
            <span class="task-status ${t.status}">${statusLabel(t.status)}</span>
            <button class="remove-style task-del-btn" data-del-task="${t.id}" title="删除">&times;</button>
          </div>
        </div>
        ${t.clips && t.clips.length > 0 ? `
          <div class="task-clips">
            ${t.clips.map((c) => `
              <div class="task-clip">
                <span>${escapeHtml((c.tags || 'No tags').substring(0, 20))}${(c.tags || '').length > 20 ? '...' : ''}</span>
                <div class="dl-btns">
                  ${c.status === 'complete' ? `
                    <button class="dl-btn mp3 open-dl-modal" data-clip-id="${c.id}">下载</button>
                  ` : c.status === 'error' ? `
                    <span style="color:#e74c3c;font-size:10px;">失败</span>
                  ` : `
                    <span class="spinner"></span>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    // Bind download modal buttons
    list.querySelectorAll('.open-dl-modal').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDownloadModal(btn.dataset.clipId);
      });
    });

    // Bind delete buttons
    list.querySelectorAll('.task-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delTask;
        try {
          await api('DELETE', `/api/tasks?id=${id}`);
          showToast('已删除');
          loadTasks();
        } catch (e) {
          showToast(e.message, 'err');
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<div class="empty">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function statusLabel(s) {
  const labels = { pending: '等待中', generating: '生成中', complete: '完成', error: '错误' };
  return labels[s] || s;
}

async function downloadClip(clipId, format) {
  try {
    const data = await api('GET', `/api/download?id=${clipId}&format=${format}`);
    if (data.url) {
      window.open(data.url);
      if (format === 'wav') {
        state.used += 1;
        renderDashboard();
      }
    }
  } catch (err) {
    showToast(err.message, 'err');
  }
}

// ======== Download Modal ========
let currentDownloadClipId = null;
let currentDownloadClipInfo = null;

async function openDownloadModal(clipId) {
  currentDownloadClipId = clipId;
  currentDownloadClipInfo = null;

  $('dlSongTitle').textContent = '加载中...';
  $('dlOptMp3').checked = true;
  $('dlOptWav').checked = false;
  $('dlOptLyrics').checked = true;
  $('dlOptStyle').checked = false;
  $('downloadModal').style.display = 'block';

  try {
    const info = await api('GET', `/api/clip?id=${clipId}`);
    currentDownloadClipInfo = info;
    $('dlSongTitle').textContent = info.title || `Song ${clipId.substring(0, 8)}`;
  } catch (e) {
    $('dlSongTitle').textContent = `clip: ${clipId.substring(0, 12)}...`;
    showToast('获取歌曲信息失败: ' + e.message, 'err');
  }
}

$('closeDownloadModal').addEventListener('click', () => {
  $('downloadModal').style.display = 'none';
});

$('dlConfirmBtn').addEventListener('click', async () => {
  if (!currentDownloadClipId) return;

  const btn = $('dlConfirmBtn');
  btn.disabled = true;
  btn.textContent = '下载中...';

  const info = currentDownloadClipInfo || {};
  const title = sanitizeFilename(info.title || `song_${currentDownloadClipId.substring(0, 8)}`);

  try {
    // MP3
    if ($('dlOptMp3').checked) {
      if (info.audio_url) {
        triggerDownloadUrl(info.audio_url, `${title}.mp3`);
      } else {
        try {
          const dl = await api('GET', `/api/download?id=${currentDownloadClipId}&format=mp3`);
          if (dl.url) triggerDownloadUrl(dl.url, `${title}.mp3`);
        } catch (e) {
          showToast('MP3 下载失败: ' + e.message, 'err');
        }
      }
    }

    // WAV
    if ($('dlOptWav').checked) {
      try {
        const dl = await api('GET', `/api/download?id=${currentDownloadClipId}&format=wav`);
        if (dl.url) {
          triggerDownloadUrl(dl.url, `${title}.wav`);
          state.used += 1;
        }
      } catch (e) {
        showToast('WAV 下载失败: ' + e.message, 'err');
      }
    }

    // 歌词 TXT
    if ($('dlOptLyrics').checked && info.lyrics) {
      downloadTextFile(info.lyrics, `${title}.txt`);
    } else if ($('dlOptLyrics').checked && !info.lyrics) {
      showToast('该歌曲无歌词信息', 'err');
    }

    // 音乐风格 + 高级参数 TXT
    if ($('dlOptStyle').checked) {
      const fmtPct = (v) => v != null && v !== '' ? (Number(v) * 100).toFixed(0) + '%' : '默认';
      const fmtVal = (v) => v != null && v !== '' && v !== false ? String(v) : '无';
      const lines = [
        `歌曲: ${fmtVal(info.title)}`,
        `Clip ID: ${info.id || currentDownloadClipId}`,
        `模型: ${fmtVal(info.model_name)}`,
        `创建时间: ${fmtVal(info.created_at)}`,
        `时长: ${fmtVal(info.duration)}`,
        '',
        '====== 音乐风格 ======',
        `风格标签: ${fmtVal(info.tags)}`,
        `排除标签: ${fmtVal(info.negative_tags)}`,
        `人声性别: ${info.vocal_gender === 'male' ? '男声' : info.vocal_gender === 'female' ? '女声' : '自动'}`,
        '',
        '====== 高级参数 ======',
        `Weirdness: ${fmtPct(info.weirdness)}`,
        `Style Influence: ${fmtPct(info.style_weight)}`,
        `Audio Influence: ${fmtPct(info.audio_weight)}`,
        '',
        `是否翻唱: ${info.is_cover ? '是' : '否'}`,
        info.cover_clip_id ? `原始 Clip ID: ${info.cover_clip_id}` : '',
      ].filter(Boolean);
      downloadTextFile(lines.join('\n'), `${title}-风格参数.txt`);
    }

    showToast('下载完成');
    $('downloadModal').style.display = 'none';
  } catch (e) {
    showToast('下载出错: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '下载选中项';
  }
});

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerDownloadUrl(url, filename) {
  chrome.downloads.download({ url, filename, saveAs: false });
}

$('clearTasksBtn').addEventListener('click', async () => {
  // 记录当前任务ID到已隐藏列表
  const data = await chrome.storage.local.get('hiddenTaskIds');
  const hidden = new Set(data.hiddenTaskIds || []);
  $('taskList').querySelectorAll('[data-task-id]').forEach((el) => {
    hidden.add(el.dataset.taskId);
  });
  await chrome.storage.local.set({ hiddenTaskIds: [...hidden] });
  $('taskList').innerHTML = '<div class="empty">暂无任务</div>';
  showToast('已清空');
});

function startAutoRefresh() {
  stopAutoRefresh();
  taskRefreshTimer = setInterval(() => {
    if (state.scene === 'scene2') {
      loadTasks();
    }
  }, 60000);
}

function stopAutoRefresh() {
  if (taskRefreshTimer) {
    clearInterval(taskRefreshTimer);
    taskRefreshTimer = null;
  }
}

// ======== Utilities ========
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ======== Init ========
async function init() {
  const data = await chrome.storage.local.get(['apiKey']);

  if (data.apiKey) {
    // Try auto-login
    state.apiKey = data.apiKey;
    loginApiKey.value = data.apiKey;

    loginBtn.disabled = true;
    loginBtn.textContent = '自动登录中...';

    try {
      const status = await api('GET', '/api/auth/status');
      state.userName = status.name;
      state.quota = status.quota;
      state.used = status.used;
      state.cookieValid = status.cookie_valid;
      state.sunoCredits = status.suno_credits;

      renderDashboard();
      showScene('scene2');
      startAutoRefresh();
    } catch {
      // Auto-login failed, stay on Scene 1
      loginBtn.disabled = false;
      loginBtn.textContent = '登录';
    }
  }
}

// Listen for cookie changes from background.js
// Cookie 变化监听 — 只在指纹变化时响应，防止风暴
let lastHandledFingerprint = '';
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastCookieFingerprint && state.apiKey) {
    const newFp = changes.lastCookieFingerprint.newValue;
    if (newFp && newFp !== lastHandledFingerprint) {
      lastHandledFingerprint = newFp;
      showToast('Cookie 已更新');
      // background.js 已经推送了，只需刷新状态
      if (state.scene === 'scene2') {
        setTimeout(() => refreshStatus(), 2000);
      }
    }
  }
});

init();
