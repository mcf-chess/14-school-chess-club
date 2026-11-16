/*
  Админ хэсэг (admin.html):
    1. Нэвтрэх, гарах
    2. Тамирчдын жагсаалт, хайлт
    3. Тамирчин нэмэх, засах, зураг солих, нийтлэх, устгах
    4. Тэмцээний амжилт нэмэх, засах, нийтлэх, устгах

  Энэ файл зөвхөн дэлгэцийг удирдана. Хэн юу өөрчилж чадахыг сервер шийднэ
  (supabase/schema.sql): админы жагсаалтад байхгүй хэрэглэгчийн хүсэлтийг сервер өөрөө
  татгалзана. Тиймээс энэ кодыг хөтөч дээр өөрчилсөн ч хамгаалалтыг тойрч чадахгүй.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const views = { setup: $('setup-view'), login: $('login-view'), app: $('app-view') };
  const statusLine = $('admin-status');
  const errorLine = $('admin-error');

  let athletes = []; // Серверээс ирсэн бүх тамирчин (ноорог орно)
  let achievements = [];

  /* Туслах функцууд -------------------------------------------------------- */

  function showView(name) {
    for (const [key, element] of Object.entries(views)) element.hidden = key !== name;
  }

  function showStatus(text) {
    errorLine.textContent = '';
    statusLine.textContent = text;
  }

  function showError(error) {
    statusLine.textContent = '';
    errorLine.textContent = error?.message || String(error);
    // Нэвтрэх хугацаа дууссан бол нэвтрэх дэлгэц рүү буцаана.
    if (error?.status === 401 && !Backend.hasSession) showView('login');
  }

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

  // Товч дарагдсан үед давхар дарахаас сэргийлж түр идэвхгүй болгоно.
  async function withBusy(button, task) {
    button.disabled = true;
    try {
      return await task();
    } finally {
      button.disabled = false;
    }
  }

  const emptyToNull = (value) => (value.trim() === '' ? null : value.trim());
  const athleteName = (id) =>
    athletes.find((athlete) => athlete.id === id)?.full_name || '(устгагдсан тамирчин)';

  /* Баталгаажуулах цонх ---------------------------------------------------- */

  const confirmDialog = $('confirm-dialog');

  function confirmDelete(text) {
    $('confirm-text').textContent = text;
    confirmDialog.showModal();
    $('confirm-no').focus(); // Санамсаргүй Enter дарахад устгахгүй.
    return new Promise((resolve) => {
      const finish = (answer) => {
        $('confirm-yes').onclick = $('confirm-no').onclick = confirmDialog.oncancel = null;
        confirmDialog.close();
        resolve(answer);
      };
      $('confirm-yes').onclick = () => finish(true);
      $('confirm-no').onclick = () => finish(false);
      confirmDialog.oncancel = (event) => {
        event.preventDefault();
        finish(false);
      };
    });
  }

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });

  /* 1. Нэвтрэх, гарах ------------------------------------------------------ */

  async function enterApp() {
    // Нэвтэрсэн ч админы жагсаалтад байхгүй бол самбарыг нээхгүй.
    if (!(await Backend.isAdmin())) {
      await Backend.signOut();
      showView('login');
      throw new Backend.BackendError(
        'Энэ хэрэглэгч админы жагсаалтад бүртгэгдээгүй байна. Сайтын эзэмшигчид хандана уу.',
      );
    }
    $('admin-email').textContent = Backend.email;
    showView('app');
    await reload();
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    showStatus('Нэвтэрч байна…');
    await withBusy(submit, async () => {
      try {
        await Backend.signIn(form.email.value.trim(), form.password.value);
        form.password.value = '';
        await enterApp();
        showStatus('Амжилттай нэвтэрлээ.');
      } catch (error) {
        showError(error);
      }
    });
  });

  $('sign-out').addEventListener('click', async () => {
    await Backend.signOut();
    athletes = [];
    achievements = [];
    $('athlete-rows').replaceChildren();
    $('achievement-rows').replaceChildren();
    showView('login');
    showStatus('Системээс гарлаа.');
  });

  /* Хэсэг солих (Тамирчид / Амжилт) ---------------------------------------- */

  const tabs = [$('tab-athletes'), $('tab-achievements')];

  function showPanel(tab, { focus = false } = {}) {
    tabs.forEach((item) => {
      const isActive = item === tab;
      item.setAttribute('aria-selected', String(isActive));
      item.tabIndex = isActive ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !isActive;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPanel(tab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      showPanel(tabs[(index + 1) % tabs.length], { focus: true });
    });
  });

  /* Өгөгдөл ачаалах -------------------------------------------------------- */

  async function reload() {
    [athletes, achievements] = await Promise.all([
      Backend.list('athletes', 'select=*&order=full_name.asc'),
      Backend.list('achievements', 'select=*&order=event_date.desc.nullslast,created_at.desc'),
    ]);
    renderAthletes();
    renderAchievementFilter();
    renderAchievements();
  }

  /* 2. Тамирчдын жагсаалт, хайлт ------------------------------------------- */

  function badge(text, kind) {
    return createElement('span', text, 'admin-badge ' + kind);
  }

  function renderAthletes() {
    const query = $('athlete-search').value.trim().toLowerCase();
    const visible = athletes.filter((athlete) =>
      [athlete.full_name, athlete.grade, athlete.class_teacher]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );

    $('athlete-count').textContent = query
      ? `${visible.length} тамирчин олдлоо (нийт ${athletes.length}).`
      : `Нийт ${athletes.length} тамирчин.`;

    if (visible.length === 0) {
      const empty = createElement(
        'li',
        athletes.length === 0
          ? 'Одоогоор тамирчин бүртгээгүй байна. «+ Шинэ тамирчин» товчоор нэмнэ үү.'
          : 'Хайлтад тохирох тамирчин олдсонгүй.',
        'admin-empty',
      );
      return $('athlete-rows').replaceChildren(empty);
    }

    $('athlete-rows').replaceChildren(
      ...visible.map((athlete) => {
        const row = createElement('li', null, 'admin-row');

        const info = document.createElement('div');
        info.append(createElement('strong', athlete.full_name));
        const details = [
          athlete.grade && `${athlete.grade} анги`,
          athlete.class_teacher && `Багш: ${athlete.class_teacher}`,
          athlete.national_title,
          athlete.national_rating != null && `Дотоод ${athlete.national_rating}`,
          athlete.intl_title,
          athlete.intl_rating != null && `Олон улс ${athlete.intl_rating}`,
        ].filter(Boolean);
        if (details.length > 0) info.append(createElement('p', details.join(' · '), 'admin-hint'));

        const badges = createElement('p', null, 'admin-badges');
        badges.append(
          athlete.is_published ? badge('Нийтэлсэн', 'is-live') : badge('Ноорог', 'is-draft'),
          athlete.consent_info
            ? badge('Зөвшөөрөлтэй', 'is-ok')
            : badge('Зөвшөөрөл аваагүй', 'is-warn'),
        );
        if (athlete.photo_path) {
          badges.append(
            athlete.consent_photo
              ? badge('Зураг нийтэлнэ', 'is-ok')
              : badge('Зураг нуугдсан', 'is-warn'),
          );
        }
        info.append(badges);

        const actions = createElement('div', null, 'admin-row-actions');
        actions.append(
          createButton('Засах', 'admin-button', () => openAthleteForm(athlete)),
          createButton(
            athlete.is_published ? 'Нийтлэхээ болих' : 'Нийтлэх',
            'admin-button',
            (event) => withBusy(event.currentTarget, () => togglePublished('athletes', athlete)),
          ),
          createButton('Устгах', 'admin-button is-danger', () => deleteAthlete(athlete)),
        );

        row.append(info, actions);
        return row;
      }),
    );
  }

  $('athlete-search').addEventListener('input', renderAthletes);

  async function togglePublished(table, record) {
    const publish = !record.is_published;
    if (table === 'athletes' && publish && !record.consent_info) {
      return showError(
        new Error(
          `«${record.full_name}»-г нийтлэхийн өмнө «Засах» дээр дарж мэдээлэл нийтлэх зөвшөөрлийг тэмдэглэнэ үү.`,
        ),
      );
    }
    try {
      await Backend.update(table, record.id, { is_published: publish });
      await reload();
      showStatus(
        publish ? 'Нийтлэгдлээ. Сайт дээр харагдана.' : 'Нийтлэхээ болилоо. Сайт дээр харагдахгүй.',
      );
    } catch (error) {
      showError(error);
    }
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
      await reload();
      showStatus(`«${athlete.full_name}» устгагдлаа.`);
    } catch (error) {
      showError(error);
    }
  }

  /* 3. Тамирчны бүртгэлийн цонх -------------------------------------------- */

  const athleteDialog = $('athlete-dialog');
  const athleteForm = $('athlete-form');
  const photoInput = $('athlete-photo');
  const photoPreview = $('photo-preview');
  const photoStatus = $('photo-status');

  const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // Сонгох файлын дээд хэмжээ
  const PHOTO_MAX_SIDE = 800; // Хадгалах зургийн урт талын дээд хэмжээ (пиксел)

  let editingAthlete = null; // Засаж буй бүртгэл; шинэ бол null
  let pendingPhoto = null; // Хадгалахад илгээх шинэ зураг (Blob)
  let removePhoto = false; // Хадгалахад одоогийн зургийг устгах эсэх
  let previewUrl = null;

  function setPreview(url) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Сонгосон зургийн урьдчилсан харагдац';
      photoPreview.replaceChildren(image);
    } else {
      const placeholder = createElement('span', '♟');
      placeholder.setAttribute('aria-hidden', 'true');
      photoPreview.replaceChildren(placeholder);
    }
    $('photo-remove').hidden = !url;
  }

  // Зургийг урт талаар нь 800 пиксел хүртэл жижигрүүлж JPEG болгоно.
  async function shrinkImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; // Тунгалаг дэвсгэртэй PNG-д цагаан дэвсгэр өгнө.
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('convert'))),
        'image/jpeg',
        0.85,
      );
    });
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    photoInput.value = ''; // Ижил файлыг дахин сонгох боломжтой байлгана.
    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      photoStatus.textContent =
        'Энэ төрлийн файлыг хүлээн авахгүй. JPEG, PNG эсвэл WebP зураг сонгоно уу.';
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      photoStatus.textContent = `Файл хэт том байна (${(file.size / 1024 / 1024).toFixed(1)} MB). 8 MB-аас бага зураг сонгоно уу.`;
      return;
    }
    try {
      pendingPhoto = await shrinkImage(file);
      removePhoto = false;
      setPreview(URL.createObjectURL(pendingPhoto));
      photoStatus.textContent = `Зураг сонгогдлоо (${Math.round(pendingPhoto.size / 1024)} KB). «Хадгалах» дарахад серверт хадгалагдана.`;
    } catch {
      photoStatus.textContent = 'Зургийг уншиж чадсангүй. Өөр зураг сонгож үзнэ үү.';
    }
  });

  $('photo-remove').addEventListener('click', () => {
    pendingPhoto = null;
    removePhoto = Boolean(editingAthlete?.photo_path);
    setPreview(null);
    photoStatus.textContent = removePhoto
      ? 'Зураг «Хадгалах» дарахад серверээс устана.'
      : 'Сонгосон зургийг хаслаа.';
  });

  // Зөвшөөрөлгүй бол «Сайтад нийтлэх»-ийг тэмдэглэх боломжгүй.
  function syncPublishCheckbox() {
    const consent = $('athlete-consent-info').checked;
    $('athlete-published').disabled = !consent;
    if (!consent) $('athlete-published').checked = false;
  }
  $('athlete-consent-info').addEventListener('change', syncPublishCheckbox);

  function openAthleteForm(athlete = null) {
    editingAthlete = athlete;
    pendingPhoto = null;
    removePhoto = false;
    athleteForm.reset();
    $('athlete-form-error').textContent = '';
    photoStatus.textContent = '';
    setPreview(null);
    $('athlete-dialog-title').textContent = athlete ? 'Тамирчны мэдээлэл засах' : 'Шинэ тамирчин';

    if (athlete) {
      for (const field of ['full_name', 'grade', 'class_teacher', 'national_title', 'intl_title']) {
        athleteForm[field].value = athlete[field] || '';
      }
      athleteForm.national_rating.value = athlete.national_rating ?? '';
      athleteForm.intl_rating.value = athlete.intl_rating ?? '';
      athleteForm.consent_info.checked = athlete.consent_info;
      athleteForm.consent_photo.checked = athlete.consent_photo;
      athleteForm.is_published.checked = athlete.is_published;
      if (athlete.photo_path) {
        photoStatus.textContent = 'Одоогийн зургийг ачаалж байна…';
        Backend.photoUrl(athlete.photo_path, { asAdmin: true })
          .then((url) => {
            // Энэ хооронд өөр зураг сонгосон эсвэл цонх хаагдсан бол хуучин зургийг тавихгүй.
            if (editingAthlete !== athlete || pendingPhoto || removePhoto)
              return URL.revokeObjectURL(url);
            setPreview(url);
            photoStatus.textContent = 'Одоогийн зураг.';
          })
          .catch(() => {
            photoStatus.textContent = 'Одоогийн зургийг ачаалж чадсангүй.';
          });
      }
    }
    syncPublishCheckbox();
    athleteDialog.showModal();
    athleteForm.full_name.focus();
  }

  $('add-athlete').addEventListener('click', () => openAthleteForm());

  function readRating(input, label) {
    if (input.value.trim() === '') return null;
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > 4000) {
      input.focus();
      throw new Error(`${label} 0–4000 хоорондох бүхэл тоо байх ёстой.`);
    }
    return value;
  }

  athleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('athlete-form-error');
    errorBox.textContent = '';

    let record;
    try {
      if (athleteForm.full_name.value.trim() === '') {
        athleteForm.full_name.focus();
        throw new Error('Овог нэрийг оруулна уу.');
      }
      record = {
        full_name: athleteForm.full_name.value.trim(),
        grade: emptyToNull(athleteForm.grade.value),
        class_teacher: emptyToNull(athleteForm.class_teacher.value),
        national_title: emptyToNull(athleteForm.national_title.value),
        national_rating: readRating(athleteForm.national_rating, 'Дотоодын чансаа'),
        intl_title: emptyToNull(athleteForm.intl_title.value),
        intl_rating: readRating(athleteForm.intl_rating, 'Олон улсын чансаа'),
        consent_info: athleteForm.consent_info.checked,
        consent_photo: athleteForm.consent_photo.checked,
        is_published: athleteForm.consent_info.checked && athleteForm.is_published.checked,
      };
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }

    await withBusy($('athlete-save'), async () => {
      try {
        // 1. Бүртгэлийг хадгална (шинэ бол id авна).
        let saved = editingAthlete
          ? await Backend.update('athletes', editingAthlete.id, record)
          : await Backend.insert('athletes', record);
        editingAthlete = saved; // Зураг дээр алдаа гарвал дахин «Хадгалах» дарахад давхар үүсэхгүй.

        // 2. Зургийн өөрчлөлт.
        let photoMessage = '';
        const oldPath = saved.photo_path;
        if (pendingPhoto) {
          const newPath = `${saved.id}/${Date.now()}.jpg`;
          await Backend.uploadPhoto(newPath, pendingPhoto);
          saved = await Backend.update('athletes', saved.id, { photo_path: newPath });
          if (oldPath) await Backend.removePhoto(oldPath).catch(() => {});
          pendingPhoto = null;
          photoMessage = ' Зураг амжилттай хадгалагдлаа.';
        } else if (removePhoto && oldPath) {
          saved = await Backend.update('athletes', saved.id, { photo_path: null });
          await Backend.removePhoto(oldPath).catch(() => {});
          removePhoto = false;
          photoMessage = ' Зураг устгагдлаа.';
        }

        athleteDialog.close();
        await reload();
        showStatus(
          `«${saved.full_name}» хадгалагдлаа — ${saved.is_published ? 'сайтад нийтлэгдсэн' : 'ноорог (олон нийтэд харагдахгүй)'}.${photoMessage}`,
        );
      } catch (error) {
        errorBox.textContent = error.message;
        if (error.status === 401) {
          athleteDialog.close();
          showError(error);
        }
      }
    });
  });

  athleteDialog.addEventListener('close', () => setPreview(null));

  /* 4. Тэмцээний амжилт ---------------------------------------------------- */

  const achievementDialog = $('achievement-dialog');
  const achievementForm = $('achievement-form');
  let editingAchievement = null;

  function athleteOptions(select, { placeholder }) {
    const selected = select.value;
    const first = createElement('option', placeholder);
    first.value = '';
    select.replaceChildren(
      first,
      ...athletes.map((athlete) => {
        const option = createElement(
          'option',
          athlete.full_name + (athlete.is_published ? '' : ' (ноорог)'),
        );
        option.value = athlete.id;
        return option;
      }),
    );
    select.value = athletes.some((athlete) => athlete.id === selected) ? selected : '';
  }

  function renderAchievementFilter() {
    athleteOptions($('achievement-filter'), { placeholder: 'Бүх тамирчин' });
  }

  function renderAchievements() {
    const filter = $('achievement-filter').value;
    const visible = achievements.filter((item) => !filter || item.athlete_id === filter);

    $('achievement-count').textContent = filter
      ? `${visible.length} амжилт (нийт ${achievements.length}).`
      : `Нийт ${achievements.length} амжилт.`;

    if (visible.length === 0) {
      const empty = createElement(
        'li',
        athletes.length === 0
          ? 'Амжилт нэмэхийн өмнө «Тамирчид» хэсэгт тамирчнаа бүртгэнэ үү.'
          : 'Одоогоор амжилт бүртгээгүй байна. «+ Шинэ амжилт» товчоор нэмнэ үү.',
        'admin-empty',
      );
      return $('achievement-rows').replaceChildren(empty);
    }

    $('achievement-rows').replaceChildren(
      ...visible.map((item) => {
        const athlete = athletes.find((candidate) => candidate.id === item.athlete_id);
        const row = createElement('li', null, 'admin-row');

        const info = document.createElement('div');
        info.append(createElement('strong', `${item.result} — ${item.tournament_name}`));
        info.append(
          createElement(
            'p',
            [athleteName(item.athlete_id), item.event_date?.replaceAll('-', '.')]
              .filter(Boolean)
              .join(' · '),
            'admin-hint',
          ),
        );
        const badges = createElement('p', null, 'admin-badges');
        badges.append(
          item.is_published ? badge('Нийтэлсэн', 'is-live') : badge('Ноорог', 'is-draft'),
        );
        if (item.is_published && athlete && !athlete.is_published) {
          badges.append(badge('Тамирчин нийтлэгдээгүй тул харагдахгүй', 'is-warn'));
        }
        info.append(badges);

        const actions = createElement('div', null, 'admin-row-actions');
        actions.append(
          createButton('Засах', 'admin-button', () => openAchievementForm(item)),
          createButton(item.is_published ? 'Нийтлэхээ болих' : 'Нийтлэх', 'admin-button', (event) =>
            withBusy(event.currentTarget, () => togglePublished('achievements', item)),
          ),
          createButton('Устгах', 'admin-button is-danger', () => deleteAchievement(item)),
        );

        row.append(info, actions);
        return row;
      }),
    );
  }

  $('achievement-filter').addEventListener('change', renderAchievements);

  function openAchievementForm(item = null) {
    if (athletes.length === 0) {
      return showError(new Error('Амжилт нэмэхийн өмнө «Тамирчид» хэсэгт тамирчнаа бүртгэнэ үү.'));
    }
    editingAchievement = item;
    achievementForm.reset();
    $('achievement-form-error').textContent = '';
    $('achievement-dialog-title').textContent = item ? 'Амжилт засах' : 'Шинэ амжилт';
    athleteOptions(achievementForm.athlete_id, { placeholder: 'Тамирчин сонгоно уу' });

    if (item) {
      achievementForm.athlete_id.value = item.athlete_id;
      achievementForm.tournament_name.value = item.tournament_name;
      achievementForm.result.value = item.result;
      achievementForm.event_date.value = item.event_date || '';
      achievementForm.description.value = item.description || '';
      achievementForm.is_published.checked = item.is_published;
    } else {
      achievementForm.athlete_id.value = $('achievement-filter').value;
    }
    achievementDialog.showModal();
    achievementForm.athlete_id.focus();
  }

  $('add-achievement').addEventListener('click', () => openAchievementForm());

  achievementForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('achievement-form-error');
    errorBox.textContent = '';

    const required = [
      [achievementForm.athlete_id, 'Тамирчнаа сонгоно уу.'],
      [achievementForm.tournament_name, 'Тэмцээний нэрийг оруулна уу.'],
      [achievementForm.result, 'Үр дүнг оруулна уу.'],
    ];
    for (const [field, text] of required) {
      if (field.value.trim() === '') {
        field.focus();
        errorBox.textContent = text;
        return;
      }
    }

    const record = {
      athlete_id: achievementForm.athlete_id.value,
      tournament_name: achievementForm.tournament_name.value.trim(),
      result: achievementForm.result.value.trim(),
      event_date: achievementForm.event_date.value || null,
      description: emptyToNull(achievementForm.description.value),
      is_published: achievementForm.is_published.checked,
    };

    await withBusy($('achievement-save'), async () => {
      try {
        if (editingAchievement) await Backend.update('achievements', editingAchievement.id, record);
        else await Backend.insert('achievements', record);
        achievementDialog.close();
        await reload();
        showStatus(
          `Амжилт хадгалагдлаа — ${record.is_published ? 'нийтлэгдсэн' : 'ноорог (олон нийтэд харагдахгүй)'}.`,
        );
      } catch (error) {
        errorBox.textContent = error.message;
        if (error.status === 401) {
          achievementDialog.close();
          showError(error);
        }
      }
    });
  });

  async function deleteAchievement(item) {
    const confirmed = await confirmDelete(
      `«${item.result} — ${item.tournament_name}» (${athleteName(item.athlete_id)}) амжилт бүрмөсөн устана. Үүнийг буцаах боломжгүй.`,
    );
    if (!confirmed) return;
    try {
      await Backend.remove('achievements', item.id);
      await reload();
      showStatus('Амжилт устгагдлаа.');
    } catch (error) {
      showError(error);
    }
  }

  /* Эхлүүлэх --------------------------------------------------------------- */

  if (typeof Backend === 'undefined' || !Backend.isConfigured) {
    showView('setup');
  } else if (Backend.hasSession) {
    // Хуудсыг дахин ачаалсан үед өмнөх нэвтрэлтийг сервертэй дахин шалгана.
    showStatus('Нэвтрэлтийг шалгаж байна…');
    enterApp()
      .then(() => showStatus(''))
      .catch((error) => {
        showView('login');
        showError(error);
      });
  } else {
    showView('login');
  }
})();
