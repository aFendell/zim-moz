/** Single shared bottom sheet for map-type / personalize panels (the edit form has its own). */
let root: HTMLElement | null = null;
let onCloseCb: (() => void) | null = null;

function ensureRoot(parent: HTMLElement): HTMLElement {
  if (root) return root;
  root = document.createElement('div');
  root.className = 'sheet sheet-panel';
  root.hidden = true;
  parent.appendChild(root);
  document.addEventListener('click', (e) => {
    if (root && !root.hidden && !root.contains(e.target as Node) && !(e.target as Element).closest('.sheet-opener')) {
      closeSheet();
    }
  });
  return root;
}

export function openSheet(parent: HTMLElement, title: string, content: HTMLElement, onClose?: () => void): void {
  const el = ensureRoot(parent);
  onCloseCb?.();
  onCloseCb = onClose ?? null;
  el.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'sheet-head';
  const h = document.createElement('strong');
  h.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'sheet-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeSheet);
  head.append(h, close);
  el.append(head, content);
  el.hidden = false;
}

export function closeSheet(): void {
  if (!root || root.hidden) return;
  root.hidden = true;
  root.innerHTML = '';
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}

export function isSheetOpen(): boolean {
  return !!root && !root.hidden;
}
