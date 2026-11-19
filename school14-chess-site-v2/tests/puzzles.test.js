/*
  Шатрын дүрэм болон бодлогуудын автомат шалгалт.
  Ажиллуулах:  node tests/puzzles.test.js
  (Node.js суусан байхад л хангалттай; нэмэлт сан шаардахгүй.)
*/
const assert = require('node:assert/strict');
const Chess = require('../js/chess-rules.js');
const PUZZLES = require('../js/puzzle-data.js');

let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Шатрын дүрэм');

test('тэрэг шулуун нүүж, саад дээгүүр харайхгүй', () => {
  const position = { a1: 'wR', a4: 'wP', d1: 'bP', h8: 'bK', h1: 'wK' };
  const moves = Chess.legalMoves(position, 'a1').sort();
  assert.deepEqual(moves, ['a2', 'a3', 'b1', 'c1', 'd1']);
  assert.equal(Chess.illegalReason(position, 'a1', 'a5').code, 'blocked');
  assert.equal(Chess.illegalReason(position, 'a1', 'a5').blocker, 'a4');
  assert.equal(Chess.illegalReason(position, 'a1', 'e1').blocker, 'd1');
  assert.equal(Chess.illegalReason(position, 'a1', 'b2').code, 'shape');
  assert.equal(Chess.illegalReason(position, 'a1', 'a4').code, 'own-piece');
  assert.equal(Chess.illegalReason(position, 'a1', 'd1'), null);
});

test('ноёноо шагт үлдээх нүүдэл дүрмийн бус', () => {
  const position = { e1: 'wK', e2: 'wR', e8: 'bR', a8: 'bK' };
  assert.equal(Chess.illegalReason(position, 'e2', 'a2').code, 'self-check');
  assert.equal(Chess.illegalReason(position, 'e2', 'e5'), null);
  assert.ok(!Chess.legalMoves(position, 'e1').includes('e2'));
});

test('ноёныг идэх нүүдэл байхгүй', () => {
  const position = { a1: 'wR', a8: 'bK', h1: 'wK' };
  assert.equal(Chess.illegalReason(position, 'a1', 'a8').code, 'king');
});

test('хүү: урагш нэг/хоёр нүд, ташуу иднэ', () => {
  const position = { e2: 'wP', d3: 'bP', e1: 'wK', a8: 'bK', h4: 'wP', h5: 'bP' };
  assert.deepEqual(Chess.legalMoves(position, 'e2').sort(), ['d3', 'e3', 'e4']);
  assert.deepEqual(Chess.legalMoves(position, 'h4'), []);
});

test('шаг, мад, жидийг ялгана', () => {
  const mate = { g8: 'bK', f7: 'bP', g7: 'bP', h7: 'bP', e8: 'wR', g1: 'wK' };
  assert.ok(Chess.inCheck(mate, 'b') && Chess.isCheckmate(mate, 'b'));
  const escape = { g8: 'bK', f7: 'bP', g7: 'bP', e8: 'wR', g1: 'wK' }; // h7 чөлөөтэй
  assert.ok(Chess.inCheck(escape, 'b') && !Chess.isCheckmate(escape, 'b'));
  const stalemate = { a8: 'bK', b6: 'wQ', c7: 'wK' };
  assert.ok(Chess.isStalemate(stalemate, 'b') && !Chess.isCheckmate(stalemate, 'b'));
});

console.log('\nБодлогууд');

const after = (position, move) => Chess.applyMove(position, move.from, move.to);

// Цагаан нүүсний дараах байрлал: хар юу ч хийсэн цагаан n-1 нүүдэлд мад тавих уу?
function forces(position, n) {
  if (Chess.isCheckmate(position, 'b')) return true;
  if (n === 1) return false;
  const replies = Chess.allLegalMoves(position, 'b');
  return replies.length > 0 && replies.every((reply) => winsIn(after(position, reply), n - 1));
}

function winsIn(position, n) {
  return Chess.allLegalMoves(position, 'w').some((move) => forces(after(position, move), n));
}

const keysIn = (position, n) =>
  Chess.allLegalMoves(position, 'w').filter((move) => forces(after(position, move), n));

PUZZLES.forEach((puzzle, index) => {
  const label = `${index + 1}. ${puzzle.title}`;
  const line = puzzle.line;

  test(`${label}: түвшин, нүүдлийн тоо зөв`, () => {
    assert.ok(['Амархан', 'Дунд', 'Хэцүү', 'Маш хэцүү'].includes(puzzle.level));
    assert.equal(line.length % 2, 1, 'цагаан эхэлж, цагаан дуусгана');
    assert.ok(line.length <= 5, 'гурваас олон нүүдэлгүй');
    assert.ok(line.every((move) => move.from && move.to && move.san));
  });

  test(`${label}: байрлал зөв (ноён тус бүр нэг, хэн ч шагт ороогүй)`, () => {
    const pieces = Object.values(puzzle.position);
    assert.equal(pieces.filter((piece) => piece === 'wK').length, 1);
    assert.equal(pieces.filter((piece) => piece === 'bK').length, 1);
    assert.ok(!Chess.inCheck(puzzle.position, 'b'), 'хар эхнээсээ шагт байж болохгүй');
    assert.ok(!Chess.inCheck(puzzle.position, 'w'));
  });

  test(`${label}: шийдлийн мөр дүрмийн дагуу, харын хариу албадмал, төгсгөл нь мад`, () => {
    let position = puzzle.position;
    line.forEach((move, ply) => {
      const color = ply % 2 === 0 ? 'w' : 'b';
      assert.equal(position[move.from]?.[0], color, `${move.san}: ${move.from} дээр ${color} дүрс байх ёстой`);
      assert.equal(Chess.illegalReason(position, move.from, move.to), null, `${move.san} дүрмийн бус`);
      assert.ok(move.san.includes(move.to), `${move.san} дотор ${move.to} байх ёстой`);
      if (color === 'b') {
        assert.deepEqual(Chess.allLegalMoves(position, 'b'), [{ from: move.from, to: move.to }], `${move.san} цорын ганц хариу байх ёстой`);
      }
      position = Chess.applyMove(position, move.from, move.to);
      const last = ply === line.length - 1;
      if (color === 'w') {
        assert.equal(Chess.isCheckmate(position, 'b'), last, `${move.san}: мад зөвхөн төгсгөлд`);
        assert.equal(move.san.endsWith('#'), last);
      }
    });
  });

  test(`${label}: эхний нүүдэл цорын ганц, богино мад байхгүй`, () => {
    const n = (line.length + 1) / 2;
    for (let k = 1; k < n; k++) assert.deepEqual(keysIn(puzzle.position, k), [], `${k} нүүдлийн мад байж болохгүй`);
    assert.deepEqual(keysIn(puzzle.position, n), [{ from: line[0].from, to: line[0].to }]);
  });
});

console.log(`\n${passed} шалгалт амжилттай.`);
