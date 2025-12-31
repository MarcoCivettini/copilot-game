import { Room } from 'colyseus.js';
import { IWeaponHandler } from './IWeaponHandler';
import { PlayerMesh, PlayerMeshService } from '../services/player-mesh.service';

/**
 * Handler per la spada.
 * Gestisce l'animazione dello swing e l'invio delle posizioni dell'arma per la collision detection.
 */
export class SwordHandler implements IWeaponHandler {
  constructor(private playerMeshService: PlayerMeshService) {}

  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    if (playerMesh.weaponType !== 'SWORD') {
      console.warn('[SwordHandler] Player does not have a sword');
      return;
    }

    // Invia continuamente le posizioni dell'arma durante l'animazione
    this.playerMeshService.playSwordSwing(playerMesh, (tipPos, basePos) => {
      room.send('weaponSwing', {
        tipPosition: { x: tipPos.x, y: tipPos.y, z: tipPos.z },
        basePosition: { x: basePos.x, y: basePos.y, z: basePos.z },
        timestamp: Date.now()
      });
    });
  }
}
