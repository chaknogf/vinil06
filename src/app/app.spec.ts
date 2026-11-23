import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { GameSessionService } from './core/services/game-session.service';
import { LocalBroadcastSyncProvider } from './core/sync/local-broadcast-sync.provider';
import { ROOM_SYNC_PROVIDER } from './core/sync/room-sync.provider';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ROOM_SYNC_PROVIDER, useClass: LocalBroadcastSyncProvider }
      ]
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the app shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-shell')).toBeTruthy();
  });

  it('muestra el copy de anfitrión al abrir el aviso de privacidad', async () => {
    const fixture = TestBed.createComponent(App);
    const session = TestBed.inject(GameSessionService);
    session.requestHost({ mode: 'CARDS_12', includeSelf: true, botNames: [], manual: true });
    await fixture.whenStable();
    expect(session.privacyForHost()).toBe(true);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Conectar tu Spotify Premium es opcional.');
    expect(compiled.textContent).not.toContain('No se creó la sala');
  });
});
