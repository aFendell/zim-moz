import type { LayerPrefs } from '../map';

const PREF_KEY = 'zim-moz:layers';

export function loadLayerPrefs(): LayerPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LayerPrefs>;
      return { flavor: p.flavor === 'dark' ? 'dark' : 'light', terrain: p.terrain === true };
    }
  } catch {
    /* ignore */
  }
  return { flavor: 'light', terrain: false };
}

function saveLayerPrefs(p: LayerPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export interface LayerPickerOptions {
  parent: HTMLElement;
  initial: LayerPrefs;
  /** Whether the terrain file is available offline; when false the toggle explains why. */
  terrainReady: () => Promise<boolean>;
  onChange: (prefs: LayerPrefs) => void;
}

/** Layer button + popover: Light / Dark, Terrain on/off. Persists to localStorage. */
export function mountLayerPicker(o: LayerPickerOptions): void {
  let prefs = { ...o.initial };
  const wrap = document.createElement('div');
  wrap.className = 'layers';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'layers-toggle';
  toggle.textContent = '◧';
  toggle.setAttribute('aria-label', 'Map layers');
  const panel = document.createElement('div');
  panel.className = 'layers-panel';
  panel.hidden = true;
  wrap.append(toggle, panel);
  o.parent.appendChild(wrap);

  const apply = () => {
    saveLayerPrefs(prefs);
    o.onChange(prefs);
    render();
  };

  const render = async () => {
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'layers-title';
    title.textContent = 'Map style';
    panel.appendChild(title);
    for (const f of ['light', 'dark'] as const) {
      const row = document.createElement('label');
      row.className = 'layers-row';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'flavor';
      input.checked = prefs.flavor === f;
      input.addEventListener('change', () => {
        prefs = { ...prefs, flavor: f };
        apply();
      });
      row.append(input, document.createTextNode(f === 'light' ? 'Light' : 'Dark (night driving)'));
      panel.appendChild(row);
    }
    const t = document.createElement('label');
    t.className = 'layers-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = prefs.terrain;
    const ready = await o.terrainReady();
    cb.disabled = !ready && !navigator.onLine;
    cb.addEventListener('change', () => {
      prefs = { ...prefs, terrain: cb.checked };
      apply();
    });
    t.append(cb, document.createTextNode('Terrain (hillshade)'));
    panel.appendChild(t);
    if (!ready) {
      const hint = document.createElement('div');
      hint.className = 'layers-hint';
      hint.textContent = navigator.onLine
        ? 'Terrain streams while online. Download it in the offline panel to use it off-grid.'
        : 'Terrain not downloaded. Get it from the offline panel when on wifi.';
      panel.appendChild(hint);
    }
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) void render();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) panel.hidden = true;
  });
}
