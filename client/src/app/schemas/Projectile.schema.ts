import { Schema, type } from '@colyseus/schema';
import { Position } from './Position.schema';

/**
 * Schema per un proiettile (freccia dell'arco)
 */
export class Projectile extends Schema {
  @type('string') id: string = '';
  @type('string') ownerId: string = '';
  @type(Position) position: Position = new Position();
  @type('number') directionX: number = 0;
  @type('number') directionZ: number = 0;
  @type('number') speed: number = 10;
  @type('number') damage: number = 0;
  @type('number') range: number = 0;
  @type('number') distanceTraveled: number = 0;
}
