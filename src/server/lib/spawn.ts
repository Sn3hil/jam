export interface SpawnToolOptions {
  cmd: string[];
  timeoutMs: number;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

export interface SpawnToolResult {
  code: number | null;
  stdoutBytes: Uint8Array;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_MAX_STDOUT = 4 * 1024 * 1024;
const DEFAULT_MAX_STDERR = 64 * 1024;

export async function spawnTool(options: SpawnToolOptions): Promise<SpawnToolResult> {
  const maxOut = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT;
  const maxErr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR;

  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn({
      cmd: options.cmd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
  } catch (error) {
    if (String(error).includes("ENOENT")) {
      throw new Error(`ENOENT: ${options.cmd[0]} not found`);
    }
    throw error;
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, options.timeoutMs);

  const onAbort = () => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already exited
    }
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let dataOut: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let dataErr: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  const outDone = readBoundedBytes(proc.stdout, maxOut).then((b) => {
    dataOut = b;
  });
  const errDone = readBoundedBytes(proc.stderr, maxErr).then((b) => {
    dataErr = b;
  });
  const exitCode = await proc.exited;
  await Promise.all([outDone, errDone]);

  clearTimeout(timer);
  options.signal?.removeEventListener("abort", onAbort);

  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const utf8 = new TextDecoder("utf8", { fatal: false });
  return {
    code: exitCode,
    stdoutBytes: dataOut,
    stdout: utf8.decode(dataOut),
    stderr: utf8.decode(dataErr),
    timedOut,
  };
}

async function readBoundedBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size <= maxBytes) chunks.push(value);
        else {
          const remaining = maxBytes - (size - value.byteLength);
          if (remaining > 0) chunks.push(value.subarray(0, remaining));
        }
      }
      if (size >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    // reader aborted
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
}
