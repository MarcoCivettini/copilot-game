import { Room, Client } from 'colyseus';
import { BattleState, Player, Position, Projectile } from '../schemas/BattleState';
import { GAME_CONFIG, WeaponType } from '../config/game.config';
import { CombatService } from '../services/combat.service';

/**
 * Messaggi ricevuti dai client
 */
interface PlayerInput {
  x: number;
  z: number;
  rotation: number;
}

interface AttackInput {
  timestamp: number;
}

/**
 * Dati player inviati ai client (plain JS object)
 */
interface PlayerData {
  sessionId: string;
  name: string;
  weaponType: WeaponType;
  position: { x: number; y: number; z: number };
  rotation: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
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
  private projectileCounter = 0;

  onCreate(): void {
    this.setState(new BattleState());
    console.log(`[BattleRoom] Room ${this.roomId} created`);

    // Gestisce il movimento del giocatore
    this.onMessage('playerMove', (client: Client, message: PlayerInput) => {
      this.handlePlayerMove(client, message);
    });

    // Gestisce l'attacco del giocatore
    this.onMessage('playerAttack', (client: Client, message: AttackInput) => {
      this.handlePlayerAttack(client, message.timestamp);
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

    // Spawn in posizione random nel cerchio
    const spawnPosition = this.getRandomSpawnPosition();
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

    // Aggiorna proiettili
    const projectilesToRemove: string[] = [];

    this.state.projectiles.forEach((projectile, projectileId) => {
      // Muovi il proiettile
      const shouldRemove = CombatService.updateProjectile(projectile, deltaTime / 1000);

      if (shouldRemove) {
        projectilesToRemove.push(projectileId);
        return;
      }

      // Controlla collisioni con giocatori
      const hitPlayerId = CombatService.checkProjectileCollision(
        projectile,
        this.state.players
      );

      if (hitPlayerId) {
        projectilesToRemove.push(projectileId);

        // Notifica il colpo
        this.broadcast('playerHit', {
          attackerId: projectile.ownerId,
          targetId: hitPlayerId,
          damage: projectile.damage,
          weaponType: WeaponType.BOW
        });

        console.log(`[BattleRoom] Player ${hitPlayerId} hit by arrow from ${projectile.ownerId}`);
      }
    });

    // Rimuovi proiettili
    projectilesToRemove.forEach(id => {
      this.state.projectiles.delete(id);
    });

    // Controlla giocatori fuori mappa
    this.state.players.forEach((player, playerId) => {
      if (!player.isAlive) return;

      if (CombatService.isPlayerOutOfBounds(player.position)) {
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
  private handlePlayerAttack(client: Client, timestamp: number): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    const currentTime = Date.now();

    if (player.weaponType === WeaponType.BOW) {
      // Crea proiettile
      const projectileId = `projectile_${this.projectileCounter++}`;
      const projectile = CombatService.createProjectile(player, projectileId, currentTime);

      if (projectile) {
        this.state.projectiles.set(projectileId, projectile);

        this.broadcast('projectileCreated', {
          projectileId,
          ownerId: player.sessionId,
          position: {
            x: projectile.position.x,
            y: projectile.position.y,
            z: projectile.position.z
          }
        });
      }
    } else {
      // Attacco in mischia
      const hitPlayers = CombatService.handleMeleeAttack(
        player,
        this.state.players,
        currentTime
      );

      if (hitPlayers.length > 0) {
        hitPlayers.forEach(targetId => {
          const target = this.state.players.get(targetId);
          if (target) {
            this.broadcast('playerHit', {
              attackerId: player.sessionId,
              targetId: targetId,
              damage: player.weaponType === WeaponType.SWORD ? 2 : 4,
              weaponType: player.weaponType
            });

            console.log(
              `[BattleRoom] Player ${target.name} hit by ${player.name} with ${player.weaponType}`
            );

            // Se il target è morto, notifica eliminazione
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
  }

  /**
   * Avvia il countdown prima dell'inizio della partita
   */
  private startCountdown(): void {
    this.state.countdown = GAME_CONFIG.COUNTDOWN_DURATION;

    const countdownInterval = this.clock.setInterval(() => {
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

    const aliveCount = CombatService.countAlivePlayers(this.state.players);

    if (aliveCount <= 1) {
      this.state.gameEnded = true;
      this.state.gameActive = false;

      const winner = CombatService.findWinner(this.state.players);

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
   * Genera una posizione random nel cerchio della mappa
   */
  /**
   * Invia la lista completa dei player a un singolo client (per chi si connette)
   */
  private sendPlayerListToClient(client: Client): void {
    const playersList: PlayerData[] = [];
    this.state.players.forEach((player, sessionId) => {
      playersList.push({
        sessionId: sessionId,
        name: player.name,
        weaponType: player.weaponType as WeaponType,
        position: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        },
        rotation: player.rotation,
        hp: player.hp,
        maxHp: player.maxHp,
        isAlive: player.isAlive
      });
    });

    client.send('playerList', { players: playersList });
    console.log(`[BattleRoom] Sent player list to client ${client.sessionId} with ${playersList.length} players`);
  }

  /**
   * Broadcast della lista completa dei player a tutti i client connessi
   */
  private broadcastPlayerList(): void {
    const playersList: PlayerData[] = [];
    this.state.players.forEach((player, sessionId) => {
      playersList.push({
        sessionId: sessionId,
        name: player.name,
        weaponType: player.weaponType as WeaponType,
        position: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        },
        rotation: player.rotation,
        hp: player.hp,
        maxHp: player.maxHp,
        isAlive: player.isAlive
      });
    });

    this.broadcast('playerList', { players: playersList });
    console.log(`[BattleRoom] Broadcasted player list with ${playersList.length} players`);
  }

  private getRandomSpawnPosition(): { x: number; z: number } {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * (GAME_CONFIG.MAP_RADIUS - 5); // -5 per non spawnarli troppo al bordo

    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  }
}
