// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Runs every /input/<id>/program.bin on its input.bin and writes
// /output/<id>/stdout.bin + exit.txt, per generator/subject/ISA.md.
// Correctness is the whole score, so every hard rule is honoured:
// wrapping 32-bit arithmetic (Math.imul, unsigned DIVU/MODU/LTU),
// PUSH8 sign extension, shift counts masked to 5 bits, INT_MIN/-1,
// and all ten traps with their own exit codes, in ISA order:
// step limit, pc out of range, unknown opcode, cut-off immediate,
// stack under/overflow, then the instruction's own trap.
// No clock, no randomness, no network: two runs write identical bytes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIM = 1000000, OUT = 65536, INT_MIN = -2147483648;

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const st = new Int32Array(256); let sp = 0;      // data stack
  const cs = new Int32Array(64); let cp = 0;       // call stack
  const mem = new Int32Array(256);                 // memory words
  const out = new Uint8Array(OUT); let ol = 0;     // output bytes
  let pc = 0, ip = 0, steps = 0;
  const end = (code: number) => ({ out: out.slice(0, ol), code });
  for (;;) {
    if (steps === LIM) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const op = p[pc];
    // Immediate length: PUSH8 1, PUSH32 4, JMP/JZ/JNZ/CALL 2, else 0.
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (op !== 0 && imm === 0 && !(
      op === 3 || op === 4 || op === 5 || op === 6 || op === 7 ||
      (op >= 0x10 && op <= 0x22) || op === 0x34 ||
      (op >= 0x40 && op <= 0x41) || (op >= 0x50 && op <= 0x53))) return end(5);
    if (pc + imm >= p.length) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: if (sp >= 256) return end(3); st[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: if (sp >= 256) return end(3); st[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
      case 3: if (sp < 1) return end(2); sp--; break;
      case 4: if (sp < 1) return end(2); if (sp >= 256) return end(3); st[sp] = st[sp - 1]; sp++; break;
      case 5: { if (sp < 2) return end(2); const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 6: if (sp < 2) return end(2); if (sp >= 256) return end(3); st[sp] = st[sp - 2]; sp++; break;
      case 7: { if (sp < 3) return end(2); const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 0x17: if (sp < 1) return end(2); st[sp - 1] = -st[sp - 1] | 0; break;
      case 0x1b: if (sp < 1) return end(2); st[sp - 1] = ~st[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        if (sp < 2) return end(2);
        const b = st[sp - 1], a = st[sp - 2]; let r: number;
        switch (op) {
          case 0x10: r = a + b | 0; break;
          case 0x11: r = a - b | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (!b) return end(4); r = a === INT_MIN && b === -1 ? a : a / b | 0; break;
          case 0x14: if (!b) return end(4); r = b === -1 ? 0 : a % b | 0; break;
          case 0x15: if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (!b) return end(4); r = (a >>> 0) % (b >>> 0) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = a >>> (b & 31) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        }
        sp -= 2; st[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = (p[nx - 2] | p[nx - 1] << 8) << 16 >> 16;
        if (op !== 0x30) { if (sp < 1) return end(2); const v = st[--sp]; if ((op === 0x31) !== (v === 0)) break; }
        pc = nx + rel; break;
      }
      case 0x33: if (cp >= 64) return end(7); cs[cp++] = nx; pc = p[nx - 2] | p[nx - 1] << 8; break;
      case 0x34: if (!cp) return end(8); pc = cs[--cp]; break;
      case 0x40: { if (sp < 1) return end(2); const a = st[sp - 1]; if (a < 0 || a > 255) return end(6); st[sp - 1] = mem[a]; break; }
      case 0x41: { if (sp < 2) return end(2); const a = st[sp - 1]; if (a < 0 || a > 255) return end(6); sp -= 2; mem[a] = st[sp]; break; }
      case 0x50: { if (sp < 1) return end(2); let v = st[--sp]; const neg = v < 0; let u = neg ? -v : v; const d = new Uint8Array(11); let n = 0; if (u === 0) d[n++] = 48; else while (u > 0) { d[n++] = 48 + u % 10; u = Math.floor(u / 10); } const len = n + (neg ? 1 : 0); if (ol + len > OUT) return end(11); if (neg) out[ol++] = 45; while (n) out[ol++] = d[--n]; break; }
      case 0x51: if (sp < 1) return end(2); if (ol + 1 > OUT) return end(11); out[ol++] = st[--sp] & 255; break;
      case 0x52: if (sp >= 256) return end(3); st[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: if (sp < 1) return end(2); return end(st[--sp] & 255);
      default: return end(5);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
