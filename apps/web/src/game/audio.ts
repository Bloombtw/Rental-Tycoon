/**
 * Game audio (sounds.md): looping music and city ambience, and a cash sound on every rental.
 * Web side only (the sim never makes noise). Everything fails silently: no file, no AudioContext,
 * a blocked autoplay — the game simply runs without sound.
 *
 * iOS only lets audio start inside a user gesture, so nothing plays before the first tap
 * (`unlock`). Music and ambience stream from <audio> elements routed through Web Audio gains
 * (iOS ignores HTMLMediaElement.volume); the cash sound is a decoded buffer so it can overlap
 * itself with no latency.
 */

export const AUDIO_FILES = Object.freeze({
  music: "assets/audio/music-theme.mp3",
  ambience: "assets/audio/city-ambience.mp3",
  cash: "assets/audio/cash.mp3",
});

export const MUSIC_VOLUME = 0.35;
export const AMBIENCE_VOLUME = 0.25;
export const CASH_VOLUME = 0.6;
/** At x10 many rentals land in the same frame: at most one cash sound per this gap. */
export const CASH_MIN_GAP_MS = 120;
export const MUTED_KEY = "rental-tycoon/muted";

/** True if a cash sound may play at `now` after one at `last` (null: never played). */
export function cashAllowed(last: number | null, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  return last === null || !Number.isFinite(last) || now - last >= CASH_MIN_GAP_MS || now < last;
}

interface MiniStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Sound is on by default; only an explicit "1" mutes. Never throws. */
export function readMuted(storage: MiniStorage | null): boolean {
  try {
    return storage?.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(storage: MiniStorage | null, muted: boolean): void {
  try {
    storage?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // private mode or full storage: the choice lasts for this session only
  }
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

interface Loop {
  readonly element: HTMLAudioElement;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cashBuffer: AudioBuffer | null = null;
  private loops: Loop[] = [];
  private lastCash: number | null = null;
  private unlocked = false;
  private hidden = false;

  constructor(
    private readonly baseUrl: string,
    private muted: boolean,
  ) {}

  isMuted(): boolean {
    return this.muted;
  }

  /** First user gesture: create the context, start the loops, load the cash sound. */
  unlock(): void {
    if (this.unlocked) return;
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.unlocked = true;
      void ctx.resume().catch(() => undefined);
      this.loops = [
        this.makeLoop(AUDIO_FILES.music, MUSIC_VOLUME),
        this.makeLoop(AUDIO_FILES.ambience, AMBIENCE_VOLUME),
      ].filter((l): l is Loop => l !== null);
      this.syncLoops();
      void this.loadCash();
    } catch {
      this.unlocked = false;
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private makeLoop(path: string, volume: number): Loop | null {
    const { ctx, master } = this;
    if (!ctx || !master) return null;
    try {
      const element = new Audio(this.url(path));
      element.loop = true;
      element.preload = "auto";
      const gain = ctx.createGain();
      gain.gain.value = volume;
      ctx.createMediaElementSource(element).connect(gain);
      gain.connect(master);
      return { element };
    } catch {
      return null;
    }
  }

  private async loadCash(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const res = await fetch(this.url(AUDIO_FILES.cash));
      if (!res.ok) return;
      this.cashBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      this.cashBuffer = null;
    }
  }

  /** Loops play only when unlocked, unmuted and visible. */
  private syncLoops(): void {
    const play = this.unlocked && !this.muted && !this.hidden;
    for (const { element } of this.loops) {
      if (play) void element.play().catch(() => undefined);
      else element.pause();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
    this.syncLoops();
  }

  /** Tab hidden: pause the loops and the context; back: resume. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (ctx) {
      if (hidden) void ctx.suspend().catch(() => undefined);
      else void ctx.resume().catch(() => undefined);
    }
    this.syncLoops();
  }

  /** A rental was paid. Throttled; silent until unlocked, while muted or hidden. */
  playCash(now: number): void {
    const { ctx, master, cashBuffer } = this;
    if (!ctx || !master || !cashBuffer || this.muted || this.hidden) return;
    if (!cashAllowed(this.lastCash, now)) return;
    this.lastCash = now;
    try {
      const source = ctx.createBufferSource();
      source.buffer = cashBuffer;
      const gain = ctx.createGain();
      gain.gain.value = CASH_VOLUME;
      source.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // a sound that cannot play is skipped
    }
  }

  dispose(): void {
    for (const { element } of this.loops) {
      element.pause();
      element.removeAttribute("src");
    }
    this.loops = [];
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.cashBuffer = null;
    this.unlocked = false;
  }
}
