/*
  Шатрын бодлогын хөлөг (training.html).

  Бодлогууд js/puzzle-data.js-д, шатрын дүрэм js/chess-rules.js-д байна.
  Хэрэглэгч хулгана, хуруу эсвэл гарын сумаар цагаан дүрсээ сонгож нүүнэ.
  Нүүдэл бүрийг дүрмээр шалгаж, гурван өөр хариу өгнө:
    — дүрмийн бус нүүдэл (шалтгааныг тайлбарлана)
    — дүрмийн дагуу боловч мат биш (хар хэрхэн аврагдахыг тайлбарлана)
    — мат (бодлого бодогдлоо)
*/
(() => {
  'use strict';

  const board = document.getElementById('board');
  if (!board || typeof PUZZLES === 'undefined' || typeof ChessRules === 'undefined') return;

  const message = document.getElementById('puzzle-message');
  const hintButton = document.getElementById('hint');
  const nextButton = document.getElementById('next-puzzle');
  const shell = board.closest('.puzzle-shell');

  const FILES = ChessRules.FILES;
  const PIECE_NAMES = { K: 'ноён', Q: 'бэрс', R: 'тэрэг', B: 'тэмээ', N: 'морь', P: 'хүү' };
  const COLOR_NAMES = { w: 'цагаан', b: 'хар' };

  const squares = new Map(); // нүдний нэр → <button>
  const completed = new Set(); // бодсон бодлогын дугаарууд

  let puzzleIndex = 0;
  let position; // одоогийн байрлал
  let selected = null; // сонгосон цагаан дүрсийн нүд
  let focusSquare; // гарын фокус байгаа нүд
  let solved = false;
  let hintLevel = 0; // 0: санамж аваагүй, 1: санамж, 2: шийдэл харуулсан

  /* Туслах функцууд -------------------------------------------------------- */

  const currentPuzzle = () => PUZZLES[puzzleIndex];

  const pieceName = (piece) => `${COLOR_NAMES[piece[0]]} ${PIECE_NAMES[piece[1]]}`;

  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

  function announce(text, state = '') {
    message.textContent = text;
    message.className = ('puzzle-message ' + state).trim();
  }

  /* Тайлбарууд ------------------------------------------------------------- */

  const SHAPE_RULES = {
    K: 'Ноён аль ч зүгт зөвхөн нэг нүд нүүнэ.',
    Q: 'Бэрс шулуун болон ташуу шугамаар нүүнэ.',
    R: 'Тэрэг зөвхөн босоо эсвэл хэвтээ шулуун шугамаар нүүнэ.',
    B: 'Тэмээ зөвхөн ташуу шугамаар нүүнэ.',
    N: 'Морь «Г» хэлбэрээр нүүнэ.',
    P: 'Хүү урагш нэг нүд (эхний байрлалаасаа хоёр нүд) нүүж, зөвхөн ташуу иднэ.',
  };

  function explainIllegal(from, to, reason) {
    const piece = position[from];
    switch (reason.code) {
      case 'own-piece':
        return `${to} нүдэнд өөрийн ${PIECE_NAMES[position[to][1]]} байна. Өөрийн дүрсийг идэж болохгүй.`;
      case 'king':
        return 'Ноёныг идэж болохгүй. Ноёнд зугтах газаргүй шах өгөх нүүдлийг олоорой.';
      case 'blocked':
        return `${capitalize(PIECE_NAMES[piece[1]])} ${to} нүдэнд хүрэхгүй: замд ${reason.blocker} нүдэн дэх ${pieceName(position[reason.blocker])} саад болж байна. Дүрс дээгүүр харайж болохгүй.`;
      case 'self-check':
        return 'Ингэж нүүвэл цагаан ноён шахад орно. Энэ нүүдэл дүрмийн бус.';
      default:
        return `Дүрмийн бус нүүдэл. ${SHAPE_RULES[piece[1]]}`;
    }
  }

  // Дүрмийн дагуу боловч мат болоогүй нүүдлийн дараах байрлалыг тайлбарлана.
  function explainNotMate(next) {
    if (ChessRules.isStalemate(next, 'b')) {
      return 'Энэ нүүдлээр пат болно: хар шахад ороогүй мөртөө нүүх нүүдэлгүй. Пат бол тэнцээ.';
    }
    if (!ChessRules.inCheck(next, 'b')) {
      return 'Дүрмийн дагуух нүүдэл. Гэхдээ хар ноёнд шах болоогүй тул мат биш.';
    }
    const escape = ChessRules.allLegalMoves(next, 'b')[0];
    const piece = next[escape.from];
    const how =
      piece[1] === 'K'
        ? `хар ноён ${escape.to} нүд рүү зугтана`
        : next[escape.to]
          ? `${pieceName(piece)} ${escape.to} нүдэн дэх дүрсийг идэж шахыг арилгана`
          : `${pieceName(piece)} ${escape.to} нүдэнд очиж шахыг хаана`;
    return `Шах боллоо. Гэхдээ мат биш: ${how}.`;
  }

  /* Хөлөг үүсгэх ----------------------------------------------------------- */

  // Нүднүүдийг нэг удаа үүсгэснээр сонголт хийхэд фокус болон click үйлдэл алдагдахгүй.
  for (let rank = 8; rank >= 1; rank--) {
    for (const file of FILES) {
      const square = file + rank;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.square = square;
      button.addEventListener('click', () => selectSquare(square));
      button.addEventListener('keydown', (event) => navigate(event, square));
      squares.set(square, button);
      board.append(button);
    }
  }

  /* Хөлгийг зурах ---------------------------------------------------------- */

  function render({ focus = false } = {}) {
    const puzzle = currentPuzzle();
    const targets = selected ? ChessRules.legalMoves(position, selected) : [];
    const checkedKing = ChessRules.inCheck(position, 'b')
      ? ChessRules.kingSquare(position, 'b')
      : null;

    for (const [square, button] of squares) {
      const piece = position[square];
      const isDark = (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 0;
      const isAnswer =
        hintLevel === 2 &&
        !solved &&
        (square === puzzle.solution.to || square === puzzle.solution.from);

      button.className = [
        'square',
        isDark ? 'dark' : 'light',
        selected === square && 'selected',
        targets.includes(square) && 'available',
        solved && square === lastMoveTo && 'last',
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

      // Дүрс өөрчлөгдсөн нүдний зургийг л солино.
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

    document.getElementById('puzzle-turn').textContent = solved
      ? 'Мат! Сайн бодлоо.'
      : 'Цагаан нүүнэ';
    document.getElementById('puzzle-progress').textContent =
      `Бодсон: ${completed.size} / ${PUZZLES.length}`;
    shell.classList.toggle('is-solved', solved);

    const isLast = puzzleIndex === PUZZLES.length - 1;
    nextButton.textContent = isLast
      ? 'Эхний бодлого руу ↺'
      : solved
        ? 'Дараагийн бодлого →'
        : 'Алгасах →';

    hintButton.textContent =
      solved || hintLevel === 2
        ? 'Тайлбарыг дахин харах'
        : hintLevel === 1
          ? 'Шийдлийг харах'
          : 'Санамж авах';

    if (focus) squares.get(focusSquare).focus();
  }

  /* Бодлого ачаалах -------------------------------------------------------- */

  let lastMoveTo = null;

  function loadPuzzle(index, { focus = false } = {}) {
    puzzleIndex = index;
    const puzzle = currentPuzzle();
    position = { ...puzzle.position };
    focusSquare = puzzle.solution.from;
    selected = null;
    solved = false;
    hintLevel = 0;
    lastMoveTo = null;

    document.getElementById('puzzle-title').textContent = puzzle.title;
    document.getElementById('puzzle-count').textContent =
      `${String(index + 1).padStart(2, '0')} / ${String(PUZZLES.length).padStart(2, '0')}`;
    board.setAttribute('aria-label', `Шатрын бодлого ${index + 1}: ${puzzle.title}. Цагаан нүүнэ.`);
    announce('Цагаан нүүнэ. Дүрсээ сонгоод нэг нүүдлээр мат тавих нүдийг олоорой.');
    render({ focus });
  }

  /* Нүд сонгох, нүүдэл шалгах ---------------------------------------------- */

  function selectSquare(square) {
    focusSquare = square;
    const piece = position[square];

    if (solved) {
      render({ focus: true });
      return announce(
        'Энэ бодлогыг бодсон. Дараагийн бодлого руу шилжих эсвэл дахин эхлээрэй.',
        'success',
      );
    }

    // Сонгосон дүрсээ дахин дарвал сонголт цуцлагдана.
    if (square === selected) {
      selected = null;
      render({ focus: true });
      return announce('Сонголт цуцлагдлаа. Цагаан дүрсээ дахин сонгож болно.');
    }

    // Цагаан дүрс дарвал түүнийг сонгоно (өөр дүрс сонгосон байсан ч).
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

  function tryMove(from, to) {
    const reason = ChessRules.illegalReason(position, from, to);
    if (reason) {
      render({ focus: true });
      return announce(explainIllegal(from, to, reason), 'error');
    }

    const next = ChessRules.applyMove(position, from, to);

    if (ChessRules.isCheckmate(next, 'b')) {
      const puzzle = currentPuzzle();
      const isBookMove = from === puzzle.solution.from && to === puzzle.solution.to;
      position = next;
      selected = null;
      solved = true;
      lastMoveTo = to;
      completed.add(puzzleIndex);
      render({ focus: true });
      return announce(
        isBookMove
          ? `Зөв! ${puzzle.notation} — мат. ${puzzle.explanation}`
          : 'Зөв! Энэ нүүдлээр мат боллоо.',
        'success',
      );
    }

    // Дүрмийн дагуу боловч мат биш: байрлалыг хэвээр үлдээж, дахин оролдох боломж өгнө.
    render({ focus: true });
    announce(`${explainNotMate(next)} Дүрс байрандаа буцлаа — дахин оролдоорой.`, 'notice');
  }

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

  document.getElementById('reset').addEventListener('click', () => loadPuzzle(puzzleIndex));

  nextButton.disabled = false;
  nextButton.addEventListener('click', () => loadPuzzle((puzzleIndex + 1) % PUZZLES.length));

  hintButton.addEventListener('click', () => {
    const puzzle = currentPuzzle();
    if (solved) return announce(`${puzzle.notation} — ${puzzle.explanation}`, 'success');

    if (hintLevel === 0) {
      hintLevel = 1;
      announce('Санамж: ' + puzzle.hint);
    } else {
      hintLevel = 2;
      announce(
        `Шийдэл: ${puzzle.solution.from} нүдэн дэх ${PIECE_NAMES[puzzle.position[puzzle.solution.from][1]]} ${puzzle.solution.to} нүд рүү нүүнэ (${puzzle.notation}). Онцолсон нүднүүдийг дарж өөрөө нүүж үзээрэй.`,
      );
    }
    render();
  });

  loadPuzzle(0);
})();
