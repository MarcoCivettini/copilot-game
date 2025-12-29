import { Player } from '../schemas/BattleState';
import { WEAPONS, WeaponType } from '../config/game.config';

/**
 * Service per la gestione del combattimento corpo a corpo.
 * Gestisce attacchi in mischia, danni e meccaniche di combattimento.
 */
export class CombatService {
  /**
   * Calcola la distanza tra due giocatori (solo x e z, ignora y).
   */
  private static getDistance(player1: Player, player2: Player): number {
    const dx = player1.position.x - player2.position.x;
    const dz = player1.position.z - player2.position.z;
    return Math.sqrt(dx * dx + dz * dz);
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

      const distance = this.getDistance(attacker, target);

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
   * Applica danno a un giocatore e gestisce la morte.
   */
  static applyDamage(player: Player, damage: number): void {
    player.hp = Math.max(0, player.hp - damage);

    if (player.hp <= 0) {
      player.isAlive = false;
      player.hp = 0;
    }
  }
}
