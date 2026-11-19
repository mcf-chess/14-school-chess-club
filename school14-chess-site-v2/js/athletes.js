/*
  Тамирчид ба тэмцээний амжилтыг серверээс уншиж харуулна (athletes.html).

  Зочинд: сервер зөвхөн НИЙТЭЛСЭН бөгөөд ЗӨВШӨӨРӨЛ БАТАЛГААЖСАН бүртгэлийг буцаадаг
  (supabase/schema.sql дахь public_athletes, public_achievements харагдац).
  Ноорог болон зөвшөөрөлгүй мэдээлэл хөтөч рүү огт ирэхгүй.

  Админ нэвтэрсэн үед: ноорог орсон бүх бүртгэл харагдаж, карт бүрт «Засах», «Нийтлэх»,
  «Устгах» товч гарна. «Засах» нь admin.html дахь маягтыг тэр бүртгэл дээр нээнэ.
  Эрхийг сервер шалгадаг тул энэ кодыг өөрчилсөн ч админ бус хүн юу ч өөрчилж чадахгүй.

  Сервер тохируулаагүй эсвэл холбогдож чадаагүй бол HTML дэх «удахгүй» бичвэр хэвээр
  үлдэж, хуудасны бусад агуулга хэвийн харагдана.
*/
(() => {
  'use strict';

  const athleteList = document.getElementById('athlete-list');
  const achievementList = document.getElementById('achievement-list');
  const status = document.getElementById('athlete-status');

  if (!athleteList || !achievementList || typeof Backend === 'undefined') return;
  if (!Backend.isConfigured) return;

  // Үйлдлийн дараа гарын товчлуурын фокусыг мэдэгдэл рүү шилжүүлэхэд хэрэгтэй.
  status.tabIndex = -1;

  // Бүртгэлгүй үед харуулах «удахгүй» картууд (дахин зурахад ашиглана).
  const athleteEmpty = athleteList.firstElementChild?.cloneNode(true);
  const achievementEmpty = achievementList.firstElementChild?.cloneNode(true);

  let adminMode = false;
  let athletes = [];
  let achievements = [];

  /* Туслах функцууд -------------------------------------------------------- */

  // Бичвэрийг textContent-оор оруулдаг тул серверээс ирсэн тэмдэгт HTML болж ажиллахгүй.
  function createElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null && text !== '') element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function createButton(label, className, onClick) {
    const button = createElement('button', label, className);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function createLink(label, href, className) {
    const link = createElement('a', label, className);
    link.href = href;
    return link;
  }

  const badge = (text, kind) => createElement('span', text, 'admin-badge ' + kind);
  const formatDate = (isoDate) => (isoDate ? isoDate.replaceAll('-', '.') : '');
  const athleteName = (id) =>
    athletes.find((athlete) => athlete.id === id)?.full_name || '(устгагдсан тамирчин)';

  function showStatus(text, { error = false } = {}) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  // Товч дарагдсан үед давхар дарахаас сэргийлж түр идэвхгүй болгоно.
  async function withBusy(button, task) {
    button.disabled = true;
    try {
      return await task();
    } finally {
      button.disabled = false;
    }
  }

  /* Тамирчны карт ---------------------------------------------------------- */

  function createRanks(athlete) {
    const rows = [
      ['Дотоодын цол', athlete.national_title],
      ['Дотоодын чансаа', athlete.national_rating],
      ['Олон улсын цол', athlete.intl_title],
      ['Олон улсын чансаа', athlete.intl_rating],
    ].filter(([, value]) => value != null && value !== '');

    if (rows.length === 0) return null; // Цол, чансаагүй бол хэсгийг бүхэлд нь харуулахгүй.

    const list = createElement('dl', null, 'athlete-ranks');
    for (const [label, value] of rows) {
      list.append(createElement('dt', label), createElement('dd', String(value)));
    }
    return list;
  }

  function createAthleteCard(athlete, athleteAchievements) {
    const card = createElement('article', null, 'athlete-card');
    card.id = 'athlete-' + athlete.id;
    if (adminMode && !athlete.is_published) card.classList.add('is-draft');

    const photo = createElement('div', null, 'athlete-photo');
    photo.setAttribute('aria-hidden', 'true');
    const placeholder = document.createElement('img');
    placeholder.src = 'assets/pieces/blueP.svg';
    placeholder.alt = '';
    placeholder.className = 'athlete-photo-placeholder';
    photo.append(placeholder);
    if (athlete.photo_path) {
      Backend.photoUrl(athlete.photo_path, { asAdmin: adminMode })
        .then((url) => {
          const image = document.createElement('img');
          image.src = url;
          image.alt = '';
          image.width = 96;
          image.height = 96;
          photo.replaceChildren(image);
        })
        .catch(() => {}); // Зураг ачаалагдаагүй бол дүрс хэвээр үлдэнэ.
    }

    const heading = document.createElement('div');
    heading.append(createElement('h3', athlete.full_name));
    const meta = [
      athlete.grade && `${athlete.grade} анги`,
      athlete.class_teacher && `Анги хариуцсан багш: ${athlete.class_teacher}`,
    ].filter(Boolean);
    if (meta.length > 0) {
      const paragraph = createElement('p', null, 'athlete-meta');
      meta.forEach((line, index) => {
        if (index > 0) paragraph.append(document.createElement('br'));
        paragraph.append(line);
      });
      heading.append(paragraph);
    }

    card.append(photo, heading);

    const ranks = createRanks(athlete);
    if (ranks) card.append(ranks);

    // Картанд гол амжилтууд (админ тамирчны маягтад бичдэг); байхгүй бол сүүлийн 3 амжилт.
    const featured = athleteAchievements.filter((achievement) => achievement.is_featured);
    const highlights = (featured.length > 0 ? featured : athleteAchievements).slice(0, 3);
    if (highlights.length > 0) {
      const block = createElement('div', null, 'athlete-highlights');
      block.append(createElement('p', 'Гол амжилт', 'athlete-highlights-title'));
      const results = createElement('ul', null, 'athlete-results');
      for (const achievement of highlights) {
        const item = document.createElement('li');
        item.append(createElement('strong', achievement.result), ` — ${achievement.tournament_name}`);
        if (achievement.event_date) item.append(`, ${achievement.event_date.slice(0, 4)}`);
        if (adminMode && !achievement.is_published) item.append(' (ноорог)');
        results.append(item);
      }
      block.append(results);
      card.append(block);
    }

    if (adminMode) card.append(createAthleteTools(athlete));
    return card;
  }

  /* Амжилтын карт ---------------------------------------------------------- */

  function createAchievementCard(achievement) {
    const card = createElement('article', null, 'achievement-card');
    if (adminMode && !achievement.is_published) card.classList.add('is-draft');
    card.append(
      createElement('span', achievement.result, 'achievement-result'),
      createElement('h3', athleteName(achievement.athlete_id)),
      createElement('p', achievement.tournament_name, 'achievement-event'),
    );
    if (achievement.event_date) {
      const time = createElement('time', formatDate(achievement.event_date));
      time.dateTime = achievement.event_date;
      card.append(time);
    }
    if (achievement.description) card.append(createElement('p', achievement.description));
    if (adminMode) card.append(createAchievementTools(achievement));
    return card;
  }

  /* Админы товчнууд -------------------------------------------------------- */

  function createAthleteTools(athlete) {
    const tools = createElement('div', null, 'card-admin');

    const badges = createElement('p', null, 'admin-badges');
    badges.append(
      athlete.is_published ? badge('Нийтэлсэн', 'is-live') : badge('Ноорог', 'is-draft'),
    );
    if (!athlete.consent_info) badges.append(badge('Зөвшөөрөл аваагүй', 'is-warn'));
    if (athlete.photo_path && !athlete.consent_photo) {
      badges.append(badge('Зураг олон нийтэд харагдахгүй', 'is-warn'));
    }

    const actions = createElement('div', null, 'card-admin-actions');
    actions.append(
      createLink('Засах', `admin.html#athlete=${athlete.id}`, 'admin-button'),
      createButton(athlete.is_published ? 'Нийтлэхээ болих' : 'Нийтлэх', 'admin-button', (event) =>
        withBusy(event.currentTarget, () => togglePublished('athletes', athlete)),
      ),
      createLink('Амжилт нэмэх', `admin.html#new-achievement=${athlete.id}`, 'admin-button'),
      createButton('Устгах', 'admin-button is-danger', () => deleteAthlete(athlete)),
    );

    tools.append(badges, actions);
    return tools;
  }

  function createAchievementTools(achievement) {
    const tools = createElement('div', null, 'card-admin');
    const athlete = athletes.find((candidate) => candidate.id === achievement.athlete_id);

    const badges = createElement('p', null, 'admin-badges');
    badges.append(
      achievement.is_published ? badge('Нийтэлсэн', 'is-live') : badge('Ноорог', 'is-draft'),
    );
    if (achievement.is_published && athlete && !athlete.is_published) {
      badges.append(badge('Тамирчин нийтлэгдээгүй тул харагдахгүй', 'is-warn'));
    }

    const actions = createElement('div', null, 'card-admin-actions');
    actions.append(
      createLink('Засах', `admin.html#achievement=${achievement.id}`, 'admin-button'),
      createButton(
        achievement.is_published ? 'Нийтлэхээ болих' : 'Нийтлэх',
        'admin-button',
        (event) => withBusy(event.currentTarget, () => togglePublished('achievements', achievement)),
      ),
      createButton('Устгах', 'admin-button is-danger', () => deleteAchievement(achievement)),
    );

    tools.append(badges, actions);
    return tools;
  }

  // Хэсгийн гарчгийн доор «Шинэ … нэмэх» товч.
  function addSectionButton(list, label, href) {
    const bar = createElement('div', null, 'section-admin');
    bar.append(createLink(label, href, 'button gold'));
    list.before(bar);
  }

  async function togglePublished(table, record) {
    const publish = !record.is_published;
    if (table === 'athletes' && publish && !record.consent_info) {
      return showStatus(
        `«${record.full_name}»-г нийтлэхийн өмнө «Засах» дээр дарж мэдээлэл нийтлэх зөвшөөрлийг тэмдэглэнэ үү.`,
        { error: true },
      );
    }
    try {
      await Backend.update(table, record.id, { is_published: publish });
      await load();
      showStatus(
        publish ? 'Нийтлэгдлээ. Зочид одоо харна.' : 'Нийтлэхээ болилоо. Зочдод харагдахгүй.',
      );
    } catch (error) {
      showStatus(error.message, { error: true });
    }
  }

  /* Устгахыг баталгаажуулах цонх ------------------------------------------- */

  let confirmDialog = null;

  function confirmDelete(text) {
    if (!confirmDialog) {
      confirmDialog = createElement('dialog', null, 'admin-dialog is-small');
      confirmDialog.setAttribute('aria-labelledby', 'confirm-title');
      confirmDialog.setAttribute('aria-describedby', 'confirm-text');
      const title = createElement('h2', 'Устгах уу?', 'as-h3');
      title.id = 'confirm-title';
      const message = createElement('p');
      message.id = 'confirm-text';
      const actions = createElement('div', null, 'admin-actions');
      actions.append(
        createElement('button', 'Тийм, устгах', 'admin-button is-danger'),
        createElement('button', 'Болих', 'admin-button'),
      );
      actions.querySelectorAll('button').forEach((button) => (button.type = 'button'));
      confirmDialog.append(title, message, actions);
      document.body.append(confirmDialog);
    }

    const [yes, no] = confirmDialog.querySelectorAll('button');
    confirmDialog.querySelector('#confirm-text').textContent = text;
    confirmDialog.showModal();
    no.focus(); // Санамсаргүй Enter дарахад устгахгүй.

    return new Promise((resolve) => {
      const finish = (answer) => {
        yes.onclick = no.onclick = confirmDialog.oncancel = null;
        confirmDialog.close();
        resolve(answer);
      };
      yes.onclick = () => finish(true);
      no.onclick = () => finish(false);
      confirmDialog.oncancel = (event) => {
        event.preventDefault();
        finish(false);
      };
    });
  }

  async function deleteAthlete(athlete) {
    const count = achievements.filter((item) => item.athlete_id === athlete.id).length;
    const confirmed = await confirmDelete(
      `«${athlete.full_name}»-н бүртгэл` +
        (count ? `, түүний ${count} амжилт` : '') +
        (athlete.photo_path ? ' болон зураг' : '') +
        ' бүрмөсөн устана. Үүнийг буцаах боломжгүй.',
    );
    if (!confirmed) return;
    try {
      await Backend.remove('athletes', athlete.id);
      // Бүртгэл устсаны дараа зургийг цэвэрлэнэ; зураг устгаж чадаагүй ч бүртгэл устсан хэвээр.
      if (athlete.photo_path) await Backend.removePhoto(athlete.photo_path).catch(() => {});
      await load();
      showStatus(`«${athlete.full_name}» устгагдлаа.`);
      status.focus(); // Устгасан картын товч алга болсон тул фокусыг мэдэгдэл дээр тавина.
    } catch (error) {
      showStatus(error.message, { error: true });
    }
  }

  async function deleteAchievement(achievement) {
    const confirmed = await confirmDelete(
      `«${achievement.result} — ${achievement.tournament_name}» (${athleteName(achievement.athlete_id)}) амжилт бүрмөсөн устана. Үүнийг буцаах боломжгүй.`,
    );
    if (!confirmed) return;
    try {
      await Backend.remove('achievements', achievement.id);
      await load();
      showStatus('Амжилт устгагдлаа.');
      status.focus();
    } catch (error) {
      showStatus(error.message, { error: true });
    }
  }

  /* Ачаалах, зурах --------------------------------------------------------- */

  function render() {
    const byAthlete = new Map();
    for (const achievement of achievements) {
      if (!byAthlete.has(achievement.athlete_id)) byAthlete.set(achievement.athlete_id, []);
      byAthlete.get(achievement.athlete_id).push(achievement);
    }

    athleteList.replaceChildren(
      ...(athletes.length > 0
        ? athletes.map((athlete) => createAthleteCard(athlete, byAthlete.get(athlete.id) || []))
        : [athleteEmpty]),
    );

    // Зочинд зөвхөн харагдаж буй тамирчны амжилт; админд бүгд.
    const shown = adminMode
      ? achievements
      : achievements.filter((item) => athletes.some((athlete) => athlete.id === item.athlete_id));
    achievementList.replaceChildren(
      ...(shown.length > 0 ? shown.map(createAchievementCard) : [achievementEmpty]),
    );
  }

  async function load() {
    if (adminMode) {
      [athletes, achievements] = await Promise.all([
        Backend.list('athletes', 'select=*&order=full_name.asc'),
        Backend.list('achievements', 'select=*&order=event_date.desc.nullslast,created_at.desc'),
      ]);
    } else {
      [athletes, achievements] = await Promise.all([
        Backend.readPublic('public_athletes', 'select=*&order=full_name.asc'),
        Backend.readPublic('public_achievements', 'select=*&order=event_date.desc.nullslast'),
      ]);
    }
    render();
  }

  // Нэвтэрсэн хэрэглэгч үнэхээр админ эсэхийг серверээс асууна.
  async function checkAdmin() {
    if (!Backend.hasSession) return false;
    try {
      return await Backend.isAdmin();
    } catch {
      return false;
    }
  }

  async function start() {
    showStatus('Тамирчдын мэдээллийг ачаалж байна…');
    adminMode = await checkAdmin();
    if (Backend.hasSession && !adminMode) {
      window.dispatchEvent(new Event('club:not-admin'));
    }
    if (adminMode) {
      addSectionButton(athleteList, 'Шинэ тамирчин нэмэх', 'admin.html#new-athlete');
      addSectionButton(achievementList, 'Шинэ амжилт нэмэх', 'admin.html#new-achievement');
    }

    try {
      await load();
      if (adminMode && location.hash === '#saved') {
        showStatus('Өөрчлөлт хадгалагдлаа.');
        history.replaceState(null, '', location.pathname);
      } else {
        showStatus(
          adminMode
            ? 'Админ горим: ноорог болон нийтэлсэн бүх бүртгэл харагдаж байна. Зочид зөвхөн «Нийтэлсэн» бүртгэлийг харна.'
            : '',
        );
      }
    } catch (error) {
      // Алдааны үед «удахгүй» гэсэн анхны бичвэр хэвээр үлдэнэ.
      showStatus(
        adminMode
          ? error.message
          : 'Тамирчдын мэдээллийг одоогоор ачаалж чадсангүй. Хуудсыг дараа дахин нээж үзнэ үү.',
        { error: adminMode },
      );
    }
  }

  start();
})();
