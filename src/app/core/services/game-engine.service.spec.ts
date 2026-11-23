import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { GameEngineService } from './game-engine.service';
import { PreviewAudioService } from './preview-audio.service';

/** Audio controlado por el test: la pista "suena" solo cuando lo decidimos. */
class FakePreviewAudioService {
  readonly playing = signal(false);
  readonly blocked = signal(false);
  #resolvePlay: ((started: boolean) => void) | null = null;
  retries = 0;

  preload(): void {}

  cancelPreload(): void {}

  stop(): void {}

  cancelWait(): void {
    this.#resolvePlay?.(false);
    this.#resolvePlay = null;
  }

  markRetry(): void {
    this.retries++;
  }

  unlock(): void {}

  retry(): void {
    this.retries++;
  }

  play(url: string): Promise<boolean> {
    return this.playWhenReady(url);
  }

  playWhenReady(_url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.#resolvePlay = resolve;
    });
  }

  /** Simula el evento `playing` del navegador. */
  startPlayback(): void {
    this.#resolvePlay?.(true);
    this.#resolvePlay = null;
  }
}

describe('GameEngineService · arranque sincronizado con el audio', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PreviewAudioService, useClass: FakePreviewAudioService }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantiene SPINNING mientras carga y solo inicia el cronómetro al sonar la pista', async () => {
    const engine = TestBed.inject(GameEngineService);
    const audio = TestBed.inject(PreviewAudioService) as unknown as FakePreviewAudioService;

    engine.createRoom('CARDS_12', true, [], false);
    engine.spin();

    // Termina el giro: aquí antes se entraba en LISTEN_8S aunque no hubiera audio.
    await vi.advanceTimersByTimeAsync(environment.timings.spinMs);
    await vi.advanceTimersByTimeAsync(1500);
    expect(engine.phase()).toBe('SPINNING');
    expect(engine.snapshot().phase).toBe('SPINNING');
    expect(engine.snapshot().audioWaiting).toBe(true);

    // El evento `playing` confirma buffer suficiente: ahora sí arranca la fase.
    audio.startPlayback();
    await vi.advanceTimersByTimeAsync(0);

    expect(engine.phase()).toBe('LISTEN_8S');
    expect(engine.snapshot().phase).toBe('LISTEN_8S');
    expect(engine.snapshot().audioWaiting).toBe(false);
    expect(Date.now() - engine.phaseStartedAt()).toBeLessThan(100);

    // El cronómetro de escucha se programa desde ese instante, no desde el giro.
    await vi.advanceTimersByTimeAsync(engine.snapshot().listenDurationMs);
    expect(engine.phase()).toBe('FLIP_6S');
  });

  it('reintenta con una petición nueva sin cerrar la sala ni perder jugadores', async () => {
    const engine = TestBed.inject(GameEngineService);
    const audio = TestBed.inject(PreviewAudioService) as unknown as FakePreviewAudioService;

    engine.createRoom('CARDS_12', true, [], false);
    const code = engine.roomCode();
    const players = engine.players().map((player) => ({ ...player }));
    engine.spin();
    await vi.advanceTimersByTimeAsync(environment.timings.spinMs);

    expect(engine.audioWaiting()).toBe(true);
    engine.retryAudio();

    expect(audio.retries).toBe(1);
    expect(engine.roomCode()).toBe(code);
    expect(engine.players()).toEqual(players);
    expect(engine.phase()).toBe('SPINNING');
    expect(engine.audioWaiting()).toBe(true);

    // #trySpotify introduces una microtask antes de pedir el preview.
    await Promise.resolve();
    audio.startPlayback();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.phase()).toBe('LISTEN_8S');
  });

  it('el rematch desde el podio conserva el código y los jugadores', () => {
    const engine = TestBed.inject(GameEngineService);

    engine.createRoom('CARDS_12', true, ['Bota', 'Nena'], false);
    const code = engine.roomCode();
    const names = engine.players().map((player) => player.name);
    engine.showPodium();
    expect(engine.phase()).toBe('PODIUM');

    engine.advance();

    expect(engine.phase()).toBe('LOBBY');
    expect(engine.roomCode()).toBe(code);
    expect(engine.players().map((player) => player.name)).toEqual(names);
    expect(engine.players().every((player) => player.score === 0)).toBe(true);
  });
});
