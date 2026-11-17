(function () {
  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (e) {
    savedTheme = null;
  }
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = savedTheme === 'dark' || ((!savedTheme || savedTheme === 'system') && systemPrefersDark);
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
})();
