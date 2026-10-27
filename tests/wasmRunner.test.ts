import { describe, expect, it } from "vitest";
import { assertWasmSandbox, createWasmModRunner } from "../src/wasmRunner";

function uleb(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
}

function section(id: number, payload: number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

function name(value: string): number[] {
  return [...uleb(value.length), ...[...value].map(character => character.charCodeAt(0))];
}

/** A guest that writes input[0] + dt into output[0], with memory capped at 16 pages. */
function sampleModule(): Uint8Array {
  const types = [
    4,
    0x60, 0, 1, 0x7f,
    0x60, 3, 0x7c, 0x7f, 0x7f, 1, 0x7f,
    0x60, 0, 0,
    0x60, 1, 0x7c, 1, 0x7f,
  ];
  const functions = [6, 0, 1, 2, 0, 0, 3];
  const memory = [1, 0x01, 1, 16];
  const exportEntry = (label: string, kind: number, index: number) => [...name(label), kind, ...uleb(index)];
  const exports = [
    7,
    ...exportEntry("memory", 0x02, 0),
    ...exportEntry("osfs_mod_abi_version", 0x00, 0),
    ...exportEntry("osfs_mod_init", 0x00, 1),
    ...exportEntry("osfs_mod_reset", 0x00, 2),
    ...exportEntry("osfs_mod_input_ptr", 0x00, 3),
    ...exportEntry("osfs_mod_output_ptr", 0x00, 4),
    ...exportEntry("osfs_mod_step", 0x00, 5),
  ];
  const body = (instructions: number[]) => {
    const bytes = [0x00, ...instructions, 0x0b];
    return [...uleb(bytes.length), ...bytes];
  };
  const code = [
    6,
    ...body([0x41, 0x01]),
    ...body([0x41, 0x00]),
    ...body([]),
    ...body([0x41, 0x00]),
    ...body([0x41, 0xc0, 0x00]),
    ...body([0x41, 0xc0, 0x00, 0x20, 0x00, 0x41, 0x00, 0x2b, 0x03, 0x00, 0xa0, 0x39, 0x03, 0x00, 0x41, 0x00]),
  ];
  return Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, types),
    ...section(3, functions),
    ...section(5, memory),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

describe("sandboxed WASM runner", () => {
  it("runs the numeric ABI and disables a mod that misses its frame budget", async () => {
    const runner = await createWasmModRunner(sampleModule(), {
      frameBudgetMs: 1,
      budgetStrikes: 1,
      now: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          return calls * 5;
        };
      })(),
    });
    expect(runner.abiVersion).toBe(1);
    expect(runner.step(0.5, [2])).toEqual([2.5]);
    expect(runner.disabled).toBe(true);
    expect(runner.step(1, [9])).toEqual([0]);
  });

  it("rejects host imports and an uncapped or oversized memory", () => {
    const imported = Uint8Array.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...section(2, [1, ...name("env"), ...name("log"), 0x00, 0]),
    ]);
    expect(() => assertWasmSandbox(imported)).toThrow(/cannot import host functions/);
    const uncapped = Uint8Array.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...section(5, [1, 0x00, 1]),
    ]);
    expect(() => assertWasmSandbox(uncapped)).toThrow(/maximum memory/);
    const huge = Uint8Array.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ...section(5, [1, 0x01, 1, ...uleb(512)]),
    ]);
    expect(() => assertWasmSandbox(huge)).toThrow(/exceeds the 256-page limit/);
  });
});
