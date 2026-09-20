/**
 * Inline SVG icon set (readable rewrite of minified `kz` + `Az()`).
 * 24x24 stroke icons, currentColor.
 */
const PATHS = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M4 8h10M18 8h2M4 16h4M12 16h8m-9-7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  garage: 'M3 7h4l2-3h6l2 3h4v13H3z',
  sound: 'M4 10v4h4l5 4V6l-5 4H4zm12 0a4 4 0 0 1 0 4m2-7a7 7 0 0 1 0 10',
  mute: 'M4 10v4h4l5 4V6l-5 4H4zm12 3l5 5m0-5l-5 5',
  flag: 'M6 21V4m0 1h12l-3 4 3 4H6',
  check: 'M5 13l4 4L19 7',
  pause: 'M8 5v14M16 5v14',
  camera: 'M4 8h3l2-2h6l2 2h3v11H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  replay: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
};

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] ?? PATHS.arrow}"/></svg>`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
