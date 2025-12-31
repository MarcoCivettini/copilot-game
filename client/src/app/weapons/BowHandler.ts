import { Room } from 'colyseus.js';
import { IWeaponHandler } from './IWeaponHandler';
import { PlayerMesh } from '../services/player-mesh.service';

/**
 * Handler per l'arco.
 * Gestisce l'animazione di tiro e la creazione dei proiettili.
 */
export class BowHandler implements IWeaponHandler {
  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    if (playerMesh.weaponType !== 'BOW') {
      console.warn('[BowHandler] Player does not have a bow');
      return;
    }

    // Invia messaggio di attacco al server per creare il proiettile
    room.send('playerAttack', { timestamp: Date.now() });

    // TODO: Aggiungere animazione di tiro con arco in futuro
  }
}
