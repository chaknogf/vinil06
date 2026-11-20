import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  Type
} from '@angular/core';
import { NavigationEnd, provideRouter, Router, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { filter } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { trackRoute } from './core/analytics/vercel-analytics';
import { FirebaseRoomSyncProvider } from './core/sync/firebase-room-sync.provider';
import { LocalBroadcastSyncProvider } from './core/sync/local-broadcast-sync.provider';
import { PeerHubSyncProvider } from './core/sync/peer-hub-sync.provider';
import { RealtimeCloudSyncProvider } from './core/sync/realtime-cloud-sync.provider';
import { ROOM_SYNC_PROVIDER, RoomSyncProvider } from './core/sync/room-sync.provider';

/**
 * Peer es el modo por defecto: el host es autoridad y la sala vive solo en RAM.
 * Firebase queda como respaldo y solo se activa si se pide explícitamente
 * (`syncProvider: 'firebase'`) y hay config web pegada.
 */
function selectSyncProvider(): Type<RoomSyncProvider> {
  if (environment.syncProvider === 'firebase') {
    return environment.firebase.databaseURL.trim()
      ? FirebaseRoomSyncProvider
      : PeerHubSyncProvider;
  }
  if (environment.syncProvider === 'cloud') return RealtimeCloudSyncProvider;
  if (environment.syncProvider === 'peer') return PeerHubSyncProvider;
  return LocalBroadcastSyncProvider;
}

/** El Router es la única fuente de cambios de ruta: inicial + pushState/popstate. */
function provideAnalyticsRouteTracking() {
  return provideAppInitializer(() => {
    const router = inject(Router);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => trackRoute(event.urlAfterRedirects));
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnalyticsRouteTracking(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    {
      provide: ROOM_SYNC_PROVIDER,
      useClass: selectSyncProvider()
    },
    // El SW solo cachea el app shell; las señales de sala y /api nunca se persisten.
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
