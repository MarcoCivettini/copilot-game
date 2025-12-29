import { Player, Projectile } from '../schemas/BattleState';
import { WEAPONS, WeaponType } from '../config/game.config';
import { MapService } from './map.service';
import { CombatService } from './combat.service';

/**
 * Service per la gestione dei proiettili.
 * Gestisce creazione, aggiornamento e collisioni dei proiettili.
 */
export class ProjectileService {
  /**
   * Crea un proiettile per l'arco.
   * Ritorna null se il cooldown non è scaduto.
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
   * Aggiorna la posizione di un proiettile.
   * Ritorna true se il proiettile deve essere rimosso.
   */
  static updateProjectile(projectile: Projectile, deltaTime: number): boolean {
    const distance = projectile.speed * deltaTime;

    projectile.position.x += projectile.directionX * distance;
    projectile.position.z += projectile.directionZ * distance;
    projectile.distanceTraveled += distance;

    // Rimuovi se ha superato il range
    if (projectile.distanceTraveled >= projectile.range) {
      return true;
    }

    // Rimuovi se è fuori dalla mappa
    if (MapService.isOutOfBounds(projectile.position)) {
      return true;
    }

    return false;
  }

  /**
   * Controlla collisioni tra un proiettile e i giocatori.
   * Applica danno e ritorna il sessionId del giocatore colpito.
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
        CombatService.applyDamage(player, projectile.damage);
        return playerId;
      }
    }

    return null;
  }

  /**
   * Aggiorna tutti i proiettili nella mappa.
   * Ritorna gli ID dei proiettili da rimuovere.
   */
  static updateAllProjectiles(
    projectiles: Map<string, Projectile>,
    players: Map<string, Player>,
    deltaTime: number
  ): { toRemove: string[]; hits: Array<{ projectileId: string; playerId: string; damage: number }> } {
    const toRemove: string[] = [];
    const hits: Array<{ projectileId: string; playerId: string; damage: number }> = [];

    projectiles.forEach((projectile, projectileId) => {
      // Aggiorna posizione
      const shouldRemove = this.updateProjectile(projectile, deltaTime);

      if (shouldRemove) {
        toRemove.push(projectileId);
        return;
      }

      // Controlla collisioni
      const hitPlayerId = this.checkProjectileCollision(projectile, players);

      if (hitPlayerId) {
        toRemove.push(projectileId);
        hits.push({
          projectileId,
          playerId: hitPlayerId,
          damage: projectile.damage
        });
      }
    });

    return { toRemove, hits };
  }

  /**
   * Calcola la distanza tra due posizioni 3D.
   */
  private static getDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number }
  ): number {
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
