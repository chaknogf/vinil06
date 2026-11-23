import { TestBed } from '@angular/core/testing';
import { PreviewAudioService } from './preview-audio.service';

/** Audio falso: expone los eventos reales del navegador sin red ni autoplay. */
class FakeAudio extends EventTarget {
  static last: FakeAudio;
  static nextPlayResult: Promise<void> = Promise.resolve();
  src = '';
  volume = 1;
  currentTime = 0;
  preload = '';

  constructor() {
    super();
    FakeAudio.last = this;
  }

  play(): Promise<void> {
    return FakeAudio.nextPlayResult;
  }

  pause(): void {}

  load(): void {}
}

describe('PreviewAudioService', () => {
  const OriginalAudio = globalThis.Audio;

  beforeEach(() => {
    FakeAudio.nextPlayResult = Promise.resolve();
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.Audio = OriginalAudio;
  });

  it('resuelve cuando el preview empieza a sonar, no cuando se pide play()', async () => {
    const service = TestBed.inject(PreviewAudioService);
    let finishPlay!: () => void;
    FakeAudio.nextPlayResult = new Promise<void>((resolve) => {
      finishPlay = resolve;
    });

    const ready = service.playWhenReady('https://example.test/preview.m4a');
    const audio = FakeAudio.last;
    let settled = false;
    void ready.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    audio.dispatchEvent(new Event('playing'));
    finishPlay();
    await expect(ready).resolves.toBe(true);
  });

  it('espera indefinidamente tras un error y el reintento con playing la desbloquea', async () => {
    const service = TestBed.inject(PreviewAudioService);
    FakeAudio.nextPlayResult = Promise.reject(new Error('autoplay bloqueado'));

    const ready = service.playWhenReady('https://example.test/preview.m4a');
    const audio = FakeAudio.last;
    let settled = false;
    void ready.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(service.blocked()).toBe(true);
    expect(settled).toBe(false);

    FakeAudio.nextPlayResult = Promise.resolve();
    service.retry();
    await Promise.resolve();
    expect(audio.src).toContain('_vinil_retry=');

    audio.dispatchEvent(new Event('playing'));
    await expect(ready).resolves.toBe(true);
    expect(service.blocked()).toBe(false);
  });

  it('cancelWait cierra la espera sin perder la sala', async () => {
    const service = TestBed.inject(PreviewAudioService);
    const ready = service.playWhenReady('https://example.test/preview.m4a');

    service.cancelWait();

    await expect(ready).resolves.toBe(false);
    expect(service.playing()).toBe(false);
  });
});
