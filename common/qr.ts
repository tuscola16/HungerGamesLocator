/**
 * A minimal QR encoder — byte mode, error-correction level M, versions 1–10.
 *
 * **Why this exists rather than a dependency.** The web dashboard renders its join QR with
 * the `qrcode` npm package (#92), but the GM's *phone* had no way to draw one: every React
 * Native QR component is built on `react-native-svg`, and adding a native module to the iOS
 * pod configuration is exactly what the CLAUDE.md gotchas warn against — that project's iOS
 * build is held together by a `useFrameworks: "static"` + `disableSPM: true` pair that has
 * already cost two rounds of debugging. `qrcode` itself isn't usable either: its
 * browser/node entry points reach for `canvas` and `Buffer`.
 *
 * So the matrix is computed here, in pure TypeScript with no dependencies, and drawn as
 * plain `<View>`s. That is the whole trick — a QR is just a grid of squares, and React
 * Native can draw squares without help.
 *
 * **Scope is deliberately narrow.** The only thing this ever encodes is
 * `outdoorgm://join?code=ABCDEF` — around 28 bytes, which fits version 2 at level M with
 * room to spare. Versions up to 10 are supported so a longer scheme change doesn't silently
 * break it, and anything beyond that throws rather than emitting a wrong code.
 *
 * Verified against the `qrcode` package's output for the payload shapes this app produces.
 */

// --- Version tables, error-correction level M ----------------------------------------
// Index 0 = version 1. Standard values from ISO/IEC 18004 tables 7–9.
/** Total data codewords available at level M. */
const DATA_CODEWORDS_M = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];
/** Error-correction codewords **per block** at level M. */
const EC_PER_BLOCK_M = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Number of error-correction blocks at level M. */
const BLOCKS_M = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Alignment-pattern centre coordinates, per version. */
const ALIGNMENT: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// --- GF(256) arithmetic, the field Reed–Solomon works over ---------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed–Solomon remainder of `data` for `ecLen` check codewords. */
function ecCodewords(data: number[], ecLen: number): number[] {
  const gen = generatorPoly(ecLen);
  const rem = new Array<number>(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// --- Bit buffer -----------------------------------------------------------------------
class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

/** UTF-8 bytes of a string — the payload is ASCII in practice, but be correct anyway. */
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

/** Smallest version 1–10 whose level-M capacity holds `byteLen` bytes in byte mode. */
function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    const capacityBits = DATA_CODEWORDS_M[v - 1] * 8;
    if (4 + countBits + byteLen * 8 <= capacityBits) return v;
  }
  throw new Error(`QR payload too long for version 10 at level M (${byteLen} bytes)`);
}

/** Mode indicator + length + data + terminator + padding, as data codewords. */
function encodeData(bytes: number[], version: number): number[] {
  const capacity = DATA_CODEWORDS_M[version - 1];
  const buf = new BitBuffer();
  buf.put(0b0100, 4);                       // byte mode
  buf.put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) buf.put(b, 8);
  // Terminator: up to four zero bits, then pad to a byte boundary.
  const cap = capacity * 8;
  buf.put(0, Math.min(4, cap - buf.length));
  while (buf.length % 8 !== 0) buf.bits.push(0);

  const words: number[] = [];
  for (let i = 0; i < buf.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    words.push(byte);
  }
  // The standard's alternating pad bytes.
  const PADS = [0xec, 0x11];
  for (let i = 0; words.length < capacity; i++) words.push(PADS[i % 2]);
  return words;
}

/** Split into blocks, append each block's EC words, and interleave, per the standard. */
function interleave(data: number[], version: number): number[] {
  const blocks = BLOCKS_M[version - 1];
  const ecLen = EC_PER_BLOCK_M[version - 1];
  const shortLen = Math.floor(data.length / blocks);
  const numLong = data.length % blocks;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks; i++) {
    const len = shortLen + (i >= blocks - numLong ? 1 : 0);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(ecCodewords(block, ecLen));
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of ecBlocks) out.push(b[i]);
  }
  return out;
}

// --- Matrix construction ---------------------------------------------------------------
type Grid = (0 | 1 | null)[][];

function placeFunctionPatterns(m: Grid, size: number, version: number): void {
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const onRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
          || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = onRing || inCore ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const bit: 0 | 1 = i % 2 === 0 ? 1 : 0;
    if (m[6][i] === null) m[6][i] = bit;
    if (m[i][6] === null) m[i][6] = bit;
  }

  // Alignment patterns — skipped where they would collide with a finder.
  const centres = ALIGNMENT[version - 1];
  for (const r0 of centres) {
    for (const c0 of centres) {
      const nearFinder =
        (r0 <= 8 && c0 <= 8) || (r0 <= 8 && c0 >= size - 9) || (r0 >= size - 9 && c0 <= 8);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const ring = Math.max(Math.abs(r), Math.abs(c));
          m[r0 + r][c0 + c] = ring === 1 ? 0 : 1;
        }
      }
    }
  }

  // The always-dark module.
  m[size - 8][8] = 1;

  // Reserve the format-info areas so data placement skips them.
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
  }

  // Version info (v7+): an 18-bit block above the bottom-left and left of the top-right
  // finder. Never reached by this app's payloads, but a silent omission would produce an
  // unreadable code rather than an error.
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = ((version << 12) | rem) >>> 0;
    for (let i = 0; i < 18; i++) {
      const bit: 0 | 1 = ((bits >>> i) & 1) as 0 | 1;
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
}

/** Is this cell part of a function pattern (i.e. already written)? */
function isReserved(m: Grid, r: number, c: number): boolean {
  return m[r][c] !== null;
}

function placeData(m: Grid, size: number, words: number[]): void {
  const bits: number[] = [];
  for (const w of words) for (let i = 7; i >= 0; i--) bits.push((w >>> i) & 1);

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped entirely
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (isReserved(m, row, col)) continue;
        m[row][col] = (bitIndex < bits.length ? bits[bitIndex] : 0) as 0 | 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

/** The eight standard mask conditions. */
function maskAt(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

/** Write the 15-bit format information for level M + this mask. */
function placeFormat(m: Grid, size: number, mask: number): void {
  const data = (0b00 << 3) | mask; // 0b00 = error-correction level M
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (((data << 10) | rem) ^ 0x5412) >>> 0;

  // The format string is placed **most-significant bit first**: index 0 below is bit 14 of
  // the value, and lands at (8,0). Getting this backwards produces a matrix that is correct
  // everywhere except its 31 format modules — which is to say, one no scanner will read.
  for (let i = 0; i < 15; i++) {
    const bit: 0 | 1 = ((bits >>> (14 - i)) & 1) as 0 | 1;
    // Copy 1: around the top-left finder.
    if (i < 6) m[8][i] = bit;
    else if (i === 6) m[8][7] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[7][8] = bit;
    else m[14 - i][8] = bit;
    // Copy 2: split between the other two finders. The boundary is **7, not 8** — index 7
    // belongs to the row-8 run at column `size - 8`, and the column-8 run stops one short
    // because `(size - 8, 8)` is the always-dark module, not a format bit. Getting this
    // off by one leaves exactly one module wrong in the whole matrix, which is the kind of
    // bug that produces a code no scanner reads and no reviewer spots.
    if (i < 7) m[size - 1 - i][8] = bit;
    else m[8][size - 15 + i] = bit;
  }

  // The always-dark module, re-asserted after the format bits so the ordering above can
  // never silently take it back.
  m[size - 8][8] = 1;
}

/** The standard's four penalty rules — lower is better. */
function penalty(m: Grid, size: number): number {
  const at = (r: number, c: number) => m[r][c] === 1;
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules in a row or column.
  for (let i = 0; i < size; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const cur = horizontal ? at(i, j) : at(j, i);
        const prev = horizontal ? at(i, j - 1) : at(j - 1, i);
        if (cur === prev) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2: 2×2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3: the 1:1:3:1:1 finder-lookalike pattern, with four light modules either side.
  const P1 = [true, false, true, true, true, false, true, false, false, false, false];
  const P2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      let h1 = true, h2 = true, v1 = true, v2 = true;
      for (let k = 0; k < 11; k++) {
        if (at(r, c + k) !== P1[k]) h1 = false;
        if (at(r, c + k) !== P2[k]) h2 = false;
        if (at(c + k, r) !== P1[k]) v1 = false;
        if (at(c + k, r) !== P2[k]) v2 = false;
      }
      if (h1) score += 40;
      if (h2) score += 40;
      if (v1) score += 40;
      if (v2) score += 40;
    }
  }

  // Rule 4: deviation from a 50/50 light/dark balance.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (at(r, c)) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * The final interleaved codeword stream for `text`, and the version it needs.
 *
 * Exported for the verification harness only: it lets the encoded bytes be compared against
 * a reference implementation *independently of* mask selection, which is the difference
 * between "my QR is wrong" and "my QR picked a different, equally valid mask".
 */
export function qrCodewordsForTest(text: string): { version: number; words: number[] } {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length);
  return { version, words: interleave(encodeData(bytes, version), version) };
}

/**
 * Encode `text` as a QR matrix: `matrix[row][col]`, true where the module is dark.
 * Throws for a payload too long for version 10 at level M (~271 bytes) rather than
 * emitting something unscannable.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8Bytes(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;

  const words = interleave(encodeData(bytes, version), version);

  // Build the function-pattern layer once, then try each mask on a copy of it.
  const base: Grid = Array.from({ length: size }, () => new Array(size).fill(null));
  placeFunctionPatterns(base, size, version);
  // Remember which cells are function patterns *before* data lands on them — masking must
  // not touch them, and after placeData every cell is non-null.
  const reserved = base.map((row) => row.map((v) => v !== null));
  placeData(base, size, words);

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand: Grid = base.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && maskAt(mask, r, c)) cand[r][c] = (cand[r][c] === 1 ? 0 : 1);
      }
    }
    placeFormat(cand, size, mask);
    const s = penalty(cand, size);
    if (s < bestScore) { bestScore = s; best = cand; }
  }

  return best!.map((row) => row.map((v) => v === 1));
}
