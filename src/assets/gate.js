/* Root redirect. Runs blocking in <head> so nothing is ever painted here:
   last language read → browser preference → default locale. */
(function () {
  var root = document.documentElement;
  var locales = (root.getAttribute('data-locales') || 'en').split(' ');
  var fallback = root.getAttribute('data-default') || locales[0];

  var stored = null;
  try {
    stored = localStorage.getItem('fk-locale');
  } catch (e) {
    /* private mode or blocked storage: fall through to the browser preference */
  }
  if (stored && locales.indexOf(stored) !== -1) {
    location.replace('./' + stored + '/');
    return;
  }

  var wanted = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ''];
  for (var i = 0; i < wanted.length; i++) {
    var tag = String(wanted[i]).toLowerCase().split('-')[0];
    if (locales.indexOf(tag) !== -1) {
      location.replace('./' + tag + '/');
      return;
    }
  }

  location.replace('./' + fallback + '/');
})();
