import { Injectable } from '@angular/core';
import * as THREE from 'three';

/**
 * Interfaccia per i dati del player
 */
export interface PlayerData {
  sessionId: string;
  name: string;
  weaponType: 'SWORD' | 'SPEAR' | 'BOW';
  position: { x: number; y: number; z: number };
  rotation: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
}

/**
 * Struttura che contiene mesh e componenti di un player
 */
export interface PlayerMesh {
  mesh: THREE.Group;
  nameLabel: THREE.Sprite;
  healthBar: THREE.Mesh;
  targetRotation: number;
}

/**
 * Service per la gestione dei mesh dei giocatori.
 * Gestisce creazione, aggiornamento e rimozione dei player mesh.
 */
@Injectable({ providedIn: 'root' })
export class PlayerMeshService {
  /**
   * Crea il mesh 3D per un giocatore.
   */
  createPlayerMesh(
    sessionId: string,
    playerData: PlayerData,
    isMyPlayer: boolean,
    scene: THREE.Scene
  ): PlayerMesh {
    const group = new THREE.Group();

    // Corpo del giocatore
    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: isMyPlayer ? 0x0066ff : 0xff6600
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // Arma (placeholder)
    const weaponGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    const weaponMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
    weapon.position.set(0.5, 0.9, 0);
    group.add(weapon);

    // Barra vita
    const healthBarGeometry = new THREE.PlaneGeometry(1, 0.1);
    const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    healthBar.position.set(0, 2.5, 0);
    group.add(healthBar);

    // Nome giocatore (sprite)
    const nameLabel = this.createNameLabel(playerData.name || 'Player');
    nameLabel.position.set(0, 3, 0);
    nameLabel.scale.set(2, 0.5, 1);
    group.add(nameLabel);

    // Posizione iniziale
    group.position.set(
      playerData.position?.x || 0,
      playerData.position?.y || 1,
      playerData.position?.z || 0
    );

    scene.add(group);

    return {
      mesh: group,
      nameLabel,
      healthBar,
      targetRotation: playerData.rotation || 0
    };
  }

  /**
   * Crea il label con il nome del giocatore.
   */
  private createNameLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText(name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    return new THREE.Sprite(spriteMaterial);
  }

  /**
   * Aggiorna la barra vita di un player.
   */
  updateHealthBar(playerMesh: PlayerMesh, healthPercent: number): void {
    playerMesh.healthBar.scale.x = healthPercent;

    const color = healthPercent > 0.5 ? 0x00ff00 : 0xff0000;
    (playerMesh.healthBar.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /**
   * Rimuove un player dalla scena.
   */
  removePlayerFromScene(
    sessionId: string,
    playerMeshes: Map<string, PlayerMesh>,
    scene: THREE.Scene
  ): void {
    const playerMesh = playerMeshes.get(sessionId);
    if (playerMesh) {
      scene.remove(playerMesh.mesh);
      playerMeshes.delete(sessionId);
    }
  }

  /**
   * Interpola la rotazione di un player mesh verso la target rotation.
   */
  interpolateRotation(playerMesh: PlayerMesh): void {
    const currentRotation = playerMesh.mesh.rotation.y;
    const targetRotation = playerMesh.targetRotation;

    const delta = this.getShortestAngleDelta(currentRotation, targetRotation);
    const lerpFactor = 0.15;
    const newRotation = currentRotation + delta * lerpFactor;

    playerMesh.mesh.rotation.y = newRotation;
  }

  /**
   * Calcola la differenza più breve tra due angoli.
   */
  private getShortestAngleDelta(from: number, to: number): number {
    let delta = to - from;
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;

    if (delta < -Math.PI) {
      delta += Math.PI * 2;
    }

    return delta;
  }

  /**
   * Aggiorna i billboard (healthbar e nome) per guardare sempre la camera.
   */
  updateBillboards(playerMesh: PlayerMesh, camera: THREE.Camera): void {
    playerMesh.healthBar.lookAt(camera.position);
    playerMesh.nameLabel.lookAt(camera.position);
  }
}
