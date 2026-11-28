/*
  Админ хэсэг (admin.html):
    1. Нэвтрэх, гарах
    2. Тамирчдын жагсаалт, хайлт
    3. Тамирчин нэмэх, засах, зураг солих, нийтлэх, устгах
    4. Тэмцээний амжилт нэмэх, засах, нийтлэх, устгах
    5. Хүүхдийн бүртгэл, төлбөр (нэг төлбөр = 8 хичээл)
    6. Ирцийн бүртгэл

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
  let registrations = []; // Эцэг эхийн онлайн бүртгэл
  let payments = []; // Баталгаажсан төлбөр (нэг нь ихэвчлэн 8 хичээл)
  let sessions = []; // Хичээлүүд (ээлж + өдөр)
  let attendance = []; // Ирцийн бичлэг

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

  function confirmDelete(text, { title = 'Устгах уу?', yes = 'Тийм, устгах' } = {}) {
    $('confirm-title').textContent = title;
    $('confirm-yes').textContent = yes;
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
    openFromSiteLink();
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
    registrations = [];
    payments = [];
    sessions = [];
    attendance = [];
    $('att-grid').replaceChildren();
    $('att-shift-tabs').replaceChildren();
    $('reg-rows').replaceChildren();
    $('shift-tabs').replaceChildren();
    showView('login');
    showStatus('Системээс гарлаа.');
  });

  /* Хэсэг солих (Тамирчид / Амжилт) ---------------------------------------- */

  const tabs = [$('tab-athletes'), $('tab-achievements'), $('tab-registrations'), $('tab-attendance')];

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
      const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
      showPanel(tabs[(index + step) % tabs.length], { focus: true });
    });
  });

  /* Өгөгдөл ачаалах -------------------------------------------------------- */

  async function reload() {
    [athletes, achievements, registrations, payments, sessions, attendance] = await Promise.all([
      Backend.list('athletes', 'select=*&order=full_name.asc'),
      Backend.list('achievements', 'select=*&order=event_date.desc.nullslast,created_at.desc'),
      Backend.list('registrations', 'select=*&order=created_at.desc'),
      Backend.list('payments', 'select=*&order=confirmed_at.asc'),
      Backend.list('class_sessions', 'select=*&order=class_date.asc'),
      Backend.list('attendance', 'select=session_id,registration_id,status'),
    ]);
    renderAthletes();
    renderAchievementFilter();
    renderAchievements();
    renderRegistrations();
    renderAttendance();
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

  /* Гол амжилтууд (тамирчны маягт дахь 3 мөр) ------------------------------ */

  const HIGHLIGHT_LIMIT = 3;
  let editingHighlights = []; // Маягт нээгдэх үеийн гол амжилтууд (мөрийн дарааллаар)

  const highlightFields = (index) => ({
    tournament: $(`highlight-${index + 1}-tournament`),
    result: $(`highlight-${index + 1}-result`),
    date: $(`highlight-${index + 1}-date`),
  });

  // Тамирчны гол амжилтууд: шинэ огноотой нь эхэнд.
  function featuredOf(athleteId) {
    return achievements.filter((item) => item.athlete_id === athleteId && item.is_featured);
  }

  function fillHighlights(athlete) {
    editingHighlights = athlete ? featuredOf(athlete.id).slice(0, HIGHLIGHT_LIMIT) : [];
    for (let index = 0; index < HIGHLIGHT_LIMIT; index += 1) {
      const fields = highlightFields(index);
      const item = editingHighlights[index];
      fields.tournament.value = item?.tournament_name || '';
      fields.result.value = item?.result || '';
      fields.date.value = item?.event_date || '';
    }
  }

  // Мөр бүрийг уншина. Тэмцээн, үр дүнгийн аль нэгийг л бөглөсөн бол алдаа заана.
  function readHighlights() {
    const rows = [];
    for (let index = 0; index < HIGHLIGHT_LIMIT; index += 1) {
      const fields = highlightFields(index);
      const row = {
        tournament_name: fields.tournament.value.trim(),
        result: fields.result.value.trim(),
        event_date: fields.date.value || null,
      };
      const filled = row.tournament_name || row.result || row.event_date;
      if (filled && !row.tournament_name) {
        fields.tournament.focus();
        throw new Error(`${index + 1}-р гол амжилтын тэмцээний нэрийг оруулна уу.`);
      }
      if (filled && !row.result) {
        fields.result.focus();
        throw new Error(`${index + 1}-р гол амжилтын үр дүнг оруулна уу (жишээ нь «1-р байр»).`);
      }
      rows.push(filled ? row : null);
    }
    return rows;
  }

  /*
    Мөр бүрийг хуучин гол амжилттай нь харьцуулна:
      бөглөсөн + өмнө байсан  → засна
      бөглөсөн + шинэ         → «гол амжилт» болгон нэмнэ
      хоосолсон + өмнө байсан → картнаас хасна (амжилт өөрөө жагсаалтад үлдэнэ)
  */
  async function saveHighlights(athleteId, rows) {
    let changed = 0;
    for (let index = 0; index < HIGHLIGHT_LIMIT; index += 1) {
      const row = rows[index];
      const previous = editingHighlights[index];
      if (row && previous) {
        const same =
          row.tournament_name === previous.tournament_name &&
          row.result === previous.result &&
          row.event_date === (previous.event_date || null);
        if (!same) {
          editingHighlights[index] = await Backend.update('achievements', previous.id, row);
          changed += 1;
        }
      } else if (row) {
        // Хадгалсан мөрийг санана: дараагийн мөр дээр алдаа гараад дахин хадгалахад давхардахгүй.
        editingHighlights[index] = await Backend.insert('achievements', {
          ...row,
          athlete_id: athleteId,
          is_featured: true,
          // Тамирчин нийтлэгдээгүй бол сайтад харагдахгүй (supabase/schema.sql).
          is_published: true,
        });
        changed += 1;
      } else if (previous) {
        await Backend.update('achievements', previous.id, { is_featured: false });
        editingHighlights[index] = undefined;
        changed += 1;
      }
    }
    editingHighlights = [];
    return changed;
  }

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
    fillHighlights(athlete);
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
    let highlights;
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
      highlights = readHighlights();
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

        // 3. Гол амжилтууд.
        const highlightCount = await saveHighlights(saved.id, highlights);
        const highlightMessage = highlightCount ? ' Гол амжилтууд шинэчлэгдлээ.' : '';

        savedFromSiteLink = true;
        athleteDialog.close();
        await reload();
        showStatus(
          `«${saved.full_name}» хадгалагдлаа — ${saved.is_published ? 'сайтад нийтлэгдсэн' : 'ноорог (олон нийтэд харагдахгүй)'}.${photoMessage}${highlightMessage}`,
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
        if (item.is_featured) badges.append(badge('Гол амжилт', 'is-ok'));
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
      achievementForm.is_featured.checked = Boolean(item.is_featured);
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
      is_featured: achievementForm.is_featured.checked,
    };

    // Нэг тамирчинд 3-аас олон гол амжилт байвал карт ачаалалтай болно.
    const otherFeatured = featuredOf(record.athlete_id).filter(
      (item) => item.id !== editingAchievement?.id,
    );
    if (record.is_featured && otherFeatured.length >= HIGHLIGHT_LIMIT) {
      achievementForm.is_featured.focus();
      errorBox.textContent = `${athleteName(record.athlete_id)} аль хэдийн ${HIGHLIGHT_LIMIT} гол амжилттай. Эхлээд аль нэгийг нь хасна уу.`;
      return;
    }

    await withBusy($('achievement-save'), async () => {
      try {
        if (editingAchievement) await Backend.update('achievements', editingAchievement.id, record);
        else await Backend.insert('achievements', record);
        savedFromSiteLink = true;
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

  /* 5. Бүртгэл, төлбөр (8 хичээлийн багц) ---------------------------------- */

  /*
    Нэг төлбөр = 8 хичээл (payments.lessons). Ирц бүртгэсэн хичээл бүр (ирсэн, тасалсан,
    чөлөөтэй аль нь ч) хүүхдийн хичээлээс нэгийг хасна. Үлдсэн нь 0 болоход дараагийн
    төлбөр төлөх ёстой.
  */
  const STATUSES = ['Шинэ', 'Идэвхтэй', 'Түр зогссон', 'Гарсан'];
  const FEES = (typeof CLUB !== 'undefined' && CLUB.feeBySchool) || { 14: 100000, other: 250000 };
  const LESSONS_PER_PAYMENT = 8;
  const LOW_LESSONS = 2; // Ийм буюу цөөн хичээл үлдвэл «Төлбөр» товч гарна.
  const SHIFT_ORDER = (typeof CLUB !== 'undefined' && CLUB.slots?.length
    ? CLUB.slots.map((slot) => `${slot.start}–${slot.end}`)
    : ['10:00–11:00', '11:00–12:00', '12:00–13:30', '14:00–16:00']);
  const SHIFT_CAPACITY = (typeof CLUB !== 'undefined' && CLUB.capacity) || 26;
  // 2026-11-28-ны хичээл хуучин хуваариар (10:00–11:30 гэх мэт) бүртгэгдсэн. Журналд огноогоор нь харуулна.
  const isLegacySession = (session) => !SHIFT_ORDER.includes(session.shift);


  const today = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
  const dateLabel = (iso) => (iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '');
  const money = (n) => `${Number(n).toLocaleString('en-US')}₮`;
  const ageOf = (birth) => {
    const [ty, tm, td] = today().split('-').map(Number);
    const [by, bm, bd] = birth.split('-').map(Number);
    return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  };
  // Эцэг эхэд зааварласан гүйлгээний утга: хүүхдийн овог нэр + утас.
  const transferRef = (r) => `${r.child_name} ${r.parent_phone}`;
  const byName = (a, b) => a.child_name.localeCompare(b.child_name, 'mn');

  const paymentsOf = (r) =>
    payments
      .filter((p) => p.registration_id === r.id)
      .sort((x, y) => (x.confirmed_at || '').localeCompare(y.confirmed_at || ''));
  const boughtOf = (r) => paymentsOf(r).reduce((sum, p) => sum + (p.lessons || LESSONS_PER_PAYMENT), 0);
  const usedOf = (r) => attendance.filter((a) => a.registration_id === r.id).length;
  const leftOf = (r) => boughtOf(r) - usedOf(r);
  const hasLessons = (r) => leftOf(r) > 0;
  const needsPayment = (r) => leftOf(r) <= LOW_LESSONS;

  /* Ээлжийн товч (бүртгэл, ирц хоёуланд) */

  function shiftButton(shift, selected, lines, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shift-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    button.append(createElement('strong', shift));
    lines.forEach(([text, className]) => button.append(createElement('span', text, className || '')));
    button.addEventListener('click', onClick);
    return button;
  }

  /* Бүртгэлийн хүснэгт ---------------------------------------------------- */

  let currentShift = SHIFT_ORDER[0];
  const showLeft = () => $('reg-left').checked;
  const inShift = (shift) =>
    registrations.filter((r) => r.shift === shift && (showLeft() || r.status !== 'Гарсан'));

  function renderShiftTabs() {
    $('shift-tabs').replaceChildren(
      ...SHIFT_ORDER.map((shift) => {
        const list = inShift(shift);
        const ok = list.filter(hasLessons).length;
        const due = list.length - ok;
        const seats = registrations.filter((r) => r.shift === shift && r.status !== 'Гарсан').length;
        return shiftButton(
          shift,
          shift === currentShift,
          [
            [`${seats}/${SHIFT_CAPACITY} хүүхэд`, seats >= SHIFT_CAPACITY ? 'is-due' : ''],
            [`Төлсөн ${ok}, төлөх ${due}`, due > 0 ? 'is-due' : ''],
          ],
          () => {
            currentShift = shift;
            renderRegistrations();
          },
        );
      }),
    );
  }

  function visibleRegistrations() {
    const query = $('reg-search').value.trim().toLowerCase();
    // Хайлт бичсэн бол бүх ээлжээс хайна.
    const base = query
      ? registrations.filter((r) => showLeft() || r.status !== 'Гарсан')
      : inShift(currentShift);
    return base
      .filter((r) => !$('reg-unpaid').checked || needsPayment(r))
      .filter(
        (r) =>
          !query ||
          [r.child_name, r.parent_name, r.parent_phone].some((v) => (v || '').toLowerCase().includes(query)),
      )
      .sort(byName);
  }

  function paymentCell(r) {
    const td = document.createElement('td');
    const bought = boughtOf(r);
    const left = leftOf(r);
    if (bought === 0) {
      td.append(createElement('span', 'Төлөөгүй', 'pay-pill is-unpaid'), createElement('small', money(r.monthly_fee)));
    } else if (left <= 0) {
      td.append(
        createElement('span', 'Төлөх', 'pay-pill is-unpaid'),
        createElement('small', left < 0 ? `${-left} хичээл өртэй` : '8 хичээл дууссан'),
      );
    } else {
      td.append(
        createElement('span', 'Төлсөн', `pay-pill ${left <= LOW_LESSONS ? 'is-low' : 'is-paid'}`),
        createElement('small', `${left} хичээл үлдсэн`),
      );
    }
    return td;
  }

  function renderRegistrations() {
    renderShiftTabs();
    const visible = visibleRegistrations();
    const query = $('reg-search').value.trim();

    if (visible.length === 0) {
      const tr = document.createElement('tr');
      const td = createElement(
        'td',
        registrations.length === 0
          ? 'Одоогоор бүртгэл ирээгүй байна.'
          : query
            ? 'Хайлтад тохирох хүүхэд олдсонгүй.'
            : 'Энэ ээлжид харуулах хүүхэд алга.',
        'reg-empty',
      );
      td.colSpan = 7;
      tr.append(td);
      return $('reg-rows').replaceChildren(tr);
    }

    $('reg-rows').replaceChildren(
      ...visible.map((r, i) => {
        const tr = document.createElement('tr');
        if (r.status === 'Гарсан' || r.status === 'Түр зогссон') tr.className = 'is-inactive';

        const name = document.createElement('td');
        name.append(createElement('strong', r.child_name));
        const sub = [];
        if (query) sub.push(r.shift);
        if (r.school_type === 'other') sub.push('Бусад сургууль');
        if (r.status !== 'Идэвхтэй') sub.push(r.status);
        if (sub.length) name.append(createElement('small', sub.join(', ')));

        const phone = document.createElement('td');
        const link = createElement('a', r.parent_phone);
        link.href = 'tel:+976' + r.parent_phone;
        phone.append(link, createElement('small', r.parent_name));

        const actions = createElement('td', null, 'reg-actions');
        if (needsPayment(r)) {
          actions.append(createButton('Төлбөр', 'button gold small', () => openPaymentForm(r)));
        }
        actions.append(createButton('Засах', 'admin-button small', () => openRegistrationForm(r)));

        tr.append(
          createElement('td', String(i + 1), 'reg-num'),
          name,
          createElement('td', r.school_grade || ''),
          createElement('td', r.birth_date ? String(ageOf(r.birth_date)) : ''),
          phone,
          paymentCell(r),
          actions,
        );
        return tr;
      }),
    );
  }

  $('reg-search').addEventListener('input', renderRegistrations);
  $('reg-unpaid').addEventListener('change', renderRegistrations);
  $('reg-left').addEventListener('change', renderRegistrations);

  /* Төлбөр баталгаажуулах цонх */

  const paymentDialog = $('payment-dialog');
  const paymentForm = $('payment-form');
  let paymentTarget = null;

  function openPaymentForm(r) {
    paymentTarget = r;
    paymentForm.reset();
    $('payment-form-error').textContent = '';
    const left = leftOf(r);
    $('payment-who').textContent =
      `${r.child_name}, ээлж ${r.shift}. ` +
      (boughtOf(r) === 0 ? 'Анхны төлбөр.' : `Одоо ${Math.max(left, 0)} хичээл үлдсэн.`);
    $('payment-lessons').value = LESSONS_PER_PAYMENT;
    $('payment-amount').value = r.monthly_fee;
    $('payment-date').value = today();
    $('payment-ref').value = transferRef(r);
    paymentDialog.showModal();
    $('payment-date').focus();
  }

  paymentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('payment-form-error');
    const lessons = Number($('payment-lessons').value);
    const amount = Number($('payment-amount').value);
    if (!Number.isInteger(lessons) || lessons <= 0) return (errorBox.textContent = 'Хичээлийн тоог зөв бичнэ үү.');
    if (!Number.isInteger(amount) || amount <= 0) return (errorBox.textContent = 'Дүнг зөв бичнэ үү.');

    await withBusy($('payment-save'), async () => {
      try {
        const paidOn = $('payment-date').value || today();
        const saved = await Backend.insert('payments', {
          registration_id: paymentTarget.id,
          period_start: paidOn,
          lessons,
          amount,
          paid_on: paidOn,
          bank_ref: emptyToNull($('payment-ref').value),
          note: emptyToNull($('payment-note').value),
        });
        payments.push(saved);
        // Анх төлбөр төлсөн шинэ бүртгэлийг идэвхтэй болгоно.
        if (paymentTarget.status === 'Шинэ') {
          Object.assign(
            paymentTarget,
            await Backend.update('registrations', paymentTarget.id, { status: 'Идэвхтэй' }),
          );
        }
        paymentDialog.close();
        showStatus(`${paymentTarget.child_name}: төлбөр баталгаажлаа. ${leftOf(paymentTarget)} хичээл үлдсэн.`);
        renderRegistrations();
        renderAttendance();
      } catch (error) {
        errorBox.textContent = error?.message || String(error);
      }
    });
  });

  async function cancelPayment(r, payment) {
    const ok = await confirmDelete(
      `${r.child_name}: ${dateLabel(payment.paid_on || payment.period_start)}-ны ${money(payment.amount)}-ийн төлбөрийн баталгаажуулалтыг цуцлах уу? ${payment.lessons || LESSONS_PER_PAYMENT} хичээл хасагдана.`,
    );
    if (!ok) return;
    try {
      await Backend.remove('payments', payment.id);
      payments = payments.filter((p) => p.id !== payment.id);
      showStatus('Төлбөрийн баталгаажуулалтыг цуцаллаа.');
      renderRegistrations();
      renderAttendance();
    } catch (error) {
      showError(error);
    }
  }

  /* Бүртгэл засах цонх */

  const registrationDialog = $('registration-dialog');
  const registrationForm = $('registration-form');
  let registrationTarget = null;

  function openRegistrationForm(r) {
    registrationTarget = r;
    $('registration-form-error').textContent = '';
    $('registration-who').textContent = `${r.child_name} (${r.ref_code})`;
    $('edit-shift').value = r.shift;
    $('edit-school').value = r.school_type;
    $('edit-fee').value = r.monthly_fee;
    $('edit-start').value = r.start_date;
    $('edit-note').value = r.admin_note || '';
    $('edit-status').value = r.status;

    const box = $('edit-payments');
    const paid = paymentsOf(r);
    box.replaceChildren(
      createElement('h3', 'Хичээл, төлбөр'),
      createElement(
        'p',
        `Төлсөн ${boughtOf(r)} хичээл, суусан ${usedOf(r)}, үлдсэн ${leftOf(r)}.`,
        'admin-hint',
      ),
    );
    if (paid.length > 0) {
      const list = document.createElement('ul');
      paid.forEach((p) =>
        list.append(
          createElement(
            'li',
            `${dateLabel(p.paid_on || p.period_start)}: ${money(p.amount)}, ${p.lessons || LESSONS_PER_PAYMENT} хичээл`,
          ),
        ),
      );
      box.append(list);
      box.append(
        createButton('Сүүлийн төлбөрийг цуцлах', 'admin-button small', () => {
          registrationDialog.close();
          cancelPayment(r, paid[paid.length - 1]);
        }),
      );
    }
    box.append(
      createButton('Төлбөр нэмэх', 'admin-button small', () => {
        registrationDialog.close();
        openPaymentForm(r);
      }),
    );
    registrationDialog.showModal();
  }

  // Сургууль солиход стандарт төлбөрийг санал болгоно (гараар өөрчилж болно).
  $('edit-school').addEventListener('change', () => {
    $('edit-fee').value = FEES[$('edit-school').value];
  });

  registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('registration-form-error');
    const fee = Number($('edit-fee').value);
    if (!Number.isInteger(fee) || fee <= 0) return (errorBox.textContent = 'Төлбөрийн дүнг зөв бичнэ үү.');
    if (!$('edit-start').value) return (errorBox.textContent = 'Бүртгүүлсэн өдрийг сонгоно уу.');

    await withBusy($('registration-save'), async () => {
      try {
        Object.assign(
          registrationTarget,
          await Backend.update('registrations', registrationTarget.id, {
            shift: $('edit-shift').value,
            school_type: $('edit-school').value,
            monthly_fee: fee,
            start_date: $('edit-start').value,
            status: $('edit-status').value,
            admin_note: emptyToNull($('edit-note').value),
          }),
        );
        registrationDialog.close();
        showStatus(`${registrationTarget.child_name}: бүртгэл шинэчлэгдлээ.`);
        renderRegistrations();
        renderAttendance();
      } catch (error) {
        errorBox.textContent = error?.message || String(error);
      }
    });
  });

  $('registration-delete').addEventListener('click', () => {
    const r = registrationTarget;
    registrationDialog.close();
    deleteRegistration(r);
  });

  async function deleteRegistration(r) {
    const ok = await confirmDelete(
      `${r.child_name} (${r.ref_code})-ийн бүртгэл, төлбөр, ирцийн бүх бичлэгийг бүрмөсөн устгах уу? Буцаах боломжгүй.`,
    );
    if (!ok) return;
    try {
      await Backend.remove('registrations', r.id);
      registrations = registrations.filter((x) => x.id !== r.id);
      payments = payments.filter((p) => p.registration_id !== r.id);
      attendance = attendance.filter((a) => a.registration_id !== r.id);
      showStatus('Бүртгэлийг устгалаа.');
      renderRegistrations();
      renderAttendance();
    } catch (error) {
      showError(error);
    }
  }

  // Харагдаж буй жагсаалтыг Excel-д нээгдэх CSV болгон татна.
  // Бүх ээлжийн хүүхдийг Excel (.xlsx) файлаар татна. Сонгосон ээлж, хайлтаас үл хамаарна.
  // «Бүх хүүхэд» хуудас + ээлж бүрийн тусдаа хуудас. «Гарсныг харуулах» чагтлаагүй бол гарсан хүүхэд орохгүй.
  $('reg-export').addEventListener('click', () => {
    const columns = [
      { header: '№', width: 5 },
      { header: 'Ээлж', width: 13 },
      { header: 'Хүүхдийн нэр', width: 28 },
      { header: 'Төрсөн өдөр', width: 12 },
      { header: 'Нас', width: 6 },
      { header: 'Сургууль', width: 14 },
      { header: 'Анги', width: 16 },
      { header: 'Шатрын мэдлэг', width: 20 },
      { header: 'Эцэг/эх', width: 22 },
      { header: 'Утас', width: 11 },
      { header: 'Төлөв', width: 12 },
      { header: 'Төлбөрийн дүн', width: 13 },
      { header: 'Төлсөн хичээл', width: 13 },
      { header: 'Суусан', width: 8 },
      { header: 'Үлдсэн', width: 8 },
      { header: 'Сүүлд төлсөн', width: 13 },
      { header: 'Бүртгүүлсэн', width: 12 },
      { header: 'Тэмдэглэл', width: 40 },
    ];
    const rowOf = (r, i) => {
      const paid = paymentsOf(r);
      const last = paid[paid.length - 1];
      return [
        i + 1, r.shift, r.child_name, r.birth_date || '', r.birth_date ? ageOf(r.birth_date) : '',
        r.school_type === '14' ? '14-р сургууль' : 'Бусад', r.school_grade || '', r.experience || '',
        r.parent_name || '', r.parent_phone || '', r.status, Number(r.monthly_fee) || 0,
        boughtOf(r), usedOf(r), leftOf(r), last ? last.paid_on || last.period_start : '',
        (r.created_at || '').slice(0, 10), [r.note, r.admin_note].filter(Boolean).join(' / '),
      ];
    };
    const all = registrations
      .filter((r) => showLeft() || r.status !== 'Гарсан')
      .sort((a, b) => SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift) || byName(a, b));

    const sheets = [{ name: `Бүх хүүхэд (${all.length})`, columns, rows: all.map(rowOf) }];
    SHIFT_ORDER.forEach((shift) => {
      const list = all.filter((r) => r.shift === shift);
      sheets.push({ name: `${shift.replace(/:/g, '.')} (${list.length})`, columns, rows: list.map(rowOf) });
    });

    const blob = MiniXlsx.build(sheets);
    // Файлын нэрэнд цаг оруулж, өмнө татсан файлтай андуурагдахаас сэргийлнэ.
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit' })
      .format(new Date())
      .replace(':', '');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `burtgel-buh-eelj-${today()}-${time}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    showStatus(`Excel файл татагдлаа: нийт ${all.length} хүүхэд (${SHIFT_ORDER.map((s) => `${s}: ${all.filter((r) => r.shift === s).length}`).join(', ')}).`);
  });

  /* 6. Ирц ----------------------------------------------------------------- */

  /*
    Ирц бүртгэх: ирсэн хүүхдийн нэр дээр дарахад тэр даруй хадгалагдана (хадгалах товчгүй).
    «Хичээл дуусгах» нь ирц бүртгэгдээгүй, төлбөр төлсөн хүүхдийг «Тасалсан» болгоно.
    Төлбөр төлөөгүй, ирээгүй хүүхдийн ирцийг бүртгэхгүй (хичээлдээ эхлээгүй гэж үзнэ).
  */
  const FIRST_CLASS = '2026-11-28'; // Анхны хичээл (Бямба)
  const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const isClassDay = (iso) => [0, 6].includes(weekday(iso));
  const addDays = (iso, n) => {
    const date = new Date(iso + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
  };
  const shortDate = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const normal = (t) => (t || '').toLowerCase().replace(/[^а-яөүёa-z0-9]/g, '');

  // Өнөөдөр Бямба/Ням бол өнөөдөр, үгүй бол дараагийн Бямба (анхны хичээлээс өмнө биш).
  function defaultClassDate() {
    let iso = today();
    while (!isClassDay(iso)) iso = addDays(iso, 1);
    return iso < FIRST_CLASS ? FIRST_CLASS : iso;
  }

  // Товчоор харуулах өдрүүд: сүүлийн 8 хичээлийн өдөр (дараагийн амралтын өдрийг оруулаад).
  function classDays() {
    const last = defaultClassDate();
    const days = [];
    for (let iso = FIRST_CLASS; iso <= last; iso = addDays(iso, 1)) {
      if (isClassDay(iso)) days.push(iso);
    }
    if (weekday(last) === 6) days.push(addDays(last, 1));
    return days.slice(-8);
  }

  const attDate = $('att-date');
  attDate.value = defaultClassDate();
  let attShift = SHIFT_ORDER[0];
  let attMode = 'mark'; // 'mark' — ирц бүртгэх, 'journal' — ирцийн журнал
  let journalShift = SHIFT_ORDER[0];
  let draftKey = ''; // Журналаас шилжихэд ашиглана (хадгалаагүй өөрчлөлт байхгүй тул хоосон)
  const pending = new Set(); // Хадгалж байгаа хүүхдүүд

  const sessionFor = (shift, date) => sessions.find((s) => s.shift === shift && s.class_date === date);
  const marksOf = (session) => (session ? attendance.filter((a) => a.session_id === session.id) : []);
  const markOf = (session, r) =>
    session ? attendance.find((a) => a.session_id === session.id && a.registration_id === r.id) : null;

  // Жагсаалт: тухайн ээлжийн шинэ/идэвхтэй хүүхэд + энэ хичээлд ирц бүртгэгдсэн бусад хүүхэд.
  function rollFor(shift, date) {
    const marked = new Set(marksOf(sessionFor(shift, date)).map((a) => a.registration_id));
    return registrations
      .filter((r) => marked.has(r.id) || (r.shift === shift && (r.status === 'Шинэ' || r.status === 'Идэвхтэй')))
      .sort(byName);
  }

  // Ирцийн журнал руу шилжихэд хадгалаагүй өөрчлөлт байхгүй (дармагц хадгалагддаг).
  const leaveDraft = async () => true;

  function renderDays() {
    $('att-days').replaceChildren(
      ...classDays().map((iso) => {
        const done = SHIFT_ORDER.filter((shift) => sessionFor(shift, iso)).length;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'att-day-chip';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(iso === attDate.value));
        button.append(
          createElement('strong', `${shortDate(iso)} ${WEEKDAYS[weekday(iso)]}`),
          createElement(
            'span',
            done === SHIFT_ORDER.length ? 'Бүгд ✓' : done > 0 ? `${done}/${SHIFT_ORDER.length} ээлж` : iso === today() ? 'Өнөөдөр' : '',
            done === SHIFT_ORDER.length ? 'is-done' : '',
          ),
        );
        button.addEventListener('click', () => {
          attDate.value = iso;
          $('att-search').value = '';
          renderAttendance();
        });
        return button;
      }),
    );
  }

  // 8 хичээлийн явц ---------------------------------------------------------
  const STATUS_CLASS = { Ирсэн: 'is-present', Тасалсан: 'is-absent', Чөлөөтэй: 'is-excused' };
  const STATUS_ICON = { Ирсэн: '✓', Тасалсан: '✗', Чөлөөтэй: 'Ч' };
  const sessionDate = (id) => (sessions.find((x) => x.id === id) || {}).class_date || '';

  // Хүүхдийн бүх ирц огноогоор, төлбөр бүрийн багцад хуваасан.
  function lessonHistory(r) {
    const marks = attendance
      .filter((a) => a.registration_id === r.id)
      .map((a) => ({ date: sessionDate(a.session_id), status: a.status }))
      .sort((x, y) => x.date.localeCompare(y.date));
    const packs = paymentsOf(r).map((p) => ({ payment: p, size: p.lessons || LESSONS_PER_PAYMENT, marks: [] }));
    let i = 0;
    for (const pack of packs) {
      pack.marks = marks.slice(i, i + pack.size);
      i += pack.size;
    }
    return { marks, packs, owed: marks.slice(i) };
  }

  // Одоогийн багц: хэд дэх хичээл, хэд үлдсэн, ойролцоогоор хэзээ дуусах.
  function lessonPack(r, fromDate = today()) {
    const { marks, packs, owed } = lessonHistory(r);
    const bought = packs.reduce((s, p) => s + p.size, 0);
    const left = bought - marks.length;
    const current = packs.find((p) => p.marks.length < p.size) || packs[packs.length - 1] || null;
    const lastPaid = paymentsOf(r).at(-1);
    // Үлдсэн хичээлүүд ямар өдрүүдэд таарахыг (Бямба, Ням) тооцно.
    let lastLesson = '';
    let nextPay = '';
    if (left > 0) {
      const latest = marks.length ? marks[marks.length - 1].date : '';
      let iso = latest && latest >= fromDate ? addDays(latest, 1) : fromDate;
      let n = 0;
      for (; n < left; iso = addDays(iso, 1)) {
        if (isClassDay(iso)) {
          n += 1;
          lastLesson = iso;
        }
      }
      nextPay = addDays(lastLesson, 1);
      while (!isClassDay(nextPay)) nextPay = addDays(nextPay, 1);
    }
    return {
      bought,
      used: marks.length,
      left,
      size: current ? current.size : LESSONS_PER_PAYMENT,
      packMarks: current ? current.marks : [],
      owed: owed.length,
      paidOn: lastPaid ? lastPaid.paid_on || lastPaid.period_start || '' : '',
      lastLesson,
      nextPay,
    };
  }

  function lessonDots(info) {
    const box = createElement('span', null, 'lesson-dots');
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < info.size; i += 1) {
      const dot = createElement('i', null, 'dot');
      if (info.packMarks[i]) dot.classList.add(STATUS_CLASS[info.packMarks[i].status]);
      box.append(dot);
    }
    if (info.owed > 0) box.append(createElement('b', `+${info.owed}`, 'dot-owed'));
    return box;
  }

  // Төлбөрийн мөр: [текст, төрөл]
  function payLine(info) {
    if (info.bought === 0) {
      return ['Төлбөр төлөөгүй', 'is-unpaid'];
    }
    if (info.left < 0) return [`${-info.left} хичээл өртэй. Дараагийн төлбөр одоо`, 'is-unpaid'];
    if (info.left === 0) return ['8 хичээл дууссан. Дараагийн төлбөр одоо', 'is-unpaid'];
    const when = `Дараагийн төлбөр ≈ ${shortDate(info.nextPay)}`;
    if (info.left <= LOW_LESSONS) return [`${when} (${info.left} хичээл үлдсэн)`, 'is-low'];
    return [`Төлсөн ${info.paidOn ? shortDate(info.paidOn) : ''}. ${when}`, 'is-paid'];
  }

  // Хуучин нэрээр (бүртгэлийн хүснэгт гэх мэт) ашиглагддаг.
  function leftText(r) {
    const info = lessonPack(r);
    if (info.bought === 0) return ['Төлбөр төлөөгүй', 'is-unpaid'];
    if (info.left < 0) return [`${-info.left} хичээл өртэй`, 'is-unpaid'];
    if (info.left === 0) return ['8 хичээл дууссан', 'is-unpaid'];
    return [`${info.left} хичээл үлдсэн`, info.left <= LOW_LESSONS ? 'is-low' : 'is-paid'];
  }

  // Хичээлийн дугаар: «3 дахь хичээл» гэх мэт (одоогийн багц дотор).
  function lessonNumberText(info) {
    if (info.bought === 0) return info.owed > 0 ? `${info.owed} хичээл бүртгэгдсэн` : 'Хичээл эхлээгүй';
    if (info.left < 0) return `${info.size}/${info.size} дууссан, +${-info.left}`;
    return `${info.packMarks.length}/${info.size} хичээл`;
  }

  function setState(text, kind = '') {
    $('att-state').textContent = text;
    $('att-state').className = `att-state ${kind}`;
  }

  async function ensureSession(shift, date) {
    let session = sessionFor(shift, date);
    if (session) return session;
    const rows = await Backend.upsert('class_sessions', [{ shift, class_date: date }], 'shift,class_date');
    session = rows[0];
    sessions.push(session);
    return session;
  }

  // Нэг хүүхдийн ирцийг тэр даруй хадгална. status = null бол бичлэгийг устгана.
  async function saveMark(r, status) {
    if (pending.has(r.id)) return;
    pending.add(r.id);
    const date = attDate.value;
    const shift = attShift;
    setState('Хадгалж байна…');
    try {
      const session = await ensureSession(shift, date);
      if (status) {
        const rows = await Backend.upsert(
          'attendance',
          [{ session_id: session.id, registration_id: r.id, status }],
          'session_id,registration_id',
        );
        attendance = attendance
          .filter((a) => !(a.session_id === session.id && a.registration_id === r.id))
          .concat(rows.map((a) => ({ session_id: a.session_id, registration_id: a.registration_id, status: a.status })));
      } else {
        await Backend.removeWhere('attendance', `session_id=eq.${session.id}&registration_id=eq.${r.id}`);
        attendance = attendance.filter((a) => !(a.session_id === session.id && a.registration_id === r.id));
      }
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit' }).format(new Date());
      const info = lessonPack(r);
      const after = info.bought === 0
        ? 'Төлбөр төлөөгүй.'
        : info.left >= 0
          ? `${info.packMarks.length}/${info.size} хичээл, ${info.left} үлдсэн.`
          : `${-info.left} хичээл өртэй.`;
      setState(`${r.child_name}: ${status || 'тэмдэглэгээ арилсан'}. ${after} Хадгалагдсан ✓ ${time}`, 'is-done');
    } catch (error) {
      setState('Хадгалж чадсангүй. Дахин дарна уу.', 'is-dirty');
      showError(error);
    } finally {
      pending.delete(r.id);
      renderAttendance({ keepScroll: true });
      renderRegistrations();
    }
  }

  function tileFor(r, session, { other = false } = {}) {
    const mark = markOf(session, r);
    const status = mark ? mark.status : '';
    const info = lessonPack(r, attDate.value);
    const tile = createElement('div', null, 'att-tile');
    tile.dataset.status = status;

    const main = createElement('button', null, 'att-tile-main');
    main.type = 'button';
    main.setAttribute('aria-pressed', String(status === 'Ирсэн'));
    const check = createElement('span', STATUS_ICON[status] || '', 'att-check');
    const text = createElement('span', null, 'att-tile-text');
    text.append(createElement('strong', r.child_name));
    if (other || r.shift !== attShift) text.append(createElement('small', `${r.shift} ээлжийн хүүхэд`, 'att-other-shift'));

    const count = createElement('span', null, 'att-count-line');
    count.append(createElement('b', lessonNumberText(info)));
    if (info.bought > 0) count.append(lessonDots(info));
    if (info.bought > 0 && info.left > 0) count.append(createElement('span', `${info.left} үлдсэн`, 'att-left'));
    const [payText, payKind] = payLine(info);
    text.append(count, createElement('span', payText, `pay-pill ${payKind}`));
    main.append(check, text);
    main.addEventListener('click', () => saveMark(r, status === 'Ирсэн' ? null : 'Ирсэн'));

    const leave = createElement('button', 'Чөлөө', 'att-leave');
    leave.type = 'button';
    leave.setAttribute('aria-pressed', String(status === 'Чөлөөтэй'));
    leave.setAttribute('aria-label', `${r.child_name}: чөлөөтэй`);
    leave.addEventListener('click', () => saveMark(r, status === 'Чөлөөтэй' ? null : 'Чөлөөтэй'));

    // Доод мөр: энэ багцад ирсэн өдрүүд + дэлгэрэнгүй
    const foot = createElement('div', null, 'att-tile-foot');
    const days = createElement('span', null, 'att-dates');
    const shown = info.bought === 0 ? lessonHistory(r).owed : info.packMarks;
    if (shown.length) {
      shown.forEach((m) => {
        const chip = createElement('span', `${shortDate(m.date)} ${STATUS_ICON[m.status]}`, `att-date-chip ${STATUS_CLASS[m.status]}`);
        chip.title = `${dateLabel(m.date)}: ${m.status}`;
        days.append(chip);
      });
    } else {
      days.append(createElement('span', 'Ирц бүртгэгдээгүй', 'att-dates-empty'));
    }
    const more = createElement('button', 'Дэлгэрэнгүй', 'att-more');
    more.type = 'button';
    more.setAttribute('aria-label', `${r.child_name}: ирц, төлбөрийн дэлгэрэнгүй`);
    more.addEventListener('click', () => openLessonDetail(r));
    foot.append(days, more);

    if (pending.has(r.id)) tile.classList.add('is-saving');
    const top = createElement('div', null, 'att-tile-top');
    top.append(main, leave);
    tile.append(top, foot);
    return tile;
  }

  /* Хүүхдийн ирц, төлбөрийн дэлгэрэнгүй цонх */

  const detailDialog = $('att-detail');
  let detailTarget = null;

  function openLessonDetail(r) {
    detailTarget = r;
    const info = lessonPack(r);
    const { packs, owed } = lessonHistory(r);
    $('att-detail-title').textContent = r.child_name;
    $('att-detail-who').textContent =
      `${r.school_grade || ''} анги, ${r.shift} ээлж. Эцэг эх: ${r.parent_name || ''} ${r.parent_phone || ''}`.trim();

    const [payText, payKind] = payLine(info);
    const summary = createElement('div', null, 'att-detail-summary');
    summary.append(
      createElement('span', `Төлсөн: ${packs.length} удаа, ${info.bought} хичээл`),
      createElement('span', `Хичээллэсэн: ${info.used}`),
      createElement('span', info.left >= 0 ? `Үлдсэн: ${info.left}` : `Өртэй: ${-info.left}`),
      createElement('span', payText, `pay-pill ${payKind}`),
    );
    if (info.left > 0 && info.lastLesson) {
      summary.append(
        createElement(
          'small',
          `Үлдсэн хичээл ≈ ${dateLabel(info.lastLesson)} хүртэл хүрнэ. Дараагийн төлбөрийг ${dateLabel(info.nextPay)}-ны хичээлээс өмнө авна (баярын өдөр тооцоогүй).`,
          'admin-hint',
        ),
      );
    }

    const body = createElement('div', null, 'att-detail-packs');
    if (packs.length === 0) {
      body.append(createElement('p', 'Төлбөр бүртгэгдээгүй байна.', 'admin-hint'));
    }
    packs.forEach((pack, index) => {
      const p = pack.payment;
      const box = createElement('section', null, 'att-pack');
      box.append(
        createElement(
          'h4',
          `${index + 1}-р төлбөр: ${dateLabel(p.paid_on || p.period_start)}, ${money(p.amount)}, ${pack.size} хичээл`,
        ),
      );
      const list = createElement('ol', null, 'att-pack-list');
      for (let i = 0; i < pack.size; i += 1) {
        const m = pack.marks[i];
        const li = createElement('li', null, m ? STATUS_CLASS[m.status] : 'is-left');
        li.append(
          createElement('span', `${i + 1}.`, 'num'),
          createElement('span', m ? `${dateLabel(m.date)}, ${WEEKDAYS[weekday(m.date)]}` : '—', 'when'),
          createElement('span', m ? `${STATUS_ICON[m.status]} ${m.status}` : 'Үлдсэн', 'what'),
        );
        list.append(li);
      }
      box.append(list);
      body.append(box);
    });
    if (owed.length) {
      const box = createElement('section', null, 'att-pack is-owed');
      box.append(createElement('h4', `Төлбөргүй бүртгэгдсэн ${owed.length} хичээл (дараагийн төлбөрөөс хасагдана)`));
      const list = createElement('ol', null, 'att-pack-list');
      owed.forEach((m, i) => {
        const li = createElement('li', null, STATUS_CLASS[m.status]);
        li.append(
          createElement('span', `${i + 1}.`, 'num'),
          createElement('span', `${dateLabel(m.date)}, ${WEEKDAYS[weekday(m.date)]}`, 'when'),
          createElement('span', `${STATUS_ICON[m.status]} ${m.status}`, 'what'),
        );
        list.append(li);
      });
      box.append(list);
      body.append(box);
    }
    $('att-detail-body').replaceChildren(summary, body);
    detailDialog.showModal();
  }

  $('att-detail-pay').addEventListener('click', () => {
    if (!detailTarget) return;
    detailDialog.close();
    openPaymentForm(detailTarget);
  });

  function renderAttendance({ keepScroll = false } = {}) {
    if (attMode === 'journal') return renderJournal();
    if (!attDate.value) return;
    const scroll = window.scrollY;
    const date = attDate.value;
    renderDays();
    $('att-day').textContent =
      `${dateLabel(date)}, ${WEEKDAYS[weekday(date)]} гараг` + (isClassDay(date) ? '' : '. Энэ өдөр хичээлийн өдөр биш.');
    $('att-day').classList.toggle('is-warn', !isClassDay(date));

    $('att-shift-tabs').replaceChildren(
      ...SHIFT_ORDER.map((shift) => {
        const session = sessionFor(shift, date);
        const marks = marksOf(session);
        const present = marks.filter((a) => a.status === 'Ирсэн').length;
        return shiftButton(
          shift,
          shift === attShift,
          [
            [`${rollFor(shift, date).length} хүүхэд`],
            session ? [`Ирсэн ${present}`, 'is-done'] : ['Ирц бүртгээгүй', 'is-due'],
          ],
          () => {
            attShift = shift;
            $('att-search').value = '';
            renderAttendance();
          },
        );
      }),
    );

    const session = sessionFor(attShift, date);
    const roll = rollFor(attShift, date);
    const query = normal($('att-search').value);
    const match = (r) => !query || normal(r.child_name).includes(query) || (r.parent_phone || '').includes(query);

    // Тоолуур
    const marks = marksOf(session);
    const count = (s) => marks.filter((a) => a.status === s).length;
    const unmarked = roll.filter((r) => !markOf(session, r)).length;
    $('att-counts').replaceChildren(
      ...[
        ['Ирсэн', count('Ирсэн')],
        ['Чөлөөтэй', count('Чөлөөтэй')],
        ['Тасалсан', count('Тасалсан')],
      ].map(([label, n]) => {
        const chip = createElement('span', null, 'att-count');
        chip.dataset.status = label;
        chip.append(createElement('strong', String(n)), ` ${label}`);
        return chip;
      }),
      createElement('span', `Тэмдэглээгүй ${unmarked}, нийт ${roll.length}`, 'att-total'),
    );

    const visible = roll.filter(match);
    $('att-grid').replaceChildren(
      ...(visible.length
        ? visible.map((r) => tileFor(r, session))
        : [createElement('p', query ? 'Энэ ээлжээс олдсонгүй.' : 'Энэ ээлжид хүүхэд алга.', 'reg-empty')]),
    );

    // Хайлтаар бусад ээлжийн хүүхдийг санал болгоно.
    const inRoll = new Set(roll.map((r) => r.id));
    const others = query.length >= 2
      ? registrations.filter((r) => !inRoll.has(r.id) && r.status !== 'Гарсан' && match(r)).sort(byName).slice(0, 12)
      : [];
    $('att-others').hidden = others.length === 0;
    $('att-others-grid').replaceChildren(...others.map((r) => tileFor(r, session, { other: true })));

    // Төлөв, товчнууд
    if (!pending.size && !$('att-state').textContent) {
      setState(session ? 'Энэ хичээлийн ирц хадгалагдсан ✓' : 'Ирсэн хүүхдийн нэр дээр дарж эхэлнэ үү.', session ? 'is-done' : '');
    }
    $('att-finish').disabled = roll.length === 0;
    $('att-delete').hidden = !session;
    if (keepScroll) window.scrollTo(0, scroll);
  }

  $('att-search').addEventListener('input', () => renderAttendance({ keepScroll: true }));
  attDate.addEventListener('change', () => {
    $('att-search').value = '';
    setState('');
    renderAttendance();
  });

  // Хичээл дуусгах: ирц бүртгэгдээгүй, төлбөр төлсөн хүүхдийг «Тасалсан» болгоно.
  $('att-finish').addEventListener('click', async () => {
    const date = attDate.value;
    const session = sessionFor(attShift, date);
    const roll = rollFor(attShift, date);
    const unmarked = roll.filter((r) => !markOf(session, r));
    const absentPaid = unmarked.filter((r) => boughtOf(r) > 0);
    const skipped = unmarked.length - absentPaid.length;
    const present = marksOf(session).filter((a) => a.status === 'Ирсэн').length;

    if (absentPaid.length === 0) {
      setState(
        `Ирсэн ${present}. Тэмдэглээгүй, төлбөр төлсөн хүүхэд алга` + (skipped ? ` (төлбөр төлөөгүй ${skipped} хүүхдийн ирцийг бүртгэхгүй).` : '.'),
        'is-done',
      );
      return;
    }
    const ok = await confirmDelete(
      `${absentPaid.length} хүүхэд ирц бүртгэгдээгүй, төлбөр төлсөн байна: ${absentPaid.map((r) => r.child_name).join(', ')}. ` +
        `Тэднийг «Тасалсан» болгох уу? 8 хичээлээс нэг хасагдана.` +
        (skipped ? ` Төлбөр төлөөгүй ${skipped} хүүхдийн ирцийг бүртгэхгүй.` : ''),
      { title: 'Хичээл дуусгах', yes: `${absentPaid.length} хүүхдийг «Тасалсан» болгох` },
    );
    if (!ok) return;

    await withBusy($('att-finish'), async () => {
      try {
        const s = await ensureSession(attShift, date);
        const rows = await Backend.upsert(
          'attendance',
          absentPaid.map((r) => ({ session_id: s.id, registration_id: r.id, status: 'Тасалсан' })),
          'session_id,registration_id',
        );
        const ids = new Set(absentPaid.map((r) => r.id));
        attendance = attendance
          .filter((a) => !(a.session_id === s.id && ids.has(a.registration_id)))
          .concat(rows.map((a) => ({ session_id: a.session_id, registration_id: a.registration_id, status: a.status })));
        setState(`Хичээл дууслаа: ирсэн ${present}, тасалсан ${absentPaid.length}.`, 'is-done');
        showStatus(`${dateLabel(date)}, ${attShift} ээлжийн ирц бүрэн бүртгэгдлээ.`);
        renderAttendance();
        renderRegistrations();
      } catch (error) {
        showError(error);
      }
    });
  });

  $('att-delete').addEventListener('click', async () => {
    const session = sessionFor(attShift, attDate.value);
    if (!session) return;
    const ok = await confirmDelete(
      `${dateLabel(session.class_date)}, ${session.shift} ээлжийн ирцийг бүхэлд нь устгах уу? Хүүхдүүдийн хичээл буцаж нэмэгдэнэ.`,
    );
    if (!ok) return;
    try {
      await Backend.remove('class_sessions', session.id);
      sessions = sessions.filter((s) => s.id !== session.id);
      attendance = attendance.filter((a) => a.session_id !== session.id);
      setState('Энэ хичээлийн ирцийг устгалаа.');
      renderAttendance();
      renderRegistrations();
    } catch (error) {
      showError(error);
    }
  });

  /* Ирцийн журнал (ээлж бүрийн бүх хичээл) */

  const MARK_SYMBOL = { Ирсэн: '✓', Тасалсан: '✗', Чөлөөтэй: 'Ч' };

  function setAttMode(mode) {
    attMode = mode;
    $('att-mode-mark').setAttribute('aria-selected', String(mode === 'mark'));
    $('att-mode-journal').setAttribute('aria-selected', String(mode === 'journal'));
    $('att-mark').hidden = mode !== 'mark';
    $('att-journal').hidden = mode !== 'journal';
    if (mode === 'journal') {
      journalShift = attShift;
      renderJournal();
    } else {
      renderAttendance();
    }
  }

  $('att-mode-mark').addEventListener('click', () => setAttMode('mark'));
  $('att-mode-journal').addEventListener('click', async () => {
    if (attMode === 'journal' || !(await leaveDraft())) return;
    draftKey = '';
    setAttMode('journal');
  });

  function renderJournal() {
    const own = sessions.filter((x) => x.shift === journalShift);
    const ids = new Set(own.map((x) => x.id));
    const marked = new Set(attendance.filter((a) => ids.has(a.session_id)).map((a) => a.registration_id));
    const roll = registrations
      .filter((r) => marked.has(r.id) || (r.shift === journalShift && (r.status === 'Шинэ' || r.status === 'Идэвхтэй')))
      .sort(byName);
    // Багана: энэ ээлжийн хичээл бүр + хуучин хуваарийн өдөр бүр (энэ хүүхдүүдийн аль нэгнийх нь ирцтэй бол).
    const rollIds = new Set(roll.map((r) => r.id));
    const legacyByDate = new Map();
    sessions.filter(isLegacySession).forEach((session) => {
      if (!attendance.some((a) => a.session_id === session.id && rollIds.has(a.registration_id))) return;
      const column = legacyByDate.get(session.class_date) || { class_date: session.class_date, ids: [], legacy: true };
      column.ids.push(session.id);
      legacyByDate.set(session.class_date, column);
    });
    const shiftSessions = own
      .map((session) => ({ ...session, ids: [session.id] }))
      .concat([...legacyByDate.values()])
      .sort((a, b) => a.class_date.localeCompare(b.class_date));

    $('att-journal-shifts').replaceChildren(
      ...SHIFT_ORDER.map((shift) =>
        shiftButton(
          shift,
          shift === journalShift,
          [[`${sessions.filter((x) => x.shift === shift).length} хичээл бүртгэсэн`]],
          () => {
            journalShift = shift;
            renderJournal();
          },
        ),
      ),
    );

    const head = document.createElement('tr');
    head.append(createElement('th', 'Хүүхэд', 'journal-name'));
    shiftSessions.forEach((session) => {
      const th = document.createElement('th');
      th.className = 'journal-date';
      const button = createElement('button', null, 'journal-date-btn');
      button.type = 'button';
      button.title = session.legacy ? 'Хуучин хуваарийн хичээл (засах боломжгүй)' : 'Энэ өдрийн ирцийг засах';
      button.disabled = Boolean(session.legacy);
      button.append(
        createElement('span', shortDate(session.class_date)),
        createElement('small', WEEKDAYS[weekday(session.class_date)].slice(0, 2)),
      );
      button.addEventListener('click', () => {
        attShift = session.shift;
        attDate.value = session.class_date;
        draftKey = '';
        setAttMode('mark');
      });
      th.append(button);
      head.append(th);
    });
    head.append(createElement('th', 'Ирсэн', 'journal-sum'), createElement('th', 'Үлдсэн', 'journal-sum'));
    $('att-journal-head').replaceChildren(head);

    if (shiftSessions.length === 0 || roll.length === 0) {
      const tr = document.createElement('tr');
      const td = createElement(
        'td',
        shiftSessions.length === 0
          ? 'Энэ ээлжид ирц бүртгэсэн хичээл алга. «Ирц бүртгэх» хэсгээс эхэлнэ.'
          : 'Энэ ээлжид хүүхэд алга.',
        'reg-empty',
      );
      td.colSpan = shiftSessions.length + 3;
      tr.append(td);
      return $('att-journal-rows').replaceChildren(tr);
    }

    $('att-journal-rows').replaceChildren(
      ...roll.map((r) => {
        const tr = document.createElement('tr');
        const name = createElement('th', null, 'journal-name');
        name.scope = 'row';
        name.append(createElement('strong', r.child_name));
        tr.append(name);
        let present = 0;
        shiftSessions.forEach((session) => {
          const mark = attendance.find((a) => session.ids.includes(a.session_id) && a.registration_id === r.id);
          const td = createElement('td', null, 'journal-cell');
          const cls = mark ? STATUS_CLASS[mark.status] : 'is-none';
          const i = createElement('i', mark ? MARK_SYMBOL[mark.status] : '·', `mark ${cls}`);
          i.title = mark ? mark.status : 'Бүртгэлгүй';
          td.append(i);
          if (mark && mark.status === 'Ирсэн') present += 1;
          tr.append(td);
        });
        const left = leftOf(r);
        const leftTd = createElement('td', null, 'journal-sum');
        leftTd.append(
          createElement(
            'span',
            boughtOf(r) === 0 ? 'Төлөөгүй' : left <= 0 ? 'Төлөх' : String(left),
            `pay-pill ${boughtOf(r) === 0 || left <= 0 ? 'is-unpaid' : left <= LOW_LESSONS ? 'is-low' : 'is-paid'}`,
          ),
        );
        tr.append(createElement('td', String(present), 'journal-sum'), leftTd);
        return tr;
      }),
    );
  }

  /* Сайтаас «Засах» дарж ирэх --------------------------------------------- */

  /*
    athletes.html дээрх админы товчнууд энд дараах хаягаар ирнэ:
      admin.html#athlete=<id>           тамирчны маягт
      admin.html#new-athlete            шинэ тамирчин
      admin.html#achievement=<id>       амжилтын маягт
      admin.html#new-achievement=<id>   тухайн тамирчинд шинэ амжилт (id заавал биш)
    Маягтыг хаахад (хадгалсан эсвэл болисон) сайтын хуудас руу буцна.
  */
  let savedFromSiteLink = false;

  function openFromSiteLink() {
    const [action, id = ''] = decodeURIComponent(location.hash.slice(1)).split('=');
    if (!action) return;
    history.replaceState(null, '', location.pathname); // Дахин ачаалахад маягт дахин нээгдэхгүй.

    let dialog = null;
    if (action === 'athlete' || action === 'new-athlete') {
      const athlete = athletes.find((item) => item.id === id) || null;
      if (action === 'athlete' && !athlete) {
        return showError(new Error('Засах тамирчин олдсонгүй. Устгагдсан байж магадгүй.'));
      }
      openAthleteForm(athlete);
      dialog = athleteDialog;
    } else if (action === 'achievement' || action === 'new-achievement') {
      showPanel(tabs[1]);
      const item = achievements.find((candidate) => candidate.id === id) || null;
      if (action === 'achievement' && !item) {
        return showError(new Error('Засах амжилт олдсонгүй. Устгагдсан байж магадгүй.'));
      }
      if (action === 'new-achievement' && athletes.some((athlete) => athlete.id === id)) {
        $('achievement-filter').value = id;
        renderAchievements();
      }
      openAchievementForm(item);
      dialog = achievementDialog;
    }

    if (dialog?.open) {
      dialog.addEventListener(
        'close',
        () => location.assign('athletes.html' + (savedFromSiteLink ? '#saved' : '')),
        { once: true },
      );
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
