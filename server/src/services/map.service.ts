import { GAME_CONFIG } from '../config/game.config';
import { Position } from '../schemas/BattleState';

/**
 * Service per la gestione della mappa di gioco.
 * Gestisce spawn positions, boundary checking e logica spaziale.
 */
export class MapService {
  /**
   * Genera una posizione random nel cerchio della mappa.
   * Evita di spaware i giocatori troppo vicini al bordo.
   */
  static getRandomSpawnPosition(): { x: number; z: number } {
    const angle = Math.random() * Math.PI * 2;
    const safetyMargin = 5; // distanza dal bordo
    const maxRadius = GAME_CONFIG.MAP_RADIUS - safetyMargin;
    const radius = Math.random() * maxRadius;

    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  }

  /**
   * Verifica se una posizione è fuori dai confini della mappa circolare.
   */
  static isOutOfBounds(position: Position): boolean {
    const distanceFromCenter = Math.sqrt(
      position.x ** 2 + position.z ** 2
    );
    return distanceFromCenter > GAME_CONFIG.MAP_RADIUS;
  }

  /**
   * Calcola la distanza dal centro della mappa.
   */
  static getDistanceFromCenter(position: Position): number {
    return Math.sqrt(position.x ** 2 + position.z ** 2);
  }

  /**
   * Verifica se una posizione è vicina al bordo della mappa.
   */
  static isNearBorder(position: Position, threshold: number = 5): boolean {
    const distance = this.getDistanceFromCenter(position);
    return distance > (GAME_CONFIG.MAP_RADIUS - threshold);
  }
}
