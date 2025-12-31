import { Room } from 'colyseus.js';
import { IWeaponHandler } from './IWeaponHandler';
import { PlayerMesh, PlayerMeshService } from '../services/player-mesh.service';

/**
 * Handler per la lancia.
 * Gestisce l'animazione del thrust (affondo) e l'invio dei dati per la collision detection.
 */
export class SpearHandler implements IWeaponHandler {
  constructor(private playerMeshService: PlayerMeshService) {}

  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    if (playerMesh.weaponType !== 'SPEAR') {
      console.warn('[SpearHandler] Player does not have a spear');
      return;
    }

    const attackTimestamp = Date.now();

    // Invia continuamente le posizioni dell'arma durante l'animazione di thrust
    this.playerMeshService.playSpearThrust(playerMesh, (tipPos, basePos) => {
      room.send('weaponSwing', {
        tipPosition: { x: tipPos.x, y: tipPos.y, z: tipPos.z },
        basePosition: { x: basePos.x, y: basePos.y, z: basePos.z },
        timestamp: Date.now(),
        attackTimestamp // Timestamp iniziale dell'attacco
      });
    });
  }
}
