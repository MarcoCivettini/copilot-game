import { Room } from 'colyseus.js';
import { IWeaponHandler } from './IWeaponHandler';
import { PlayerMesh, PlayerMeshService } from '../services/player-mesh.service';

/**
 * Handler per l'arco.
 * Gestisce l'animazione di tiro e la creazione dei proiettili.
 */
export class BowHandler implements IWeaponHandler {
  constructor(private playerMeshService: PlayerMeshService) {}

  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    if (playerMesh.weaponType !== 'BOW') {
      console.warn('[BowHandler] Player does not have a bow');
      return;
    }

    // Anima l'arco e invia il messaggio quando il proiettile deve partire
    this.playerMeshService.playBowShot(playerMesh, () => {
      // Callback chiamato durante l'animazione quando il proiettile deve partire
      room.send('playerAttack', { timestamp: Date.now() });
    });
  }
}
