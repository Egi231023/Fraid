// Small, local visual primitives. No network requests or user data.
const paths = {
  today:
    '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  attendance: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shifts:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  recipes:
    '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/>',
  stock: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9M7.5 5.5l9 5v4"/>',
  checklists:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 13 2 2 5-5m-7 8h7"/>',
  sales: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM9 7h6m-6 4h6m-6 4h3"/>',
  notes:
    '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M8 10h8m-8 4h5"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/>',
  admin:
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  payroll:
    '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 5h6M6 5V3h12"/><circle cx="16" cy="14" r=".6"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  more: '<circle cx="5" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/>',
  assistant:
    '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  coffee:
    '<path d="M4 8h12v7a6 6 0 0 1-12 0zM16 8h2a3 3 0 1 1 0 6h-2M3 22h16M7 2v2m5-2v2"/>',
  logout: '<path d="M10 4H4v16h6m4-12 4 4-4 4m-7-4h12"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>',
};
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.more}</svg>`;
export const brand = () =>
  '<div class="brand"><img src="assets/FRAID_LOGO_ICON.png" alt=""><span>fraid<small>COFFEE & PEOPLE</small></span></div>';
export const coffeeArt = () =>
  '<div class="coffee-art" aria-hidden="true"><div class="ritual-orbit"></div><img src="assets/coffee-ritual.svg" alt="" width="380" height="380"><span class="ritual-caption">MALÉ RITUÁLY. DOBRÉ DNI.</span></div>';
