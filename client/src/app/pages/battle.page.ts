import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ColyseusService } from '../services/colyseus.service';
import * as THREE from 'three';

interface PlayerMesh {
  mesh: THREE.Group;
  nameLabel: THREE.Sprite;
  healthBar: THREE.Mesh;
}

interface PlayerData {
  sessionId: string;
  name: string;
  weaponType: 'SWORD' | 'SPEAR' | 'BOW';
  position: { x: number; y: number; z: number };
  rotation: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
}

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

  // ThreeJS
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationId?: number;
  
  // Giocatori nella scena
  private playerMeshes = new Map<string, PlayerMesh>();
  private myPlayer?: THREE.Group;

  // Controlli
  private keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
  };

  private moveSpeed = 0.2;
  private readonly MAP_RADIUS = 30;

  constructor(private colyseus: ColyseusService, private router: Router) {}

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
      console.log('[BattlePage] Received player list:', data.players);
      this.players = data.players;

      // Aggiorna ogni player nella scena
      data.players.forEach(player => {
        this.updatePlayerInScene(player.sessionId, player);
      });

      // Rimuovi player che non sono più nella lista
      const currentPlayerIds = new Set(data.players.map(p => p.sessionId));
      this.playerMeshes.forEach((mesh, sessionId) => {
        if (!currentPlayerIds.has(sessionId)) {
          this.removePlayerFromScene(sessionId);
        }
      });
    });

    // Ascolta attacchi
    room.onMessage('playerAttacked', (data: { attackerId: string, targetId: string, damage: number }) => {
      console.log('[BattlePage] Attack:', data);
      // TODO: Mostra effetto visivo dell'attacco
    });

    // Ascolta eliminazioni
    room.onMessage('playerEliminated', (data: { playerId: string, killerId: string }) => {
      console.log('[BattlePage] Player eliminated:', data);
      this.removePlayerFromScene(data.playerId);
    });

    // Ascolta fine partita
    room.onMessage('gameOver', (data: { winner: string }) => {
      this.isGameOver = true;
      this.winner = data.winner;
      setTimeout(() => this.router.navigate(['/']), 10000);
    });

    // Setup controlli tastiera
    this.setupKeyboardControls();
  }

  ngAfterViewInit() {
    this.initThreeJS();
    this.animate();
  }

  private setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w') this.keys.w = true;
      if (key === 'a') this.keys.a = true;
      if (key === 's') this.keys.s = true;
      if (key === 'd') this.keys.d = true;
      if (key === ' ') {
        this.keys.space = true;
        this.attack();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w') this.keys.w = false;
      if (key === 'a') this.keys.a = false;
      if (key === 's') this.keys.s = false;
      if (key === 'd') this.keys.d = false;
      if (key === ' ') this.keys.space = false;
    });
  }

  private updatePlayerMovement() {
    if (!this.myPlayer) return;

    const room = this.colyseus.getRoom();
    if (!room) return;

    let moved = false;
    const newPosition = this.myPlayer.position.clone();

    if (this.keys.w) {
      newPosition.z -= this.moveSpeed;
      moved = true;
    }
    if (this.keys.s) {
      newPosition.z += this.moveSpeed;
      moved = true;
    }
    if (this.keys.a) {
      newPosition.x -= this.moveSpeed;
      moved = true;
    }
    if (this.keys.d) {
      newPosition.x += this.moveSpeed;
      moved = true;
    }

    // Verifica che il giocatore rimanga dentro il cerchio
    const distance = Math.sqrt(newPosition.x ** 2 + newPosition.z ** 2);
    if (distance <= this.MAP_RADIUS - 1) {
      this.myPlayer.position.copy(newPosition);
      
      // Invia la posizione al server
      if (moved) {
        room.send('playerMove', {
          x: newPosition.x,
          z: newPosition.z,
          rotation: 0
        });
      }
    }
  }

  private attack() {
    const room = this.colyseus.getRoom();
    if (room) {
      room.send('playerAttack', {
        timestamp: Date.now()
      });
      console.log('[BattlePage] Attack sent!');
    }
  }

  private updatePlayerInScene(sessionId: string, playerData: PlayerData) {
    let playerMesh = this.playerMeshes.get(sessionId);

    // Se il giocatore non esiste ancora nella scena, crealo
    if (!playerMesh) {
      playerMesh = this.createPlayerMesh(sessionId, playerData);
      this.playerMeshes.set(sessionId, playerMesh);
      
      if (sessionId === this.myPlayerId) {
        this.myPlayer = playerMesh.mesh;
      }
    }

    // Aggiorna posizione solo se non è il mio giocatore (il mio si muove con i tasti)
    if (sessionId !== this.myPlayerId && playerData.position) {
      playerMesh.mesh.position.set(
        playerData.position.x, 
        playerData.position.y || 1, 
        playerData.position.z
      );
    }

    // Aggiorna barra vita
    if (playerData.hp !== undefined && playerData.maxHp !== undefined) {
      this.updateHealthBar(playerMesh, playerData.hp / playerData.maxHp);
    }
  }

  private createPlayerMesh(sessionId: string, playerData: PlayerData): PlayerMesh {
    const group = new THREE.Group();

    // Corpo del giocatore (cubo)
    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const isMyPlayer = sessionId === this.myPlayerId;
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: isMyPlayer ? 0x0066ff : 0xff6600
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // Arma (placeholder - cubo piccolo)
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
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText(playerData.name || 'Player', 128, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const nameLabel = new THREE.Sprite(spriteMaterial);
    nameLabel.position.set(0, 3, 0);
    nameLabel.scale.set(2, 0.5, 1);
    group.add(nameLabel);

    // Posizione iniziale
    group.position.set(
      playerData.position?.x || 0,
      playerData.position?.y || 1,
      playerData.position?.z || 0
    );

    this.scene.add(group);

    return { mesh: group, nameLabel, healthBar };
  }

  private updateHealthBar(playerMesh: PlayerMesh, healthPercent: number) {
    playerMesh.healthBar.scale.x = healthPercent;
    
    // Cambia colore da verde a rosso
    const color = healthPercent > 0.5 ? 0x00ff00 : 0xff0000;
    (playerMesh.healthBar.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  private removePlayerFromScene(sessionId: string) {
    const playerMesh = this.playerMeshes.get(sessionId);
    if (playerMesh) {
      this.scene.remove(playerMesh.mesh);
      this.playerMeshes.delete(sessionId);
    }
  }

  private initThreeJS() {
    // Scena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Cielo azzurro

    // Camera
    const container = document.getElementById('threejs-canvas');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 20, 40);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Luce ambientale
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Luce direzionale con ombre
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    this.scene.add(directionalLight);

    // Mappa circolare (raggio 30)
    const mapGeometry = new THREE.CircleGeometry(this.MAP_RADIUS, 64);
    const mapMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x6ab04c,
      roughness: 0.8,
      metalness: 0.2
    });
    const map = new THREE.Mesh(mapGeometry, mapMaterial);
    map.rotation.x = -Math.PI / 2;
    map.receiveShadow = true;
    this.scene.add(map);

    // Bordo del cerchio
    const edgeGeometry = new THREE.RingGeometry(this.MAP_RADIUS - 0.5, this.MAP_RADIUS, 64);
    const edgeMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      side: THREE.DoubleSide
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.1;
    this.scene.add(edge);

    // Handle resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private onWindowResize() {
    const container = document.getElementById('threejs-canvas');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // Aggiorna movimento del giocatore
    this.updatePlayerMovement();
    
    // Aggiorna camera per seguire il giocatore
    if (this.myPlayer) {
      this.camera.position.x = this.myPlayer.position.x;
      this.camera.position.z = this.myPlayer.position.z + 15;
      this.camera.lookAt(this.myPlayer.position);
    }
    
    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    window.removeEventListener('keydown', () => {});
    window.removeEventListener('keyup', () => {});
  }
}
