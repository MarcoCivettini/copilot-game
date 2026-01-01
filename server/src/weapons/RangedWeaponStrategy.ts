import { Player, Projectile } from '../schemas/BattleState';
import { IWeaponStrategy } from './IWeaponStrategy';
import { WEAPONS, WeaponType } from '../config/game.config';

/**
 * Strategia per armi a distanza (Arco).
 * Gestisce creazione e gestione dei proiettili.
 */
export class RangedWeaponStrategy implements IWeaponStrategy {
  private projectileCounter = 0;

  canAttack(attacker: Player, currentTime: number): boolean {
    const weapon = WEAPONS[WeaponType.BOW];
    return currentTime - attacker.lastAttackTime >= weapon.cooldown;
  }

  handleAttack(
    _attacker: Player,
    _allPlayers: Map<string, Player>,
    _currentTime: number
  ): string[] {
    // Per armi ranged, non ritorniamo hit immediati
    // I colpi vengono gestiti tramite proiettili
    return [];
  }

  /**
   * Crea un proiettile per l'arco.
   * @param shooter Il giocatore che spara
   * @param projectiles Mappa dei proiettili attivi
   * @param currentTime Timestamp corrente
   * @returns Il proiettile creato o null se il cooldown non è scaduto
   */
  createProjectile(
    shooter: Player,
    projectiles: Map<string, Projectile>,
    currentTime: number
  ): Projectile | null {
    if (!this.canAttack(shooter, currentTime)) {
      return null;
    }

    const projectileId = `projectile_${this.projectileCounter++}`;
    const weapon = WEAPONS[WeaponType.BOW];

    shooter.lastAttackTime = currentTime;
    shooter.isAttacking = true;

    const projectile = new Projectile();
    projectile.id = projectileId;
    projectile.ownerId = shooter.sessionId;

    const spawnDistance = 0.5;
    projectile.position.x = shooter.position.x + Math.sin(shooter.rotation) * spawnDistance;
    projectile.position.y = 1;
    projectile.position.z = shooter.position.z + Math.cos(shooter.rotation) * spawnDistance;

    projectile.directionX = Math.sin(shooter.rotation);
    projectile.directionZ = Math.cos(shooter.rotation);
    projectile.speed = (weapon as any).projectileSpeed ?? 1.714;
    projectile.damage = weapon.damage;
    projectile.range = weapon.range;
    projectile.distanceTraveled = 0;

    projectiles.set(projectileId, projectile);
    return projectile;
  }
}
