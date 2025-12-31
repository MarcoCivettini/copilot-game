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
 * Input inviato con timestamp per riconciliazione
 */
export interface InputSnapshot {
  timestamp: number;
  position: THREE.Vector3;
  rotation: number;
}

/**
 * Service per la gestione degli input del giocatore.
 * Gestisce keyboard controls e movimento con client-side prediction.
 */
@Injectable({ providedIn: 'root' })
export class InputService {
  private readonly moveSpeed = 0.2;
  private readonly MAP_RADIUS = 30;
  private readonly ROTATION_SMOOTH_FACTOR = 0.12;

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

  // Client-side prediction: buffer di input inviati
  private inputBuffer: InputSnapshot[] = [];
  private readonly INPUT_BUFFER_TIME = 1000; // 1 secondo

  // Adaptive send rate
  private lastSentPosition: THREE.Vector3 | null = null;
  private lastSentTime = 0;
  private readonly MIN_SEND_INTERVAL = 50; // Max 20 updates/sec
  private readonly HEARTBEAT_INTERVAL = 200; // Heartbeat per player fermi
  private readonly POSITION_THRESHOLD = 0.1; // Invia se movimento > 0.1 unità

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
   * Usa client-side prediction e adaptive send rate.
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

    if (!moved) {
      // Anche se non si muove, invia heartbeat periodico
      this.sendHeartbeatIfNeeded(room, playerMesh.position, this.currentRotation || 0);
      return null;
    }

    const newPosition = playerMesh.position.clone().add(movementVector);

    // Verifica boundary circolare
    const distance = Math.sqrt(newPosition.x ** 2 + newPosition.z ** 2);
    if (distance <= this.MAP_RADIUS - 1) {
      // CLIENT-SIDE PREDICTION: muovi immediatamente il player locale
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

        // ADAPTIVE SEND RATE: invia solo se necessario
        if (this.shouldSendUpdate(newPosition)) {
          const timestamp = Date.now();
          
          // Salva input nel buffer per riconciliazione
          this.inputBuffer.push({
            timestamp,
            position: newPosition.clone(),
            rotation: this.currentRotation
          });

          // Cleanup buffer vecchi
          this.cleanupInputBuffer();

          // Invia movimento al server con timestamp
          room.send('playerMove', {
            x: newPosition.x,
            z: newPosition.z,
            rotation: this.currentRotation,
            timestamp
          });

          this.lastSentPosition = newPosition.clone();
          this.lastSentTime = timestamp;
        }

        return this.currentRotation;
      }
    }

    return null;
  }

  /**
   * Determina se inviare update al server (adaptive send rate)
   */
  private shouldSendUpdate(currentPosition: THREE.Vector3): boolean {
    const now = Date.now();
    const timeDelta = now - this.lastSentTime;

    // Prima volta
    if (!this.lastSentPosition) {
      return true;
    }

    // Calcola distanza da ultima posizione inviata
    const positionDelta = currentPosition.distanceTo(this.lastSentPosition);

    // Invia se:
    // 1. È passato abbastanza tempo E ti sei mosso significativamente
    // 2. Oppure è passato molto tempo (heartbeat)
    return (timeDelta > this.MIN_SEND_INTERVAL && positionDelta > this.POSITION_THRESHOLD) ||
           timeDelta > this.HEARTBEAT_INTERVAL;
  }

  /**
   * Invia heartbeat se il player è fermo da troppo tempo
   */
  private sendHeartbeatIfNeeded(room: Room, position: THREE.Vector3, rotation: number): void {
    const now = Date.now();
    const timeDelta = now - this.lastSentTime;

    if (timeDelta > this.HEARTBEAT_INTERVAL) {
      room.send('playerMove', {
        x: position.x,
        z: position.z,
        rotation,
        timestamp: now
      });

      this.lastSentTime = now;
      this.lastSentPosition = position.clone();
    }
  }

  /**
   * Riconcilia posizione locale con quella autoritativa del server.
   * Chiamato quando ricevi update dal server.
   */
  reconcilePosition(
    playerMesh: THREE.Group,
    serverPosition: THREE.Vector3,
    serverTimestamp?: number
  ): number {
    const currentPosition = playerMesh.position;
    const distance = currentPosition.distanceTo(serverPosition);

    // Tolleranza normale: nessuna correzione necessaria
    if (distance < 0.1) {
      return distance;
    }

    // Discrepanza significativa: applica correzione graduale
    if (distance > 0.5) {
      // Smooth lerp per evitare "rubber banding" brusco
      playerMesh.position.lerp(serverPosition, 0.2);
    }

    return distance;
  }

  /**
   * Cleanup input buffer vecchi
   */
  private cleanupInputBuffer(): void {
    const cutoffTime = Date.now() - this.INPUT_BUFFER_TIME;
    this.inputBuffer = this.inputBuffer.filter(input => input.timestamp > cutoffTime);
  }

  /**
   * Ottiene l'input buffer (per debug)
   */
  getInputBuffer(): InputSnapshot[] {
    return this.inputBuffer;
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
    
    // Reset adaptive send rate
    this.lastSentPosition = null;
    this.lastSentTime = 0;
    
    // Cleanup buffer
    this.inputBuffer = [];
  }
}
