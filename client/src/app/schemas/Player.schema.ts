import { Schema, type } from '@colyseus/schema';
import { Position } from './Position.schema';

/**
 * Schema del giocatore sincronizzato con il server.
 * Deve corrispondere esattamente allo schema del server.
 */
export class Player extends Schema {
  @type('string') sessionId: string = '';
  @type('string') name: string = '';
  @type('string') weaponType: string = 'sword';
  @type(Position) position: Position = new Position();
  @type('number') rotation: number = 0;
  @type('number') hp: number = 10;
  @type('number') maxHp: number = 10;
  @type('boolean') isAlive: boolean = true;
  @type('number') lastAttackTime: number = 0;
  @type('boolean') isAttacking: boolean = false;
}
