# Tiny Stack VM

A correct, compact interpreter for make.fun's tiny stack ISA, built for the
[Build a tiny stack virtual machine](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)
bounty ($100 in USDC, 1st–10th place $10 each).

`main.ts` (Node 22, no dependencies) runs every `/input/<id>/program.bin`
on its `input.bin` and writes `/output/<id>/stdout.bin` and `exit.txt`.

It honours the hard rules the house baseline gets wrong: wrapping 32-bit
multiplication, unsigned DIVU/MODU/LTU, INT_MIN/-1, shift counts masked to
5 bits, PUSH8 sign extension, and all ten traps with their own exit codes,
in ISA order (step limit, pc, unknown opcode, cut-off immediate, stack,
then the instruction's own trap).

Local practice score: 1,000,000/1,000,000 (40/40), baseline 670,000.
