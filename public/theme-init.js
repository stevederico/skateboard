/**
 * Apply the saved or system color scheme before paint.
 *
 * Classic (non-module) script so it runs while parsing and avoids a light-theme
 * flash. Served from /theme-init.js (public/) so CSP script-src 'self' allows it
 * without 'unsafe-inline'.
 */
(function () {
  var savedTheme = localStorage.getItem('theme');
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = savedTheme ? savedTheme === 'dark' : systemPrefersDark;
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
})();
