import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Pulso rítmico opcional y feedback sonoro sintetizado (Web Audio API).
 * No reproduce música: el anfitrión ya tiene Spotify abierto en su dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly enabled = signal(environment.features.audio);

  #ctx: AudioContext | null = null;
  #beatId: ReturnType<typeof setInterval> | null = null;
  #step = 0;

  toggle(): void {
    this.enabled.update((value) => !value);
    if (!this.enabled()) this.stopBeat();
  }

  private context(): AudioContext | null {
    if (!this.enabled()) return null;
    if (!this.#ctx) {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      this.#ctx = new Ctor();
    }
    if (this.#ctx.state === 'suspended') void this.#ctx.resume();
    return this.#ctx;
  }

  tone(freq = 440, duration = 0.09, type: OscillatorType = 'sine', volume = 0.08): void {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // El navegador puede bloquear audio hasta el primer gesto: se ignora.
    }
  }

  startBeat(bpm: number): void {
    this.stopBeat();
    if (!this.enabled()) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
    const intervalMs = Math.max(260, Math.round((60 / bpm) * 1000));
    this.#step = 0;
    const tick = () => {
      if (!this.enabled()) return;
      this.tone(notes[this.#step % notes.length] ?? 440, 0.14, 'triangle', 0.055);
      this.#step++;
    };
    tick();
    this.#beatId = setInterval(tick, intervalMs);
  }

  stopBeat(): void {
    if (this.#beatId !== null) {
      clearInterval(this.#beatId);
      this.#beatId = null;
    }
  }

  flipChime(): void {
    this.stopBeat();
    this.tone(660, 0.12, 'sine', 0.09);
    setTimeout(() => this.tone(880, 0.16, 'sine', 0.1), 90);
  }

  answerTap(correct: boolean): void {
    if (correct) this.tone(523.25, 0.1, 'sine', 0.08);
    else this.tone(190, 0.14, 'sawtooth', 0.045);
  }

  urgentTick(): void {
    this.tone(1046.5, 0.06, 'sine', 0.055);
  }

  dispose(): void {
    this.stopBeat();
    void this.#ctx?.close().catch(() => undefined);
    this.#ctx = null;
  }
}
