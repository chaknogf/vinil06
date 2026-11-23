import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostListener,
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
  /** El invitado solo necesita leer el aviso: no tiene tablero que activar. */
  readonly isHost = input(true);
  readonly accept = output<void>();
  readonly manual = output<void>();
  readonly dismiss = output<void>();

  protected readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

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
      // Enfocamos el PANEL (tabindex=-1) y luego su primer botón: así el keydown
      // siempre burbujea desde dentro, aunque el invitado solo vea «Entendido».
      queueMicrotask(() => {
        const root = this.panel()?.nativeElement;
        root?.focus();
        root?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
      });
    });
  }

  /** Con `inert` en el shell, el documento es la red de seguridad del trap. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.visible()) this.onKeydown(event);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = this.panel()?.nativeElement;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Si algo mueve el foco fuera del diálogo, lo devolvemos al primer botón. */
  onFocusIn(event: FocusEvent): void {
    if (!this.visible()) return;
    const root = this.panel()?.nativeElement;
    if (!root || event.target instanceof Node && root.contains(event.target)) return;
    root.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }
}
