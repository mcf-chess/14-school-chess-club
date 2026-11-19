/*
  Админ нэвтэрсэн үед нийтийн хуудсуудын дээд талд «Админ горим» мөр харуулна.

  Энэ мөр зөвхөн товчлол. Мэдээлэл өөрчлөх эрхийг сервер шалгадаг тул хэн нэгэн
  энэ мөрийг гараар гаргаж ирсэн ч юу ч өөрчилж чадахгүй.
  Нэвтрэлт зөвхөн энэ таб нээлттэй байх хугацаанд хадгалагдана (js/backend.js).
*/
(() => {
  'use strict';

  const SESSION_KEY = 'club-admin-session'; // js/backend.js-тэй ижил нэр

  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    session = null;
  }
  if (!session) return;

  const onAthletesPage = /athletes\.html$/.test(location.pathname);

  function link(label, href) {
    const element = document.createElement('a');
    element.href = href;
    element.textContent = label;
    return element;
  }

  const bar = document.createElement('div');
  bar.className = 'admin-mode-bar';

  const container = document.createElement('div');
  container.className = 'container';

  const label = document.createElement('p');
  const title = document.createElement('strong');
  title.textContent = 'Админ горим';
  label.append(title);
  if (session.email) {
    const email = document.createElement('span');
    email.textContent = session.email;
    label.append(email);
  }

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Админы товчлол');
  if (!onAthletesPage) nav.append(link('Тамирчид, амжилтыг засах', 'athletes.html'));
  nav.append(link('Админ хэсэг', 'admin.html'));

  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.textContent = 'Гарах';
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    // Backend ачаалагдсан хуудсанд сервер дээрх нэвтрэлтийг ч хүчингүй болгоно.
    if (typeof Backend !== 'undefined') await Backend.signOut();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // sessionStorage хаалттай бол энд юу ч хадгалагдаагүй.
    }
    location.reload();
  });
  nav.append(signOut);

  container.append(label, nav);
  bar.append(container);

  // «Үндсэн агуулга руу» холбоосны дараа байрлуулж, гарын товчлуурын дараалал хэвээр үлдэнэ.
  const skipLink = document.querySelector('.skip');
  if (skipLink) skipLink.after(bar);
  else document.body.prepend(bar);

  document.documentElement.classList.add('admin-mode');

  // Сервер эрхийг баталгаажуулаагүй бол (js/athletes.js) мөрийг хасна.
  window.addEventListener('club:not-admin', () => {
    bar.remove();
    document.documentElement.classList.remove('admin-mode');
  });
})();
