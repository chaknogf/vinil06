import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { KaraokeTurn } from '../../core/models/game.models';
import { AlbumArtComponent } from '../../shared/components/album-art/album-art.component';
import { TimerPanelComponent } from '../../shared/components/timer-panel/timer-panel.component';

@Component({
  selector: 'app-karaoke-turn',
  imports: [AlbumArtComponent, TimerPanelComponent],
  templateUrl: './karaoke-turn.component.html',
  styleUrl: './karaoke-turn.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KaraokeTurnComponent {
  readonly turn = input.required<KaraokeTurn>();
  readonly startedAt = input(0);
  readonly clockOffset = input(0);
  readonly canInteract = input(false);
  readonly active = input(true);

  readonly wildcard = output<void>();
  readonly done = output<void>();
}
