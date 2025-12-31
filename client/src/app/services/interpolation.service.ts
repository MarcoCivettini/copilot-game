import { Injectable } from '@angular/core';
import * as THREE from 'three';

/**
 * Snapshot di posizione e rotazione con timestamp
 */
export interface PositionSnapshot {
  timestamp: number;
  position: THREE.Vector3;
  rotation: number;
}

/**
 * Service per interpolare posizioni tra snapshot ricevuti dal server.
 * Renderizza nel passato (~100ms) per avere sempre 2 punti tra cui interpolare,
 * garantendo movimento fluido anche con update rate variabile.
 */
@Injectable({
  providedIn: 'root'
})
export class InterpolationService {
  private readonly RENDER_DELAY_MS = 100; // Renderizza 100ms nel passato
  private readonly BUFFER_TIME_MS = 200; // Mantieni 200ms di history

  /**
   * Aggiunge uno snapshot al buffer mantenendo solo gli ultimi BUFFER_TIME_MS
   */
  addSnapshot(buffer: PositionSnapshot[], snapshot: PositionSnapshot): void {
    buffer.push(snapshot);
    
    // Rimuovi snapshot troppo vecchi
    const cutoffTime = Date.now() - this.BUFFER_TIME_MS;
    while (buffer.length > 0 && buffer[0].timestamp < cutoffTime) {
      buffer.shift();
    }
  }

  /**
   * Calcola posizione e rotazione interpolate basate sul render time.
   * Renderizza RENDER_DELAY_MS nel passato per garantire sempre 2 snapshot disponibili.
   */
  getInterpolatedState(buffer: PositionSnapshot[]): { position: THREE.Vector3; rotation: number } | null {
    if (buffer.length < 2) {
      // Non abbastanza dati per interpolare, usa l'ultimo disponibile
      if (buffer.length === 1) {
        return {
          position: buffer[0].position.clone(),
          rotation: buffer[0].rotation
        };
      }
      return null;
    }

    // Renderizza nel passato
    const targetTime = Date.now() - this.RENDER_DELAY_MS;

    // Trova i 2 snapshot tra cui interpolare
    let before = buffer[0];
    let after = buffer[1];

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= targetTime && buffer[i + 1].timestamp >= targetTime) {
        before = buffer[i];
        after = buffer[i + 1];
        break;
      }
    }

    // Se il targetTime è oltre l'ultimo snapshot, usa gli ultimi 2
    if (targetTime > buffer[buffer.length - 1].timestamp) {
      before = buffer[buffer.length - 2];
      after = buffer[buffer.length - 1];
    }

    // Calcola alpha per interpolazione lineare
    const timeDelta = after.timestamp - before.timestamp;
    if (timeDelta === 0) {
      return {
        position: before.position.clone(),
        rotation: before.rotation
      };
    }

    const alpha = Math.min(1, Math.max(0, (targetTime - before.timestamp) / timeDelta));

    // Interpola posizione
    const interpolatedPosition = new THREE.Vector3().lerpVectors(
      before.position,
      after.position,
      alpha
    );

    // Interpola rotazione (gestisci wrap-around a 2π)
    const interpolatedRotation = this.interpolateAngle(before.rotation, after.rotation, alpha);

    return {
      position: interpolatedPosition,
      rotation: interpolatedRotation
    };
  }

  /**
   * Interpola tra 2 angoli gestendo correttamente il wrap-around
   */
  private interpolateAngle(from: number, to: number, alpha: number): number {
    // Calcola la differenza più breve
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    
    return from + diff * alpha;
  }

  /**
   * Pulisce buffer vecchi (chiamato quando un player viene rimosso)
   */
  clearBuffer(buffer: PositionSnapshot[]): void {
    buffer.length = 0;
  }
}
