import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { LocalBroadcastSyncProvider } from './core/sync/local-broadcast-sync.provider';
import { RealtimeCloudSyncProvider } from './core/sync/realtime-cloud-sync.provider';
import { ROOM_SYNC_PROVIDER } from './core/sync/room-sync.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    {
      provide: ROOM_SYNC_PROVIDER,
      useClass:
        environment.syncProvider === 'cloud'
          ? RealtimeCloudSyncProvider
          : LocalBroadcastSyncProvider
    },
    // El SW solo cachea el app shell; las señales de sala y /api nunca se persisten.
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
