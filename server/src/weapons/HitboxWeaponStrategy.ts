import { Player } from '../schemas/BattleState';
import { IWeaponStrategy } from './IWeaponStrategy';
import { WEAPONS, WeaponType } from '../config/game.config';
import { CombatService } from '../services/combat.service';

/**
 * Strategia per armi con hitbox durante l'animazione (Spada con swing).
 * Gestisce attacchi verificando intersezione tra segmento arma e hitbox target.
 */
export class HitboxWeaponStrategy implements IWeaponStrategy {
  private activeSwings = new Set<string>();
  private swingHitPlayers = new Map<string, Set<string>>();
  private readonly SWING_CLEANUP_DELAY_MS = 500;

  constructor(private weaponType: WeaponType) {
    if (weaponType === WeaponType.BOW) {
      throw new Error('HitboxWeaponStrategy cannot be used with BOW');
    }
  }

  canAttack(attacker: Player, currentTime: number): boolean {
    const weapon = WEAPONS[this.weaponType];
    return currentTime - attacker.lastAttackTime >= weapon.cooldown;
  }

  handleAttack(
    _attacker: Player,
    _allPlayers: Map<string, Player>,
    _currentTime: number
  ): string[] {
    // Questo metodo non è utilizzato per hitbox weapons
    // La logica è gestita in handleHitboxAttack
    return [];
  }

  /**
   * Gestisce l'attacco con hitbox durante l'animazione dello swing.
   * @param attacker Il giocatore che attacca
   * @param weaponTip Posizione della punta dell'arma
   * @param weaponBase Posizione della base dell'arma
   * @param allPlayers Mappa di tutti i giocatori
   * @returns Array di sessionId dei giocatori colpiti (nuovi, non già colpiti in questo swing)
   */
  handleHitboxAttack(
    attacker: Player,
    weaponTip: { x: number; y: number; z: number },
    weaponBase: { x: number; y: number; z: number },
    allPlayers: Map<string, Player>
  ): string[] {
    const isFirstSwingMessage = !this.activeSwings.has(attacker.sessionId);

    if (isFirstSwingMessage) {
      const currentTime = Date.now();
      if (!this.canAttack(attacker, currentTime)) {
        return [];
      }

      attacker.lastAttackTime = currentTime;
      attacker.isAttacking = true;
      this.activeSwings.add(attacker.sessionId);
      this.swingHitPlayers.set(attacker.sessionId, new Set<string>());

      setTimeout(() => {
        this.activeSwings.delete(attacker.sessionId);
        this.swingHitPlayers.delete(attacker.sessionId);
      }, this.SWING_CLEANUP_DELAY_MS);
    }

    const hitPlayers = CombatService.handleWeaponHitboxAttack(
      attacker,
      weaponTip,
      weaponBase,
      allPlayers,
      false // Non controllare cooldown, già gestito sopra
    );

    const alreadyHitThisSwing = this.swingHitPlayers.get(attacker.sessionId);
    if (!alreadyHitThisSwing) {
      return [];
    }

    const newHits: string[] = [];
    hitPlayers.forEach(targetId => {
      if (!alreadyHitThisSwing.has(targetId)) {
        alreadyHitThisSwing.add(targetId);
        newHits.push(targetId);
      }
    });

    return newHits;
  }

  /**
   * Verifica se il giocatore sta eseguendo uno swing.
   */
  isSwinging(sessionId: string): boolean {
    return this.activeSwings.has(sessionId);
  }
}
