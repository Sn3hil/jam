import { spawn } from "node:child_process";
import { Mp3Framer, type Mp3Frame } from "./mp3Framer";
import { ffmpegEncodeCommand, ffmpegCdnInputArgs } from "./ffmpeg";

export const MAX_BUFFERED_FRAMES = 460;
const RESUME_AT_FRAMES = 300;
const KILL_GRACE_MS = 2000;

export interface FrameSource {
  readonly buffered: number;
  readonly framesTaken: number;
  readonly finished: boolean;
  readonly ready: Promise<void>;
  take(n: number): Mp3Frame[];
  isFailed(): boolean;
  kill(): void;
}

export interface TrackEncoderDeps {
  ffmpegPath: string;
  cdnUrl: string;
  onError?: (info: { stderrTail: string }) => void;
}

export class TrackEncoder implements FrameSource {
  readonly ready: Promise<void>;
  finished = false;
  framesTaken = 0;
  failed = false;
  private readonly proc: ReturnType<typeof spawn>;
  private readonly framer = new Mp3Framer();
  private readonly buffer: Mp3Frame[] = [];
  private readonly readyResolve: () => void;
  private firstFrameArrived = false;
  private killed = false;
  private stderrTail = "";
  private pausedByBackpressure = false;
  private readonly onClosed: Promise<void>;

  constructor(deps: TrackEncoderDeps) {
    const cmd = ffmpegEncodeCommand(deps.ffmpegPath, ffmpegCdnInputArgs(deps.cdnUrl));
    const ffmpeg = cmd[0]!;
    this.proc = spawn(ffmpeg, cmd.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc.on("error", () => {
      this.failed = true;
    });
    let readyResolve!: () => void;
    this.ready = new Promise<void>((r) => {
      readyResolve = r;
    });
    this.readyResolve = readyResolve;
    this.onClosed = new Promise<void>((resolve) => {
      this.proc.once("close", () => resolve());
    });

    const stdout = this.proc.stdout!;
    stdout.on("data", (chunk: Uint8Array) => {
      for (const frame of this.framer.push(new Uint8Array(chunk))) {
        this.queueFrame(frame);
      }
    });
    stdout.on("end", () => {
      for (const frame of this.framer.flush()) this.buffer.push(frame);
      this.finished = true;
    });
    const stderr = this.proc.stderr!;
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-2000);
    });

    void this.onClosed.then(() => {
      if (!this.killed) {
        const code = this.proc.exitCode ?? 0;
        if (code !== 0 || this.framesTaken + this.buffered < 40) {
          this.failed = true;
          deps.onError?.({ stderrTail: this.stderrTail });
        }
      }
      this.finished = true;
      this.readyResolve();
    });
  }

  get buffered(): number {
    return this.buffer.length;
  }

  take(n: number): Mp3Frame[] {
    const count = Math.min(n, this.buffer.length);
    const frames = this.buffer.splice(0, count);
    this.framesTaken += count;
    this.resume();
    return frames;
  }

  isFailed(): boolean {
    return this.failed;
  }

  kill(): void {
    if (this.killed || this.finished) return;
    if (this.buffer.length > 0) {
      this.finished = true;
      this.readyResolve();
      return;
    }
    this.killed = true;
    try {
      this.proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }
    setTimeout(() => {
      try {
        if (this.proc.exitCode === null && !this.finished) this.proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, KILL_GRACE_MS).unref?.();
  }

  private resume(): void {
    if (this.pausedByBackpressure && this.buffer.length <= RESUME_AT_FRAMES) {
      this.pausedByBackpressure = false;
      this.proc.stdout?.resume();
    }
  }

  private queueFrame(frame: Mp3Frame): void {
    if (!this.firstFrameArrived) {
      this.firstFrameArrived = true;
      this.readyResolve();
    }
    if (this.buffer.length < MAX_BUFFERED_FRAMES) {
      this.buffer.push(frame);
      return;
    }
    if (!this.pausedByBackpressure) {
      this.pausedByBackpressure = true;
      this.proc.stdout?.pause();
    }
    this.buffer.push(frame);
  }
}
