import { Player } from '../schemas/BattleState';
import { WEAPONS, WeaponType } from '../config/game.config';

/**
 * Service per la gestione del combattimento corpo a corpo.
 * Gestisce attacchi in mischia, danni e meccaniche di combattimento.
 */
export class CombatService {
  /**
   * Raggio della hitbox cilindrica del giocatore
   * Aumentato per essere più permissivi con i colpi
   */
  private static readonly PLAYER_HITBOX_RADIUS = 1.0;

  /**
   * Verifica se un segmento di linea (arma) interseca una sfera (player hitbox).
   * Usa il metodo della distanza punto-linea.
   */
  static lineIntersectsSphere(
    lineStart: { x: number; y: number; z: number },
    lineEnd: { x: number; y: number; z: number },
    sphereCenter: { x: number; y: number; z: number },
    sphereRadius: number
  ): boolean {
    // Vettore della linea
    const lineVec = {
      x: lineEnd.x - lineStart.x,
      y: lineEnd.y - lineStart.y,
      z: lineEnd.z - lineStart.z
    };

    // Vettore dal punto iniziale della linea al centro della sfera
    const toSphere = {
      x: sphereCenter.x - lineStart.x,
      y: sphereCenter.y - lineStart.y,
      z: sphereCenter.z - lineStart.z
    };

    // Lunghezza della linea al quadrato
    const lineLengthSq =
      lineVec.x * lineVec.x + lineVec.y * lineVec.y + lineVec.z * lineVec.z;

    // Se la linea ha lunghezza zero, tratta come punto
    if (lineLengthSq === 0) {
      const distSq =
        toSphere.x * toSphere.x + toSphere.y * toSphere.y + toSphere.z * toSphere.z;
      const hit = distSq <= sphereRadius * sphereRadius;
      console.log('[CombatService] Line has zero length, distance:', Math.sqrt(distSq), 'radius:', sphereRadius, 'hit:', hit);
      return hit;
    }

    // Proiezione di toSphere sulla linea (parametro t tra 0 e 1)
    let t =
      (toSphere.x * lineVec.x + toSphere.y * lineVec.y + toSphere.z * lineVec.z) /
      lineLengthSq;

    // Clamp t tra 0 e 1 per rimanere sul segmento
    t = Math.max(0, Math.min(1, t));

    // Punto più vicino sulla linea
    const closestPoint = {
      x: lineStart.x + t * lineVec.x,
      y: lineStart.y + t * lineVec.y,
      z: lineStart.z + t * lineVec.z
    };

    // Distanza dal punto più vicino al centro della sfera
    const distVec = {
      x: sphereCenter.x - closestPoint.x,
      y: sphereCenter.y - closestPoint.y,
      z: sphereCenter.z - closestPoint.z
    };

    const distSq = distVec.x * distVec.x + distVec.y * distVec.y + distVec.z * distVec.z;
    const distance = Math.sqrt(distSq);
    const hit = distSq <= sphereRadius * sphereRadius;

    console.log('[CombatService] Collision check - distance:', distance.toFixed(2), 'radius:', sphereRadius, 't:', t.toFixed(2), 'hit:', hit);
    console.log('[CombatService] Line:', lineStart, '->', lineEnd);
    console.log('[CombatService] Sphere center:', sphereCenter);
    console.log('[CombatService] Closest point on line:', closestPoint);

    return hit;
  }

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
   * Gestisce un attacco basato sulla hitbox dell'arma durante l'animazione.
   * Verifica se il segmento arma (base -> punta) interseca la hitbox sferica del target.
   * NON aggiorna il cooldown - deve essere gestito dal chiamante una sola volta.
   */
  static handleWeaponHitboxAttack(
    attacker: Player,
    weaponTip: { x: number; y: number; z: number },
    weaponBase: { x: number; y: number; z: number },
    allPlayers: Map<string, Player>,
    checkCooldown: boolean = true
  ): string[] {
    const weapon = WEAPONS[attacker.weaponType as WeaponType];
    if (!weapon) {
      console.log('[CombatService] No weapon config found for', attacker.weaponType);
      return [];
    }

    // Verifica cooldown solo se richiesto (solo al primo frame dell'attacco)
    if (checkCooldown) {
      const currentTime = Date.now();
      if (currentTime - attacker.lastAttackTime < weapon.cooldown) {
        console.log('[CombatService] Attack on cooldown', {
          elapsed: currentTime - attacker.lastAttackTime,
          cooldown: weapon.cooldown
        });
        return [];
      }
      attacker.lastAttackTime = currentTime;
      attacker.isAttacking = true;
    }

    console.log('[CombatService] Processing weapon hitbox attack for', attacker.name);
    
    const hitPlayers: string[] = [];

    // Controlla tutti i giocatori nemici
    allPlayers.forEach((target, targetId) => {
      if (targetId === attacker.sessionId || !target.isAlive) return;

      // Centro della hitbox del target (a metà altezza del corpo)
      const targetCenter = {
        x: target.position.x,
        y: 0.9, // Metà altezza del corpo (1.8 / 2)
        z: target.position.z
      };

      console.log('[CombatService] Checking collision with', target.name, 'at', targetCenter);

      // Verifica se il segmento dell'arma interseca la sfera del target
      if (this.lineIntersectsSphere(weaponBase, weaponTip, targetCenter, this.PLAYER_HITBOX_RADIUS)) {
        console.log('[CombatService] HIT DETECTED on', target.name);
        // NON applichiamo danno qui - lo fa il BattleRoom dopo aver verificato duplicati
        hitPlayers.push(targetId);
      } else {
        console.log('[CombatService] No hit on', target.name);
      }
    });

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
