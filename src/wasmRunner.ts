/** Default linear-memory cap: 16 MiB. Audio and DSP mods use 4 MiB. */
export const WASM_MAX_MEMORY_PAGES = 256;
export const WASM_AUDIO_MAX_MEMORY_PAGES = 64;
const PAGE_BYTES = 65536;

export interface WasmModExports {
  memory: WebAssembly.Memory;
  osfs_mod_abi_version: () => number;
  osfs_mod_init: (sampleRateHz: number, numInputs: number, numOutputs: number) => number;
  osfs_mod_reset: () => void;
  osfs_mod_input_ptr: () => number;
  osfs_mod_output_ptr: () => number;
  osfs_mod_step: (dtSec: number) => number;
}

export interface WasmModRunnerOptions {
  maxMemoryPages?: number;
  frameBudgetMs?: number;
  budgetStrikes?: number;
  now?: () => number;
  onDiagnostic?: (message: string) => void;
}

export interface WasmModRunner {
  readonly abiVersion: number;
  readonly disabled: boolean;
  reset(): void;
  step(dtSec: number, inputs: readonly number[]): number[];
}

const text = new TextDecoder();

function readLeb(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let next = offset;
  for (;;) {
    const byte = bytes[next];
    if (byte === undefined) throw new Error("The WASM module ended inside an integer.");
    next += 1;
    value += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) return { value, next };
    shift += 7;
  }
}

function sections(bytes: Uint8Array): { id: number; body: Uint8Array }[] {
  if (bytes.length < 8 || text.decode(bytes.slice(0, 4)) !== "\0asm") throw new Error("Not a WebAssembly module.");
  const found: { id: number; body: Uint8Array }[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const id = bytes[offset]!;
    const size = readLeb(bytes, offset + 1);
    const start = size.next;
    const end = start + size.value;
    found.push({ id, body: bytes.slice(start, end) });
    offset = end;
  }
  return found;
}

/** Reject host imports and a linear memory with no cap or a cap above the limit. */
export function assertWasmSandbox(bytes: Uint8Array, maxMemoryPages = WASM_MAX_MEMORY_PAGES): void {
  for (const section of sections(bytes)) {
    if (section.id === 2) {
      const count = readLeb(section.body, 0);
      if (count.value > 0) throw new Error("WASM mods cannot import host functions.");
    }
    if (section.id === 5) {
      const count = readLeb(section.body, 0);
      let cursor = count.next;
      for (let index = 0; index < count.value; index += 1) {
        const flags = section.body[cursor];
        if (flags === undefined) throw new Error("The WASM memory section is truncated.");
        cursor += 1;
        const minimum = readLeb(section.body, cursor);
        cursor = minimum.next;
        const hasMaximum = (flags & 0x01) !== 0;
        if (!hasMaximum) throw new Error("WASM mods must declare a maximum memory size.");
        const maximum = readLeb(section.body, cursor);
        cursor = maximum.next;
        if (maximum.value > maxMemoryPages) {
          throw new Error(`WASM memory of ${maximum.value} pages exceeds the ${maxMemoryPages}-page limit (${maxMemoryPages * PAGE_BYTES} bytes).`);
        }
      }
    }
  }
}

/**
 * Instantiates a mod with an empty import object. The guest only sees its own linear memory.
 * A step that misses its frame budget too often is disabled and reported, without throwing into the flight.
 */
export async function createWasmModRunner(bytes: Uint8Array, options: WasmModRunnerOptions = {}): Promise<WasmModRunner> {
  const maxMemoryPages = options.maxMemoryPages ?? WASM_MAX_MEMORY_PAGES;
  assertWasmSandbox(bytes, maxMemoryPages);
  const instantiated = await WebAssembly.instantiate(bytes, { env: {} }) as unknown as { instance: WebAssembly.Instance };
  const exports = instantiated.instance.exports as unknown as Partial<WasmModExports>;
  const required = ["memory", "osfs_mod_abi_version", "osfs_mod_init", "osfs_mod_reset", "osfs_mod_input_ptr", "osfs_mod_output_ptr", "osfs_mod_step"] as const;
  for (const name of required) {
    if (exports[name] === undefined) throw new Error(`WASM mod is missing export ${name}.`);
  }
  const wasm = exports as WasmModExports;
  const abiVersion = wasm.osfs_mod_abi_version();
  if (abiVersion !== 1) throw new Error(`WASM mod ABI version ${abiVersion} is not supported.`);
  const budgetMs = options.frameBudgetMs ?? 2;
  const strikes = options.budgetStrikes ?? 3;
  const now = options.now ?? (() => performance.now());
  let overBudget = 0;
  let disabled = false;
  const runner: WasmModRunner = {
    get abiVersion() { return abiVersion; },
    get disabled() { return disabled; },
    reset() { wasm.osfs_mod_reset(); },
    step(dtSec, inputs) {
      if (disabled) return Array.from({ length: inputs.length }, () => 0);
      const inputPtr = wasm.osfs_mod_input_ptr();
      const outputPtr = wasm.osfs_mod_output_ptr();
      const memory = new Float64Array(wasm.memory.buffer);
      for (let index = 0; index < inputs.length; index += 1) memory[(inputPtr >> 3) + index] = inputs[index] ?? 0;
      const started = now();
      const code = wasm.osfs_mod_step(dtSec);
      const elapsed = now() - started;
      if (code !== 0) options.onDiagnostic?.(`osfs_mod_step returned ${code}.`);
      if (elapsed > budgetMs) {
        overBudget += 1;
        if (overBudget >= strikes) {
          disabled = true;
          options.onDiagnostic?.(`Disabled a WASM mod after it exceeded ${budgetMs} ms ${strikes} times.`);
        }
      } else overBudget = 0;
      const output = new Float64Array(wasm.memory.buffer);
      const count = Math.max(inputs.length, 1);
      return Array.from({ length: count }, (_, index) => output[(outputPtr >> 3) + index] ?? 0);
    },
  };
  const init = wasm.osfs_mod_init(0, 0, 0);
  if (init !== 0) throw new Error(`osfs_mod_init returned ${init}.`);
  return runner;
}
