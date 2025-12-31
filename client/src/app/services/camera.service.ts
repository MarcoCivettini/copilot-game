import { Injectable } from '@angular/core';
import * as THREE from 'three';

/**
 * Service per la gestione della camera in terza persona.
 * Gestisce posizionamento camera e interpolazione.
 */
@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly cameraOffset = new THREE.Vector3(0, 12, 14);
  private readonly cameraLookAtOffset = new THREE.Vector3(0, 1, 0);

  /**
   * Aggiorna la posizione della camera per seguire il player.
   */
  updateThirdPersonCamera(
    camera: THREE.PerspectiveCamera,
    playerMesh: THREE.Group
  ): void {
    // Calcola posizione target della camera
    const targetCameraPosition = new THREE.Vector3();
    targetCameraPosition.copy(playerMesh.position).add(this.cameraOffset);

    // Smooth camera movement
    camera.position.lerp(targetCameraPosition, 0.08);

    // La camera guarda sempre il personaggio
    const lookAtPosition = playerMesh.position.clone().add(this.cameraLookAtOffset);
    camera.lookAt(lookAtPosition);
  }
}
