// Sound without a single audio file: short soft tones and noise bursts computed at start-up, and a slow, low drone under everything.
// Same recipes as the Unity game (rounded envelopes, low pitch: nothing sharp on a click).
const RATE = 22050;

type Wave = (t: number) => number;

const TAU = Math.PI * 2;
const sine = (hz: number, t: number): number => Math.sin(TAU * hz * t);
const env = (t: number, length: number, attack = 0.004): number => Math.min(1, t / attack) * Math.exp((-5 * t) / length);
/** A rounded envelope: it swells over `attack` seconds (no click at the start) and fades away. */
const soft = (t: number, length: number, attack: number): number => {
  const a = Math.sin(0.5 * Math.PI * Math.min(1, t / attack));
  return a * a * Math.exp((-5 * t) / length);
};
// a noise value that depends on the sample, so every run sounds the same
const noise: Wave = (t) => (((Math.imul(Math.floor(t * 91237), 2654435761) >>> 7) & 1023) / 511.5) - 1;

export type SoundName = 'click' | 'tick' | 'place' | 'error' | 'knock' | 'whoosh' | 'shard' | 'win' | 'fail' | 'unlock';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private clips = new Map<string, AudioBuffer>();
  private drone: AudioBufferSourceNode | null = null;
  private droneGain: GainNode | null = null;
  sound = true;
  volume = 0.8;
  /** Sounds asked for since the start (the tests look at it). */
  count = 0;

  /** Browsers only allow sound after a first gesture: this is called from the first pointer or key event. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.build();
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.22;
    this.droneGain.connect(this.master);
    this.apply();
  }

  private make(name: string, seconds: number, wave: Wave): void {
    if (!this.ctx) return;
    const n = Math.round(seconds * RATE);
    const buf = this.ctx.createBuffer(1, n, RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.max(-1, Math.min(1, wave(i / RATE)));
    this.clips.set(name, buf);
  }

  private build(): void {
    this.make('click', 0.22, (t) => sine(205 - 35 * t, t) * soft(t, 0.22, 0.026) * 0.075); // a low, round, muffled tap
    this.make('tick', 0.16, (t) => sine(250 - 35 * t, t) * soft(t, 0.16, 0.02) * 0.07);
    this.make('place', 0.28, (t) => (sine(95 * (1 + 0.5 * Math.exp(-30 * t)), t) * 0.8 + noise(t) * 0.25 * Math.exp(-60 * t)) * env(t, 0.28));
    this.make('error', 0.24, (t) => sine(150 - 40 * t, t) * soft(t, 0.24, 0.02) * 0.12); // a low, soft refusal
    this.make('knock', 0.16, (t) => (sine(150, t) * 0.6 + noise(t) * 0.5 * Math.exp(-80 * t)) * env(t, 0.16));
    this.make('whoosh', 0.38, (t) => {
      const s = Math.sin(Math.PI * Math.min(1, t / 0.38));
      return sine(130 - 40 * t, t) * s * s * 0.08; // a slow low swell between screens
    });
    this.make('shard', 0.55, (t) => (sine(1318, t) + sine(1760, t) * 0.7 + sine(2637, t) * 0.4) * 0.22 * env(t, 0.55));
    this.make('win', 1.1, (t) => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      let v = 0;
      notes.forEach((hz, i) => {
        const st = t - i * 0.13;
        if (st > 0) v += (sine(hz, st) + 0.3 * sine(hz * 2, st)) * env(st, 0.7) * 0.22;
      });
      return v;
    });
    this.make('fail', 0.6, (t) => sine(220 - 120 * (t / 0.6), t) * env(t, 0.5) * 0.4);
    this.make('unlock', 0.9, (t) => (sine(440, t) + sine(554.37, t) + sine(659.25, t)) * 0.13 * env(t, 0.9));
    // the drone: whole numbers of cycles over the length of the loop, so it joins up with itself
    this.make('drone', 12, (t) => {
      const slow = 0.6 + 0.4 * Math.sin(TAU * 0.25 * t);
      return (sine(55, t) * 0.5 + sine(82.5, t) * 0.3 * slow + sine(110, t) * 0.2 * (1.2 - slow)) * 0.5;
    });
  }

  /** The settings' volume and sound switch, applied to everything that plays. */
  apply(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.value = this.sound ? Math.max(0, Math.min(1, this.volume)) : 0;
    if (this.sound && !this.drone && this.droneGain) {
      const buf = this.clips.get('drone');
      if (buf) {
        this.drone = this.ctx.createBufferSource();
        this.drone.buffer = buf;
        this.drone.loop = true;
        this.drone.connect(this.droneGain);
        this.drone.start();
      }
    }
    if (!this.sound && this.drone) {
      this.drone.stop();
      this.drone.disconnect();
      this.drone = null;
    }
  }

  play(name: SoundName, volume = 1, pitch = 1): void {
    if (!this.sound) return;
    this.count++;
    if (!this.ctx || !this.master) return;
    const buf = this.clips.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }
}
