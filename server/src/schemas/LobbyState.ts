import { Schema, type, MapSchema } from '@colyseus/schema';

/**
 * Schema per un giocatore nella lobby
 */
export class LobbyPlayer extends Schema {
  @type('string') sessionId: string = '';
  @type('string') name: string = '';
  @type('string') weaponType: string = '';
  @type('boolean') isReady: boolean = false;
}

/**
 * Schema dello stato della lobby
 */
export class LobbyState extends Schema {
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
  @type('number') playerCount: number = 0;
  @type('boolean') gameStarted: boolean = false;
}
