import { Room, Client } from 'colyseus';
import { BattleState, Player } from '../schemas/BattleState';
import { GAME_CONFIG, WeaponType, WEAPONS } from '../config/game.config';
import { MapService } from '../services/map.service';
import { PlayerService } from '../services/player.service';
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

  // NUOVO: Gestione proiettili semplificata con messaggi
  /**
   * Message-based projectile store (server-authoritative).
   * Deprecated: previous schema-based `ProjectileService` was removed
   * in favor of an explicit message flow: the server keeps `activeProjectiles`
   * and broadcasts `projectileSpawned`, `projectileUpdate`, `projectileRemoved`.
   * Keep this structure minimal and authoritative — do not attempt to
   * mirror it into the Colyseus `state` MapSchema to avoid nested-schema sync issues.
   */
  private activeProjectiles = new Map<string, {
    id: string;
    ownerId: string;
    position: { x: number; y: number; z: number };
    direction: { x: number; z: number };
    speed: number;
    damage: number;
    distanceTraveled: number;
    maxDistance: number;
  }>();
  private projectileCounter = 0;

  onCreate(): void {
    this.setState(new BattleState());
    console.info(`[BattleRoom] Room ${this.roomId} created`);

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

    console.debug(`[BattleRoom] Player ${options.name} spawned at (${spawnPosition.x}, ${spawnPosition.z})`);

    // Invia la lista completa dei giocatori al client appena entrato
    this.sendPlayerListToClient(client);
    
    // Notifica tutti gli altri client del nuovo giocatore
    this.broadcastPlayerList();
  }

  onLeave(client: Client, consented: boolean): void {
    console.info(`[BattleRoom] Client ${client.sessionId} left (consented: ${consented})`);

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
    console.info(`[BattleRoom] Room ${this.roomId} disposed`);
  }

  /**
   * Game loop principale
   */
  private update(deltaTime: number): void {
    this.tickCounter++;

    // Aggiorna proiettili SEMPRE (anche durante countdown)
    this.updateProjectiles(deltaTime / 1000); // converti ms in secondi

    if (!this.state.gameActive || this.state.gameEnded) {
      return;
    }

    // Debug: log ogni 60 tick per verificare deltaTime e proiettili attivi
    try {
      if (this.tickCounter % 60 === 0) {
        // occasional debug information
        console.debug(`[BattleRoom] tick=${this.tickCounter} deltaTime=${deltaTime.toFixed(4)} activeProjectiles=${this.activeProjectiles.size}`);
      }
    } catch (e) {
      console.debug('[BattleRoom] update tick debug failed', e);
    }

    // Salva snapshot di TUTTI i player per lag compensation
    this.savePlayerSnapshots();

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
        console.info(`[BattleRoom] Player ${player.name} eliminated (out of bounds)`);
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
   * Aggiorna tutti i proiettili attivi
   */
  private updateProjectiles(deltaTime: number): void {
    const projectilesToRemove: string[] = [];

    this.activeProjectiles.forEach((projectile, id) => {
      // Calcola movimento
      const distance = projectile.speed * deltaTime;
      projectile.position.x += projectile.direction.x * distance;
      projectile.position.z += projectile.direction.z * distance;
      projectile.distanceTraveled += distance;

      // Controlla collisioni con giocatori
      let hitSomeone = false;
      this.state.players.forEach((player) => {
        if (player.sessionId === projectile.ownerId || !player.isAlive) return;
        
        const dx = projectile.position.x - player.position.x;
        const dz = projectile.position.z - player.position.z;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);
        
        if (distToPlayer < 0.5) { // Raggio collisione
          // Colpito!
          player.hp = Math.max(0, player.hp - projectile.damage);
          if (player.hp <= 0) {
            player.isAlive = false;
          }
          
          this.broadcast('playerHit', {
            attackerId: projectile.ownerId,
            targetId: player.sessionId,
            damage: projectile.damage,
            weaponType: WeaponType.BOW
          });
          
          hitSomeone = true;
          projectilesToRemove.push(id);
          console.log(`[BattleRoom] Arrow ${id} hit ${player.name}`);
        }
      });

      if (hitSomeone) return;

      // Controlla se ha superato la distanza massima
      if (projectile.distanceTraveled >= projectile.maxDistance) {
        projectilesToRemove.push(id);
        console.debug(`[BattleRoom] Arrow ${id} reached max distance`);
        return;
      }

      // Controlla se è fuori dalla mappa
      if (MapService.isOutOfBounds({ x: projectile.position.x, z: projectile.position.z })) {
        projectilesToRemove.push(id);
        console.debug(`[BattleRoom] Arrow ${id} out of bounds`);
        return;
      }

      // Broadcast posizione aggiornata
      // broadcast projectile position to clients (high-frequency)
      this.broadcast('projectileUpdate', {
        id: projectile.id,
        position: projectile.position
      });
    });

    // Rimuovi proiettili
    projectilesToRemove.forEach(id => {
      this.activeProjectiles.delete(id);
      this.broadcast('projectileRemoved', { id });
      console.debug(`[BattleRoom] Arrow ${id} removed`);
    });
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
    private handlePlayerAttack(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive || !this.state.gameActive) {
      return;
    }

    const currentTime = Date.now();
    
    // Se è arco, crea proiettile
    if (player.weaponType === WeaponType.BOW) {
      const weapon = WEAPONS[WeaponType.BOW];
      
      // Verifica cooldown
      if (currentTime - player.lastAttackTime < weapon.cooldown) {
        return;
      }
      
      player.lastAttackTime = currentTime;
      player.isAttacking = true;
      
      // Crea proiettile
      const projectileId = `arrow_${this.projectileCounter++}`;
      const spawnDistance = 0.5;
      
      const projectile = {
        id: projectileId,
        ownerId: player.sessionId,
        position: {
          x: player.position.x + Math.sin(player.rotation) * spawnDistance,
          y: 1,
          z: player.position.z + Math.cos(player.rotation) * spawnDistance
        },
        direction: {
          x: Math.sin(player.rotation),
          z: Math.cos(player.rotation)
        },
        speed: weapon.projectileSpeed || 1.714,
        damage: weapon.damage,
        distanceTraveled: 0,
        maxDistance: weapon.range
      };
      
      this.activeProjectiles.set(projectileId, projectile);
      
      // Notifica tutti i client della creazione del proiettile
      this.broadcast('projectileSpawned', {
        id: projectileId,
        position: projectile.position,
        direction: projectile.direction
      });
      console.debug(`[BattleRoom] Arrow ${projectileId} spawned at (${projectile.position.x.toFixed(2)}, ${projectile.position.z.toFixed(2)})`);
      return;
    }

    // Attacco melee - usa la logica esistente
    const attackResult = this.attackHandler.handleStandardAttack(
      player,
      this.state.players,
      this.state.projectiles,
      currentTime
    );

    if (attackResult.projectile && attackResult.projectileId) {
      // Arco - proiettile creato (usiamo flow message-based)
      const proj = attackResult.projectile;

      const projectileId = attackResult.projectileId;
      // Inserisci nel record server-authoritative e broadcast
      this.activeProjectiles.set(projectileId, {
        id: projectileId,
        ownerId: player.sessionId,
        position: {
          x: proj.position.x,
          y: proj.position.y,
          z: proj.position.z
        },
        direction: {
          x: proj.directionX || Math.sin(player.rotation),
          z: proj.directionZ || Math.cos(player.rotation)
        },
        speed: proj.speed || (WEAPONS[WeaponType.BOW].projectileSpeed || 1.714),
        damage: proj.damage || WEAPONS[WeaponType.BOW].damage,
        distanceTraveled: proj.distanceTraveled || 0,
        maxDistance: proj.range || WEAPONS[WeaponType.BOW].range
      });

      console.debug(`[BattleRoom] Projectile ${projectileId} created (message-based)`);

      this.broadcast('projectileSpawned', {
        id: projectileId,
        position: {
          x: proj.position.x,
          y: proj.position.y,
          z: proj.position.z
        },
        direction: {
          x: proj.directionX || Math.sin(player.rotation),
          z: proj.directionZ || Math.cos(player.rotation)
        }
      });

      // Forza broadcast immediato per sincronizzare stato critico
      this.needsCriticalBroadcast = true;
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

          console.info(`[BattleRoom] Player ${target.name} hit by ${player.name} with ${player.weaponType}`);

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
