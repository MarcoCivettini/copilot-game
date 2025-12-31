import { Room } from 'colyseus.js';
import { IWeaponHandler } from './IWeaponHandler';
import { PlayerMesh } from '../services/player-mesh.service';

/**
 * Handler per la lancia.
 * Gestisce l'animazione del thrust (affondo) e l'invio dei dati per la collision detection.
 */
export class SpearHandler implements IWeaponHandler {
  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    if (playerMesh.weaponType !== 'SPEAR') {
      console.warn('[SpearHandler] Player does not have a spear');
      return;
    }

    // Per ora usa lo stesso sistema della spada
    // In futuro si può implementare un'animazione di affondo specifica
    room.send('playerAttack', { timestamp: Date.now() });
  }
}
