import { Player, Projectile } from '../schemas/BattleState';
import { IWeaponStrategy } from './IWeaponStrategy';
import { WEAPONS, WeaponType } from '../config/game.config';
import { ProjectileService } from '../services/projectile.service';

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
    const projectile = ProjectileService.createProjectile(shooter, projectileId, currentTime);

    if (projectile) {
      projectiles.set(projectileId, projectile);
    }

    return projectile;
  }
}
