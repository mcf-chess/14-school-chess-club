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

test('ноёноо шахад үлдээх нүүдэл дүрмийн бус', () => {
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

test('шах, мат, патыг ялгана', () => {
  const mate = { g8: 'bK', f7: 'bP', g7: 'bP', h7: 'bP', e8: 'wR', g1: 'wK' };
  assert.ok(Chess.inCheck(mate, 'b') && Chess.isCheckmate(mate, 'b'));
  const escape = { g8: 'bK', f7: 'bP', g7: 'bP', e8: 'wR', g1: 'wK' }; // h7 чөлөөтэй
  assert.ok(Chess.inCheck(escape, 'b') && !Chess.isCheckmate(escape, 'b'));
  const stalemate = { a8: 'bK', b6: 'wQ', c7: 'wK' };
  assert.ok(Chess.isStalemate(stalemate, 'b') && !Chess.isCheckmate(stalemate, 'b'));
});

console.log('\nБодлогууд');

PUZZLES.forEach((puzzle, index) => {
  const label = `${index + 1}. ${puzzle.title}`;
  const { from, to } = puzzle.solution;

  test(`${label}: байрлал зөв (ноён тус бүр нэг, хэн ч шахад ороогүй)`, () => {
    const pieces = Object.values(puzzle.position);
    assert.equal(pieces.filter((piece) => piece === 'wK').length, 1);
    assert.equal(pieces.filter((piece) => piece === 'bK').length, 1);
    assert.ok(!Chess.inCheck(puzzle.position, 'b'), 'хар эхнээсээ шахад байж болохгүй');
    assert.ok(!Chess.inCheck(puzzle.position, 'w'));
  });

  test(`${label}: ${puzzle.notation} дүрмийн дагуу бөгөөд үнэхээр мат`, () => {
    assert.equal(Chess.illegalReason(puzzle.position, from, to), null);
    assert.ok(Chess.isCheckmate(Chess.applyMove(puzzle.position, from, to), 'b'));
  });

  test(`${label}: өөр мат байхгүй (шийдэл цорын ганц)`, () => {
    const mates = Chess.allLegalMoves(puzzle.position, 'w').filter((move) =>
      Chess.isCheckmate(Chess.applyMove(puzzle.position, move.from, move.to), 'b'),
    );
    assert.deepEqual(mates, [{ from, to }]);
  });

  test(`${label}: тэмдэглэгээ шийдэлтэй таарна`, () => {
    assert.ok(puzzle.notation.includes(to), `${puzzle.notation} дотор ${to} байх ёстой`);
    assert.ok(puzzle.notation.endsWith('#'));
  });
});

console.log(`\n${passed} шалгалт амжилттай.`);
