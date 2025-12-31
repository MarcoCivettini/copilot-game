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

  onCreate(): void {
    this.setState(new BattleState());
    console.log(`[BattleRoom] Room ${this.roomId} created`);

    // Gestisce il movimento del giocatore
    this.onMessage('playerMove', (client: Client, message: PlayerInput) => {
      this.handlePlayerMove(client, message);
    });

    // Gestisce l'attacco del giocatore
    this.onMessage('playerAttack', (client: Client) => {
      this.handlePlayerAttack(client);
    });

    // Gestisce l'attacco con hitbox durante l'animazione dello swing
    this.onMessage('weaponSwing', (client: Client, message: {
      tipPosition: { x: number; y: number; z: number };
      basePosition: { x: number; y: number; z: number };
      timestamp: number;
    }) => {
      this.handleWeaponSwing(client, message);
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

        console.log(`[BattleRoom] Player ${player.name} eliminated (out of bounds)`);
      }

      // Reset attacking flag
      if (player.isAttacking) {
        player.isAttacking = false;
      }
    });

    // Controlla condizione di vittoria
    this.checkVictoryCondition();
  }

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

    // Broadcast aggiornamento posizione a tutti i client
    this.broadcastPlayerList();
  }

  /**
   * Gestisce l'attacco del giocatore
   */
  private handlePlayerAttack(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    const currentTime = Date.now();
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

          // Broadcast immediato della lista player aggiornata per sincronizzare l'HP
          this.broadcastPlayerList();

          // Se il target è morto, notifica eliminazione
          if (!target.isAlive) {
            this.broadcast('playerEliminated', {
              playerId: targetId,
              killerId: player.sessionId,
              reason: 'killed'
            });
          }
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
    this.broadcast('playerList', { players: playersList });
    console.log(`[BattleRoom] Broadcasted player list with ${playersList.length} players`);
  }
}
