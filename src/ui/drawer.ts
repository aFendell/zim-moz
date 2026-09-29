/**
 * Bottom drawer with a drag handle. Two snap states: peek (handle + quick chips)
 * and open (scrollable content, up to 85vh). Vanilla pointer events.
 */
export interface Drawer {
  root: HTMLElement;
  peek: HTMLElement;
  body: HTMLElement;
  open(sectionId?: string): void;
  close(): void;
  isOpen(): boolean;
}

const PEEK_PX = 64;

export function mountDrawer(parent: HTMLElement): Drawer {
  const root = document.createElement('div');
  root.className = 'drawer';
  const handle = document.createElement('div');
  handle.className = 'drawer-handle';
  handle.innerHTML = '<span class="drawer-grip" aria-hidden="true"></span>';
  const peek = document.createElement('div');
  peek.className = 'drawer-peek';
  const body = document.createElement('div');
  body.className = 'drawer-body';
  body.hidden = true;
  root.append(handle, peek, body);
  parent.appendChild(root);

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    root.classList.toggle('is-open', v);
    body.hidden = !v;
    root.style.transform = '';
    if (!v) body.scrollTop = 0;
  };

  // Drag: track vertical movement on the handle/peek strip; snap on release.
  let startY = 0;
  let lastY = 0;
  let dragging = false;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    startY = lastY = e.clientY;
    root.classList.add('is-dragging');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    lastY = e.clientY;
    const dy = lastY - startY;
    if (open) root.style.transform = `translateY(${Math.max(0, dy)}px)`;
    else root.style.transform = `translateY(${Math.min(0, Math.max(dy, -PEEK_PX))}px)`;
  };
  // Use the last tracked position: pointercancel can arrive with meaningless coordinates.
  const finish = (isTap: boolean) => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    const dy = lastY - startY;
    if (isTap && Math.abs(dy) < 8) setOpen(!open);
    else if (open && dy > 60) setOpen(false);
    else if (!open && dy < -30) setOpen(true);
    else root.style.transform = '';
  };
  for (const el of [handle, peek]) {
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', () => finish(true));
    el.addEventListener('pointercancel', () => finish(false));
  }

  return {
    root,
    peek,
    body,
    open(sectionId) {
      setOpen(true);
      if (sectionId) {
        const el = body.querySelector<HTMLElement>(`#${sectionId}`);
        el?.scrollIntoView({ block: 'start' });
      }
    },
    close() {
      setOpen(false);
    },
    isOpen: () => open,
  };
}
