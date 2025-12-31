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
  weapon?: THREE.Mesh;
  weaponType: 'SWORD' | 'SPEAR' | 'BOW';
  swingTrail?: THREE.Mesh;
  isSwinging?: boolean;
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

    // Arma - gestisce weaponType con fallback
    const weaponType = playerData.weaponType || 'SWORD';
    let weapon: THREE.Mesh;
    
    if (weaponType === 'SWORD') {
      const swordGeometry = new THREE.BoxGeometry(0.15, 1.2, 0.05);
      // Sposta la geometria in modo che il pivot sia alla base (impugnatura)
      swordGeometry.translate(0, 0.6, 0); // Metà altezza (1.2 / 2 = 0.6)
      const swordMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
      weapon = new THREE.Mesh(swordGeometry, swordMaterial);
      // Posiziona a destra del personaggio, il pivot è ora alla base
      weapon.position.set(0.6, 0.3, 0); // Y più basso perché il pivot è alla base
      weapon.rotation.z = 0; // Dritta verticale
    } else if (weaponType === 'SPEAR') {
      const spearGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
      spearGeometry.translate(0, 0.75, 0);
      const spearMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
      weapon = new THREE.Mesh(spearGeometry, spearMaterial);
      weapon.position.set(0.6, 0.3, 0);
      weapon.rotation.z = 0;
    } else {
      // BOW
      const bowGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.3);
      bowGeometry.translate(0, 0.4, 0);
      const bowMaterial = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
      weapon = new THREE.Mesh(bowGeometry, bowMaterial);
      weapon.position.set(0.6, 0.3, 0);
    }
    weapon.castShadow = true;
    group.add(weapon);

    // Swing trail effect (solo per spada)
    let swingTrail: THREE.Mesh | undefined;
    if (weaponType === 'SWORD') {
      swingTrail = this.createSwingTrailEffect();
      swingTrail.visible = false;
      weapon.add(swingTrail);
    }

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
      playerData.position?.y || 0,
      playerData.position?.z || 0
    );

    scene.add(group);

    return {
      mesh: group,
      nameLabel,
      healthBar,
      targetRotation: playerData.rotation || 0,
      weapon,
      weaponType: weaponType,
      swingTrail,
      isSwinging: false
    };
  }

  /**
   * Crea l'effetto trail shader per lo swing della spada.
   */
  private createSwingTrailEffect(): THREE.Mesh {
    // Trail più lungo e orientato per swing orizzontale
    const trailGeometry = new THREE.PlaneGeometry(2.0, 0.4);
    
    // Shader personalizzato per effetto trail con gradiente animato
    const trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1.0 },
        uColor: { value: new THREE.Color(0x00ffff) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        
        void main() {
          // Gradiente lungo la spada
          float gradient = 1.0 - vUv.x;
          
          // Effetto shimmer animato
          float shimmer = sin(vUv.x * 10.0 - uTime * 15.0) * 0.5 + 0.5;
          
          // Alpha fade verso i bordi
          float alpha = gradient * uOpacity * (1.0 - abs(vUv.y - 0.5) * 2.0);
          alpha *= (0.7 + shimmer * 0.3);
          
          // Colore con effetto glow
          vec3 finalColor = uColor + vec3(shimmer * 0.3);
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    // Posiziona il trail lungo la spada, orientato orizzontalmente
    trail.position.set(0, 0.2, 0);
    trail.rotation.x = Math.PI / 2; // Ruota per essere orizzontale durante lo swing
    
    return trail;
  }

  /**
   * Anima lo swing della spada con effetto trail visivo.
   * Ritorna la durata dell'animazione in ms.
   * @param onSwingUpdate callback opzionale chiamato ad ogni frame con le posizioni dell'arma
   */
  playSwordSwing(
    playerMesh: PlayerMesh,
    onSwingUpdate?: (tipPosition: THREE.Vector3, basePosition: THREE.Vector3) => void
  ): number {
    if (playerMesh.weaponType !== 'SWORD' || !playerMesh.weapon || playerMesh.isSwinging) {
      return 0;
    }

    playerMesh.isSwinging = true;
    const weapon = playerMesh.weapon;
    const swingTrail = playerMesh.swingTrail;

    // Salva posizione e rotazione iniziali (nello spazio locale del player)
    const startRotationY = weapon.rotation.y;
    const startRotationZ = weapon.rotation.z;
    const startRotationX = weapon.rotation.x;
    const startPositionX = weapon.position.x;
    const startPositionY = weapon.position.y;
    const startPositionZ = weapon.position.z;

    // Parametri animazione - swing orizzontale da destra a sinistra nello spazio locale
    const swingDuration = 400; // ms
    const startTime = Date.now();

    // Mostra trail
    if (swingTrail) {
      swingTrail.visible = true;
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / swingDuration, 1);

      // Easing out cubic per movimento naturale
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      // La spada ruota attorno all'impugnatura
      // L'impugnatura si sposta leggermente in avanti durante il colpo
      weapon.position.x = startPositionX;
      weapon.position.y = startPositionY;
      // Movimento in avanti dell'impugnatura (max al centro del colpo)
      weapon.position.z = startPositionZ + (Math.sin(progress * Math.PI) * 0.4);

      // Rotazione Z: da verticale (0°) a orizzontale (-90°)
      // La punta parte in alto a destra e finisce a metà altezza del personaggio a sinistra
      const tiltAngle = easeProgress * (-Math.PI / 2); // -90° per finire orizzontale a metà altezza
      weapon.rotation.z = startRotationZ + tiltAngle;
      
      // Rotazione Y: attraversa completamente da destra a sinistra (-180°)
      // La spada passa davanti al personaggio e finisce dall'altra parte
      const forwardSwing = easeProgress * (-Math.PI); // -180° per attraversare completamente
      weapon.rotation.y = startRotationY + forwardSwing;
      
      // Rotazione X: inclina la spada verso l'esterno (in fuori dal personaggio)
      // Piccola inclinazione verso l'esterno al centro dell'animazione (~-1.8°)
      const depthRotation = Math.sin(progress * Math.PI) * (-Math.PI / 100);
      weapon.rotation.x = startRotationX + depthRotation;

      // Aggiorna shader del trail
      if (swingTrail) {
        const material = swingTrail.material as THREE.ShaderMaterial;
        material.uniforms['uTime'].value = elapsed / 1000;
        material.uniforms['uOpacity'].value = Math.sin(progress * Math.PI);
        
        // Aggiorna rotazione del trail per seguire la spada in tutte le direzioni
        // Il trail deve seguire l'orientamento della lama durante il fendente
        
        // Rotazione X del trail: segue l'inclinazione in fuori della spada
        swingTrail.rotation.x = Math.PI / 2 + depthRotation * 0.8;
        
        // Rotazione Y del trail: segue l'attraversamento orizzontale
        swingTrail.rotation.y = forwardSwing * 0.6;
        
        // Rotazione Z del trail: segue l'inclinazione verticale della spada
        swingTrail.rotation.z = tiltAngle * 0.5;
      }

      // Callback per inviare le posizioni dell'arma al server per collision detection
      if (onSwingUpdate && playerMesh.weapon) {
        // IMPORTANTE: Aggiorna tutte le matrici world dalla radice
        playerMesh.mesh.updateMatrixWorld(true);
        playerMesh.weapon.updateMatrixWorld(true);
        
        const tipPos = this.getWeaponTipWorldPosition(playerMesh);
        const basePos = this.getWeaponBaseWorldPosition(playerMesh);
        if (tipPos && basePos) {
          onSwingUpdate(tipPos, basePos);
        }
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Reset finale
        weapon.rotation.y = startRotationY;
        weapon.rotation.z = startRotationZ;
        weapon.rotation.x = startRotationX;
        weapon.position.x = startPositionX;
        weapon.position.y = startPositionY;
        weapon.position.z = startPositionZ;
        if (swingTrail) {
          swingTrail.visible = false;
          // Reset rotazione trail
          swingTrail.rotation.x = Math.PI / 2;
          swingTrail.rotation.y = 0;
          swingTrail.rotation.z = 0;
        }
        playerMesh.isSwinging = false;
      }
    };

    animate();
    return swingDuration;
  }

  /**
   * Calcola la posizione world della punta dell'arma.
   * Usato per collision detection precisa durante l'animazione.
   */
  getWeaponTipWorldPosition(playerMesh: PlayerMesh): THREE.Vector3 | null {
    if (!playerMesh.weapon) return null;

    // La punta dell'arma è a y = 1.2 (lunghezza spada) dalla base (pivot)
    // nel sistema di coordinate locale dell'arma
    const tipLocalPosition = new THREE.Vector3(0, 1.2, 0);
    
    // Converte in coordinate world applicando tutte le trasformazioni
    const tipWorldPosition = tipLocalPosition.clone();
    playerMesh.weapon.localToWorld(tipWorldPosition);
    
    return tipWorldPosition;
  }

  /**
   * Calcola la posizione world della base dell'arma (impugnatura).
   */
  getWeaponBaseWorldPosition(playerMesh: PlayerMesh): THREE.Vector3 | null {
    if (!playerMesh.weapon) return null;

    // La base è all'origine del sistema locale dell'arma (pivot point)
    const baseLocalPosition = new THREE.Vector3(0, 0, 0);
    const baseWorldPosition = baseLocalPosition.clone();
    playerMesh.weapon.localToWorld(baseWorldPosition);
    
    return baseWorldPosition;
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
    const lerpFactor = 0.18; // Ridotto per maggiore fluidità
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
