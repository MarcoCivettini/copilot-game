import { Room, Client } from 'colyseus';
import { BattleState, Player } from '../schemas/BattleState';
import { GAME_CONFIG, WeaponType, WEAPONS } from '../config/game.config';
import { MapService } from '../services/map.service';
import { PlayerService } from '../services/player.service';
import { ProjectileService } from '../services/projectile.service';
import { AttackHandler } from '../weapons/AttackHandler';

/**
 * Messaggi ricevuti dai client
 */
interface PlayerInput {
  x: number;
  z: number;
  rotation: number;
  timestamp?: number; // Timestamp per lag compensation
}

/**
 * Snapshot di posizione player per lag compensation
 */
interface PositionSnapshot {
  timestamp: number;
  position: { x: number; y: number; z: number };
  rotation: number;
  hp: number;
}

/**
 * BattleRoom - Gestisce la partita vera e propria
 * 
 * Flow:
 * 1. Countdown di 5 secondi
 * 2. Gioco attivo - movimento, attacchi, danni
 * 3. Controllo vittoria (1 solo giocatore rimasto)
 * 4. Game over - tutti tornano alla home dopo 10 secondi
 */
export class BattleRoom extends Room<BattleState> {
  maxClients = GAME_CONFIG.MAX_PLAYERS;
  private updateInterval: NodeJS.Timeout | undefined;
  private attackHandler = new AttackHandler();
  private tickCounter = 0; // Contatore per broadcast ottimizzato
  private broadcastRate = 2; // Broadcast ogni 2 tick (30Hz)
  
  // Snapshot history per lag compensation
  private playerSnapshots = new Map<string, PositionSnapshot[]>();
  private readonly SNAPSHOT_BUFFER_MS = 1000; // 1 secondo di history
  
  // Flag per broadcast critico immediato
  private needsCriticalBroadcast = false;

  onCreate(): void {
    this.setState(new BattleState());
    console.log(`[BattleRoom] Room ${this.roomId} created`);

    // Gestisce il movimento del giocatore
    this.onMessage('playerMove', (client: Client, message: PlayerInput) => {
      this.handlePlayerMove(client, message);
    });

    // Gestisce l'attacco del giocatore
    this.onMessage('playerAttack', (client: Client, message: { timestamp?: number }) => {
      this.handlePlayerAttack(client, message);
    });

    // Gestisce l'attacco con hitbox durante l'animazione dello swing
    this.onMessage('weaponSwing', (client: Client, message: {
      tipPosition: { x: number; y: number; z: number };
      basePosition: { x: number; y: number; z: number };
      timestamp: number;
    }) => {
      this.handleWeaponSwing(client, message);
    });

    // Gestisce ping measurement per network metrics
    this.onMessage('ping', (client: Client, message: { timestamp: number }) => {
      // Risponde immediatamente con pong
      client.send('pong', { timestamp: message.timestamp });
    });

    // Avvia il countdown
    this.startCountdown();

    // Game loop - aggiornamento a 60 FPS
    this.setSimulationInterval((deltaTime: number) => {
      this.update(deltaTime);
    }, 1000 / GAME_CONFIG.TICK_RATE);
  }

  onJoin(client: Client, options: { name: string; weaponType: WeaponType }): void {
    console.log(`[BattleRoom] Player ${options.name} joined the battle`);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.name = options.name;
    player.weaponType = options.weaponType;
    player.hp = GAME_CONFIG.PLAYER_MAX_HP;
    player.maxHp = GAME_CONFIG.PLAYER_MAX_HP;
    player.isAlive = true;

    // Spawn in posizione random nel cerchio usando MapService
    const spawnPosition = MapService.getRandomSpawnPosition();
    player.position.x = spawnPosition.x;
    player.position.y = 0;
    player.position.z = spawnPosition.z;
    player.rotation = Math.random() * Math.PI * 2;

    this.state.players.set(client.sessionId, player);

    console.log(`[BattleRoom] Player ${options.name} spawned at (${spawnPosition.x}, ${spawnPosition.z})`);

    // Invia la lista completa dei giocatori al client appena entrato
    this.sendPlayerListToClient(client);
    
    // Notifica tutti gli altri client del nuovo giocatore
    this.broadcastPlayerList();
  }

  onLeave(client: Client, consented: boolean): void {
    console.log(`[BattleRoom] Client ${client.sessionId} left (consented: ${consented})`);

    const player = this.state.players.get(client.sessionId);
    if (player) {
      // Marca il giocatore come morto invece di rimuoverlo
      // Così gli spettatori possono ancora vedere il suo cadavere
      player.isAlive = false;
      player.hp = 0;
    }

    this.checkVictoryCondition();
  }

  onDispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    console.log(`[BattleRoom] Room ${this.roomId} disposed`);
  }

  /**
   * Game loop principale
   */
  private update(deltaTime: number): void {
    if (!this.state.gameActive || this.state.gameEnded) {
      return;
    }

    this.tickCounter++;

    // Salva snapshot di TUTTI i player per lag compensation
    this.savePlayerSnapshots();

    // Aggiorna proiettili usando ProjectileService
    const { toRemove, hits } = ProjectileService.updateAllProjectiles(
      this.state.projectiles,
      this.state.players,
      deltaTime / 1000
    );

    // Rimuovi proiettili
    toRemove.forEach(id => this.state.projectiles.delete(id));

    // Notifica colpi
    hits.forEach(hit => {
      this.broadcast('playerHit', {
        attackerId: this.state.projectiles.get(hit.projectileId)?.ownerId || '',
        targetId: hit.playerId,
        damage: hit.damage,
        weaponType: WeaponType.BOW
      });

      console.log(`[BattleRoom] Player ${hit.playerId} hit by arrow`);
      this.needsCriticalBroadcast = true; // Hit = broadcast immediato
    });

    // Controlla giocatori fuori mappa usando MapService
    this.state.players.forEach((player, playerId) => {
      if (!player.isAlive) return;

      if (MapService.isOutOfBounds(player.position)) {
        player.isAlive = false;
        player.hp = 0;

        this.broadcast('playerEliminated', {
          playerId: playerId,
          reason: 'out_of_bounds'
        });

        console.log(`[BattlePage] Player ${player.name} eliminated (out of bounds)`);
        this.needsCriticalBroadcast = true;
      }

      // Reset attacking flag
      if (player.isAttacking) {
        player.isAttacking = false;
      }
    });

    // ADAPTIVE BROADCAST: broadcast ogni 2 tick (30Hz) o se evento critico
    const shouldBroadcast = this.tickCounter % this.broadcastRate === 0 || this.needsCriticalBroadcast;
    
    if (shouldBroadcast) {
      this.broadcastPlayerList();
      this.needsCriticalBroadcast = false; // Reset flag
    }

    // Controlla condizione di vittoria
    this.checkVictoryCondition();
  }

  /**
   * Salva snapshot delle posizioni di tutti i player per lag compensation
   */
  private savePlayerSnapshots(): void {
    const now = Date.now();
    
    this.state.players.forEach((player, sessionId) => {
      if (!player.isAlive) return;
      
      if (!this.playerSnapshots.has(sessionId)) {
        this.playerSnapshots.set(sessionId, []);
      }
      
      const snapshots = this.playerSnapshots.get(sessionId)!;
      snapshots.push({
        timestamp: now,
        position: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        },
        rotation: player.rotation,
        hp: player.hp
      });
      
      // Rimuovi snapshot troppo vecchi
      const cutoffTime = now - this.SNAPSHOT_BUFFER_MS;
      while (snapshots.length > 0 && snapshots[0].timestamp < cutoffTime) {
        snapshots.shift();
      }
    });
  }

  /**
   * Recupera lo stato di un player a un timestamp specifico (per lag compensation).
   * Utility function pronta per implementazioni avanzate future.
   * TODO: Integrare in AttackHandler per lag compensation completa
   * @internal
   */
  /* Commentato temporaneamente - da abilitare quando necessario
  private getPlayerStateAtTime(sessionId: string, timestamp: number): PositionSnapshot | null {
    const snapshots = this.playerSnapshots.get(sessionId);
    if (!snapshots || snapshots.length === 0) {
      return null;
    }
    
    // Trova snapshot più vicino al timestamp
    let closest = snapshots[0];
    let minDiff = Math.abs(snapshots[0].timestamp - timestamp);
    
    for (const snapshot of snapshots) {
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snapshot;
      }
    }
    
    return closest;
  }
  */

  /**
   * Gestisce il movimento del giocatore
   */
  private handlePlayerMove(client: Client, input: PlayerInput): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    // Aggiorna posizione e rotazione
    player.position.x = input.x;
    player.position.z = input.z;
    player.rotation = input.rotation;

    // NON broadcast immediato, lascia che il game loop gestisca il broadcast ottimizzato
    // Questo riduce il traffico di rete da ~60 msg/sec a ~20 msg/sec
  }

  /**
   * Gestisce l'attacco del giocatore
   */
  private handlePlayerAttack(client: Client, _message: { timestamp?: number }): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    const currentTime = Date.now();
    // TODO: Usare _message.timestamp per lag compensation avanzata
    const attackResult = this.attackHandler.handleStandardAttack(
      player,
      this.state.players,
      this.state.projectiles,
      currentTime
    );

    if (attackResult.projectile && attackResult.projectileId) {
      // Arco - proiettile creato
      this.broadcast('projectileCreated', {
        projectileId: attackResult.projectileId,
        ownerId: player.sessionId,
        position: {
          x: attackResult.projectile.position.x,
          y: attackResult.projectile.position.y,
          z: attackResult.projectile.position.z
        }
      });
    } else if (attackResult.hitPlayers.length > 0) {
      // Mischia - giocatori colpiti
      attackResult.hitPlayers.forEach(targetId => {
        const target = this.state.players.get(targetId);
        if (target) {
          const weapon = WEAPONS[player.weaponType as WeaponType];
          this.broadcast('playerHit', {
            attackerId: player.sessionId,
            targetId: targetId,
            damage: weapon.damage,
            weaponType: player.weaponType
          });

          console.log(
            `[BattleRoom] Player ${target.name} hit by ${player.name} with ${player.weaponType}`
          );

          if (!target.isAlive) {
            this.broadcast('playerEliminated', {
              playerId: targetId,
              killerId: player.sessionId,
              reason: 'killed'
            });

            console.log(`[BattleRoom] Player ${target.name} eliminated by ${player.name}`);
          }
          
          // Evento critico = broadcast immediato
          this.needsCriticalBroadcast = true;
        }
      });
    }
  }

  /**
   * Gestisce l'attacco con hitbox durante l'animazione dello swing della spada.
   */
  private handleWeaponSwing(
    client: Client,
    message: {
      tipPosition: { x: number; y: number; z: number };
      basePosition: { x: number; y: number; z: number };
      timestamp: number;
      attackTimestamp?: number;
    }
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    // Verifica che il player abbia un'arma da mischia
    if (player.weaponType === WeaponType.BOW) {
      return;
    }

    const weaponType = player.weaponType as WeaponType;
    const isFirstSwing = !this.attackHandler.isSwinging(client.sessionId, weaponType);

    if (isFirstSwing) {
      // Broadcast ai client (escluso mittente) per mostrare l'animazione dello swing
      this.broadcast('weaponSwingStarted', {
        sessionId: client.sessionId,
        weaponType: player.weaponType
      }, { except: client });
    }

    // Usa l'AttackHandler per gestire l'attacco hitbox
    const attackResult = this.attackHandler.handleHitboxAttack(
      player,
      message.tipPosition,
      message.basePosition,
      this.state.players
    );

    if (attackResult.hitPlayers.length > 0) {
      attackResult.hitPlayers.forEach(targetId => {
        const target = this.state.players.get(targetId);
        if (target) {
          const weapon = WEAPONS[weaponType];
          
          // Broadcast usando il messaggio che il client ascolta
          this.broadcast('playerAttacked', {
            attackerId: player.sessionId,
            targetId: targetId,
            damage: weapon.damage
          });

          // Se il target è morto, notifica eliminazione
          if (!target.isAlive) {
            this.broadcast('playerEliminated', {
              playerId: targetId,
              killerId: player.sessionId,
              reason: 'killed'
            });
          }
          
          // Hit = broadcast critico immediato
          this.needsCriticalBroadcast = true;
        }
      });
    }
  }

  /**
   * Avvia il countdown prima dell'inizio della partita
   */
  private startCountdown(): void {
    this.state.countdown = GAME_CONFIG.COUNTDOWN_DURATION;

    this.clock.setInterval(() => {
      this.state.countdown--;

      if (this.state.countdown <= 0) {
        this.clock.clear();
        this.state.gameActive = true;
        this.broadcast('gameStarted', { message: 'La partita è iniziata!' });
        console.log('[BattleRoom] Game started!');
      }
    }, 1000);
  }

  /**
   * Controlla se c'è un vincitore
   */
  private checkVictoryCondition(): void {
    if (!this.state.gameActive || this.state.gameEnded) {
      return;
    }

    const aliveCount = PlayerService.countAlivePlayers(this.state.players);

    if (aliveCount <= 1) {
      this.state.gameEnded = true;
      this.state.gameActive = false;

      const winner = PlayerService.findWinner(this.state.players);

      if (winner) {
        this.state.winnerId = winner.sessionId;
        this.state.winnerName = winner.name;

        this.broadcast('gameEnded', {
          winnerId: winner.sessionId,
          winnerName: winner.name
        });

        console.log(`[BattleRoom] Game ended! Winner: ${winner.name}`);
      } else {
        this.broadcast('gameEnded', {
          winnerId: '',
          winnerName: 'Nessuno'
        });

        console.log('[BattleRoom] Game ended with no winner');
      }

      // Chiudi la room dopo il delay configurato
      this.clock.setTimeout(() => {
        this.disconnect();
      }, GAME_CONFIG.END_GAME_DELAY);
    }
  }

  /**
   * Invia la lista completa dei player a un singolo client (per chi si connette)
   */
  private sendPlayerListToClient(client: Client): void {
    const playersList = PlayerService.serializePlayerList(this.state.players);
    client.send('playerList', { players: playersList });
    console.log(`[BattleRoom] Sent player list to client ${client.sessionId} with ${playersList.length} players`);
  }

  /**
   * Broadcast della lista completa dei player a tutti i client connessi
   */
  private broadcastPlayerList(): void {
    const playersList = PlayerService.serializePlayerList(this.state.players);
    const clientCount = this.clients.length;
    console.log(`[BattleRoom] Broadcasting to ${clientCount} clients with ${playersList.length} players`);
    
    // Log dettagliato dei client connessi
    this.clients.forEach(client => {
      const player = this.state.players.get(client.sessionId);
      console.log(`  - Client ${client.sessionId}: ${player?.name || 'unknown'} (alive: ${player?.isAlive})`);
    });
    
    this.broadcast('playerList', { players: playersList });
    console.log(`[BattleRoom] Broadcasted player list with ${playersList.length} players`);
  }
}
