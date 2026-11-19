import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PublicOption } from '../../core/models/game.models';
import { AlbumArtComponent } from '../../shared/components/album-art/album-art.component';

/** Carta de naipe con tocadiscos girando en el dorso y giro 3D al revelar. */
@Component({
  selector: 'app-vinyl-card',
  imports: [AlbumArtComponent],
  templateUrl: './vinyl-card.component.html',
  styleUrl: './vinyl-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VinylCardComponent {
  readonly option = input.required<PublicOption>();
  readonly index = input(0);
  readonly flipped = input(false);
  readonly disabled = input(true);
  readonly selected = input(false);
  readonly revealed = input(false);
  readonly spinning = input(false);
  readonly uid = input('card');

  readonly choose = output<void>();

  readonly shineId = computed(() => `vinylShine_${this.uid()}`);

  readonly frontState = computed<'neutral' | 'selected' | 'correct' | 'wrong' | 'dim'>(() => {
    if (this.revealed()) {
      if (this.option().id && this.correct()) return 'correct';
      if (this.selected()) return 'wrong';
      return 'dim';
    }
    return this.selected() ? 'selected' : 'neutral';
  });

  readonly correct = input(false);

  readonly backLabel = computed(() => (this.spinning() ? 'ESCUCHANDO...' : 'BLOQUEADA'));

  readonly ariaLabel = computed(() => {
    if (!this.flipped()) return `Carta ${this.index() + 1}, boca abajo`;
    return `Carta ${this.index() + 1}: ${this.option().title} de ${this.option().artist}`;
  });
}
