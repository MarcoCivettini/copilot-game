import { Schema, type, MapSchema } from '@colyseus/schema';

/**
 * Schema per la posizione di un giocatore
 */
export class Position extends Schema {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
}

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

/**
 * Schema per un giocatore in partita
 */
export class Player extends Schema {
  @type('string') sessionId: string = '';
  @type('string') name: string = '';
  @type('string') weaponType: string = '';
  @type(Position) position: Position = new Position();
  @type('number') rotation: number = 0;
  @type('number') hp: number = 10;
  @type('number') maxHp: number = 10;
  @type('boolean') isAlive: boolean = true;
  @type('number') lastAttackTime: number = 0;
  @type('boolean') isAttacking: boolean = false;
}

/**
 * Schema dello stato della partita
 */
export class BattleState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type('number') countdown: number = 5;
  @type('boolean') gameActive: boolean = false;
  @type('boolean') gameEnded: boolean = false;
  @type('string') winnerId: string = '';
  @type('string') winnerName: string = '';
}
