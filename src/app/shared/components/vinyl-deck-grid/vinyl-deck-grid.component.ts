import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { GamePhase, ShuffledOption } from '../../../core/models/game.models';

export type CardFeedbackStatus =
  | 'IDLE'
  | 'CORRECT_FIRST'
  | 'CORRECT_OTHER'
  | 'WRONG'
  | 'TIMEOUT';

/**
 * Cuatro cartas de naipe con tocadiscos en el dorso y giro 3D al revelar.
 * El orden ya viene barajado por dispositivo; este componente solo dibuja y
 * gestiona el fallback de portadas y los estados bloqueado/activo/acierto/error.
 */
@Component({
  selector: 'app-vinyl-deck-grid',
  standalone: true,
  templateUrl: './vinyl-deck-grid.component.html',
  styleUrl: './vinyl-deck-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VinylDeckGridComponent {
  readonly options = input<readonly ShuffledOption[]>([]);
  readonly phase = input<GamePhase>('LOBBY');
  readonly flipped = input(false);
  readonly locked = input(false);
  readonly canAnswer = input(false);
  readonly selectedId = input<string | null>(null);
  readonly correctId = input<string | null>(null);
  readonly spinning = input(false);
  readonly status = input<CardFeedbackStatus>('IDLE');

  readonly select = output<string>();

  readonly #brokenIds = signal<ReadonlySet<string>>(new Set<string>());

  readonly backLabel = computed(() => (this.spinning() ? 'ESCUCHANDO...' : 'BLOQUEADA'));

  coverSrc(option: ShuffledOption): string {
    const remote = option.cover ?? '';
    return remote && !this.#brokenIds().has(option.id) ? remote : option.coverDataUri;
  }

  onCoverError(trackId: string): void {
    this.#brokenIds.update((previous) => {
      const next = new Set(previous);
      next.add(trackId);
      return next;
    });
  }

  onSelect(trackId: string): void {
    if (!this.canAnswer()) return;
    this.select.emit(trackId);
  }

  labelFor(option: ShuffledOption, index: number): string {
    if (!this.flipped()) return `Carta ${index + 1}, boca abajo y bloqueada`;
    return `Carta ${index + 1}: ${option.title} de ${option.artist}`;
  }
}
