import { Schema, type } from '@colyseus/schema';

/**
 * Schema per la posizione di un giocatore
 */
export class Position extends Schema {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;

  /**
   * Crea una copia della posizione.
   */
  copy(): Position {
    const pos = new Position();
    pos.x = this.x;
    pos.y = this.y;
    pos.z = this.z;
    return pos;
  }
}
