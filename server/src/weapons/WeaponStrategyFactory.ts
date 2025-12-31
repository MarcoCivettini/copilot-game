import { WeaponType } from '../config/game.config';
import { IWeaponStrategy } from './IWeaponStrategy';
import { MeleeWeaponStrategy } from './MeleeWeaponStrategy';
import { HitboxWeaponStrategy } from './HitboxWeaponStrategy';
import { RangedWeaponStrategy } from './RangedWeaponStrategy';

/**
 * Factory per creare strategie di armi.
 * Applica il pattern Factory per incapsulare la creazione delle strategie.
 */
export class WeaponStrategyFactory {
  private static meleeStrategies = new Map<WeaponType, MeleeWeaponStrategy>();
  private static hitboxStrategies = new Map<WeaponType, HitboxWeaponStrategy>();
  private static rangedStrategy: RangedWeaponStrategy | null = null;

  /**
   * Crea una strategia melee per il tipo di arma specificato.
   * Usa un pattern Singleton per riutilizzare le strategie.
   */
  static createMeleeStrategy(weaponType: WeaponType): MeleeWeaponStrategy {
    if (!this.meleeStrategies.has(weaponType)) {
      this.meleeStrategies.set(weaponType, new MeleeWeaponStrategy(weaponType));
    }
    return this.meleeStrategies.get(weaponType)!;
  }

  /**
   * Crea una strategia hitbox per il tipo di arma specificato.
   * Non usa Singleton perché mantiene stato per gli swing attivi.
   */
  static createHitboxStrategy(weaponType: WeaponType): HitboxWeaponStrategy {
    if (!this.hitboxStrategies.has(weaponType)) {
      this.hitboxStrategies.set(weaponType, new HitboxWeaponStrategy(weaponType));
    }
    return this.hitboxStrategies.get(weaponType)!;
  }

  /**
   * Crea una strategia ranged.
   * Usa Singleton perché c'è solo un tipo di arma ranged.
   */
  static createRangedStrategy(): RangedWeaponStrategy {
    if (!this.rangedStrategy) {
      this.rangedStrategy = new RangedWeaponStrategy();
    }
    return this.rangedStrategy;
  }

  /**
   * Crea la strategia appropriata per il tipo di arma.
   */
  static createStrategy(weaponType: WeaponType): IWeaponStrategy {
    if (weaponType === WeaponType.BOW) {
      return this.createRangedStrategy();
    }
    return this.createMeleeStrategy(weaponType);
  }
}
