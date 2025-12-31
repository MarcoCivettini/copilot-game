import { Player, Projectile } from '../schemas/BattleState';
import { WeaponType, WEAPONS } from '../config/game.config';
import { WeaponStrategyFactory } from './WeaponStrategyFactory';
import { HitboxWeaponStrategy } from './HitboxWeaponStrategy';
import { CombatService } from '../services/combat.service';

/**
 * Risultato di un attacco.
 */
export interface AttackResult {
  hitPlayers: string[];
  projectile?: Projectile;
  projectileId?: string;
}

/**
 * Handler per gestire gli attacchi dei giocatori.
 * Separa la logica di attacco dal BattleRoom seguendo il principio Single Responsibility.
 */
export class AttackHandler {
  private hitboxStrategies = new Map<WeaponType, HitboxWeaponStrategy>();

  constructor() {
    // Inizializza le strategie hitbox per armi melee
    this.hitboxStrategies.set(
      WeaponType.SWORD,
      WeaponStrategyFactory.createHitboxStrategy(WeaponType.SWORD)
    );
    this.hitboxStrategies.set(
      WeaponType.SPEAR,
      WeaponStrategyFactory.createHitboxStrategy(WeaponType.SPEAR)
    );
  }

  /**
   * Gestisce un attacco standard (non hitbox).
   */
  handleStandardAttack(
    attacker: Player,
    allPlayers: Map<string, Player>,
    projectiles: Map<string, Projectile>,
    currentTime: number
  ): AttackResult {
    if (attacker.weaponType === WeaponType.BOW) {
      const rangedStrategy = WeaponStrategyFactory.createRangedStrategy();
      const projectile = rangedStrategy.createProjectile(attacker, projectiles, currentTime);
      
      if (projectile) {
        return {
          hitPlayers: [],
          projectile,
          projectileId: projectile.id
        };
      }
      return { hitPlayers: [] };
    }

    // Attacco melee standard
    const strategy = WeaponStrategyFactory.createStrategy(attacker.weaponType as WeaponType);
    const hitPlayers = strategy.handleAttack(attacker, allPlayers, currentTime);

    return { hitPlayers };
  }

  /**
   * Gestisce un attacco con hitbox durante l'animazione.
   */
  handleHitboxAttack(
    attacker: Player,
    weaponTip: { x: number; y: number; z: number },
    weaponBase: { x: number; y: number; z: number },
    allPlayers: Map<string, Player>
  ): AttackResult {
    const weaponType = attacker.weaponType as WeaponType;
    
    if (weaponType === WeaponType.BOW) {
      return { hitPlayers: [] };
    }

    const hitboxStrategy = this.hitboxStrategies.get(weaponType);
    if (!hitboxStrategy) {
      return { hitPlayers: [] };
    }

    const newHits = hitboxStrategy.handleHitboxAttack(
      attacker,
      weaponTip,
      weaponBase,
      allPlayers
    );

    // Applica danno ai giocatori colpiti
    newHits.forEach(targetId => {
      const target = allPlayers.get(targetId);
      if (target) {
        const weapon = WEAPONS[weaponType];
        CombatService.applyDamage(target, weapon.damage);
      }
    });

    return { hitPlayers: newHits };
  }

  /**
   * Verifica se un giocatore sta eseguendo uno swing.
   */
  isSwinging(sessionId: string, weaponType: WeaponType): boolean {
    const hitboxStrategy = this.hitboxStrategies.get(weaponType);
    return hitboxStrategy?.isSwinging(sessionId) || false;
  }
}
