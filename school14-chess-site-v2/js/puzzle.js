/*
  Шатрын бодлогын хөлөг (training.html).

  Бодлогууд js/puzzle-data.js-д, шатрын дүрэм js/chess-rules.js-д байна.
  Хүүхэд цагаан дүрсээ дарж (эсвэл чирж, эсвэл гарын сумаар) нүүнэ.
  Нүүдэл бүрийг дүрмээр шалгаж, хариу өгнө:
    — дүрмийн бус нүүдэл: шалтгааныг тайлбарлана
    — дүрмийн дагуу боловч зөв биш: хар хэрхэн аврагдахыг тайлбарлаж, дүрсийг буцаана
    — олон нүүдлийн бодлогын зөв нүүдэл: хар автоматаар хариулна
    — мад: бодлого бодогдлоо
*/
(() => {
  'use strict';

  const board = document.getElementById('board');
  if (!board || typeof PUZZLES === 'undefined' || typeof ChessRules === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const message = $('puzzle-message');
  const hintButton = $('hint');
  const resetButton = $('reset');
  const nextButton = $('next-puzzle');
  const list = $('puzzle-list');
  const movesBox = $('puzzle-moves');
  const shell = board.closest('.puzzle-shell');

  const FILES = ChessRules.FILES;
  const PIECE_NAMES = { K: 'ноён', Q: 'бэрс', R: 'тэрэг', B: 'тэмээ', N: 'морь', P: 'хүү' };
  const COLOR_NAMES = { w: 'цагаан', b: 'хар' };
  const STORAGE_KEY = 'club-puzzles-solved';
  const REPLY_DELAY = 450;

  const squares = new Map(); // нүдний нэр → <button>
  const chips = [];

  // Бодсон бодлогуудыг нэрээр нь хадгална (бодлогын дараалал өөрчлөгдсөн ч зөв үлдэнэ).
  const completed = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    PUZZLES.forEach((puzzle, index) => saved.includes(puzzle.title) && completed.add(index));
  } catch {
    /* Хадгалах боломжгүй хөтөч: ахиц зөвхөн энэ удаад үлдэнэ. */
  }

  let puzzleIndex = 0;
  let position;
  let ply = 0; // шийдлийн мөрийн хэд дэх нүүдэл дээр байна
  let played = []; // хийгдсэн нүүдлүүдийн тэмдэглэгээ
  let lastMove = null; // { from, to }
  let selected = null;
  let focusSquare;
  let solved = false;
  let busy = false; // хар хариулж байх үед хөлөг түгжээтэй
  let hintLevel = 0; // 1: шийдлийн нүдийг харуулж байна
  let replyTimer = null;
  let onLine = true; // хийсэн нүүдлүүд шийдлийн мөртэй таарч байгаа эсэх
  let animating = false; // дүрс хөдөлж байх үед шинэ нүүдэл хүлээж авахгүй
  let generation = 0; // бодлого ачаалах бүрт нэмэгдэнэ: хуучин хөдөлгөөний үр дүнг хаяна

  /* Хөдөлгөөн ------------------------------------------------------------- */

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.22,.75,.3,1)';

  // Дүрсийн зургийг урьдчилан ачаалж, эхний нүүдэлд анивчихаас сэргийлнэ.
  for (const c of 'wb') for (const k of 'KQRBNP') new Image().src = `assets/pieces/${c}${k}.svg`;

  function offset(from, to) {
    const a = squares.get(from).getBoundingClientRect();
    const b = squares.get(to).getBoundingClientRect();
    return [b.left - a.left, b.top - a.top];
  }

  // Дүрсийг from нүднээс to нүд рүү гулсуулна. back: очоод буцна. fromDrop: чирж тавьсан газраас буцна.
  function slide(from, to, { back = false, fromDrop = false } = {}) {
    const button = squares.get(from);
    const image = button.querySelector('img');
    if (!image || reduceMotion() || typeof image.animate !== 'function') return Promise.resolve();
    const [dx, dy] = offset(from, to);
    const there = `translate(${dx}px, ${dy}px)`;
    let frames;
    let duration;
    if (fromDrop) {
      frames = [{ transform: there }, { transform: 'none' }];
      duration = 260;
    } else if (back) {
      frames = [
        { transform: 'none' },
        { transform: there, offset: 0.4 },
        { transform: there, offset: 0.62 },
        { transform: 'none' },
      ];
      duration = 720;
    } else {
      const distance = Math.hypot(dx, dy);
      frames = [{ transform: 'none' }, { transform: there }];
      duration = Math.min(320, 160 + distance * 0.35);
    }
    button.classList.add('moving');
    const captured = !back && !fromDrop && squares.get(to).querySelector('img');
    if (captured) captured.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration, easing: 'ease-in', fill: 'forwards' });
    const motion = image.animate(frames, { duration, easing: EASE, fill: 'forwards' });
    return motion.finished.catch(() => {}).then(() => {
      button.classList.remove('moving');
      if (back || fromDrop) motion.cancel();
    });
  }

  function shake(square) {
    const image = squares.get(square)?.querySelector('img');
    if (!image || reduceMotion() || typeof image.animate !== 'function') return;
    image.animate(
      [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
      { duration: 280, easing: 'ease-out' },
    );
  }

  function pulse(square) {
    const button = squares.get(square);
    if (!button || reduceMotion() || typeof button.animate !== 'function') return;
    button.animate([{ boxShadow: 'inset 0 0 0 0 rgba(23,102,63,.0)' }, { boxShadow: 'inset 0 0 0 6px rgba(23,102,63,.55)' }, { boxShadow: 'inset 0 0 0 3px rgba(23,102,63,.0)' }], { duration: 700, easing: 'ease-out' });
  }

  /* Туслах функцууд -------------------------------------------------------- */

  const currentPuzzle = () => PUZZLES[puzzleIndex];
  const whiteMoves = (puzzle) => (puzzle.line.length + 1) / 2;
  const expected = () => currentPuzzle().line[ply];
  const pieceName = (piece) => `${COLOR_NAMES[piece[0]]} ${PIECE_NAMES[piece[1]]}`;
  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);
  const MOVE_WORDS = ['Нэг', 'Хоёр', 'Гурван'];
  const goalText = (puzzle) => `${MOVE_WORDS[whiteMoves(puzzle) - 1]} нүүдлээр мад`;
  const movesLeft = () => (currentPuzzle().line.length - ply + 1) / 2;
  const after = (pos, move) => ChessRules.applyMove(pos, move.from, move.to);

  // Цагаан нүүсний дараах байрлал: хар юу ч хийсэн цагаан n-1 нүүдэлд мад тавих уу?
  function forces(pos, n) {
    if (ChessRules.isCheckmate(pos, 'b')) return true;
    if (n === 1) return false;
    const replies = ChessRules.allLegalMoves(pos, 'b');
    return (
      replies.length > 0 &&
      replies.every((reply) =>
        ChessRules.allLegalMoves(after(pos, reply), 'w').some((move) =>
          forces(after(after(pos, reply), move), n - 1),
        ),
      )
    );
  }

  function announce(text, state = '') {
    message.textContent = text;
    message.className = ('puzzle-message ' + state).trim();
  }

  function saveProgress() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...completed].map((index) => PUZZLES[index].title)),
      );
    } catch {
      /* хадгалж чадаагүй ч бодлого үргэлжилнэ */
    }
  }

  /* Тайлбарууд ------------------------------------------------------------- */

  const SHAPE_RULES = {
    K: 'Ноён аль ч зүгт зөвхөн нэг нүд нүүнэ.',
    Q: 'Бэрс шулуун болон ташуу шугамаар нүүнэ.',
    R: 'Тэрэг зөвхөн босоо эсвэл хэвтээ шулуун шугамаар нүүнэ.',
    B: 'Тэмээ зөвхөн ташуу шугамаар нүүнэ.',
    N: 'Морь «Г» хэлбэрээр нүүнэ: хоёр нүд шулуун, нэг нүд хажуу тийш.',
    P: 'Хүү урагш нэг нүд (эхний байрлалаасаа хоёр нүд) нүүж, зөвхөн ташуу иднэ.',
  };

  function explainIllegal(from, to, reason) {
    const piece = position[from];
    switch (reason.code) {
      case 'own-piece':
        return `${to} нүдэнд өөрийн ${PIECE_NAMES[position[to][1]]} байна. Өөрийн дүрсийг идэж болохгүй.`;
      case 'king':
        return 'Ноёныг идэж болохгүй. Ноёнд зугтах газаргүй шаг өгөх нүүдлийг олоорой.';
      case 'blocked':
        return `${capitalize(PIECE_NAMES[piece[1]])} ${to} нүдэнд хүрэхгүй: замд ${reason.blocker} нүдэн дэх ${pieceName(position[reason.blocker])} саад болж байна. Дүрс дээгүүр харайж болохгүй.`;
      case 'self-check':
        return 'Ингэж нүүвэл цагаан ноён шагт орно. Энэ нүүдэл дүрмийн бус.';
      default:
        return `Дүрмийн бус нүүдэл. ${SHAPE_RULES[piece[1]]}`;
    }
  }

  // Дүрмийн дагуу боловч зөв биш нүүдлийн дараа хар хэрхэн аврагдахыг тайлбарлана.
  function explainNotMate(next) {
    if (ChessRules.isStalemate(next, 'b')) {
      return 'Энэ нүүдлээр жид болно: хар шагт ороогүй мөртөө нүүх нүүдэлгүй. Жид бол тэнцээ.';
    }
    const many = movesLeft() > 1;
    if (!ChessRules.inCheck(next, 'b')) {
      return many
        ? 'Дүрмийн дагуух нүүдэл. Гэхдээ хар хамгаалж амжина. Илүү хүчтэй нүүдэл хайгаарай.'
        : 'Дүрмийн дагуух нүүдэл. Гэхдээ хар ноёнд шаг өгөөгүй тул мад биш.';
    }
    const escape = ChessRules.allLegalMoves(next, 'b')[0];
    const piece = next[escape.from];
    const how =
      piece[1] === 'K'
        ? next[escape.to]
          ? `хар ноён ${escape.to} нүдэн дэх дүрсийг идэж аврагдана`
          : `хар ноён ${escape.to} нүд рүү зугтана`
        : next[escape.to]
          ? `${pieceName(piece)} ${escape.to} нүдэн дэх дүрсийг идэж шагийг арилгана`
          : `${pieceName(piece)} ${escape.to} нүдэнд очиж шагийг хаана`;
    return many
      ? `Шаг өглөө. Гэхдээ энэ замаар мад гарахгүй: ${how}.`
      : `Шаг өглөө. Гэхдээ мад биш: ${how}.`;
  }

  /* Хөлөг ба бодлогын жагсаалт үүсгэх -------------------------------------- */

  for (let rank = 8; rank >= 1; rank--) {
    for (const file of FILES) {
      const square = file + rank;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = square;
      button.addEventListener('click', () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        selectSquare(square);
      });
      button.addEventListener('keydown', (event) => navigate(event, square));
      squares.set(square, button);
      board.append(button);
    }
  }

  if (list) {
    PUZZLES.forEach((puzzle, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'puzzle-chip';
      chip.addEventListener('click', () => loadPuzzle(index));
      chips.push(chip);
      list.append(chip);
    });
  }

  /* Хөлгийг зурах ---------------------------------------------------------- */

  function render({ focus = false } = {}) {
    const puzzle = currentPuzzle();
    const targets = selected && !busy ? ChessRules.legalMoves(position, selected) : [];
    const checkedKing = ChessRules.inCheck(position, 'b')
      ? ChessRules.kingSquare(position, 'b')
      : null;
    const next = !solved && !busy && ply % 2 === 0 ? expected() : null;

    for (const [square, button] of squares) {
      const piece = position[square];
      // a1 бараан, h1 цайвар нүд.
      const isDark = (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 1;
      const isAnswer = hintLevel === 1 && next && (square === next.from || square === next.to);

      button.className = [
        'square',
        isDark ? 'dark' : 'light',
        piece?.[0] === 'w' && !solved && 'own',
        selected === square && 'selected',
        targets.includes(square) && 'available',
        lastMove && (square === lastMove.from || square === lastMove.to) && 'last',
        isAnswer && 'answer',
        square === checkedKing && 'check',
      ]
        .filter(Boolean)
        .join(' ');

      button.tabIndex = square === focusSquare ? 0 : -1;
      button.setAttribute('aria-pressed', String(selected === square));
      button.setAttribute(
        'aria-label',
        [
          square,
          piece ? pieceName(piece) : 'хоосон нүд',
          targets.includes(square) && 'нүүж болно',
          isAnswer && 'шийдлийн нүд',
        ]
          .filter(Boolean)
          .join(', '),
      );

      if (button.dataset.piece !== (piece || '')) {
        button.dataset.piece = piece || '';
        button.replaceChildren();
        if (piece) {
          const image = document.createElement('img');
          image.src = `assets/pieces/${piece}.svg`;
          image.alt = '';
          image.draggable = false;
          image.width = 80;
          image.height = 80;
          button.append(image);
        }
      }
    }

    $('puzzle-turn').textContent = solved
      ? 'Мад! Сайн бодлоо.'
      : busy
        ? 'Хар нүүж байна…'
        : ply > 0
          ? `Цагаан нүүнэ: ${movesLeft() === 1 ? 'одоо мад тавь' : `${MOVE_WORDS[movesLeft() - 1].toLowerCase()} нүүдэл үлдлээ`}`
          : 'Цагаан нүүнэ';
    $('puzzle-progress').textContent = `Бодсон: ${completed.size} / ${PUZZLES.length}`;
    shell.classList.toggle('is-solved', solved);
    shell.classList.toggle('is-busy', busy);
    board.setAttribute('aria-busy', String(busy));

    if (movesBox) {
      movesBox.hidden = played.length === 0;
      movesBox.textContent = played.length
        ? 'Нүүдлүүд: ' +
          played
            .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
            .join(' ')
        : '';
    }

    chips.forEach((chip, index) => {
      const done = completed.has(index);
      chip.textContent = String(index + 1);
      chip.dataset.level = PUZZLES[index].level;
      chip.classList.toggle('done', done);
      chip.setAttribute(
        'aria-label',
        `${index + 1}-р бодлого, ${PUZZLES[index].level}${done ? ', бодсон' : ''}`,
      );
      if (index === puzzleIndex) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });

    const isLast = puzzleIndex === PUZZLES.length - 1;
    nextButton.textContent = solved
      ? isLast
        ? 'Эхний бодлого руу'
        : 'Дараагийн бодлого'
      : isLast
        ? 'Эхний бодлого руу'
        : 'Алгасах';
    nextButton.classList.toggle('primary', solved);
    nextButton.classList.toggle('secondary', !solved);

    hintButton.disabled = busy;
    hintButton.textContent = solved ? 'Тайлбарыг дахин харах' : 'Шийдлийг харах';

    if (focus) squares.get(focusSquare).focus();
  }

  /* Бодлого ачаалах -------------------------------------------------------- */

  function loadPuzzle(index, { focus = false } = {}) {
    clearTimeout(replyTimer);
    generation++;
    puzzleIndex = index;
    const puzzle = currentPuzzle();
    position = { ...puzzle.position };
    ply = 0;
    onLine = true;
    played = [];
    lastMove = null;
    focusSquare = puzzle.line[0].from;
    selected = null;
    solved = false;
    busy = false;
    animating = false;
    hintLevel = 0;

    $('puzzle-title').textContent = puzzle.title;
    $('puzzle-level').textContent = puzzle.level;
    $('puzzle-level').dataset.level = puzzle.level;
    $('puzzle-goal').textContent = goalText(puzzle);
    $('puzzle-count').textContent = `${index + 1} / ${PUZZLES.length}`;
    board.setAttribute(
      'aria-label',
      `Шатрын бодлого ${index + 1}: ${puzzle.title}. ${puzzle.level}. Цагаан нүүнэ, ${goalText(puzzle).toLowerCase()}.`,
    );
    announce(
      whiteMoves(puzzle) === 1
        ? 'Цагаан нүүнэ. Нэг нүүдлээр мад тавих нүүдлийг олоорой.'
        : `Цагаан нүүнэ. ${goalText(puzzle)}: таны нүүдэл бүрийн дараа хар хариулна.`,
    );
    render({ focus });
    if (!reduceMotion()) {
      for (const image of board.querySelectorAll('img')) {
        image.animate?.([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
      }
    }
  }

  /* Нүд сонгох, нүүдэл шалгах ---------------------------------------------- */

  function selectSquare(square) {
    if (busy || animating) return;
    focusSquare = square;
    const piece = position[square];

    if (solved) {
      render({ focus: true });
      return announce(
        'Энэ бодлогыг бодсон. Дараагийн бодлого руу шилжих эсвэл дахин эхлээрэй.',
        'success',
      );
    }

    if (square === selected) {
      selected = null;
      render({ focus: true });
      return announce('Сонголт цуцлагдлаа. Цагаан дүрсээ дахин сонгож болно.');
    }

    if (piece?.[0] === 'w') {
      selected = square;
      const count = ChessRules.legalMoves(position, square).length;
      render({ focus: true });
      return announce(
        count
          ? `${capitalize(pieceName(piece))} (${square}) сонгогдлоо. Цэгээр тэмдэглэсэн ${count} нүдний аль нэг рүү нүүж болно.`
          : `${capitalize(pieceName(piece))} (${square}) сонгогдлоо. Гэхдээ энэ дүрсэнд нүүх нүд алга.`,
      );
    }

    if (!selected) {
      render({ focus: true });
      return announce(
        piece
          ? 'Энэ бол харын дүрс. Цагаан нүүнэ: эхлээд цагаан дүрсээ сонгоорой.'
          : 'Эхлээд цагаан дүрсээ сонгоорой.',
        'error',
      );
    }

    tryMove(selected, square);
  }

  async function tryMove(from, to, { dropped = false } = {}) {
    const reason = ChessRules.illegalReason(position, from, to);
    if (reason) {
      render({ focus: true });
      shake(from);
      return announce(explainIllegal(from, to, reason), 'error');
    }

    const puzzle = currentPuzzle();
    const book = expected();
    const isBook = onLine && from === book.from && to === book.to;
    const next = ChessRules.applyMove(position, from, to);
    const left = movesLeft();
    const mate = ChessRules.isCheckmate(next, 'b');
    const leads = !mate && left > 1 && (isBook || (ply > 0 && forces(next, left)));

    const run = generation;
    animating = true;
    selected = null;
    render();
    if (mate || leads) {
      if (!dropped) await slide(from, to);
    } else {
      await slide(from, to, dropped ? { fromDrop: true } : { back: true });
    }
    if (run !== generation) return; // энэ хооронд бодлогыг дахин эхлүүлсэн
    animating = false;

    if (mate) {
      played.push(isBook ? book.san : `${from}–${to}#`);
      finishMove(from, to, next);
      solved = true;
      completed.add(puzzleIndex);
      saveProgress();
      render({ focus: true });
      pulse(to);
      return announce(
        isBook || left === 1
          ? `Зөв! ${played[played.length - 1]} — мад. ${puzzle.explanation}`
          : 'Зөв! Энэ нүүдлээр ч мад боллоо.',
        'success',
      );
    }

    // Олон нүүдлийн бодлого: эхний нүүдэл шийдлийнхтэй таарах ёстой, дараагийнх нь мадад хүргэвэл зөв.
    if (leads) {
      played.push(isBook ? book.san : `${from}–${to}${ChessRules.inCheck(next, 'b') ? '+' : ''}`);
      onLine = isBook;
      finishMove(from, to, next);
      busy = true;
      hintLevel = 0;
      render();
      announce(`Сайн нүүдэл: ${played[played.length - 1]}. Хар хариулж байна…`, 'notice');
      replyTimer = setTimeout(blackReplies, REPLY_DELAY);
      return;
    }

    focusSquare = from;
    render({ focus: true });
    announce(`${explainNotMate(next)} Дүрс байрандаа буцлаа. Дахин оролдоорой.`, 'notice');
  }

  function finishMove(from, to, next) {
    position = next;
    lastMove = { from, to };
    selected = null;
    focusSquare = to;
    ply++;
  }

  async function blackReplies() {
    // Шийдлийн мөр дээр байвал тэр хариуг, үгүй бол хамгийн удаан тэсэх хариуг сонгоно.
    const replies = ChessRules.allLegalMoves(position, 'b');
    const book = expected();
    let reply = onLine && replies.some((m) => m.from === book.from && m.to === book.to) ? book : null;
    if (!reply) {
      reply =
        replies.find(
          (m) =>
            !ChessRules.allLegalMoves(after(position, m), 'w').some((w) =>
              ChessRules.isCheckmate(after(after(position, m), w), 'b'),
            ),
        ) || replies[0];
      onLine = false;
    }
    const capture = position[reply.to];
    const san = reply.san || `${reply.from}–${reply.to}`;
    const run = generation;
    await slide(reply.from, reply.to);
    if (run !== generation) return; // энэ хооронд бодлого солигдсон
    played.push(san);
    position = after(position, reply);
    lastMove = { from: reply.from, to: reply.to };
    ply++;
    busy = false;
    focusSquare = onLine ? expected().from : reply.to;
    render({ focus: board.contains(document.activeElement) });
    const only = replies.length === 1 ? ' Өөр нүүдэл байгаагүй.' : '';
    const rest =
      movesLeft() === 1 ? 'Одоо нэг нүүдлээр мад тавь.' : `Одоо ${goalText({ line: { length: movesLeft() * 2 - 1 } }).toLowerCase()} тавь.`;
    announce(
      `Хар ${san} нүүлээ${capture ? ` (${PIECE_NAMES[capture[1]]} идлээ)` : ''}.${only} ${rest}`,
      'notice',
    );
  }

  /* Чирж нүүх (хулгана, хуруу) --------------------------------------------- */

  let drag = null;
  let suppressClick = false;

  board.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.square');
    if (!button || busy || animating || solved || event.button > 0) return;
    const from = button.dataset.square;
    if (position[from]?.[0] !== 'w') return;
    drag = { from, x: event.clientX, y: event.clientY, ghost: null, pointerId: event.pointerId };
  });

  board.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      // Чирж эхэллээ: дүрсийг сонгож, хуруун доор түүний дүрсийг дагуулна.
      if (selected !== drag.from) selectSquare(drag.from);
      const size = squares.get(drag.from).getBoundingClientRect().width;
      const ghost = document.createElement('img');
      ghost.src = `assets/pieces/${position[drag.from]}.svg`;
      ghost.alt = '';
      ghost.className = 'drag-ghost';
      ghost.style.width = ghost.style.height = `${size}px`;
      document.body.append(ghost);
      drag.ghost = ghost;
      squares.get(drag.from).classList.add('dragging');
      board.setPointerCapture(event.pointerId);
    }
    drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -58%) scale(1.12)`;
    event.preventDefault();
  });

  function endDrag(event, cancelled) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, ghost } = drag;
    drag = null;
    if (!ghost) return; // энгийн дарах: click үйлдэл өөрөө хариулна
    ghost.remove();
    squares.get(from).classList.remove('dragging');
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (cancelled) return render();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.square');
    if (!target || !board.contains(target) || target.dataset.square === from) return render();
    focusSquare = target.dataset.square;
    tryMove(from, target.dataset.square, { dropped: true });
  }

  board.addEventListener('pointerup', (event) => endDrag(event, false));
  board.addEventListener('pointercancel', (event) => endDrag(event, true));

  /* Гарын удирдлага -------------------------------------------------------- */

  const ARROWS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };

  function navigate(event, square) {
    if (event.key === 'Escape' && selected) {
      selected = null;
      announce('Сонголт цуцлагдлаа.');
      return render({ focus: true });
    }
    const offset = ARROWS[event.key];
    if (!offset) return;
    event.preventDefault();
    const file = Math.min(7, Math.max(0, FILES.indexOf(square[0]) + offset[0]));
    const rank = Math.min(8, Math.max(1, Number(square[1]) + offset[1]));
    focusSquare = FILES[file] + rank;
    render({ focus: true });
  }

  /* Товчнууд --------------------------------------------------------------- */

  resetButton.addEventListener('click', () => loadPuzzle(puzzleIndex));

  nextButton.disabled = false;
  nextButton.addEventListener('click', () => loadPuzzle((puzzleIndex + 1) % PUZZLES.length));

  hintButton.addEventListener('click', () => {
    const puzzle = currentPuzzle();
    if (solved) {
      const line = puzzle.line.map((move) => move.san).join(' ');
      return announce(`${line} — ${puzzle.explanation}`, 'success');
    }
    const next = onLine ? expected() : null;
    if (!next) return announce('Энэ байрлалаас мад тавих нүүдлийг өөрөө олоорой.');
    hintLevel = 1;
    announce(
      `Шийдэл: ${next.from} нүдэн дэх ${PIECE_NAMES[position[next.from][1]]} ${next.to} нүд рүү нүүнэ (${next.san}). Онцолсон нүднүүдийг дарж өөрөө нүүж үзээрэй.`,
    );
    render();
  });

  loadPuzzle(0);
})();
