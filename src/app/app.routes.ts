import { Routes } from '@angular/router';
import { LobbyComponent } from './features/lobby/lobby.component';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'jugar/:code', component: LobbyComponent },
  // Redirect URI del flujo PKCE de Spotify (lo procesa App y vuelve a '/').
  { path: 'spotify/callback', component: LobbyComponent },
  { path: '**', redirectTo: '' }
];
