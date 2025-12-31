import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { Room } from 'colyseus.js';

/**
 * Stato dei tasti premuti
 */
export interface KeysState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  space: boolean;
}

/**
 * Service per la gestione degli input del giocatore.
 * Gestisce keyboard controls e movimento.
 */
@Injectable({ providedIn: 'root' })
export class InputService {
  private readonly moveSpeed = 0.2;
  private readonly MAP_RADIUS = 30;
  private readonly ROTATION_SMOOTH_FACTOR = 0.12; // Fattore di interpolazione per rotazione fluida

  // Rendo keys pubblico per accesso dallo spettatore
  public keys: KeysState = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
  };

  // Traccia la rotazione corrente per interpolazione fluida
  private currentRotation: number | null = null;

  /**
   * Inizializza i listener per la tastiera.
   */
  setupKeyboardControls(onAttack: () => void): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e, onAttack));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  /**
   * Gestisce evento keydown.
   */
  private handleKeyDown(e: KeyboardEvent, onAttack: () => void): void {
    const key = e.key.toLowerCase();
    
    if (key === 'w') this.keys.w = true;
    if (key === 'a') this.keys.a = true;
    if (key === 's') this.keys.s = true;
    if (key === 'd') this.keys.d = true;
    if (key === ' ') {
      this.keys.space = true;
      onAttack();
    }
  }

  /**
   * Gestisce evento keyup.
   */
  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    
    if (key === 'w') this.keys.w = false;
    if (key === 'a') this.keys.a = false;
    if (key === 's') this.keys.s = false;
    if (key === 'd') this.keys.d = false;
    if (key === ' ') this.keys.space = false;
  }

  /**
   * Aggiorna il movimento del giocatore basato sui tasti premuti.
   * Ritorna la nuova rotazione se c'è stato movimento.
   */
  updatePlayerMovement(
    playerMesh: THREE.Group,
    room: Room | undefined
  ): number | null {
    if (!room) return null;

    let moved = false;
    const oldPosition = playerMesh.position.clone();
    const movementVector = new THREE.Vector3(0, 0, 0);

    if (this.keys.w) {
      movementVector.z -= this.moveSpeed;
      moved = true;
    }
    if (this.keys.s) {
      movementVector.z += this.moveSpeed;
      moved = true;
    }
    if (this.keys.a) {
      movementVector.x -= this.moveSpeed;
      moved = true;
    }
    if (this.keys.d) {
      movementVector.x += this.moveSpeed;
      moved = true;
    }

    if (!moved) return null;

    const newPosition = playerMesh.position.clone().add(movementVector);

    // Verifica boundary circolare
    const distance = Math.sqrt(newPosition.x ** 2 + newPosition.z ** 2);
    if (distance <= this.MAP_RADIUS - 1) {
      playerMesh.position.copy(newPosition);

      const dx = newPosition.x - oldPosition.x;
      const dz = newPosition.z - oldPosition.z;

      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        // Calcola la rotazione target basata sulla direzione del movimento
        const targetRotation = Math.atan2(dx, dz);

        // Se non abbiamo una rotazione corrente, inizializzala
        if (this.currentRotation === null) {
          this.currentRotation = targetRotation;
        } else {
          // Interpola smoothly verso la nuova rotazione
          const delta = this.getShortestAngleDelta(this.currentRotation, targetRotation);
          this.currentRotation += delta * this.ROTATION_SMOOTH_FACTOR;
          
          // Normalizza l'angolo tra -PI e PI
          this.currentRotation = ((this.currentRotation + Math.PI) % (Math.PI * 2)) - Math.PI;
        }

        // Invia movimento al server con la rotazione interpolata
        room.send('playerMove', {
          x: newPosition.x,
          z: newPosition.z,
          rotation: this.currentRotation
        });

        return this.currentRotation;
      }
    }

    return null;
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
   * Cleanup listener.
   */
  cleanup(): void {
    // I listener vengono rimossi automaticamente quando il component viene distrutto
    // ma possiamo resettare lo stato
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false
    };
    
    // Reset rotazione
    this.currentRotation = null;
  }
}
