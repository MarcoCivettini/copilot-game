import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ColyseusService } from '../services/colyseus.service';
import { ThreeJsSceneService } from '../services/threejs-scene.service';
import { PlayerMeshService, PlayerData, PlayerMesh } from '../services/player-mesh.service';
import { InputService } from '../services/input.service';
import { CameraService } from '../services/camera.service';
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

  constructor(
    private colyseus: ColyseusService,
    private router: Router,
    private sceneService: ThreeJsSceneService,
    private playerMeshService: PlayerMeshService,
    private inputService: InputService,
    private cameraService: CameraService
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
      this.playerMeshService.removePlayerFromScene(data.playerId, this.playerMeshes, this.scene);
    });

    // Ascolta fine partita
    room.onMessage('gameOver', (data: { winner: string }) => {
      this.isGameOver = true;
      this.winner = data.winner;
      setTimeout(() => this.router.navigate(['/']), 10000);
    });

    // Setup controlli tastiera usando InputService
    this.inputService.setupKeyboardControls(() => this.attack());
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
    if (room) {
      console.log('[BattlePage] Attack sent!');

      // Anima lo swing della spada se il giocatore ha la spada
      const myPlayerMesh = this.playerMeshes.get(this.myPlayerId);
      
      if (myPlayerMesh) {
        if (myPlayerMesh.weaponType === 'SWORD') {
          // Invia continuamente le posizioni dell'arma durante l'animazione
          this.playerMeshService.playSwordSwing(myPlayerMesh, (tipPos, basePos) => {
            room.send('weaponSwing', {
              tipPosition: { x: tipPos.x, y: tipPos.y, z: tipPos.z },
              basePosition: { x: basePos.x, y: basePos.y, z: basePos.z },
              timestamp: Date.now()
            });
          });
        } else {
          // Per altre armi, invia attacco semplice
          room.send('playerAttack', { timestamp: Date.now() });
        }
      }
    }
  }

  private updatePlayerInScene(sessionId: string, playerData: PlayerData) {
    let playerMesh = this.playerMeshes.get(sessionId);

    // Se il giocatore non esiste ancora, crealo usando PlayerMeshService
    if (!playerMesh) {
      const isMyPlayer = sessionId === this.myPlayerId;
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

    // Aggiorna posizione solo se non è il mio giocatore
    if (sessionId !== this.myPlayerId && playerData.position) {
      playerMesh.mesh.position.set(
        playerData.position.x, 
        playerData.position.y || 1, 
        playerData.position.z
      );
      
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
    
    // Aggiorna movimento del giocatore usando InputService
    if (this.myPlayer) {
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
    
    // Interpola rotazione e aggiorna billboards per tutti i player
    this.playerMeshes.forEach((playerMesh) => {
      this.playerMeshService.interpolateRotation(playerMesh);
      this.playerMeshService.updateBillboards(playerMesh, this.camera);
    });
    
    // Aggiorna camera usando CameraService
    if (this.myPlayer) {
      this.cameraService.updateThirdPersonCamera(this.camera, this.myPlayer);
    }
    
    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.sceneService.disposeRenderer(this.renderer);
    }
    this.inputService.cleanup();
  }
}
