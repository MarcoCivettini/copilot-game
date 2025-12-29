import { Schema, type, MapSchema } from '@colyseus/schema';

export class LobbyPlayer extends Schema {
  @type('string') sessionId: string = '';
  @type('string') name: string = '';
  @type('string') weaponType: string = '';
  @type('boolean') isReady: boolean = false;
}

export class LobbyState extends Schema {
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
  @type('number') playerCount: number = 0;
  @type('boolean') gameStarted: boolean = false;
}
