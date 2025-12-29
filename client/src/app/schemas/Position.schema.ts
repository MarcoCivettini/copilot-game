import { Schema, type } from '@colyseus/schema';

/**
 * Schema per la posizione 3D di un oggetto.
 * Deve corrispondere esattamente allo schema del server.
 */
export class Position extends Schema {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
}
