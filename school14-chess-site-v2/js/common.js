/*
  Бүх хуудсанд ажиллах үйлдлүүд:
    1. Клубын мэдээллийг js/site-config.js-ээс хуудсанд тавих
    2. Гар утасны цэс
    3. Холбоо барих мэдээлэл хуулах (зөвхөн contact.html)
*/
(() => {
  'use strict';

  /* 1. Клубын мэдээлэл ----------------------------------------------------- */

  // «slot0.start» гэх мэт замаар CLUB объектоос утга авна.
  function clubValue(path) {
    if (typeof CLUB === 'undefined') return undefined;
    return path.split('.').reduce((value, key) => {
      if (value == null) return undefined;
      const slot = key.match(/^slot(\d)$/);
      return slot ? value.slots?.[Number(slot[1])] : value[key];
    }, CLUB);
  }

  document.querySelectorAll('[data-club]').forEach((element) => {
    const value = clubValue(element.dataset.club);
    if (typeof value === 'string') element.textContent = value;
  });

  const hrefFor = {
    phone: () => 'tel:' + CLUB.phoneIntl,
    email: () => 'mailto:' + CLUB.email,
    facebookUrl: () => CLUB.facebookUrl,
    schoolUrl: () => CLUB.schoolUrl,
  };

  document.querySelectorAll('[data-club-href]').forEach((link) => {
    const build = hrefFor[link.dataset.clubHref];
    if (build && typeof CLUB !== 'undefined') link.href = build();
  });

  /* 2. Гар утасны цэс ------------------------------------------------------ */

  const menuButton = document.getElementById('menu');
  const nav = document.getElementById('nav');

  if (menuButton && nav) {
    const icon = menuButton.querySelector('span');

    const setMenuOpen = (isOpen) => {
      nav.classList.toggle('open', isOpen);
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Үндсэн цэс хаах' : 'Үндсэн цэс нээх');
      icon.textContent = isOpen ? '×' : '☰';
    };

    menuButton.addEventListener('click', () => {
      setMenuOpen(!nav.classList.contains('open'));
    });

    // Esc товчоор цэсийг хааж, фокусыг цэсний товч руу буцаана.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        setMenuOpen(false);
        menuButton.focus();
      }
    });
  }

  /* 3. Холбоо барих мэдээлэл хуулах ---------------------------------------- */

  const copyButton = document.getElementById('copy-contact');

  if (copyButton && typeof CLUB !== 'undefined') {
    const status = document.getElementById('copy-status');
    const contactText = [
      CLUB.name,
      'Утас: ' + CLUB.phone,
      'Имэйл: ' + CLUB.email,
      'Хаяг: ' + CLUB.address,
      CLUB.days + ': ' + CLUB.slots.map((slot) => `${slot.start}–${slot.end}`).join(', '),
    ].join('\n');

    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(contactText);
        status.textContent = 'Холбоо барих мэдээлэл хуулагдлаа.';
      } catch {
        status.textContent = `Автоматаар хуулж чадсангүй. Утас: ${CLUB.phone}.`;
      }
    });
  }
})();
