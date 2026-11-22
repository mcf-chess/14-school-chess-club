/*
  Онлайн бүртгэл ба төлбөрийн төлөв шалгах (contact.html#register).

  Бүртгэлийг сервер дээрх submit_registration функц хүлээн авч, гүйлгээний код буцаана.
  Зочин хүснэгтээс юу ч уншиж чадахгүй: төлөв шалгахад код болон утасны дугаар хоёулаа
  таарах ёстой бөгөөд зөвхөн төлөв, баталгаажсан саруудыг харуулна.
  Сайт мөнгө хүлээн авахгүй: төлбөрийг дансаар шилжүүлж, админ баталгаажуулна.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('register-form');
  if (!form) return;

  const club = typeof CLUB !== 'undefined' ? CLUB : {};
  const bank = club.bank || {};
  const hasBank = Boolean(bank.account && bank.account.trim());
  const ready = typeof Backend !== 'undefined' && Backend.isConfigured;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  // Огноо: 2026-11-22 → 2026.11.22
  const dateLabel = (iso) => String(iso).slice(0, 10).replace(/-/g, '.');
  const money = (n) => `${Number(n).toLocaleString('en-US')}₮`;

  // Сервертэй адил: эхлэх өдрөөс k сарын дараах өдөр (сарын сүүлд таацуулна).
  function addMonths(iso, k) {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1 + k, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
  }
  const dayBefore = (iso) => {
    const date = new Date(iso + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  };
  // Эхлэх өдрөөс тоолсон үеийн дуусах өдөр.
  function periodEnd(startDate, periodStart) {
    for (let k = 0; k < 240; k += 1) {
      if (addMonths(startDate, k) === periodStart) return dayBefore(addMonths(startDate, k + 1));
    }
    return null;
  }
  const todayUB = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());

  const digits = (value) => value.replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '');

  /* Дансны мэдээлэл ------------------------------------------------------- */

  function bankDetails(code) {
    const box = document.createElement('div');
    box.className = 'bank-details';
    if (!hasBank) {
      box.append(
        el('p', 'Дансны мэдээллийг багш утсаар хэлнэ: '),
      );
      const link = el('a', club.phone || '+976 80344372');
      link.href = 'tel:' + (club.phoneIntl || '+97680344372');
      box.firstChild.append(link);
    } else {
      const list = document.createElement('dl');
      const add = (term, value) => {
        const row = document.createElement('div');
        row.append(el('dt', term), el('dd', value));
        list.append(row);
      };
      if (bank.name) add('Банк', bank.name);
      add('Данс', bank.account);
      if (bank.holder) add('Хүлээн авагч', bank.holder);
      box.append(list);
    }
    const ref = el('p', null, 'bank-ref');
    ref.append('Гүйлгээний утга: ');
    ref.append(el('strong', code ? `${code} хүүхдийн нэр` : 'бүртгэлийн код + хүүхдийн нэр'));
    box.append(ref);
    return box;
  }

  $('bank-box').replaceChildren(bankDetails(''));

  if (!ready) {
    const note = el(
      'p',
      'Онлайн бүртгэл түр ажиллахгүй байна. Утсаар бүртгүүлнэ үү.',
      'register-error',
    );
    form.before(note);
    return;
  }

  form.hidden = false;
  $('status-form').hidden = false;

  /* Бүртгүүлэх ------------------------------------------------------------ */

  const errorLine = $('register-error');

  function validate() {
    const data = new FormData(form);
    const child = String(data.get('child') || '').trim();
    const age = Number(data.get('age'));
    const parent = String(data.get('parent') || '').trim();
    const phone = digits(String(data.get('phone') || ''));
    const checks = [
      [child.length >= 2, 'reg-child', 'Хүүхдийн овог, нэрийг бичнэ үү.'],
      [data.get('school'), 'school', 'Аль сургуулийн сурагч болохыг сонгоно уу.'],
      [Number.isInteger(age) && age >= 3 && age <= 18, 'reg-age', 'Хүүхдийн насыг 3–18 хооронд бичнэ үү.'],
      [data.get('experience'), 'reg-experience', 'Шатрын мэдлэгийг сонгоно уу.'],
      [data.get('shift'), null, 'Хүссэн ээлжээ сонгоно уу.'],
      [parent.length >= 2, 'reg-parent', 'Эцэг эх, асран хамгаалагчийн нэрийг бичнэ үү.'],
      [/^\d{8}$/.test(phone), 'reg-phone', 'Утасны дугаар 8 оронтой байх ёстой.'],
      [data.get('consent'), 'reg-consent', 'Мэдээлэл хадгалах зөвшөөрлийг тэмдэглэнэ үү.'],
    ];
    form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
    for (const [ok, id, message] of checks) {
      if (!ok) {
        const field = $(id) || form.querySelector(`input[name="${id || 'shift'}"]`);
        if ($(id)) field.setAttribute('aria-invalid', 'true');
        field.focus();
        return { error: message };
      }
    }
    return {
      args: {
        p_child_name: child,
        p_child_age: age,
        p_school_type: data.get('school'),
        p_school_grade: String(data.get('grade') || '').trim(),
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
      const done = await Backend.callPublic('submit_registration', result.args);
      showDone(done);
    } catch (error) {
      errorLine.textContent = error?.message || 'Алдаа гарлаа. Дахин оролдоно уу.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Бүртгүүлэх';
    }
  });

  function showDone(done) {
    const code = String(done.code);
    $('done-code').textContent = code;

    const summary = $('done-summary');
    summary.replaceChildren();
    const add = (term, value, className) => {
      const row = document.createElement('div');
      if (className) row.className = className;
      row.append(el('dt', term), el('dd', value));
      summary.append(row);
    };
    add('Төлөх дүн', `${money(done.fee)} / сар`, 'is-amount');
    add('Хичээллэх өдөр', `${club.days || 'Бямба, Ням'} гараг`);
    add('Цаг', done.shift);
    add('Эхний сар', `${dateLabel(done.start_date)} – ${dateLabel(done.period_end)}`);
    add('Дараагийн төлбөр', dateLabel(done.next_due));

    $('done-payment').replaceChildren(
      el('p', `Эхний сарын ${money(done.fee)}-ийг доорх дансанд шилжүүлнэ үү.`),
      bankDetails(code),
    );
    form.hidden = true;
    $('register-done').hidden = false;
    $('register-done').focus();
    $('status-code').value = code;
  }

  // Сургуулиас хамаарч ангийн талбарын шошгыг солино.
  form.querySelectorAll('input[name="school"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const other = radio.value === 'other';
      $('reg-grade-label').firstChild.textContent = other ? 'Сургууль, анги ' : 'Анги ';
      $('reg-grade').placeholder = other ? '23-р сургууль, 3б' : '3б';
    });
  });

  $('copy-code').addEventListener('click', async () => {
    const status = $('copy-code-status');
    try {
      await navigator.clipboard.writeText($('done-code').textContent);
      status.textContent = 'Хууллаа.';
    } catch {
      status.textContent = 'Хуулж чадсангүй. Кодыг гараар тэмдэглэнэ үү.';
    }
  });

  $('register-again').addEventListener('click', () => {
    form.reset();
    $('register-done').hidden = true;
    form.hidden = false;
    $('reg-child').focus();
  });

  /* Төлбөрөө шалгах ------------------------------------------------------- */

  const statusForm = $('status-form');
  const statusResult = $('status-result');

  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = statusForm.code.value.trim().toUpperCase();
    const phone = digits(statusForm.phone.value);
    if (!/^CH\d{4,}$/.test(code) || !/^\d{8}$/.test(phone)) {
      statusResult.replaceChildren(
        el('p', 'Код (жишээ нь CH0001) болон 8 оронтой утасны дугаараа бичнэ үү.', 'register-error'),
      );
      return;
    }
    const submit = statusForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const rows = await Backend.callPublic('registration_status', { p_code: code, p_phone: phone });
      if (!rows || rows.length === 0) {
        statusResult.replaceChildren(
          el('p', 'Бүртгэл олдсонгүй. Код, утасны дугаараа шалгана уу.', 'register-error'),
        );
        return;
      }
      const row = rows[0];
      const box = el('div', null, 'status-box');
      box.append(
        el('p', `Төлөв: ${row.status}`),
        el('p', `Ээлж: ${club.days || 'Бямба, Ням'} гараг, ${row.shift}`),
        el('p', `Сарын төлбөр: ${money(row.monthly_fee)}`),
      );
      const periods = row.paid_periods || [];
      if (periods.length === 0) {
        box.append(el('p', 'Баталгаажсан төлбөр одоогоор алга. Шилжүүлсэн бол багш шалгаад баталгаажуулна.'));
      } else {
        box.append(el('p', 'Баталгаажсан төлбөр:'));
        const list = el('ul', null, 'paid-list');
        periods.forEach((start) => {
          const end = periodEnd(row.start_date, start);
          list.append(el('li', end ? `${dateLabel(start)} – ${dateLabel(end)}` : dateLabel(start)));
        });
        box.append(list);
      }
      if (row.next_due) {
        const overdue = row.next_due <= todayUB();
        box.append(
          el(
            'p',
            overdue
              ? `Төлөх хугацаа болсон. Сар эхлэх өдөр ${dateLabel(row.next_due)}, дүн ${money(row.monthly_fee)}`
              : `Дараагийн төлбөр: ${dateLabel(row.next_due)}, ${money(row.monthly_fee)}`,
            overdue ? 'status-due' : 'status-next',
          ),
        );
      }
      statusResult.replaceChildren(box);
    } catch (error) {
      statusResult.replaceChildren(el('p', error?.message || 'Алдаа гарлаа.', 'register-error'));
    } finally {
      submit.disabled = false;
    }
  });
})();
