import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { initVercelAnalytics } from './app/core/analytics/vercel-analytics';

// En local el Dashboard de Spotify tiene registrado 127.0.0.1, no localhost.
// Unificar el origin antes de bootstrap evita el error "redirect_uri: Not
// matching configuration" y mantiene el verifier PKCE en el mismo origen.
if (!environment.production && window.location.hostname === 'localhost') {
  const local = new URL(window.location.href);
  local.hostname = '127.0.0.1';
  window.location.replace(local.toString());
} else {
  initVercelAnalytics();
  bootstrapApplication(App, appConfig)
    .catch((err) => console.error(err));
}
