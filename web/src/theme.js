// Theme like TorobChat's «پوسته»: روشن / تیره / سیستم (default). The choice is remembered on this device
// and applied as <html data-theme>; "system" leaves it to the device's setting.
const KEY = 'torobchin-theme';
export const THEMES = [
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تیره' },
  { value: 'system', label: 'سیستم' },
];

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some((t) => t.value === v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  // The phone's status bar follows the chosen theme too.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0f1117' : '#ffffff'));
}

export function setTheme(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  applyTheme(pref);
}
