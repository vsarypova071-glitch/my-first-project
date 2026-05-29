(function () {
  const FORM_ENDPOINT = '/api/send';

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

  const form = document.getElementById('contact-form');
  if (form) {
    const submitBtn = document.getElementById('form-submit');
    const errorBox = document.getElementById('form-error');
    const formWrap = form.parentElement;
    const successBox = document.getElementById('form-success');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = form.name.value.trim();
      const contact = form.contact.value.trim();
      const task = form.task.value.trim();

      if (!name || !contact || !task) {
        errorBox.textContent = 'Заполни, пожалуйста, все поля.';
        errorBox.hidden = false;
        return;
      }

      errorBox.hidden = true;
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Отправляю…';

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, contact: contact, task: task })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('bad_status');
          return r.json();
        })
        .then(function (data) {
          if (!data || !data.ok) throw new Error('bad_response');
          form.reset();
          formWrap.hidden = true;
          successBox.hidden = false;
        })
        .catch(function () {
          errorBox.textContent = 'Не удалось отправить. Напиши, пожалуйста, в Telegram.';
          errorBox.hidden = false;
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    });
  }
})();
