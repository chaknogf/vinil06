import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal
} from '@angular/core';

/** Portada: imagen del catálogo remoto o SVG local generado en memoria. */
@Component({
  selector: 'app-album-art',
  templateUrl: './album-art.component.html',
  styleUrl: './album-art.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlbumArtComponent {
  readonly palette = input.required<readonly [string, string]>();
  readonly motif = input(0);
  /** Prefijo único para el id del degradado (evita colisiones entre cartas). */
  readonly uid = input('art');
  /** URL remota opcional; si falla, se muestra el SVG local automáticamente. */
  readonly src = input('');

  readonly #failed = signal(false);
  readonly showRemote = computed(() => !!this.src() && !this.#failed());
  readonly remoteSrc = computed(() => (this.showRemote() ? this.src() : ''));

  get gradientId(): string {
    return `grad_${this.uid()}`;
  }

  constructor() {
    effect(() => {
      this.src();
      this.#failed.set(false);
    });
  }

  onImageError(): void {
    this.#failed.set(true);
  }
}
