/* Progressive enhancement only: every page is complete without this file. */
(function () {
  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var store = {
    get: function (key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        /* ignore */
      }
    },
  };

  /* Only an explicit switch is remembered. Merely opening a page in one
     language must not override what the reader's browser asks for. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang-link]'), function (link) {
    link.addEventListener('click', function () {
      store.set('fk-locale', link.getAttribute('data-lang-link'));
    });
  });

  /* --- dark mode ------------------------------------------------------- */
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var explicit = root.getAttribute('data-theme');
      var dark = explicit
        ? explicit === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('fk-theme', next);
      toggle.setAttribute('aria-pressed', String(next === 'dark'));
    });
  }

  /* --- reveal on scroll ------------------------------------------------ */
  var revealables = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-in');
    });
  } else {
    var revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    Array.prototype.forEach.call(revealables, function (el) {
      revealer.observe(el);
    });
  }

  /* --- highlight the section in view ---------------------------------- */
  var navStrip = document.querySelector('.sectionnav ul');
  var navLinks = {};
  var current = null;
  var holdUntil = 0;

  var setCurrent = function (link) {
    if (!link || link === current) return;
    if (current) current.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'true');
    current = link;
  };

  /* Keep the active chip visible by scrolling the nav strip and nothing else.
     Never use scrollIntoView here: it scrolls every scrollable ancestor, the
     page included, and that aborts the smooth scroll a nav click has just
     started — stranding the reader at the first section it passes. */
  var followChip = function (link, force) {
    if (!navStrip || (!force && Date.now() < holdUntil)) return;
    var pad = 16;
    var strip = navStrip.getBoundingClientRect();
    var chip = link.getBoundingClientRect();
    if (chip.left < strip.left + pad) {
      navStrip.scrollLeft += chip.left - strip.left - pad;
    } else if (chip.right > strip.right - pad) {
      navStrip.scrollLeft += chip.right - strip.right + pad;
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('.sectionnav a'), function (link) {
    navLinks[link.getAttribute('href').slice(1)] = link;
    link.addEventListener('click', function () {
      // A long smooth scroll is starting: stop intermediate sections from
      // dragging the strip about until it settles.
      holdUntil = Date.now() + 1800;
      setCurrent(link);
      followChip(link, true);
    });
  });
  window.addEventListener('scrollend', function () {
    holdUntil = 0;
  });

  var sections = document.querySelectorAll('[data-section]');
  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = navLinks[entry.target.id];
          if (!link) return;
          setCurrent(link);
          followChip(link);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    Array.prototype.forEach.call(sections, function (section) {
      spy.observe(section);
    });
  }

  /* --- tag filters ---------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (section) {
    var bar = section.querySelector('[data-filters]');
    if (!bar) return;
    var cards = section.querySelectorAll('.card');
    var empty = section.querySelector('[data-empty]');

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('.chip');
      if (!button) return;
      var wanted = button.getAttribute('data-filter');

      Array.prototype.forEach.call(bar.querySelectorAll('.chip'), function (chip) {
        var on = chip === button;
        chip.classList.toggle('is-on', on);
        chip.setAttribute('aria-pressed', String(on));
      });

      var shown = 0;
      Array.prototype.forEach.call(cards, function (card) {
        var tags = (card.getAttribute('data-tags') || '').split(' ');
        var show = wanted === '*' || tags.indexOf(wanted) !== -1;
        card.classList.toggle('is-hidden', !show);
        if (show) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
    });
  });

  /* --- back to top ---------------------------------------------------- */
  var totop = document.querySelector('[data-totop]');
  if (totop) {
    var ticking = false;
    var update = function () {
      totop.setAttribute('data-visible', String(window.scrollY > window.innerHeight * 0.8));
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }
})();
