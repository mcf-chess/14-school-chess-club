/*
  Шатрын дүрмийн жижиг сан (бодлогын хөлөгт зориулсан).

  Байрлал нь { нүд: дүрс } объект: жишээ нь { e1: 'wR', g8: 'bK' }.
  Дүрсийн эхний үсэг өнгө ('w' цагаан, 'b' хар), хоёр дахь нь төрөл:
  K ноён, Q бэрс, R тэрэг, B тэмээ, N морь, P хүү.

  Дэмждэг зүйл: бүх дүрсийн энгийн нүүдэл, замын саад, шах, мат, пат,
  ноёноо шахад үлдээх нүүдлийг хориглох.
  Дэмждэггүй зүйл: сэлгээ, замд авах, хүү хувирах — нэг нүүдлийн матын бодлогод хэрэггүй.

  Хөтөч дээр ChessRules гэсэн нэрээр, Node.js дээр (шалгалтад) module.exports-оор ашиглагдана.
*/
const ChessRules = (() => {
  'use strict';

  const FILES = 'abcdefgh';

  const toXY = (square) => [FILES.indexOf(square[0]), Number(square[1]) - 1];
  const toSquare = (x, y) => (x >= 0 && x < 8 && y >= 0 && y < 8 ? FILES[x] + (y + 1) : null);
  const opponent = (color) => (color === 'w' ? 'b' : 'w');

  const STRAIGHT = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const DIAGONAL = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const KNIGHT = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ];
  const SLIDES = { R: STRAIGHT, B: DIAGONAL, Q: [...STRAIGHT, ...DIAGONAL] };

  /** Шулуун эсвэл диагональ замаар саад тулах хүртэлх нүднүүд (саадтай нүд орно). */
  function slide(position, from, directions) {
    const [x0, y0] = toXY(from);
    const squares = [];
    for (const [dx, dy] of directions) {
      let square = toSquare(x0 + dx, y0 + dy);
      for (let step = 2; square; step++) {
        squares.push(square);
        if (position[square]) break;
        square = toSquare(x0 + dx * step, y0 + dy * step);
      }
    }
    return squares;
  }

  /** Тухайн нүдэн дэх дүрсийн довтолж (хянаж) буй нүднүүд. */
  function attackedSquares(position, from) {
    const piece = position[from];
    if (!piece) return [];
    const [color, type] = piece;
    const [x, y] = toXY(from);
    const offsets = (list) => list.map(([dx, dy]) => toSquare(x + dx, y + dy)).filter(Boolean);

    if (SLIDES[type]) return slide(position, from, SLIDES[type]);
    if (type === 'N') return offsets(KNIGHT);
    if (type === 'K') return offsets([...STRAIGHT, ...DIAGONAL]);
    // Хүү зөвхөн урд талын хоёр диагональ нүдийг довтолно.
    const forward = color === 'w' ? 1 : -1;
    return offsets([
      [-1, forward],
      [1, forward],
    ]);
  }

  /** `byColor` өнгийн аль нэг дүрс `square` нүдийг довтолж байгаа эсэх. */
  function isAttacked(position, square, byColor) {
    return Object.keys(position).some(
      (from) => position[from][0] === byColor && attackedSquares(position, from).includes(square),
    );
  }

  function kingSquare(position, color) {
    return Object.keys(position).find((square) => position[square] === color + 'K') || null;
  }

  function inCheck(position, color) {
    const king = kingSquare(position, color);
    return king ? isAttacked(position, king, opponent(color)) : false;
  }

  /** Нүүдэл хийсний дараах шинэ байрлал (анхны байрлал өөрчлөгдөхгүй). */
  function applyMove(position, from, to) {
    const next = { ...position };
    next[to] = next[from];
    delete next[from];
    return next;
  }

  /** Ноёны аюулгүй байдлыг тооцоогүй, дүрсийн нүүж чадах нүднүүд. */
  function pseudoMoves(position, from) {
    const piece = position[from];
    if (!piece) return [];
    const [color, type] = piece;

    if (type !== 'P') {
      return attackedSquares(position, from).filter((to) => position[to]?.[0] !== color);
    }

    const [x, y] = toXY(from);
    const forward = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    const moves = [];
    const one = toSquare(x, y + forward);
    if (one && !position[one]) {
      moves.push(one);
      const two = toSquare(x, y + 2 * forward);
      if (y === startRank && two && !position[two]) moves.push(two);
    }
    for (const to of attackedSquares(position, from)) {
      if (position[to] && position[to][0] !== color) moves.push(to);
    }
    return moves;
  }

  /** Дүрмийн дагуух нүүдлүүд: нүүсний дараа өөрийн ноён шахад үлдэхгүй. */
  function legalMoves(position, from) {
    const piece = position[from];
    if (!piece) return [];
    return pseudoMoves(position, from).filter(
      (to) => position[to]?.[1] !== 'K' && !inCheck(applyMove(position, from, to), piece[0]),
    );
  }

  /** Тухайн өнгийн бүх дүрмийн дагуух нүүдэл: [{ from, to }]. */
  function allLegalMoves(position, color) {
    return Object.keys(position)
      .filter((from) => position[from][0] === color)
      .flatMap((from) => legalMoves(position, from).map((to) => ({ from, to })));
  }

  const isCheckmate = (position, color) =>
    inCheck(position, color) && allLegalMoves(position, color).length === 0;

  const isStalemate = (position, color) =>
    !inCheck(position, color) && allLegalMoves(position, color).length === 0;

  /**
   * Нүүдэл яагаад дүрмийн бус болохыг тайлбарлах код.
   * Буцаах утга: null (дүрмийн дагуу) эсвэл
   *   'own-piece'   — очих нүдэнд өөрийн дүрс байна
   *   'king'        — ноёныг идэж болохгүй
   *   'shape'       — энэ дүрс ийм хэлбэрээр нүүдэггүй
   *   'blocked'     — замд дүрс саад болж байна (blocker нүдийг хамт буцаана)
   *   'self-check'  — нүүвэл өөрийн ноён шахад орно
   */
  function illegalReason(position, from, to) {
    const piece = position[from];
    const [color, type] = piece;
    if (position[to]?.[0] === color) return { code: 'own-piece' };
    if (position[to]?.[1] === 'K') return { code: 'king' };

    if (!pseudoMoves(position, from).includes(to)) {
      // Шулуун/диагональ замтай дүрсийн хувьд: хоосон хөлөг дээр хүрэх байсан бол зам хаагдсан гэсэн үг.
      if (SLIDES[type] && slide({ [from]: piece }, from, SLIDES[type]).includes(to)) {
        const [x0, y0] = toXY(from);
        const [x1, y1] = toXY(to);
        const dx = Math.sign(x1 - x0);
        const dy = Math.sign(y1 - y0);
        for (let step = 1; ; step++) {
          const square = toSquare(x0 + dx * step, y0 + dy * step);
          if (position[square]) return { code: 'blocked', blocker: square };
        }
      }
      return { code: 'shape' };
    }
    if (inCheck(applyMove(position, from, to), color)) return { code: 'self-check' };
    return null;
  }

  return {
    FILES,
    opponent,
    attackedSquares,
    isAttacked,
    kingSquare,
    inCheck,
    applyMove,
    legalMoves,
    allLegalMoves,
    isCheckmate,
    isStalemate,
    illegalReason,
  };
})();

if (typeof module !== 'undefined') module.exports = ChessRules;
