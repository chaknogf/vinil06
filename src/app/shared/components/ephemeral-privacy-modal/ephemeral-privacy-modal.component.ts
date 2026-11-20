import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild
} from '@angular/core';

/** Modal bloqueante de transparencia: el host acepta antes de activar su tablero. */
@Component({
  selector: 'app-ephemeral-privacy-modal',
  standalone: true,
  templateUrl: './ephemeral-privacy-modal.component.html',
  styleUrl: './ephemeral-privacy-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EphemeralPrivacyModalComponent {
  readonly visible = input(false);
  readonly error = input('');
  readonly accept = output<void>();
  readonly manual = output<void>();
  readonly dismiss = output<void>();

  protected readonly acceptButton = viewChild<ElementRef<HTMLButtonElement>>('acceptButton');

  #previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (!this.visible()) {
        if (this.#previouslyFocused) {
          const previous = this.#previouslyFocused;
          this.#previouslyFocused = null;
          queueMicrotask(() => previous.focus());
        }
        return;
      }
      this.#previouslyFocused = document.activeElement as HTMLElement;
      queueMicrotask(() => this.acceptButton()?.nativeElement.focus());
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = this.acceptButton()?.nativeElement.closest('[role="dialog"]');
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
