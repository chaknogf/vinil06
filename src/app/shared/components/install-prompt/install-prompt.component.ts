import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

/** CTA sutil: solo aparece si el navegador ofrece instalación (beforeinstallprompt). */
@Component({
  selector: 'app-install-prompt',
  templateUrl: './install-prompt.component.html',
  styleUrl: './install-prompt.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstallPromptComponent {
  readonly visible = signal(false);
  readonly installing = signal(false);
  #deferred: BeforeInstallPromptEvent | null = null;

  constructor() {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      this.#deferred = event as BeforeInstallPromptEvent;
      this.visible.set(true);
    };
    const onInstalled = () => {
      this.#deferred = null;
      this.visible.set(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    });
  }

  async install(): Promise<void> {
    const event = this.#deferred;
    if (!event || this.installing()) {
      this.visible.set(false);
      return;
    }
    this.installing.set(true);
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    this.#deferred = null;
    this.installing.set(false);
    this.visible.set(false);
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
