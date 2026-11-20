import { ApplicationConfig, provideBrowserGlobalErrorListeners, Type } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { FirebaseRoomSyncProvider } from './core/sync/firebase-room-sync.provider';
import { LocalBroadcastSyncProvider } from './core/sync/local-broadcast-sync.provider';
import { PeerHubSyncProvider } from './core/sync/peer-hub-sync.provider';
import { RealtimeCloudSyncProvider } from './core/sync/realtime-cloud-sync.provider';
import { ROOM_SYNC_PROVIDER, RoomSyncProvider } from './core/sync/room-sync.provider';

/**
 * Peer + IndexedDB es el modo por defecto: el host guarda la sala en su
 * dispositivo. Firebase queda como respaldo y solo se activa si se pide
 * explícitamente (`syncProvider: 'firebase'`) y hay config web pegada.
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
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
