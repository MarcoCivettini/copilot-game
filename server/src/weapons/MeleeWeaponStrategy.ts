import { Player } from '../schemas/BattleState';
import { IWeaponStrategy } from './IWeaponStrategy';
import { WEAPONS, WeaponType } from '../config/game.config';
import { CombatService } from '../services/combat.service';

/**
 * Strategia per armi da mischia (Spada e Lancia).
 * Gestisce attacchi corpo a corpo con range e danno variabili.
 */
export class MeleeWeaponStrategy implements IWeaponStrategy {
  constructor(private weaponType: WeaponType) {
    if (weaponType === WeaponType.BOW) {
      throw new Error('MeleeWeaponStrategy cannot be used with BOW');
    }
  }

  canAttack(attacker: Player, currentTime: number): boolean {
    const weapon = WEAPONS[this.weaponType];
    return currentTime - attacker.lastAttackTime >= weapon.cooldown;
  }

  handleAttack(
    attacker: Player,
    allPlayers: Map<string, Player>,
    currentTime: number
  ): string[] {
    if (!this.canAttack(attacker, currentTime)) {
      return [];
    }

    const weapon = WEAPONS[this.weaponType];
    attacker.lastAttackTime = currentTime;
    attacker.isAttacking = true;

    const hitPlayers: string[] = [];
    const attackDirection = {
      x: Math.sin(attacker.rotation),
      z: Math.cos(attacker.rotation)
    };

    allPlayers.forEach((target, targetId) => {
      if (targetId === attacker.sessionId || !target.isAlive) return;

      const distance = this.getDistance(attacker, target);

      if (distance <= weapon.range) {
        const toTarget = {
          x: target.position.x - attacker.position.x,
          z: target.position.z - attacker.position.z
        };

        const dotProduct =
          attackDirection.x * toTarget.x + attackDirection.z * toTarget.z;

        if (dotProduct > 0) {
          CombatService.applyDamage(target, weapon.damage);
          hitPlayers.push(targetId);
        }
      }
    });

    return hitPlayers;
  }

  private getDistance(player1: Player, player2: Player): number {
    const dx = player1.position.x - player2.position.x;
    const dz = player1.position.z - player2.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
