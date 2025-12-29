import { Player, Projectile, Position } from '../schemas/BattleState';
import { WEAPONS, WeaponType, GAME_CONFIG } from '../config/game.config';

/**
 * Service per la gestione del combattimento
 * Gestisce attacchi, danni, proiettili e collisioni
 */
export class CombatService {
  /**
   * Calcola la distanza tra due posizioni
   */
  private static getDistance(pos1: Position, pos2: Position): number {
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Verifica se un giocatore è fuori dalla mappa circolare
   */
  static isPlayerOutOfBounds(position: Position): boolean {
    const distance = Math.sqrt(position.x ** 2 + position.z ** 2);
    return distance > GAME_CONFIG.MAP_RADIUS;
  }

  /**
   * Gestisce un attacco in mischia (Spada o Lancia)
   * Ritorna l'array di sessionId dei giocatori colpiti
   */
  static handleMeleeAttack(
    attacker: Player,
    allPlayers: Map<string, Player>,
    currentTime: number
  ): string[] {
    const weapon = WEAPONS[attacker.weaponType as WeaponType];
    if (!weapon) return [];

    // Verifica cooldown
    if (currentTime - attacker.lastAttackTime < weapon.cooldown) {
      return [];
    }

    attacker.lastAttackTime = currentTime;
    attacker.isAttacking = true;

    const hitPlayers: string[] = [];

    // Calcola direzione attacco (basata sulla rotazione del player)
    const attackDirection = {
      x: Math.sin(attacker.rotation),
      z: Math.cos(attacker.rotation)
    };

    // Controlla tutti i giocatori nemici
    allPlayers.forEach((target, targetId) => {
      if (targetId === attacker.sessionId || !target.isAlive) return;

      const distance = this.getDistance(attacker.position, target.position);

      if (distance <= weapon.range) {
        // Verifica che il target sia nella direzione dell'attacco
        const toTarget = {
          x: target.position.x - attacker.position.x,
          z: target.position.z - attacker.position.z
        };

        const dotProduct =
          attackDirection.x * toTarget.x + attackDirection.z * toTarget.z;

        // Se il prodotto scalare è positivo, il target è davanti
        if (dotProduct > 0) {
          this.applyDamage(target, weapon.damage);
          hitPlayers.push(targetId);
        }
      }
    });

    // Reset attacking flag dopo un breve delay (gestito nel room update)
    return hitPlayers;
  }

  /**
   * Crea un proiettile per l'arco
   */
  static createProjectile(
    shooter: Player,
    projectileId: string,
    currentTime: number
  ): Projectile | null {
    const weapon = WEAPONS[WeaponType.BOW];

    // Verifica cooldown
    if (currentTime - shooter.lastAttackTime < weapon.cooldown) {
      return null;
    }

    shooter.lastAttackTime = currentTime;
    shooter.isAttacking = true;

    const projectile = new Projectile();
    projectile.id = projectileId;
    projectile.ownerId = shooter.sessionId;

    // Posizione iniziale davanti al giocatore
    projectile.position.x = shooter.position.x + Math.sin(shooter.rotation) * 0.5;
    projectile.position.y = 1; // Altezza freccia
    projectile.position.z = shooter.position.z + Math.cos(shooter.rotation) * 0.5;

    // Direzione basata sulla rotazione del giocatore
    projectile.directionX = Math.sin(shooter.rotation);
    projectile.directionZ = Math.cos(shooter.rotation);

    projectile.damage = weapon.damage;
    projectile.range = weapon.range;
    projectile.distanceTraveled = 0;

    return projectile;
  }

  /**
   * Aggiorna la posizione di un proiettile
   * Ritorna true se il proiettile deve essere rimosso
   */
  static updateProjectile(projectile: Projectile, deltaTime: number): boolean {
    const distance = projectile.speed * deltaTime;

    projectile.position.x += projectile.directionX * distance;
    projectile.position.z += projectile.directionZ * distance;
    projectile.distanceTraveled += distance;

    // Rimuovi se ha superato il range o è fuori dalla mappa
    if (projectile.distanceTraveled >= projectile.range) {
      return true;
    }

    const distanceFromCenter = Math.sqrt(
      projectile.position.x ** 2 + projectile.position.z ** 2
    );
    if (distanceFromCenter > GAME_CONFIG.MAP_RADIUS) {
      return true;
    }

    return false;
  }

  /**
   * Controlla collisioni tra un proiettile e i giocatori
   * Ritorna il sessionId del giocatore colpito, null altrimenti
   */
  static checkProjectileCollision(
    projectile: Projectile,
    allPlayers: Map<string, Player>
  ): string | null {
    const hitRadius = 0.5; // Raggio di collisione del proiettile

    for (const [playerId, player] of allPlayers) {
      if (playerId === projectile.ownerId || !player.isAlive) continue;

      const distance = this.getDistance(projectile.position, player.position);

      if (distance <= hitRadius) {
        this.applyDamage(player, projectile.damage);
        return playerId;
      }
    }

    return null;
  }

  /**
   * Applica danno a un giocatore
   */
  static applyDamage(player: Player, damage: number): void {
    player.hp = Math.max(0, player.hp - damage);

    if (player.hp <= 0) {
      player.isAlive = false;
      player.hp = 0;
    }
  }

  /**
   * Conta i giocatori vivi
   */
  static countAlivePlayers(players: Map<string, Player>): number {
    let count = 0;
    players.forEach(player => {
      if (player.isAlive) count++;
    });
    return count;
  }

  /**
   * Trova il vincitore (l'ultimo giocatore vivo)
   */
  static findWinner(players: Map<string, Player>): Player | null {
    for (const player of players.values()) {
      if (player.isAlive) {
        return player;
      }
    }
    return null;
  }
}
