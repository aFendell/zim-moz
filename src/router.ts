export interface Route {
  locationId: string | null;
  edit: boolean;
}

/** Parse `#<id>` or `#<id>/edit` into a Route. Empty/unknown hash -> no selection. */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { locationId: null, edit: false };
  const [id, action] = raw.split('/');
  if (!id) return { locationId: null, edit: false };
  return { locationId: decodeURIComponent(id), edit: action === 'edit' };
}

export function toHash(route: Route): string {
  if (!route.locationId) return '';
  const id = encodeURIComponent(route.locationId);
  return route.edit ? `#${id}/edit` : `#${id}`;
}

export function navigate(route: Route): void {
  const next = toHash(route);
  const current = window.location.hash;
  if (next === current) return;
  if (next === '') {
    history.pushState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = next;
  }
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const listener = () => handler(parseHash(window.location.hash));
  window.addEventListener('hashchange', listener);
  listener();
  return () => window.removeEventListener('hashchange', listener);
}
