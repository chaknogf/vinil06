import { Routes } from '@angular/router';
import { LobbyComponent } from './features/lobby/lobby.component';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'jugar/:code', component: LobbyComponent },
  // Redirect URI del flujo PKCE de Spotify (lo procesa App y vuelve a '/').
  { path: 'spotify/callback', component: LobbyComponent },
  // YouTube usa Google Identity Services: no hay redirect URI propia (el token
  // llega al callback de JS), por eso no hace falta una ruta /auth/callback.
  { path: '**', redirectTo: '' }
];
