import { Player } from '../schemas/BattleState';

/**
 * Interfaccia per le strategie delle armi.
 * Implementa il pattern Strategy per gestire comportamenti diversi per ogni tipo di arma.
 */
export interface IWeaponStrategy {
  /**
   * Gestisce l'attacco con l'arma.
   * @param attacker Il giocatore che attacca
   * @param allPlayers Mappa di tutti i giocatori
   * @param currentTime Timestamp corrente
   * @returns Array di sessionId dei giocatori colpiti
   */
  handleAttack(
    attacker: Player,
    allPlayers: Map<string, Player>,
    currentTime: number
  ): string[];

  /**
   * Verifica se il cooldown è scaduto.
   * @param attacker Il giocatore che vuole attaccare
   * @param currentTime Timestamp corrente
   * @returns true se può attaccare, false altrimenti
   */
  canAttack(attacker: Player, currentTime: number): boolean;
}
