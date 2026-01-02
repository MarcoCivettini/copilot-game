import { Schema, type, MapSchema } from '@colyseus/schema';
import { Player } from './Player.schema';
import { Projectile } from './Projectile.schema';

/**
 * Schema dello stato della battaglia.
 * Deve corrispondere esattamente allo schema del server.
 */
export class BattleState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type('number') countdown: number = 0;
  @type('number') gameStartTime: number = 0;
  @type('boolean') gameActive: boolean = false;
  @type('boolean') gameEnded: boolean = false;
  @type('string') winnerId: string = '';
  @type('string') winnerName: string = '';
}
