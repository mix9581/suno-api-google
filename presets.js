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
  {
    id: 'preset_dj_melbourne_bounce',
    name: 'DJ',
    tags: 'Melbourne Bounce, Vinahouse, Sino-Commercial Dance, High BPM (130-145), Four-on-the-floor bass drum, Off-beat Donk bass, Nightcore vocals, Pitch-shifted female vocals, Heavy Auto-Tune, Washed-out spatial Reverb, Heavy Sidechain Compression (pumping effect), Cheesy Sawtooth Synth Leads, Plastic Synth Brass, Vocal Chops, Over-compression, Brickwall Limiting, Zero dynamic range, Airhorn sound effects, Siren FX, Aggressive snare build-ups, Abrupt drops',
    negative_tags: '',
    vocal_gender: '',
    weirdness: 0.5,
    style_weight: 0.5,
    audio_weight: 0.25,
  },
  {
    id: 'preset_reggae_rnb',
    name: '雷鬼rnb',
    tags: 'Vintage Funk X Neo-Soul, 105 BPM, Expressive soulful vocals, Seamless Register Flip to falsetto, Portamento vocal slides, Dynamic vocal phrasing, Vocal fry, Melismatic vocal runs, Tight syncopated groove, Deep pocket slap bass, Rhodes electric piano, Clean rhythm guitar, Brass section hits, ‑Overly happy intro',
    negative_tags: '‑Trap beats, ‑Club EDM, ‑Electronic dance, ‑Screamo, ‑Heavy Metal, ‑Robotic autotune, ‑Hopeless, ‑Monotone, ‑Flat dynamics, ‑Generic commercial Pop, ‑Cheesy synthesizer, ‑Fast pace, ‑R&B, ‑Rap',
    vocal_gender: '',
    weirdness: 0.5,
    style_weight: 0.5,
    audio_weight: 0.25,
  },
];

function mergeDefaultPresets(presets) {
  const result = Array.isArray(presets) ? [...presets] : [];
  let changed = false;
  for (const preset of DEFAULT_PRESETS) {
    if (!result.some((item) => item.id === preset.id)) {
      result.push({ ...preset });
      changed = true;
    }
  }
  return { presets: result, changed };
}

const PresetManager = {
  async getAll() {
    const data = await chrome.storage.local.get(['presets', 'presetsInitialized']);
    // 首次使用时加载内置预设
    if (!data.presetsInitialized) {
      await chrome.storage.local.set({ presets: DEFAULT_PRESETS, presetsInitialized: true });
      return DEFAULT_PRESETS;
    }
    const merged = mergeDefaultPresets(data.presets || []);
    if (merged.changed) await chrome.storage.local.set({ presets: merged.presets });
    return merged.presets;
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
