import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameSessionService } from '../../core/services/game-session.service';
import { HostBoardComponent } from '../host-board/host-board.component';
import { PlayerCardComponent } from '../player-card/player-card.component';

/** Cambia entre el tablero del anfitrión y la vista del jugador. */
@Component({
  selector: 'app-session-view',
  imports: [HostBoardComponent, PlayerCardComponent],
  templateUrl: './session-view.component.html',
  styleUrl: './session-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionViewComponent {
  readonly session = inject(GameSessionService);
  readonly state = computed(() => this.session.viewState());
}
