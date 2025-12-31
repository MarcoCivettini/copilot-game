import { Room } from 'colyseus.js';
import { PlayerMesh } from '../services/player-mesh.service';

/**
 * Interfaccia per gli handler delle armi.
 * Gestisce animazioni e logica specifica per ogni tipo di arma.
 */
export interface IWeaponHandler {
  /**
   * Gestisce l'attacco con l'arma.
   * @param playerMesh Il mesh del giocatore che attacca
   * @param room La room Colyseus per inviare messaggi
   */
  handleAttack(playerMesh: PlayerMesh, room: Room): void;

  /**
   * Pulisce le risorse dell'handler (se necessario).
   */
  cleanup?(): void;
}
