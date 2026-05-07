// Preset management module
// Stored in chrome.storage.local under key "presets"

const DEFAULT_PRESETS = [
  {
    id: 'default_quality',
    name: '优化音乐品质',
    tags: '[Is_MAX_MODE: MAX](MAX), [QUALITY: MAX](MAX), [REALISM: MAX](MAX), [REAL_INSTRUMENTS: MAX](MAX), [START_ON: TRUE], Stereo balance correction, middle side separation treatment, low-frequency centering and tightening, high-frequency sound field broadening; mastering balanced optimization of low-frequency undertone, mid-frequency penetration and high-frequency air feeling; Add tape saturation and tube warm dyeing to enhance the harmonic texture; light bus compression and multi-stage dynamic control to strengthen dynamic bonding and impact',
    negative_tags: '',
    vocal_gender: '',
    weirdness: 0.5,
    style_weight: 0.5,
    audio_weight: 0.64,
  },
];

const PresetManager = {
  async getAll() {
    const data = await chrome.storage.local.get(['presets', 'presetsInitialized']);
    // 首次使用时加载内置预设
    if (!data.presetsInitialized) {
      await chrome.storage.local.set({ presets: DEFAULT_PRESETS, presetsInitialized: true });
      return DEFAULT_PRESETS;
    }
    return data.presets || [];
  },

  async save(preset) {
    const presets = await this.getAll();
    const idx = presets.findIndex(p => p.id === preset.id);
    if (idx >= 0) {
      presets[idx] = preset;
    } else {
      preset.id = 'preset_' + Date.now();
      presets.push(preset);
    }
    await chrome.storage.local.set({ presets });
    return preset;
  },

  async remove(id) {
    const presets = await this.getAll();
    const filtered = presets.filter(p => p.id !== id);
    await chrome.storage.local.set({ presets: filtered });
  },

  async importFromJson(json) {
    const existing = await this.getAll();
    const incoming = json.presets || [];
    let added = 0;
    for (const p of incoming) {
      // 每个预设分配新 id，全部导入不跳过
      added++;
      p.id = 'preset_' + Date.now() + '_' + added;
      existing.push(p);
    }
    await chrome.storage.local.set({ presets: existing });
    return added;
  },

  async exportAll() {
    const presets = await this.getAll();
    return { presets };
  },

  async exportOne(id) {
    const presets = await this.getAll();
    const preset = presets.find(p => p.id === id);
    if (!preset) return null;
    return { presets: [preset] };
  },
};
