/*
  Тамирчид ба тэмцээний амжилтыг серверээс уншиж харуулна (athletes.html).

  Сервер зөвхөн НИЙТЭЛСЭН бөгөөд ЗӨВШӨӨРӨЛ БАТАЛГААЖСАН бүртгэлийг буцаадаг
  (supabase/schema.sql дахь public_athletes, public_achievements харагдац).
  Ноорог болон зөвшөөрөлгүй мэдээлэл хөтөч рүү огт ирэхгүй.

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

  // Бичвэрийг textContent-оор оруулдаг тул серверээс ирсэн тэмдэгт HTML болж ажиллахгүй.
  function createElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null && text !== '') element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  const formatDate = (isoDate) => (isoDate ? isoDate.replaceAll('-', '.') : '');

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

  function createAthleteCard(athlete, achievements) {
    const card = createElement('article', null, 'athlete-card');

    const photo = createElement('div', null, 'athlete-photo');
    photo.setAttribute('aria-hidden', 'true');
    photo.textContent = '♟';
    if (athlete.photo_path) {
      Backend.photoUrl(athlete.photo_path)
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

    if (achievements.length > 0) {
      const results = createElement('ul', null, 'athlete-results');
      for (const achievement of achievements) {
        const item = document.createElement('li');
        item.append(
          createElement('strong', achievement.result),
          ` — ${achievement.tournament_name}`,
        );
        results.append(item);
      }
      card.append(results);
    }

    return card;
  }

  /* Амжилтын карт ---------------------------------------------------------- */

  function createAchievementCard(achievement, athleteName) {
    const card = createElement('article', null, 'achievement-card');
    card.append(
      createElement('span', achievement.result, 'achievement-result'),
      createElement('h3', athleteName),
      createElement('p', achievement.tournament_name, 'achievement-event'),
    );
    if (achievement.event_date) {
      const time = createElement('time', formatDate(achievement.event_date));
      time.dateTime = achievement.event_date;
      card.append(time);
    }
    if (achievement.description) card.append(createElement('p', achievement.description));
    return card;
  }

  /* Ачаалах ---------------------------------------------------------------- */

  async function load() {
    status.textContent = 'Тамирчдын мэдээллийг ачаалж байна…';
    try {
      const [athletes, achievements] = await Promise.all([
        Backend.readPublic('public_athletes', 'select=*&order=full_name.asc'),
        Backend.readPublic('public_achievements', 'select=*&order=event_date.desc.nullslast'),
      ]);
      status.textContent = '';

      const byAthlete = new Map();
      for (const achievement of achievements) {
        if (!byAthlete.has(achievement.athlete_id)) byAthlete.set(achievement.athlete_id, []);
        byAthlete.get(achievement.athlete_id).push(achievement);
      }

      if (athletes.length > 0) {
        athleteList.replaceChildren(
          ...athletes.map((athlete) => createAthleteCard(athlete, byAthlete.get(athlete.id) || [])),
        );
      }

      const names = new Map(athletes.map((athlete) => [athlete.id, athlete.full_name]));
      const cards = achievements
        .filter((achievement) => names.has(achievement.athlete_id))
        .map((achievement) =>
          createAchievementCard(achievement, names.get(achievement.athlete_id)),
        );
      if (cards.length > 0) achievementList.replaceChildren(...cards);
    } catch {
      // Алдааны үед «удахгүй» гэсэн анхны бичвэр хэвээр үлдэнэ.
      status.textContent =
        'Тамирчдын мэдээллийг одоогоор ачаалж чадсангүй. Хуудсыг дараа дахин нээж үзнэ үү.';
    }
  }

  load();
})();
