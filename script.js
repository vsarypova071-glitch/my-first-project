(function () {
  const overlays = document.querySelectorAll('.popup-overlay');
  const openTriggers = document.querySelectorAll('[data-popup-open]');
  const closeTriggers = document.querySelectorAll('[data-popup-close]');

  function lockScroll() {
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    document.body.style.overflow = '';
  }

  function closeAll() {
    overlays.forEach(function (o) {
      o.classList.remove('active');
      o.setAttribute('aria-hidden', 'true');
    });
    unlockScroll();
  }

  function openPopup(id) {
    const overlay = document.getElementById('popup-' + id);
    if (!overlay) return;
    overlays.forEach(function (o) {
      o.classList.remove('active');
      o.setAttribute('aria-hidden', 'true');
    });
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    lockScroll();
  }

  openTriggers.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openPopup(btn.dataset.popupOpen);
    });
  });

  closeTriggers.forEach(function (btn) {
    btn.addEventListener('click', closeAll);
  });

  overlays.forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeAll();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
  });
})();
