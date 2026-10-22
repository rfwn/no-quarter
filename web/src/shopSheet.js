// Any card can open a shop's page in a sheet: openShop(id, name) → App listens and renders it.
const listeners = new Set();
export const openShop = (shopId, name) => listeners.forEach((fn) => fn({ shopId, name }));
export function onOpenShop(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
