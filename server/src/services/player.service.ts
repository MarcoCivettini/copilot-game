import { Player } from '../schemas/BattleState';
import { WeaponType } from '../config/game.config';

/**
 * Dati player serializzati per i client (plain JS object).
 */
export interface PlayerData {
  sessionId: string;
  name: string;
  weaponType: WeaponType;
  position: { x: number; y: number; z: number };
  rotation: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
}

/**
 * Service per la serializzazione e gestione dati dei giocatori.
 * Converte gli schema Colyseus in plain objects per i client.
 */
export class PlayerService {
  /**
   * Converte un singolo Player schema in PlayerData serializzabile.
   */
  static serializePlayer(player: Player, sessionId: string): PlayerData {
    return {
      sessionId: sessionId,
      name: player.name,
      weaponType: player.weaponType as WeaponType,
      position: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      },
      rotation: player.rotation,
      hp: player.hp,
      maxHp: player.maxHp,
      isAlive: player.isAlive
    };
  }

  /**
   * Converte una mappa di Player schemas in array di PlayerData.
   */
  static serializePlayerList(players: Map<string, Player>): PlayerData[] {
    const playersList: PlayerData[] = [];
    
    players.forEach((player, sessionId) => {
      playersList.push(this.serializePlayer(player, sessionId));
    });

    return playersList;
  }

  /**
   * Conta i giocatori vivi in una mappa.
   */
  static countAlivePlayers(players: Map<string, Player>): number {
    let count = 0;
    players.forEach(player => {
      if (player.isAlive) count++;
    });
    return count;
  }

  /**
   * Trova il vincitore (l'ultimo giocatore vivo).
   */
  static findWinner(players: Map<string, Player>): Player | null {
    for (const player of players.values()) {
      if (player.isAlive) {
        return player;
      }
    }
    return null;
  }
}
