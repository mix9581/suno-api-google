// Preset management module
// Stored in chrome.storage.local under key "presets"

const PresetManager = {
  async getAll() {
    const data = await chrome.storage.local.get('presets');
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
