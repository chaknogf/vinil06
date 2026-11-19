import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import {
  PlayerAnswerPayload,
  RoomStateSnapshot,
  RoomSyncMessage,
  RoomSyncProvider,
} from './room-sync.models';

@Injectable()
export class RealtimeCloudSyncProvider implements RoomSyncProvider, OnDestroy {
  private supabase: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private currentRoomCode: string | null = null;
  private isHostRole = false;

  readonly isConnected = signal<boolean>(false);
  readonly state = signal<RoomStateSnapshot | null>(null);
  readonly incomingAnswers = signal<PlayerAnswerPayload[]>([]);

  constructor() {
    // Limpieza automática al cerrar la pestaña o navegar fuera (sin persistencia)
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handleUnloadCleanup);
      window.addEventListener('beforeunload', this.handleUnloadCleanup);
    }
  }

  private getClient(): SupabaseClient {
    if (!this.supabase) {
      this.supabase = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          realtime: {
            params: {
              eventsPerSecond: 20,
            },
          },
        }
      );
    }
    return this.supabase;
  }

  async joinRoom(
    roomCode: string,
    participant: { id: string; nickname: string; isHost: boolean }
  ): Promise<void> {
    await this.leaveAndPurge();

    const normalizedCode = roomCode.trim().toUpperCase();
    this.currentRoomCode = normalizedCode;
    this.isHostRole = participant.isHost;

    const client = this.getClient();
    const topic = `vinil06:room:${normalizedCode}`;

    this.channel = client.channel(topic, {
      config: {
        broadcast: {
          // El anfitrión no necesita eco de sus propios mensajes
          self: false,
          ack: false,
        },
        presence: {
          key: participant.id,
        },
      },
    });

    // Escuchar mensajes efímeros de la sala
    this.channel
      .on('broadcast', { event: 'vinil06_event' }, ({ payload }) => {
        this.handleIncomingMessage(payload as RoomSyncMessage);
      })
      .on('presence', { event: 'sync' }, () => {
        if (this.isHostRole) {
          this.syncPresenceWithLeaderboard();
        }
      });

    await new Promise<void>((resolve, reject) => {
      if (!this.channel) {
        reject(new Error('Canal Realtime no inicializado'));
        return;
      }

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isConnected.set(true);

          // Registrar presencia efímera (vive solo mientras el socket esté abierto)
          await this.channel?.track({
            id: participant.id,
            nickname: participant.nickname,
            isHost: participant.isHost,
            joinedAt: Date.now(),
          });

          // Si es invitado, pedir al anfitrión el estado actual de la ronda
          if (!participant.isHost) {
            await this.requestLatestState(participant.id);
          }

          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.isConnected.set(false);
          reject(new Error(`Error conectando a sala ${normalizedCode}: ${status}`));
        } else if (status === 'CLOSED') {
          this.isConnected.set(false);
        }
      });
    });
  }

  async broadcastState(snapshot: RoomStateSnapshot): Promise<void> {
    if (!this.channel || !this.isConnected()) return;

    // Al iniciar una nueva fase de volteo de 6s, limpiar buffer de respuestas previas
    if (snapshot.phase === 'FLIP_6S' || snapshot.phase === 'LISTEN_8S') {
      this.incomingAnswers.set([]);
    }

    this.state.set(snapshot);

    const message: RoomSyncMessage = {
      type: 'STATE_SYNC',
      payload: snapshot,
    };

    await this.channel.send({
      type: 'broadcast',
      event: 'vinil06_event',
      payload: message,
    });
  }

  async submitAnswer(answer: PlayerAnswerPayload): Promise<void> {
    if (!this.channel || !this.isConnected()) return;

    const message: RoomSyncMessage = {
      type: 'PLAYER_ANSWER',
      payload: answer,
    };

    await this.channel.send({
      type: 'broadcast',
      event: 'vinil06_event',
      payload: message,
    });
  }

  async requestLatestState(requesterId: string): Promise<void> {
    if (!this.channel || !this.isConnected()) return;

    const message: RoomSyncMessage = {
      type: 'REQUEST_STATE',
      payload: { requesterId },
    };

    await this.channel.send({
      type: 'broadcast',
      event: 'vinil06_event',
      payload: message,
    });
  }

  async leaveAndPurge(): Promise<void> {
    if (this.channel) {
      if (this.isHostRole && this.isConnected()) {
        await this.channel.send({
          type: 'broadcast',
          event: 'vinil06_event',
          payload: {
            type: 'ROOM_CLOSED',
            payload: { reason: 'El anfitrión cerró la sala.' },
          } satisfies RoomSyncMessage,
        });
      }

      await this.channel.untrack();
      await this.supabase?.removeChannel(this.channel);
    }

    // Purga total de estado en RAM
    this.channel = null;
    this.currentRoomCode = null;
    this.isHostRole = false;
    this.isConnected.set(false);
    this.state.set(null);
    this.incomingAnswers.set([]);
  }

  private handleIncomingMessage(message: RoomSyncMessage): void {
    switch (message.type) {
      case 'STATE_SYNC':
        this.state.set(message.payload);
        break;

      case 'PLAYER_ANSWER':
        // Solo el anfitrión procesa y ordena respuestas para asignar +2 / +1 puntos
        if (this.isHostRole) {
          this.incomingAnswers.update((prev) => {
            const alreadyAnswered = prev.some(
              (item) =>
                item.playerId === message.payload.playerId &&
                item.roundNumber === message.payload.roundNumber
            );
            if (alreadyAnswered) return prev;
            return [...prev, message.payload];
          });
        }
        break;

      case 'REQUEST_STATE':
        if (this.isHostRole && this.state()) {
          void this.broadcastState(this.state()!);
        }
        break;

      case 'ROOM_CLOSED':
        void this.leaveAndPurge();
        break;
    }
  }

  /**
   * Sincroniza la lista de jugadores presentes en la sala sin guardar nada en DB
   */
  private syncPresenceWithLeaderboard(): void {
    if (!this.channel || !this.isHostRole) return;

    const currentSnapshot = this.state();
    if (!currentSnapshot) return;

    const presenceState = this.channel.presenceState<{
      id: string;
      nickname: string;
      isHost: boolean;
    }>();

    const activePlayers = Object.values(presenceState)
      .flat()
      .filter((p) => !p.isHost);

    const existingMap = new Map(
      currentSnapshot.leaderboard.map((entry) => [entry.playerId, entry])
    );

    const updatedLeaderboard = activePlayers.map((player) => {
      const existing = existingMap.get(player.id);
      return (
        existing ?? {
          playerId: player.id,
          nickname: player.nickname,
          points: 0,
          lastDelta: 0,
          isConnected: true,
          karaokeJokerUsed: false,
        }
      );
    });

    void this.broadcastState({
      ...currentSnapshot,
      leaderboard: updatedLeaderboard,
    });
  }

  private readonly handleUnloadCleanup = (): void => {
    void this.leaveAndPurge();
  };

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.handleUnloadCleanup);
      window.removeEventListener('beforeunload', this.handleUnloadCleanup);
    }
    void this.leaveAndPurge();
  }
}
