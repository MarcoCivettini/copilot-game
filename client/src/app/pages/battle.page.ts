import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ColyseusService } from '../services/colyseus.service';
import { ThreeJsSceneService } from '../services/threejs-scene.service';
import { PlayerMeshService, PlayerData, PlayerMesh } from '../services/player-mesh.service';
import { InputService } from '../services/input.service';
import { CameraService } from '../services/camera.service';
import { WeaponHandlerFactory } from '../weapons/WeaponHandlerFactory';
import { InterpolationService } from '../services/interpolation.service';
import { NetworkMetricsService, NetworkStats } from '../services/network-metrics.service';
import { BattleState } from '../schemas/BattleState.schema';
import * as THREE from 'three';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './battle.page.html',
  styleUrls: ['./battle.page.scss']
})
export class BattlePage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: false }) canvasContainer!: ElementRef;
  
  players: PlayerData[] = [];
  myPlayerId = '';
  isGameOver = false;
  winner: string | null = null;
  isDead = false; // Il giocatore è morto
  hasWon = false; // Il giocatore ha vinto

  // HUD data
  myHealth = 10;
  myMaxHealth = 10;
  playersAlive = 0;
  totalPlayers = 0;

  // ThreeJS
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationId?: number;
  
  // Giocatori nella scena
  private playerMeshes = new Map<string, PlayerMesh>();
  private myPlayer?: THREE.Group;
  private spectatorGhost?: THREE.Group; // Oggetto invisibile per modalità spettatore

  // Network metrics e debug
  showDebugOverlay = false;
  networkStats: NetworkStats = {
    avgFPS: 0,
    avgPing: 0,
    avgPredictionError: 0,
    packetLossPercent: 0,
    serverTickRate: 60,
    playersInterpolating: 0,
    totalPlayers: 0
  };

  constructor(
    private colyseus: ColyseusService,
    private router: Router,
    private sceneService: ThreeJsSceneService,
    private playerMeshService: PlayerMeshService,
    private inputService: InputService,
    private cameraService: CameraService,
    private interpolationService: InterpolationService,
    private networkMetrics: NetworkMetricsService
  ) {}

  ngOnInit() {
    const room = this.colyseus.getRoom();
    if (!room) {
      this.router.navigate(['/']);
      return;
    }

    this.myPlayerId = room.sessionId;
    console.log('[BattlePage] My player ID:', this.myPlayerId);

    // Ascolta la lista dei player (message-based invece di schema)
    room.onMessage('playerList', (data: { players: PlayerData[] }) => {
      this.players = data.players;
      
      if (this.isDead) {
        console.log('[BattlePage] [SPECTATOR] Received player list with', data.players.length, 'players');
        const alivePlayers = data.players.filter(p => p.isAlive);
        console.log('[BattlePage] [SPECTATOR] Alive players:', alivePlayers.map(p => p.name));
      }

      // Aggiorna HUD con dati del player locale
      const myPlayer = data.players.find(p => p.sessionId === this.myPlayerId);
      if (myPlayer) {
        this.myHealth = myPlayer.hp;
        this.myMaxHealth = myPlayer.maxHp;
      }

      // Conta giocatori vivi e totali
      this.playersAlive = data.players.filter(p => p.isAlive).length;
      this.totalPlayers = data.players.length;

      // Aggiorna ogni player nella scena
      data.players.forEach(player => {
        this.updatePlayerInScene(player.sessionId, player);
      });

      // Rimuovi player che non sono più nella lista
      const currentPlayerIds = new Set(data.players.map(p => p.sessionId));
      this.playerMeshes.forEach((mesh, sessionId) => {
        if (!currentPlayerIds.has(sessionId)) {
          this.playerMeshService.removePlayerFromScene(sessionId, this.playerMeshes, this.scene);
        }
      });
    });

    // Ascolta attacchi
    room.onMessage('playerAttacked', (data: { attackerId: string, targetId: string, damage: number }) => {
      console.log('[BattlePage] Attack:', data);
      
      // Mostra effetto visivo swing per l'attaccante
      const attackerMesh = this.playerMeshes.get(data.attackerId);
      if (attackerMesh && attackerMesh.weaponType === 'SWORD') {
        this.playerMeshService.playSwordSwing(attackerMesh);
      }
    });

    // Ascolta inizio swing dell'arma (per mostrare animazione agli altri client)
    room.onMessage('weaponSwingStarted', (data: { sessionId: string, weaponType: string }) => {
      console.log('[BattlePage] Weapon swing started:', data);
      
      const attackerMesh = this.playerMeshes.get(data.sessionId);
      if (attackerMesh && data.weaponType === 'SWORD') {
        this.playerMeshService.playSwordSwing(attackerMesh);
      }
    });

    // Ascolta eliminazioni
    room.onMessage('playerEliminated', (data: { playerId: string, killerId: string }) => {
      console.log('[BattlePage] Player eliminated:', data);
      
      // Se sono io a morire, entra in modalità spettatore
      if (data.playerId === this.myPlayerId) {
        this.isDead = true;
        this.hasWon = false;
        this.applyGrayscaleEffect(true);
        
        // Salva la posizione corrente del player prima di rimuoverlo
        const currentPosition = this.myPlayer ? this.myPlayer.position.clone() : new THREE.Vector3(0, 0, 0);
        
        // Rimuovi il mesh del giocatore locale
        this.playerMeshService.removePlayerFromScene(data.playerId, this.playerMeshes, this.scene);
        this.myPlayer = undefined;
        
        // Crea un oggetto invisibile "fantasma" per la modalità spettatore
        this.spectatorGhost = new THREE.Group();
        this.spectatorGhost.position.copy(currentPosition);
        this.scene.add(this.spectatorGhost);
        
        console.log('[BattlePage] Entered spectator mode at position:', currentPosition);
      } else {
        // Rimuovi gli altri giocatori eliminati dalla scena
        this.playerMeshService.removePlayerFromScene(data.playerId, this.playerMeshes, this.scene);
      }
    });

    // Ascolta fine partita
    room.onMessage('gameEnded', (data: { winnerId: string, winnerName: string }) => {
      this.isGameOver = true;
      this.winner = data.winnerName;
      
      // Verifica se ho vinto confrontando il sessionId
      if (data.winnerId === this.myPlayerId) {
        this.hasWon = true;
        this.isDead = false;
      }
      
      setTimeout(() => this.router.navigate(['/']), 10000);
    });

    // Setup controlli tastiera usando InputService
    this.inputService.setupKeyboardControls(() => this.attack());

    // Handler per proiettili - NUOVO approccio message-based
    room.onMessage('projectileSpawned', (data: { id: string; position: { x: number; y: number; z: number }; direction: { x: number; z: number } }) => {
      console.log(`[BattlePage] Projectile spawned: ${data.id}`);
      if (this.scene) {
        this.sceneService.updateProjectile(
          data.id,
          data.position,
          this.scene,
          data.direction
        );
      }
    });

    room.onMessage('projectileUpdate', (data: { id: string; position: { x: number; y: number; z: number } }) => {
      if (this.scene) {
        this.sceneService.updateProjectile(
          data.id,
          data.position,
          this.scene
        );
      }
    });

    room.onMessage('projectileRemoved', (data: { id: string }) => {
      console.log(`[BattlePage] Projectile removed: ${data.id}`);
      if (this.scene) {
        this.sceneService.removeProjectile(data.id, this.scene);
      }
    });
    
    // Setup debug overlay toggle con CTRL + D
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault(); // Previeni comportamento default del browser
        this.showDebugOverlay = !this.showDebugOverlay;
      }
    });
    
    // Setup ping measurement
    this.startPingMeasurement(room);
  }
  
  /**
   * Avvia misurazione periodica del ping
   */
  private startPingMeasurement(room: any): void {
    // Invia ping ogni 2 secondi
    setInterval(() => {
      const pingStartTime = Date.now();
      
      // Invia messaggio ping e attendi pong
      room.send('ping', { timestamp: pingStartTime });
      
      // Ascolta pong
      room.onMessage('pong', (data: { timestamp: number }) => {
        const pingTime = Date.now() - data.timestamp;
        this.networkMetrics.recordPing(pingTime);
      });
    }, 2000);
  }

  ngAfterViewInit() {
    const container = document.getElementById('threejs-canvas');
    if (!container) return;

    // Inizializza scena usando SceneService
    const sceneSetup = this.sceneService.initScene(container);
    this.scene = sceneSetup.scene;
    this.camera = sceneSetup.camera;
    this.renderer = sceneSetup.renderer;

    this.animate();
  }

  private attack() {
    const room = this.colyseus.getRoom();
    if (!room) return;

    console.log('[BattlePage] Attack sent!');

    const myPlayerMesh = this.playerMeshes.get(this.myPlayerId);
    if (!myPlayerMesh) return;

    // Usa il WeaponHandlerFactory per ottenere l'handler appropriato
    const weaponHandler = WeaponHandlerFactory.createHandler(
      myPlayerMesh.weaponType,
      this.playerMeshService
    );

    weaponHandler.handleAttack(myPlayerMesh, room);
  }

  private updatePlayerInScene(sessionId: string, playerData: PlayerData) {
    // Se sono morto, NON ricreare il mio mesh - rimango in modalità spettatore
    if (sessionId === this.myPlayerId && this.isDead) {
      console.log('[BattlePage] [SPECTATOR] Skipping update for my dead character');
      return; // Ignora gli aggiornamenti del mio personaggio morto
    }
    
    // Se il giocatore non è vivo, non mostrarlo
    if (!playerData.isAlive) {
      // Rimuovi se esiste
      if (this.playerMeshes.has(sessionId)) {
        console.log('[BattlePage] Removing dead player:', playerData.name);
        this.playerMeshService.removePlayerFromScene(sessionId, this.playerMeshes, this.scene);
      }
      return;
    }
    
    let playerMesh = this.playerMeshes.get(sessionId);

    // Se il giocatore non esiste ancora, crealo usando PlayerMeshService
    if (!playerMesh) {
      const isMyPlayer = sessionId === this.myPlayerId;
      console.log('[BattlePage] Creating mesh for player:', playerData.name, 'isMyPlayer:', isMyPlayer);
      playerMesh = this.playerMeshService.createPlayerMesh(
        sessionId,
        playerData,
        isMyPlayer,
        this.scene
      );
      this.playerMeshes.set(sessionId, playerMesh);
      
      if (isMyPlayer) {
        this.myPlayer = playerMesh.mesh;
      }
    }

    // Aggiorna posizione
    if (playerData.position) {
      const newPosition = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y || 0,
        playerData.position.z
      );
      
      // Se è il mio giocatore: usa riconciliazione server
      if (sessionId === this.myPlayerId && !this.isDead) {
        const predictionError = this.inputService.reconcilePosition(
          playerMesh.mesh,
          newPosition
        );
        
        // Traccia errore di predizione per debug
        this.networkMetrics.recordPredictionError(predictionError);
      } else {
        // Altri giocatori: usa interpolazione
        this.interpolationService.addSnapshot(playerMesh.interpolationBuffer, {
          timestamp: Date.now(),
          position: newPosition,
          rotation: playerData.rotation || 0
        });
        
        // Aggiorna velocity per dead reckoning
        this.playerMeshService.updateVelocity(playerMesh, newPosition);
      }
      
      if (playerData.rotation !== undefined) {
        playerMesh.targetRotation = playerData.rotation;
      }
    }

    // Aggiorna barra vita usando PlayerMeshService
    if (playerData.hp !== undefined && playerData.maxHp !== undefined) {
      this.playerMeshService.updateHealthBar(playerMesh, playerData.hp / playerData.maxHp);
    }
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // Aggiorna metriche FPS
    this.networkMetrics.updateFrame();
    
    // Se sono morto, muovi il fantasma spettatore invece del player
    if (this.isDead && this.spectatorGhost) {
      // Movimento fantasma (non invia messaggi al server)
      this.updateSpectatorMovement(this.spectatorGhost);
    } else if (this.myPlayer && !this.isDead) {
      // Aggiorna movimento del giocatore normale (client-side prediction)
      const rotation = this.inputService.updatePlayerMovement(
        this.myPlayer,
        this.colyseus.getRoom()
      );

      // Se c'è stata rotazione, aggiorna il target rotation del mesh
      if (rotation !== null) {
        const myPlayerMesh = this.playerMeshes.get(this.myPlayerId);
        if (myPlayerMesh) {
          myPlayerMesh.targetRotation = rotation;
        }
      }
    }
    
    // Interpola posizione e rotazione per tutti i player (tranne il mio)
    let playersInterpolating = 0;
    this.playerMeshes.forEach((playerMesh, sessionId) => {
      // Per altri giocatori: usa interpolazione
      if (sessionId !== this.myPlayerId) {
        const interpolatedState = this.interpolationService.getInterpolatedState(
          playerMesh.interpolationBuffer
        );
        
        if (interpolatedState) {
          playerMesh.mesh.position.copy(interpolatedState.position);
          playerMesh.targetRotation = interpolatedState.rotation;
          playersInterpolating++;
        } else {
          // Nessun dato di interpolazione, prova dead reckoning
          const isExtrapolating = this.playerMeshService.applyDeadReckoning(playerMesh);
          this.playerMeshService.updateNameTagOpacity(playerMesh, isExtrapolating);
        }
      }
      
      // Interpola rotazione per tutti i player
      this.playerMeshService.interpolateRotation(playerMesh);
      
      // Aggiorna billboards
      this.playerMeshService.updateBillboards(playerMesh, this.camera);
    });
    
    // Aggiorna statistiche interpolazione
    this.networkMetrics.updateInterpolationStats(playersInterpolating, this.playerMeshes.size);
    
    // Aggiorna camera usando CameraService
    if (this.isDead && this.spectatorGhost) {
      // In modalità spettatore, segui il fantasma
      this.cameraService.updateThirdPersonCamera(this.camera, this.spectatorGhost);
    } else if (this.myPlayer) {
      // Modalità normale, segui il player
      this.cameraService.updateThirdPersonCamera(this.camera, this.myPlayer);
    }

    // Aggiorna statistiche per debug overlay
    if (this.showDebugOverlay) {
      this.networkStats = this.networkMetrics.getStats();
    }
    
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Aggiorna il movimento dello spettatore fantasma (senza inviare al server).
   */
  private updateSpectatorMovement(ghost: THREE.Group): void {
    const moveSpeed = 0.3; // Leggermente più veloce per lo spettatore
    const keys = (this.inputService as any).keys; // Accesso diretto ai tasti
    
    if (!keys) return;
    
    let moved = false;
    const movementVector = new THREE.Vector3(0, 0, 0);
    
    if (keys.w) {
      movementVector.z -= moveSpeed;
      moved = true;
    }
    if (keys.s) {
      movementVector.z += moveSpeed;
      moved = true;
    }
    if (keys.a) {
      movementVector.x -= moveSpeed;
      moved = true;
    }
    if (keys.d) {
      movementVector.x += moveSpeed;
      moved = true;
    }
    
    if (moved) {
      ghost.position.add(movementVector);
    }
  }

  /**
   * Applica o rimuove l'effetto scala di grigi al canvas.
   */
  private applyGrayscaleEffect(apply: boolean): void {
    const canvas = document.getElementById('threejs-canvas');
    if (canvas) {
      if (apply) {
        canvas.style.filter = 'grayscale(100%)';
      } else {
        canvas.style.filter = 'none';
      }
    }
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.sceneService.disposeRenderer(this.renderer);
    }
    // Pulisci tutti i proiettili
    if (this.scene) {
      this.sceneService.clearAllProjectiles(this.scene);
    }
    this.inputService.cleanup();
    WeaponHandlerFactory.cleanup();
  }
}
