import { Room, Client } from 'colyseus';
import { BattleState, Player } from '../schemas/BattleState';
import { GAME_CONFIG, WeaponType } from '../config/game.config';
import { CombatService } from '../services/combat.service';
import { MapService } from '../services/map.service';
import { PlayerService } from '../services/player.service';
import { ProjectileService } from '../services/projectile.service';

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
  private projectileCounter = 0;
  private activeSwings = new Set<string>(); // Traccia player che stanno swingando
  private swingHitPlayers = new Map<string, Set<string>>(); // Map<attackerSessionId, Set<victimSessionId>>

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
      console.log('[BattleRoom] Received weaponSwing from', client.sessionId, message);
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

    if (player.weaponType === WeaponType.BOW) {
      // Crea proiettile usando ProjectileService
      const projectileId = `projectile_${this.projectileCounter++}`;
      const projectile = ProjectileService.createProjectile(player, projectileId, currentTime);

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
      console.log('[BattleRoom] weaponSwing rejected - player invalid or game not active');
      return;
    }

    // Verifica che il player abbia un'arma da mischia
    if (player.weaponType === WeaponType.BOW) {
      console.log('[BattleRoom] weaponSwing rejected - player has BOW');
      return;
    }

    console.log('[BattleRoom] Processing weaponSwing for player', player.name);
    console.log('[BattleRoom] Weapon positions - Tip:', message.tipPosition, 'Base:', message.basePosition);

    // Controlla se è il primo messaggio dello swing (per il cooldown)
    const isFirstSwingMessage = !this.activeSwings.has(client.sessionId);
    console.log('[BattleRoom] isFirstSwingMessage:', isFirstSwingMessage, '| activeSwings has player:', this.activeSwings.has(client.sessionId));
    
    if (isFirstSwingMessage) {
      this.activeSwings.add(client.sessionId);
      // Inizializza il Set dei player colpiti per questo swing
      this.swingHitPlayers.set(client.sessionId, new Set<string>());
      console.log('[BattleRoom] Initialized swingHitPlayers for', client.sessionId);
      
      // Dopo 500ms (durata swing + margine), rimuovi dal set e pulisci tracking colpi
      setTimeout(() => {
        console.log('[BattleRoom] Clearing swing data for', client.sessionId);
        this.activeSwings.delete(client.sessionId);
        this.swingHitPlayers.delete(client.sessionId);
      }, 500);
    }

    // Usa il nuovo metodo con hitbox dell'arma
    // Controlla cooldown solo al primo messaggio
    const hitPlayers = CombatService.handleWeaponHitboxAttack(
      player,
      message.tipPosition,
      message.basePosition,
      this.state.players,
      isFirstSwingMessage // Controlla cooldown solo al primo frame
    );

    console.log('[BattleRoom] Hit players:', hitPlayers);

    if (hitPlayers.length > 0) {
      // Ottieni il Set dei player già colpiti (per reference, non copia)
      const alreadyHitThisSwing = this.swingHitPlayers.get(client.sessionId);
      console.log('[BattleRoom] swingHitPlayers.get result:', alreadyHitThisSwing, '| Map size:', this.swingHitPlayers.size);
      
      if (!alreadyHitThisSwing) {
        console.log('[BattleRoom] ERROR: swingHitPlayers Set not found for', client.sessionId);
        console.log('[BattleRoom] Available keys in swingHitPlayers:', Array.from(this.swingHitPlayers.keys()));
        return;
      }
      
      console.log('[BattleRoom] Already hit players in this swing:', Array.from(alreadyHitThisSwing));
      
      hitPlayers.forEach(targetId => {
        // Salta se già colpito in questo swing
        if (alreadyHitThisSwing.has(targetId)) {
          console.log(`[BattleRoom] Player ${targetId} already hit in this swing - skipping`);
          return;
        }
        
        // Aggiungi alla lista dei colpiti (modifica il Set nella Map)
        alreadyHitThisSwing.add(targetId);
        console.log(`[BattleRoom] Added ${targetId} to hit list. Total hits this swing:`, alreadyHitThisSwing.size);
        
        const target = this.state.players.get(targetId);
        if (target) {
          // Applica il danno
          const damage = player.weaponType === WeaponType.SWORD ? 2 : 4;
          CombatService.applyDamage(target, damage);
          
          this.broadcast('playerHit', {
            attackerId: player.sessionId,
            targetId: targetId,
            damage: damage,
            weaponType: player.weaponType
          });

          console.log(
            `[BattleRoom] Player ${target.name} hit by ${player.name}'s weapon swing - HP: ${target.hp}`
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
