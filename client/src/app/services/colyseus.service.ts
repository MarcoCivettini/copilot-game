import { Injectable } from '@angular/core';
import { Client, Room } from 'colyseus.js';
import { BattleState } from '../schemas/BattleState.schema';
import { LobbyState } from '../schemas/LobbyState.schema';

@Injectable({ providedIn: 'root' })
export class ColyseusService {
  private client: Client;
  private room?: Room<any>;
  private playerName: string = '';
  private playerWeapon: string = '';

  constructor() {
    this.client = new Client('ws://localhost:2567');
  }

  async joinLobby(playerName: string, weapon: string): Promise<Room<LobbyState>> {
    this.playerName = playerName;
    this.playerWeapon = weapon;
    
    // Connessione alla lobby - Colyseus deserializzerà automaticamente usando gli schema importati
    this.room = await this.client.joinOrCreate<LobbyState>('lobby', { 
      name: playerName, 
      weaponType: weapon.toUpperCase() 
    });
    
    return this.room;
  }

  async joinBattle(): Promise<Room<BattleState>> {
    this.room = await this.client.joinOrCreate<BattleState>('battle', {
      name: this.playerName,
      weaponType: this.playerWeapon.toUpperCase()
    });
    return this.room;
  }

  async joinBattleById(roomId: string): Promise<Room<BattleState>> {
    this.room = await this.client.joinById<BattleState>(roomId, {
      name: this.playerName,
      weaponType: this.playerWeapon.toUpperCase()
    });
    return this.room;
  }

  getRoom(): Room<any> | undefined {
    return this.room;
  }

  leaveRoom(): void {
    this.room?.leave();
    this.room = undefined;
  }
}
