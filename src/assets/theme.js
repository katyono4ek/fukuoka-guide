/* Runs before first paint: marks the document as scripted and restores the
   reader's colour choice without a flash. Keep this file tiny. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var stored = localStorage.getItem('fk-theme');
    if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
  } catch (e) {
    /* private mode or blocked storage: the system preference still applies */
  }
})();
