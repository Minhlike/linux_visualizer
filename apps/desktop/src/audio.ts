/**
 * Procedural Semantic Audio Engine — Web Audio API
 *
 * Provides event-driven sound cues synchronized with the choreography timeline,
 * plus a shared machine ambience layer whose intensity tracks system activity.
 *
 * Rules:
 * - Single AudioContext, lazy-initialized on first user gesture
 * - Procedural synthesis only (zero external sound files)
 * - Rate-limit I/O events (90ms gap)
 * - Polyphony capped at 6 simultaneous voices
 * - Stereo panning by entity position (normalized -1..1)
 * - Mute toggle + master volume with localStorage persistence
 * - Ambience fades with system activity level
 */

const STORAGE_KEY = "linux_obs_audio";
const MAX_VOICES = 6;
const IO_THROTTLE_MS = 90;
const PAN_RANGE = 5; // world X range for normalization

interface AudioSettings {
  muted: boolean;
  volume: number;
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        muted: typeof parsed.muted === "boolean" ? parsed.muted : false,
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : 0.5,
      };
    }
  } catch {}
  return { muted: false, volume: 0.5 };
}

function saveSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

class SemanticAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceOsc: OscillatorNode | null = null;
  private ambienceNoise: AudioBufferSourceNode | null = null;
  private settings: AudioSettings;
  private activeVoices = 0;
  private lastIoTime = 0;
  private lastEventKind = "";
  private activityLevel = 0; // 0-1

  constructor() {
    this.settings = loadSettings();
  }

  ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
    this.master.connect(this.ctx.destination);
    this.startAmbience();
  }

  private startAmbience(): void {
    if (!this.ctx || !this.master) return;

    // Low hum oscillator
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.02;
    this.ambienceGain.connect(this.master);

    this.ambienceOsc = this.ctx.createOscillator();
    this.ambienceOsc.type = "sine";
    this.ambienceOsc.frequency.value = 55; // Sub-bass hum
    this.ambienceOsc.connect(this.ambienceGain);
    this.ambienceOsc.start();

    // Filtered noise for machine room ambience
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.008;
    }

    this.ambienceNoise = this.ctx.createBufferSource();
    this.ambienceNoise.buffer = noiseBuffer;
    this.ambienceNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 200;
    noiseFilter.Q.value = 0.5;

    this.ambienceNoise.connect(noiseFilter);
    noiseFilter.connect(this.ambienceGain);
    this.ambienceNoise.start();
  }

  /** Update ambience intensity based on system activity (0=idle, 1=busy) */
  setActivityLevel(level: number): void {
    this.activityLevel = Math.max(0, Math.min(1, level));
    if (this.ambienceGain && this.ctx) {
      const target = 0.015 + this.activityLevel * 0.04;
      this.ambienceGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
    }
  }

  isMuted(): boolean { return this.settings.muted; }
  getVolume(): number { return this.settings.volume; }

  setMuted(m: boolean): void {
    this.settings.muted = m;
    saveSettings(this.settings);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.settings.volume, this.ctx.currentTime, 0.05);
    }
  }

  setVolume(v: number): void {
    this.settings.volume = Math.max(0, Math.min(1, v));
    saveSettings(this.settings);
    if (this.master && this.ctx && !this.settings.muted) {
      this.master.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.05);
    }
  }

  private createPanner(entityX: number): StereoPannerNode | null {
    if (!this.ctx) return null;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, entityX / PAN_RANGE));
    return panner;
  }

  private canPlay(eventKind: string): boolean {
    if (!this.ctx || !this.master || this.settings.muted) return false;
    if (this.activeVoices >= MAX_VOICES) return false;

    // Prevent duplicate consecutive events
    if (eventKind === this.lastEventKind) {
      const now = performance.now();
      if (now - this.lastIoTime < IO_THROTTLE_MS) return false;
    }

    // Rate-limit I/O events
    if (eventKind === "bytes_read" || eventKind === "bytes_written") {
      const now = performance.now();
      if (now - this.lastIoTime < IO_THROTTLE_MS) return false;
      this.lastIoTime = now;
    }

    this.lastEventKind = eventKind;
    return true;
  }

  private voiceStart(): void { this.activeVoices++; }
  private voiceEnd(): void { this.activeVoices = Math.max(0, this.activeVoices - 1); }

  playEvent(eventKind: string, entityX: number): void {
    if (!this.canPlay(eventKind)) return;
    const fn = eventHandlers[eventKind] ?? eventHandlers["unknown"];
    if (fn) fn(this, entityX);
  }

  /** Internal: create and schedule an oscillator voice */
  _voice(
    type: OscillatorType,
    freq: number,
    endFreq: number,
    duration: number,
    entityX: number,
    gain = 0.12,
    attackMs = 5,
    decayTarget = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    this.voiceStart();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const panner = this.createPanner(entityX);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attackMs / 1000);
    env.gain.setTargetAtTime(decayTarget, now + duration * 0.6, duration * 0.25);

    osc.connect(env);
    if (panner) { env.connect(panner); panner.connect(this.master); } else { env.connect(this.master); }

    osc.start(now);
    osc.stop(now + duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      panner?.disconnect();
      this.voiceEnd();
    };
  }

  /** Internal: filtered sweep voice */
  _filteredVoice(
    type: OscillatorType,
    freq: number,
    filterStart: number,
    filterEnd: number,
    duration: number,
    entityX: number,
    gain = 0.1,
  ): void {
    if (!this.ctx || !this.master) return;
    this.voiceStart();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    const panner = this.createPanner(entityX);

    osc.type = type;
    osc.frequency.value = freq;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterStart, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterEnd), now + duration);
    filter.Q.value = 4;

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.01);
    env.gain.setTargetAtTime(0, now + duration * 0.7, duration * 0.2);

    osc.connect(filter);
    filter.connect(env);
    if (panner) { env.connect(panner); panner.connect(this.master); } else { env.connect(this.master); }

    osc.start(now);
    osc.stop(now + duration + 0.05);
    osc.onended = () => {
      osc.disconnect(); filter.disconnect(); env.disconnect(); panner?.disconnect();
      this.voiceEnd();
    };
  }

  /** Internal: chord (multiple oscillators) */
  _chord(freqs: number[], duration: number, entityX: number, gain = 0.06): void {
    if (!this.ctx || !this.master) return;
    this.voiceStart();

    const now = this.ctx.currentTime;
    const merger = this.ctx.createGain();
    const env = this.ctx.createGain();
    const panner = this.createPanner(entityX);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.02);
    env.gain.setTargetAtTime(0, now + duration * 0.5, duration * 0.3);

    const oscs = freqs.map((f) => {
      const o = this.ctx!.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(merger);
      o.start(now);
      o.stop(now + duration + 0.1);
      return o;
    });

    merger.connect(env);
    if (panner) { env.connect(panner); panner.connect(this.master!); } else { env.connect(this.master!); }

    const lastOsc = oscs[oscs.length - 1];
    if (lastOsc) {
      lastOsc.onended = () => {
        oscs.forEach((o) => o.disconnect());
        merger.disconnect(); env.disconnect(); panner?.disconnect();
        this.voiceEnd();
      };
    }
  }
}

/* ── Event Sound Handlers ─────────────────────────────────────────── */
const eventHandlers: Readonly<Record<string, (e: SemanticAudioEngine, x: number) => void>> = {
  shell_started(e, x) { e._voice("triangle", 140, 70, 0.15, x, 0.08); },

  standard_streams_initialized(e, x) { e._voice("sine", 330, 280, 0.08, x, 0.04); },

  pipe_created(e, x) {
    e._voice("sine", 1200, 900, 0.06, x, 0.07);
    e._voice("sine", 1800, 1400, 0.06, x, 0.05);
  },

  process_forked(e, x) {
    e._voice("sine", 260, 540, 0.12, x, 0.1);
  },

  file_descriptor_duplicated(e, x) {
    e._voice("triangle", 880, 660, 0.04, x, 0.06);
  },

  file_descriptor_closed(e, x) {
    e._voice("triangle", 520, 220, 0.06, x, 0.05);
  },

  process_executed(e, x) {
    e._filteredVoice("sawtooth", 110, 180, 320, 0.2, x, 0.08);
  },

  file_opened(e, x) {
    e._voice("triangle", 420, 280, 0.08, x, 0.07);
  },

  bytes_read(e, x) {
    e._voice("sine", 320, 260, 0.04, x, 0.04, 2);
  },

  bytes_written(e, x) {
    e._voice("square", 620, 480, 0.035, x, 0.035, 2);
  },

  process_exited(e, x) {
    e._voice("sine", 480, 65, 0.35, x, 0.09, 8, 0);
  },

  process_waited(e, x) {
    e._voice("sine", 587.33, 440, 0.18, x, 0.06);
  },

  completion(e, x) {
    e._chord([523.25, 659.25, 783.99], 0.8, x, 0.05);
  },

  error(e, x) {
    e._voice("sawtooth", 160, 120, 0.12, x, 0.06);
  },

  unknown(e, x) {
    e._voice("sine", 220, 180, 0.05, x, 0.03);
  },
};

export const audioEngine = new SemanticAudioEngine();
export type { SemanticAudioEngine };
