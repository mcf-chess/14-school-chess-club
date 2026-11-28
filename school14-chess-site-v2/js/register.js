/*
  Онлайн бүртгэл (contact.html#register).

  Бүртгэлийг сервер дээрх submit_registration функц хүлээн авч, төлөх дүн, огноог буцаана.
  Зочин хүснэгтээс юу ч уншиж чадахгүй. Дансны мэдээлэл, төлөх дүн зөвхөн бүртгэл
  амжилттай болсны дараа гарна. Сайт мөнгө хүлээн авахгүй: төлбөрийг дансаар шилжүүлж,
  админ баталгаажуулна.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('register-form');
  if (!form) return;

  const club = typeof CLUB !== 'undefined' ? CLUB : {};
  const bank = club.bank || {};
  const ready = typeof Backend !== 'undefined' && Backend.isConfigured;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  // 2026-11-22 → 2026.11.22
  const dateLabel = (iso) => String(iso).slice(0, 10).replace(/-/g, '.');
  const money = (n) => `${Number(n).toLocaleString('en-US')}₮`;
  const digits = (value) => value.replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '');
  const todayUB = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
  // Анхны хичээл 2026.11.28 (Бямба). Түүнээс хойш бол дараагийн Бямба эсвэл Ням.
  const FIRST_CLASS = '2026-11-28';
  function firstClassLabel() {
    const date = new Date(todayUB() + 'T00:00:00Z');
    while (![0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
    let iso = date.toISOString().slice(0, 10);
    if (iso < FIRST_CLASS) iso = FIRST_CLASS;
    const day = new Date(iso + 'T00:00:00Z').getUTCDay() === 6 ? 'Бямба' : 'Ням';
    return `${dateLabel(iso)}, ${day} гараг`;
  }
  // IBAN-ыг 4 тэмдэгтээр бүлэглэж харуулна (хуулахад зайгүй).
  const groupIban = (iban) => iban.replace(/(.{4})(?=.)/g, '$1 ');

  if (!ready) {
    form.before(
      el('p', 'Онлайн бүртгэл түр ажиллахгүй байна. Утсаар бүртгүүлнэ үү.', 'register-error'),
    );
    return;
  }
  form.hidden = false;

  // Төрсөн өдөр: 3–18 настай хүүхэд.
  const birthInput = $('reg-birth');
  const yearsAgo = (n) => {
    const [y, m, d] = todayUB().split('-');
    return `${Number(y) - n}-${m}-${d}`;
  };
  birthInput.max = yearsAgo(3);
  birthInput.min = yearsAgo(19);

  // Сургуулиас хамаарч бүлгийн талбарын шошгыг солино.
  form.querySelectorAll('input[name="school"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const other = radio.value === 'other';
      $('reg-grade-label').replaceChildren(
        other ? 'Сургууль, бүлэг ' : 'Бүлэг ',
        el('span', '(заавал биш)', 'optional'),
      );
      $('reg-grade').placeholder = other ? '23-р сургууль, б' : 'б';
    });
  });

  /* Ээлж: ангиас хамаарч сонголт гарна, ээлж бүрт CLUB.capacity хүүхэд ------- */

  const slots = (club.slots || []).map((slot) => ({ ...slot, shift: `${slot.start}–${slot.end}` }));
  const capacity = club.capacity || 26;
  const shiftBox = $('reg-shifts');
  const gradeSelect = $('reg-grade-num');
  shiftBox.classList.add('shifts');
  let taken = null; // { '10:00–11:00': 24, ... }, серверээс

  async function loadAvailability() {
    try {
      const rows = await Backend.callPublic('shift_availability', {});
      taken = Object.fromEntries((rows || []).map((row) => [row.shift, row.taken]));
    } catch {
      taken = null; // Тоо авч чадаагүй ч бүртгэл ажиллана; сервер дүүргэлтийг шалгана.
    }
    renderShifts();
  }

  function renderShifts() {
    const grade = Number(gradeSelect.value);
    const chosen = form.querySelector('input[name="shift"]:checked')?.value;
    const hint = $('reg-shift-hint');
    if (!grade) {
      shiftBox.replaceChildren();
      hint.textContent = `Ангиа сонгоход тохирох ээлж гарна. Ээлж бүрт ${capacity} хүүхэд.`;
      return;
    }
    const fit = slots.filter((slot) => slot.grades?.includes(grade));
    let open = 0;
    shiftBox.replaceChildren(
      ...fit.map((slot) => {
        const left = taken ? Math.max(0, capacity - (taken[slot.shift] || 0)) : null;
        const full = left === 0;
        if (!full) open += 1;
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'shift';
        input.value = slot.shift;
        input.disabled = full;
        input.checked = !full && slot.shift === chosen;
        const span = el('span');
        span.append(
          slot.shift,
          el('small', slot.who),
          el('small', full ? 'Дүүрсэн' : left == null ? '' : `${left} суудал үлдсэн`, `seats${full ? ' is-full' : ''}`),
        );
        label.append(input, ' ', span);
        return label;
      }),
    );
    if (fit.length && open === 0) {
      hint.textContent = `${grade}-р ангийн ээлж дүүрсэн байна. Багштай холбогдоно уу: ${club.phone || ''}`;
    } else if (fit.length === 1) {
      hint.textContent = `${grade}-р анги ${fit[0].shift} цагт хичээллэнэ.`;
    } else {
      hint.textContent = `${grade}-р ангийнхан эдгээр ээлжээс сонгоно.`;
    }
    // Ганц сул ээлж байвал автоматаар сонгоно.
    const free = shiftBox.querySelectorAll('input:not(:disabled)');
    if (free.length === 1) free[0].checked = true;
  }

  gradeSelect.addEventListener('change', renderShifts);
  loadAvailability();

  /* Бүртгүүлэх ------------------------------------------------------------ */

  const errorLine = $('register-error');

  function validate() {
    const data = new FormData(form);
    const child = String(data.get('child') || '').trim();
    const birth = String(data.get('birth') || '');
    const gradeNum = String(data.get('gradeNum') || '');
    const group = String(data.get('grade') || '').trim();
    const grade =
      data.get('school') === 'other'
        ? [group, `${gradeNum}-р анги`].filter(Boolean).join(', ')
        : `${gradeNum}${group}`;
    const parent = String(data.get('parent') || '').trim();
    const phone = digits(String(data.get('phone') || ''));
    const checks = [
      [child.length >= 2, 'reg-child', 'Хүүхдийн овог, нэрийг бичнэ үү.'],
      [
        /^\d{4}-\d{2}-\d{2}$/.test(birth) && birth >= birthInput.min && birth <= birthInput.max,
        'reg-birth',
        'Хүүхдийн төрсөн он, сар, өдрийг зөв оруулна уу (3–18 настай).',
      ],
      [data.get('school'), 'school', 'Аль сургуулийн сурагч болохыг сонгоно уу.'],
      [gradeNum, 'reg-grade-num', 'Хүүхдийн ангийг сонгоно уу.'],
      [data.get('experience'), 'reg-experience', 'Шатрын мэдлэгийг сонгоно уу.'],
      [
        data.get('shift'),
        shiftBox.querySelector('input:not(:disabled)') ? 'shift' : 'reg-grade-num',
        shiftBox.querySelector('input:not(:disabled)')
          ? 'Ээлжээ сонгоно уу.'
          : 'Энэ ангийн ээлж дүүрсэн байна. Багштай утсаар холбогдоно уу.',
      ],
      [parent.length >= 2, 'reg-parent', 'Эцэг эх, асран хамгаалагчийн нэрийг бичнэ үү.'],
      [/^\d{8}$/.test(phone), 'reg-phone', 'Утасны дугаар 8 оронтой байх ёстой.'],
      [data.get('consent'), 'reg-consent', 'Мэдээлэл хадгалах зөвшөөрлийг тэмдэглэнэ үү.'],
    ];
    form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
    for (const [ok, id, message] of checks) {
      if (!ok) {
        const field = $(id) || form.querySelector(`input[name="${id}"]`);
        if ($(id)) field.setAttribute('aria-invalid', 'true');
        field.focus();
        return { error: message };
      }
    }
    return {
      args: {
        p_child_name: child,
        p_birth_date: birth,
        p_school_type: data.get('school'),
        p_school_grade: grade,
        p_parent_name: parent,
        p_parent_phone: phone,
        p_shift: data.get('shift'),
        p_experience: data.get('experience'),
        p_note: String(data.get('note') || '').trim(),
        p_consent: true,
      },
    };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorLine.textContent = '';
    const result = validate();
    if (result.error) {
      errorLine.textContent = result.error;
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Илгээж байна…';
    try {
      showDone(await Backend.callPublic('submit_registration', result.args));
    } catch (error) {
      errorLine.textContent = error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';
      if (/дүүрсэн/i.test(errorLine.textContent)) loadAvailability();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Бүртгүүлэх';
    }
  });

  /* Төлбөрийн мэдээлэл (бүртгэлийн дараа) --------------------------------- */

  const copyStatus = $('pay-copy-status');

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = `${label} хуулагдлаа.`;
    } catch {
      copyStatus.textContent = 'Хуулж чадсангүй. Гараар тэмдэглэнэ үү.';
    }
  }

  function addRow(list, term, value, { copyText, className } = {}) {
    const row = document.createElement('div');
    if (className) row.className = className;
    const dd = el('dd');
    dd.append(el('span', value, 'pay-value'));
    if (copyText) {
      const button = el('button', 'Хуулах', 'copy-button');
      button.type = 'button';
      button.setAttribute('aria-label', `${term} хуулах`);
      button.addEventListener('click', () => copy(copyText, term));
      dd.append(button);
    }
    row.append(el('dt', term), dd);
    list.append(row);
  }

  function showDone(done) {
    // Ижил хүүхэд аль хэдийн бүртгэлтэй бол шинэ бүртгэл үүсээгүй гэдгийг мэдэгдэнэ.
    $('done-title').textContent = done.duplicate ? 'Энэ хүүхэд аль хэдийн бүртгэлтэй байна' : 'Бүртгэл хүлээн авлаа';
    $('done-lede').textContent = done.duplicate
      ? `Дахин бүртгүүлэх шаардлагагүй. Бүртгэлтэй ээлж: ${done.shift}. Ээлж солих бол ${club.phone || '+976 80344372'} дугаараар багшид хандана уу. Төлбөр төлөөгүй бол доорх дансанд шилжүүлнэ үү.`
      : 'Эхний 8 хичээлийн төлбөрөө доорх дансанд шилжүүлнэ үү.';
    const summary = $('done-summary');
    summary.replaceChildren();
    addRow(summary, 'Төлөх дүн', money(done.fee), { className: 'is-amount' });
    addRow(summary, 'Хичээлийн тоо', '8 удаагийн хичээл');
    addRow(summary, 'Хичээллэх өдөр', `${club.days || 'Бямба, Ням'} гараг`);
    addRow(summary, 'Цаг', done.shift);
    addRow(summary, 'Хичээл эхлэх', firstClassLabel());

    const pay = $('pay-details');
    pay.replaceChildren();
    if (bank.account) {
      if (bank.name) addRow(pay, 'Банк', bank.name);
      addRow(pay, 'Данс', bank.account, { copyText: bank.account });
      if (bank.iban) addRow(pay, 'IBAN', groupIban(bank.iban), { copyText: bank.iban });
      if (bank.holder) addRow(pay, 'Хүлээн авагч', bank.holder);
    } else {
      addRow(pay, 'Данс', `Багшаас лавлана: ${club.phone || '+976 80344372'}`);
    }
    addRow(pay, 'Дүн', money(done.fee), { copyText: String(done.fee) });
    addRow(pay, 'Гүйлгээний утга', done.reference, { copyText: done.reference, className: 'is-ref' });
    copyStatus.textContent = '';

    form.hidden = true;
    $('register-done').hidden = false;
    $('register-done').focus();
  }

  $('register-again').addEventListener('click', () => {
    form.reset();
    $('register-done').hidden = true;
    form.hidden = false;
    $('reg-child').focus();
  });
})();
