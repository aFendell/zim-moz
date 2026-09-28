import type { Overrides } from '../data/types';
import { exportOverrides, parseOverridesExport } from '../data/store';

export interface MenuCallbacks {
  getOverrides: () => Overrides;
  onImport: (overrides: Overrides) => void;
  onClearAll: () => void;
}

/** Small overflow menu: export / import local edits, clear all. */
export function mountMenu(parent: HTMLElement, cb: MenuCallbacks): void {
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'menu-toggle';
  toggle.textContent = '⋯';
  toggle.setAttribute('aria-label', 'Menu');
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.hidden = true;

  const msg = document.createElement('p');
  msg.className = 'menu-msg';
  msg.hidden = true;
  const say = (text: string) => {
    msg.textContent = text;
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 3000);
  };

  const exportBtn = item('Export my edits', async () => {
    const overrides = cb.getOverrides();
    const count = Object.keys(overrides).length;
    if (count === 0) return say('No local edits yet.');
    const text = exportOverrides(overrides);
    const file = new File([text], `zim-moz-edits-${new Date().toISOString().slice(0, 10)}.json`, {
      type: 'application/json',
    });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'zim-moz edits' });
        return;
      } catch {
        /* user cancelled or share failed; fall through to download */
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const overrides = parseOverridesExport(await f.text());
      cb.onImport(overrides);
      say(`Imported edits for ${Object.keys(overrides).length} location(s).`);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Import failed.');
    }
  });
  const importBtn = item('Import edits…', () => fileInput.click());

  let confirmClear = false;
  const clearBtn = item('Clear all my edits', () => {
    if (!confirmClear) {
      confirmClear = true;
      clearBtn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        confirmClear = false;
        clearBtn.textContent = 'Clear all my edits';
      }, 3000);
      return;
    }
    confirmClear = false;
    clearBtn.textContent = 'Clear all my edits';
    cb.onClearAll();
    say('Local edits cleared.');
  });

  panel.append(exportBtn, importBtn, clearBtn, fileInput, msg);
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) panel.hidden = true;
  });
  wrap.append(toggle, panel);
  parent.appendChild(wrap);
}

function item(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'menu-item';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
