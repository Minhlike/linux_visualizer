/**
 * Semantic Audio Engine for Linux Observatory
 *
 * Lightweight, procedural sound generation via Web Audio API.
 * Synthesizes event-driven mechanical/scientific auditory display with 0 external sound files.
 */

export interface AudioSettings {
  readonly muted: boolean;
  readonly volume: number; // 0.0 to 1.0
}

class SemanticAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;
  private volume: number;
  private lastEventTime = new Map<string, number>();
  private activeVoices = 0;
  private readonly maxPolyphony = 6;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    let savedMuted = false;
    let savedVol = 0.55;
    try {
      savedMuted = localStorage.getItem("linux_obs_audio_muted") === "true";
      const volStr = localStorage.getItem("linux_obs_audio_volume");
      if (volStr) savedVol = Math.max(0, Math.min(1, parseFloat(volStr)));
    } catch {
      // localStorage may be unavailable
    }
    this.muted = savedMuted;
    this.volume = savedVol;
  }

  /**
   * Lazily initialize AudioContext on user interaction
   */
  public ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initNoiseBuffer();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private initNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1; // 1 second of noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem("linux_obs_audio_muted", String(muted));
    } catch {}
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem("linux_obs_audio_volume", String(this.volume));
    } catch {}
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Helper to create a stereo panner based on entity X position in the 3D scene
   * World X ranges approximately from -7 to +7 -> Pan ranges from -0.7 to +0.7
   */
  private createPanner(entityX?: number): AudioNode {
    const ctx = this.ctx!;
    if (entityX !== undefined && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      const panValue = Math.max(-0.75, Math.min(0.75, entityX / 9));
      panner.pan.setValueAtTime(panValue, ctx.currentTime);
      panner.connect(this.masterGain!);
      return panner;
    }
    return this.masterGain!;
  }

  /**
   * Play semantic procedural sound mapped to UNIX events
   */
  public playEvent(eventKind: string, entityX?: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Rate limit rapid read/write events (min 90ms gap)
    const now = performance.now();
    const lastTime = this.lastEventTime.get(eventKind) ?? 0;
    if (["bytes_read", "bytes_written", "pipe_io"].includes(eventKind)) {
      if (now - lastTime < 90) return;
    }
    this.lastEventTime.set(eventKind, now);

    // Limit maximum active voices to avoid audio distortion
    if (this.activeVoices >= this.maxPolyphony) return;

    this.activeVoices++;
    const dest = this.createPanner(entityX);
    const t = ctx.currentTime;

    try {
      switch (eventKind) {
        // Shell started: Mechanical relay / solenoid click + low hum
        case "shell_started": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.1);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Fork / Clone: Activation latch (two-stage upward pulse)
        case "process_forked": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(540, t + 0.07);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.09);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Exec: Image transformation sweep (resonant low-to-mid engage)
        case "process_executed": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(320, t);
          filter.frequency.exponentialRampToValueAtTime(750, t + 0.08);
          osc.frequency.setValueAtTime(180, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.1);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.12);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Pipe created: Precision metallic coupling sound
        case "pipe_created": {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = "sine";
          osc1.frequency.setValueAtTime(1200, t);
          osc1.frequency.exponentialRampToValueAtTime(600, t + 0.07);
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(1800, t);
          osc2.frequency.exponentialRampToValueAtTime(900, t + 0.05);
          gain.gain.setValueAtTime(0.28, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(dest);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.09);
          osc2.stop(t + 0.09);
          osc1.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // FD dup/redirect: Precision connector snap (double click)
        case "file_descriptor_duplicated": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, t);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.02);
          gain.gain.setValueAtTime(0.35, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.07);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // FD closed: Disengage click
        case "file_descriptor_closed": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.04);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.05);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // File opened: Mechanical latch
        case "file_opened": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.exponentialRampToValueAtTime(280, t + 0.06);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.08);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Bytes read: Gentle pneumatic intake pulse
        case "bytes_read": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(320, t);
          osc.frequency.exponentialRampToValueAtTime(480, t + 0.05);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.07);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Bytes written: Transfer/output blip
        case "bytes_written": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(620, t);
          osc.frequency.exponentialRampToValueAtTime(380, t + 0.045);
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.06);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Process exited: Spindown deceleration
        case "process_exited": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(480, t);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.28);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.32);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Process waited: Closure chime
        case "process_waited": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, t); // D5
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.24);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        // Completion: Resolution major chord (C-E-G)
        case "completion": {
          const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
          freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, t + idx * 0.04);
            gain.gain.setValueAtTime(0.18, t + idx * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t + idx * 0.04);
            osc.stop(t + 0.65);
            if (idx === freqs.length - 1) {
              osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
            }
          });
          break;
        }

        // Error / Unsupported command: Warning pulse
        case "error": {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(160, t);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.15);
          osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
          break;
        }

        default:
          this.activeVoices = Math.max(0, this.activeVoices - 1);
          break;
      }
    } catch {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }
  }
}

export const audioEngine = new SemanticAudioEngine();
