import { Injectable } from '@angular/core';

/**
 * Metriche di rete per una singola misurazione
 */
export interface NetworkSample {
  timestamp: number;
  fps: number;
  ping: number;
  predictionError: number;
}

/**
 * Statistiche aggregate
 */
export interface NetworkStats {
  avgFPS: number;
  avgPing: number;
  avgPredictionError: number;
  packetLossPercent: number;
  serverTickRate: number;
  playersInterpolating: number;
  totalPlayers: number;
}

/**
 * Service per tracciare e visualizzare metriche di performance e sincronizzazione
 */
@Injectable({
  providedIn: 'root'
})
export class NetworkMetricsService {
  private samples: NetworkSample[] = [];
  private readonly MAX_SAMPLES = 100;
  
  // Frame counting
  private frameCount = 0;
  private lastFPSUpdate = Date.now();
  private currentFPS = 0;
  
  // Ping tracking
  private pingMeasurements: number[] = [];
  private readonly MAX_PING_SAMPLES = 20;
  
  // Packet loss tracking
  private expectedSequence = 0;
  private receivedPackets = 0;
  private lostPackets = 0;
  
  // Server metrics
  private serverTickRate = 60;
  
  // Prediction error tracking
  private predictionErrors: number[] = [];
  private readonly MAX_ERROR_SAMPLES = 50;
  
  // Interpolation tracking
  private playersInterpolating = 0;
  private totalPlayers = 0;

  constructor() {}

  /**
   * Chiamato ogni frame per aggiornare FPS
   */
  updateFrame(): void {
    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFPSUpdate;
    
    // Aggiorna FPS ogni 500ms
    if (elapsed >= 500) {
      this.currentFPS = Math.round((this.frameCount / elapsed) * 1000);
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }
  }

  /**
   * Registra una misurazione di ping (round-trip time)
   */
  recordPing(pingMs: number): void {
    this.pingMeasurements.push(pingMs);
    if (this.pingMeasurements.length > this.MAX_PING_SAMPLES) {
      this.pingMeasurements.shift();
    }
  }

  /**
   * Registra errore di predizione (distanza tra posizione predetta e server)
   */
  recordPredictionError(errorUnits: number): void {
    this.predictionErrors.push(errorUnits);
    if (this.predictionErrors.length > this.MAX_ERROR_SAMPLES) {
      this.predictionErrors.shift();
    }
  }

  /**
   * Traccia packet loss basandosi su sequence number
   */
  recordPacketReceived(sequenceNumber: number): void {
    if (sequenceNumber > this.expectedSequence) {
      this.lostPackets += (sequenceNumber - this.expectedSequence);
    }
    this.expectedSequence = sequenceNumber + 1;
    this.receivedPackets++;
  }

  /**
   * Aggiorna tick rate del server
   */
  updateServerTickRate(tickRate: number): void {
    this.serverTickRate = tickRate;
  }

  /**
   * Aggiorna contatore di player in interpolazione
   */
  updateInterpolationStats(interpolating: number, total: number): void {
    this.playersInterpolating = interpolating;
    this.totalPlayers = total;
  }

  /**
   * Calcola statistiche aggregate
   */
  getStats(): NetworkStats {
    const avgPing = this.pingMeasurements.length > 0
      ? this.pingMeasurements.reduce((a, b) => a + b, 0) / this.pingMeasurements.length
      : 0;

    const avgPredictionError = this.predictionErrors.length > 0
      ? this.predictionErrors.reduce((a, b) => a + b, 0) / this.predictionErrors.length
      : 0;

    const totalPackets = this.receivedPackets + this.lostPackets;
    const packetLossPercent = totalPackets > 0
      ? (this.lostPackets / totalPackets) * 100
      : 0;

    return {
      avgFPS: this.currentFPS,
      avgPing: Math.round(avgPing),
      avgPredictionError: Math.round(avgPredictionError * 100) / 100,
      packetLossPercent: Math.round(packetLossPercent * 10) / 10,
      serverTickRate: this.serverTickRate,
      playersInterpolating: this.playersInterpolating,
      totalPlayers: this.totalPlayers
    };
  }

  /**
   * Reset delle metriche (utile per testing)
   */
  reset(): void {
    this.samples = [];
    this.frameCount = 0;
    this.lastFPSUpdate = Date.now();
    this.currentFPS = 0;
    this.pingMeasurements = [];
    this.expectedSequence = 0;
    this.receivedPackets = 0;
    this.lostPackets = 0;
    this.predictionErrors = [];
  }

  /**
   * Ottiene il ping più recente
   */
  getCurrentPing(): number {
    return this.pingMeasurements.length > 0
      ? this.pingMeasurements[this.pingMeasurements.length - 1]
      : 0;
  }
}
