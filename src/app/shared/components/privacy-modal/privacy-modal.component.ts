import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  viewChild
} from '@angular/core';

/** Modal bloqueante: el host debe aceptar antes de activar su tablero. */
@Component({
  selector: 'app-privacy-modal',
  templateUrl: './privacy-modal.component.html',
  styleUrl: './privacy-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyModalComponent {
  readonly visible = input(false);
  readonly accept = output<void>();
  readonly manual = output<void>();
  readonly dismiss = output<void>();

  protected readonly acceptButton = viewChild<ElementRef<HTMLButtonElement>>('acceptButton');

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      queueMicrotask(() => this.acceptButton()?.nativeElement.focus());
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.acceptButton()?.nativeElement.closest('[role="dialog"]');
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled])')
    );
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
