/**
 * Apply the saved or system color scheme before paint.
 *
 * Classic (non-module) script so it runs while parsing and avoids a light-theme
 * flash. Served from /theme-init.js (public/) so CSP script-src 'self' allows it
 * without 'unsafe-inline'.
 */
(function () {
  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (e) {
    // Storage can be off in the iOS web view; follow the system.
  }
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  // No choice, or "system", follows the phone. Only an explicit pick overrides it.
  var isDark = savedTheme === 'dark' || ((!savedTheme || savedTheme === 'system') && systemPrefersDark);
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
})();
