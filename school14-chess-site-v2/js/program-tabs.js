/*
  Сургалтын түвшин (training.html):
    1. HTML дэх <details> жагсаалтыг таб болгон хувиргах
    2. Таб солих: хулгана, гарын сум, Home, End
    3. Холбоосоор (#level-foundation гэх мэт) зөв табыг нээх
    4. «Тохирох түвшнээ баримжаалаарай» хэсэг

  JavaScript ажиллахгүй бол HTML дэх <details> хэвээр үлдэж, бүх агуулга уншигдана.
*/
(() => {
  'use strict';

  const container = document.getElementById('program-levels');
  if (!container) return;

  /* 1. <details> → таб ----------------------------------------------------- */

  const tablist = document.createElement('div');
  tablist.className = 'program-tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', container.dataset.label || 'Сургалтын түвшин');

  // Түвшин бүр: { level, tab, panel }
  const levels = [...container.querySelectorAll('details')].map((details) => {
    const level = details.dataset.level;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = 'tab-' + level;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', details.id);
    tab.append(...details.querySelector('summary').childNodes);
    tablist.append(tab);

    // Самбар нь <details>-ийн id-г өвлөнө: #level-… холбоосууд хэвээр ажиллана.
    const panel = details.querySelector('.program-panel');
    panel.id = details.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    details.replaceWith(panel);

    return { level, tab, panel };
  });

  container.prepend(tablist);

  /* 2. Таб солих ----------------------------------------------------------- */

  // Сонгогдсон таб, ARIA төлөв, харагдаж буй самбар гурав үргэлж нэг функцээр шинэчлэгдэнэ.
  function showLevel(level, { focusTab = false } = {}) {
    if (!levels.some((item) => item.level === level)) return false;
    levels.forEach(({ level: itemLevel, tab, panel }) => {
      const isActive = itemLevel === level;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      panel.hidden = !isActive;
      if (isActive && focusTab) tab.focus();
    });
    return true;
  }

  const keyToIndex = {
    ArrowRight: (i) => (i + 1) % levels.length,
    ArrowLeft: (i) => (i - 1 + levels.length) % levels.length,
    Home: () => 0,
    End: () => levels.length - 1,
  };

  levels.forEach(({ level, tab }, index) => {
    tab.addEventListener('click', () => showLevel(level));
    tab.addEventListener('keydown', (event) => {
      const nextIndex = keyToIndex[event.key];
      if (!nextIndex) return;
      event.preventDefault();
      showLevel(levels[nextIndex(index)].level, { focusTab: true });
    });
  });

  /* 3. Холбоосоор таб нээх ------------------------------------------------- */

  // training.html#level-foundation → «Суурь бататгах» таб.
  function levelFromHash() {
    const match = location.hash.match(/^#level-(\w+)$/);
    return match ? match[1] : null;
  }

  function openFromHash() {
    const level = levelFromHash();
    if (level && showLevel(level)) {
      document.getElementById('program').scrollIntoView();
    }
  }

  showLevel(levelFromHash() || levels[0].level) || showLevel(levels[0].level);
  if (levelFromHash()) document.getElementById('program').scrollIntoView();
  window.addEventListener('hashchange', openFromHash);

  // Тухайн хуудсан дахь #level-… холбоос дарахад hash өөрчлөгдөөгүй байсан ч таб нээгдэнэ.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#level-"]');
    if (!link) return;
    const level = link.getAttribute('href').replace('#level-', '');
    if (showLevel(level)) {
      event.preventDefault();
      history.replaceState(null, '', '#level-' + level);
      document.getElementById('program').scrollIntoView();
      levels.find((item) => item.level === level).tab.focus({ preventScroll: true });
    }
  });

  /* 4. Тохирох түвшин баримжаалах ------------------------------------------ */

  const levelAdvice = {
    beginner: {
      title: 'Анхан шатнаас эхлэхэд тохиромжтой.',
      text: 'Дүрсүүдийн нүүдэл, үндсэн дүрэм, энгийн матын бодлогоос эхэлнэ.',
    },
    foundation: {
      title: 'Суурь бататгах сургалтыг сонирхоорой.',
      text: 'Тактик, гарааны зарчим, төгсгөлийн суурь мэдлэгээ тоглолттой хослуулна.',
    },
    competition: {
      title: 'Тэмцээний бэлтгэлийн талаар багштай ярилцаарай.',
      text: 'Өргийн шинжилгээ, тооцоолол, гарааны сан болон төгсгөлийн бэлтгэлд төвлөрнө.',
    },
  };

  const levelResult = document.getElementById('level-result');

  document.querySelectorAll('input[name="level"]').forEach((input) => {
    input.addEventListener('change', () => {
      const advice = levelAdvice[input.value];

      const title = document.createElement('strong');
      title.textContent = advice.title;

      const text = document.createElement('p');
      text.textContent = advice.text;

      // Дээрх click сонсогч энэ холбоосыг барьж, зөв табыг нээнэ.
      const link = document.createElement('a');
      link.href = '#level-' + input.value;
      link.textContent = 'Тохирох хөтөлбөрийг үзэх ↑';

      levelResult.replaceChildren(title, text, link);
    });
  });
})();
