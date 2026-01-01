import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { PositionSnapshot } from './interpolation.service';

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
  
  // Interpolation support
  interpolationBuffer: PositionSnapshot[];
  
  // Dead reckoning support
  lastKnownVelocity: THREE.Vector3;
  lastUpdateTime: number;
  isExtrapolating: boolean;
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
      // Crea un gruppo per la spada composita
      weapon = new THREE.Mesh();
      
      // 1. Manico (handle) - marrone
      const handleGeometry = new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8);
      handleGeometry.translate(0, 0.125, 0); // Pivot alla base
      const handleMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x5d4037, // Marrone scuro
        roughness: 0.8
      });
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.castShadow = true;
      weapon.add(handle);
      
      // 2. Guardia (crossguard) - grigia scura
      const guardGeometry = new THREE.BoxGeometry(0.3, 0.04, 0.08);
      guardGeometry.translate(0, 0.27, 0); // Appena sopra il manico
      const guardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a3a3a, // Grigio scuro
        metalness: 0.7,
        roughness: 0.3
      });
      const guard = new THREE.Mesh(guardGeometry, guardMaterial);
      guard.castShadow = true;
      weapon.add(guard);
      
      // 3. Base della lama (blade base) - argentata
      const bladeBaseGeometry = new THREE.BoxGeometry(0.08, 0.7, 0.04);
      bladeBaseGeometry.translate(0, 0.65, 0); // Sopra la guardia
      const bladeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xc0c0c0, // Argento
        metalness: 0.9,
        roughness: 0.1
      });
      const bladeBase = new THREE.Mesh(bladeBaseGeometry, bladeMaterial);
      bladeBase.castShadow = true;
      weapon.add(bladeBase);
      
      // 4. Punta della lama (blade tip) - piramidale
      const tipGeometry = new THREE.ConeGeometry(0.04, 0.2, 4);
      tipGeometry.rotateY(Math.PI / 4); // Ruota di 45° per allineare gli spigoli
      tipGeometry.translate(0, 1.1, 0); // In cima alla lama
      const tip = new THREE.Mesh(tipGeometry, bladeMaterial);
      tip.castShadow = true;
      weapon.add(tip);
      
      // Posiziona a destra del personaggio, il pivot è alla base
      weapon.position.set(0.6, 0.3, 0);
      weapon.rotation.z = 0; // Dritta verticale
    } else if (weaponType === 'SPEAR') {
      // Gruppo per cilindro + punta
      weapon = new THREE.Mesh();
      
      // Cilindro marrone lungo 2
      const shaftGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8);
      // Trasla geometria per avere pivot alla base
      shaftGeometry.translate(0, 1.0, 0); // Metà lunghezza (2.0 / 2 = 1.0)
      const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 }); // Marrone
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
      shaft.castShadow = true;
      
      // Punta conica
      const tipGeometry = new THREE.ConeGeometry(0.08, 0.3, 8);
      tipGeometry.translate(0, 2.15, 0); // Posiziona in cima al cilindro (2.0 + 0.15)
      const tipMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
      const tip = new THREE.Mesh(tipGeometry, tipMaterial);
      tip.castShadow = true;
      
      // Aggiungi entrambi al gruppo weapon
      weapon.add(shaft);
      weapon.add(tip);
      
      // Posiziona a destra del personaggio come la spada
      weapon.position.set(0.6, 1.0, 0);
      weapon.rotation.z = Math.PI / 2; // Ruota per renderla orizzontale
      weapon.rotation.y = -Math.PI / 2; // Punta in avanti (-90 gradi)
      weapon.rotation.x = Math.PI; // Flip di 180 gradi
    } else {
      // BOW - Arco curvo con filo
      weapon = new THREE.Mesh();
      
      // 1. Arco curvo (cilindro marrone piegato)
      const bowCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),      // Base in basso
        new THREE.Vector3(0.15, 0.3, 0), // Curva esterna
        new THREE.Vector3(0.15, 0.6, 0), // Curva esterna
        new THREE.Vector3(0, 0.9, 0)     // Punta in alto
      ]);
      
      const bowGeometry = new THREE.TubeGeometry(bowCurve, 20, 0.04, 8, false);
      const bowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x5d4037, // Marrone scuro (legno)
        roughness: 0.8 
      });
      const bowMesh = new THREE.Mesh(bowGeometry, bowMaterial);
      bowMesh.castShadow = true;
      weapon.add(bowMesh);
      
      // 2. Filo grigio (linea sottile che congiunge le estremità)
      const stringGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),   // Base
        new THREE.Vector3(0, 0.9, 0)  // Punta
      ]);
      const stringMaterial = new THREE.LineBasicMaterial({ 
        color: 0x888888, // Grigio
        linewidth: 1 
      });
      const bowString = new THREE.Line(stringGeometry, stringMaterial);
      weapon.add(bowString);
      
      // Posizione idle: a lato del personaggio, perpendicolare (come spada/lancia)
      weapon.position.set(0.6, 0.3, 0);
      weapon.rotation.z = 0; // Verticale
    }
    weapon.castShadow = true;
    group.add(weapon);

    // Swing trail effect (per spada e lancia)
    let swingTrail: THREE.Mesh | undefined;
    if (weaponType === 'SWORD') {
      swingTrail = this.createSwingTrailEffect();
      swingTrail.visible = false;
      weapon.add(swingTrail);
    } else if (weaponType === 'SPEAR') {
      swingTrail = this.createSpearTrailEffect();
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
      isSwinging: false,
      interpolationBuffer: [],
      lastKnownVelocity: new THREE.Vector3(0, 0, 0),
      lastUpdateTime: Date.now(),
      isExtrapolating: false
    };
  }

  /**
   * Crea l'effetto trail verde per la lancia durante il thrust.
   */
  private createSpearTrailEffect(): THREE.Mesh {
    // Trail lungo tutta la lancia (2.3 per coprire cilindro + punta)
    const trailGeometry = new THREE.PlaneGeometry(2.3, 0.25);
    
    // Shader con colore verde
    const trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1.0 },
        uColor: { value: new THREE.Color(0x00ff00) } // Verde
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
          // Gradiente lungo la lancia
          float gradient = 1.0 - vUv.x;
          
          // Effetto shimmer animato
          float shimmer = sin(vUv.x * 12.0 - uTime * 20.0) * 0.5 + 0.5;
          
          // Alpha fade verso i bordi
          float alpha = gradient * uOpacity * (1.0 - abs(vUv.y - 0.5) * 2.0);
          alpha *= (0.8 + shimmer * 0.2);
          
          // Colore verde con effetto glow
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
    // Posiziona il trail lungo la lancia
    trail.position.set(0, 1.15, 0); // Centro della lancia
    trail.rotation.z = Math.PI / 2; // Allinea con la lancia orizzontale
    
    return trail;
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
   * Anima il thrust (affondo) della lancia con effetto trail verde.
   * La lancia si muove in avanti di circa 0.5 unità.
   * @param onThrustUpdate callback opzionale chiamato ad ogni frame con le posizioni dell'arma
   */
  playSpearThrust(
    playerMesh: PlayerMesh,
    onThrustUpdate?: (tipPosition: THREE.Vector3, basePosition: THREE.Vector3) => void
  ): number {
    if (playerMesh.weaponType !== 'SPEAR' || !playerMesh.weapon || playerMesh.isSwinging) {
      return 0;
    }

    playerMesh.isSwinging = true;
    const weapon = playerMesh.weapon;
    const swingTrail = playerMesh.swingTrail;

    // Salva posizione e rotazione iniziali
    const startPositionX = weapon.position.x;
    const startPositionY = weapon.position.y;
    const startPositionZ = weapon.position.z;

    // Parametri animazione - thrust in avanti
    const thrustDuration = 300; // ms
    const thrustDistance = 0.5; // Distanza di thrust
    const startTime = Date.now();

    // Mostra trail verde
    if (swingTrail) {
      swingTrail.visible = true;
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / thrustDuration, 1);

      // Easing: veloce all'inizio, rallenta alla fine (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 2);

      // Thrust in avanti lungo l'asse Z locale
      // Animazione: va avanti e poi torna indietro
      let thrustOffset;
      if (progress < 0.6) {
        // Fase di thrust in avanti (60% del tempo)
        thrustOffset = (progress / 0.6) * thrustDistance;
      } else {
        // Fase di ritorno (40% del tempo)
        const returnProgress = (progress - 0.6) / 0.4;
        thrustOffset = thrustDistance * (1 - returnProgress);
      }

      weapon.position.z = startPositionZ + thrustOffset;

      // Aggiorna shader del trail
      if (swingTrail) {
        const material = swingTrail.material as THREE.ShaderMaterial;
        material.uniforms['uTime'].value = elapsed / 1000;
        // Opacità aumenta rapidamente e poi decade
        material.uniforms['uOpacity'].value = Math.sin(progress * Math.PI);
      }

      // Callback per inviare le posizioni dell'arma al server per collision detection
      if (onThrustUpdate && playerMesh.weapon) {
        playerMesh.mesh.updateMatrixWorld(true);
        playerMesh.weapon.updateMatrixWorld(true);
        
        const tipPos = this.getSpearTipWorldPosition(playerMesh);
        const basePos = this.getWeaponBaseWorldPosition(playerMesh);
        if (tipPos && basePos) {
          onThrustUpdate(tipPos, basePos);
        }
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Reset finale
        weapon.position.x = startPositionX;
        weapon.position.y = startPositionY;
        weapon.position.z = startPositionZ;
        if (swingTrail) {
          swingTrail.visible = false;
        }
        playerMesh.isSwinging = false;
      }
    };

    animate();
    return thrustDuration;
  }

  /**
   * Anima il tiro con l'arco.
   * L'arco si sposta al centro e davanti al personaggio, ruota parallelamente al corpo.
   * @param onShoot callback chiamato quando il proiettile deve essere sparato
   */
  playBowShot(
    playerMesh: PlayerMesh,
    onShoot?: () => void
  ): number {
    if (playerMesh.weaponType !== 'BOW' || !playerMesh.weapon || playerMesh.isSwinging) {
      return 0;
    }

    playerMesh.isSwinging = true;
    const weapon = playerMesh.weapon;

    // Salva posizione e rotazione iniziali
    const startPositionX = weapon.position.x;
    const startPositionY = weapon.position.y;
    const startPositionZ = weapon.position.z;
    const startRotationY = weapon.rotation.y;
    const startRotationZ = weapon.rotation.z;

    // Parametri animazione
    const drawDuration = 250; // ms - fase di caricamento
    const releaseDuration = 150; // ms - fase di rilascio
    const totalDuration = drawDuration + releaseDuration;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      if (progress < drawDuration / totalDuration) {
        // FASE 1: Caricamento (draw) - sposta al centro e davanti
        const drawProgress = (elapsed / drawDuration);
        const easeProgress = 1 - Math.pow(1 - drawProgress, 2); // ease-out

        // Rotazione: da verticale (0°) a orizzontale parallela al corpo (-90°)
        weapon.rotation.z = startRotationZ - (easeProgress * Math.PI / 2);
        
        // Posizione: dal lato (0.6, 0.3, 0) al centro davanti (0, 1.2, 0.3)
        weapon.position.x = startPositionX - (easeProgress * 0.6); // Al centro
        weapon.position.y = startPositionY + (easeProgress * 0.9); // Più in alto
        weapon.position.z = startPositionZ + (easeProgress * 0.3); // Davanti
      } else {
        // FASE 2: Rilascio (release)
        const releaseProgress = (elapsed - drawDuration) / releaseDuration;
        
        // Piccolo movimento in avanti al rilascio
        weapon.position.z = startPositionZ + 0.3 + (releaseProgress * 0.1);
        
        // Callback per sparare il proiettile a metà del rilascio
        if (releaseProgress > 0.3 && releaseProgress < 0.5 && onShoot) {
          onShoot();
          onShoot = undefined; // Spara solo una volta
        }
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Reset finale
        weapon.position.x = startPositionX;
        weapon.position.y = startPositionY;
        weapon.position.z = startPositionZ;
        weapon.rotation.y = startRotationY;
        weapon.rotation.z = startRotationZ;
        playerMesh.isSwinging = false;
      }
    };

    animate();
    return totalDuration;
  }

  /**
   * Calcola la posizione world della punta della lancia.
   */
  getSpearTipWorldPosition(playerMesh: PlayerMesh): THREE.Vector3 | null {
    if (!playerMesh.weapon) return null;

    // La punta della lancia è a y = 2.3 (lunghezza totale con cono) dalla base
    const tipLocalPosition = new THREE.Vector3(0, 2.3, 0);
    
    const tipWorldPosition = tipLocalPosition.clone();
    playerMesh.weapon.localToWorld(tipWorldPosition);
    
    return tipWorldPosition;
  }

  /**
   * Calcola la posizione world della punta dell'arma.
   * Usato per collision detection precisa durante l'animazione.
   */
  getWeaponTipWorldPosition(playerMesh: PlayerMesh): THREE.Vector3 | null {
    if (!playerMesh.weapon) return null;

    if (playerMesh.weaponType === 'SPEAR') {
      return this.getSpearTipWorldPosition(playerMesh);
    }

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
    const lerpFactor = 0.18;
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

  /**
   * Aggiorna velocity tracking per dead reckoning.
   * Chiamato quando ricevi update dal server.
   */
  updateVelocity(playerMesh: PlayerMesh, newPosition: THREE.Vector3): void {
    const oldPosition = playerMesh.mesh.position;
    const timeDelta = (Date.now() - playerMesh.lastUpdateTime) / 1000;
    
    if (timeDelta > 0) {
      // Calcola velocità basata su spostamento
      playerMesh.lastKnownVelocity.copy(newPosition).sub(oldPosition).divideScalar(timeDelta);
    }
    
    playerMesh.lastUpdateTime = Date.now();
    playerMesh.isExtrapolating = false;
  }

  /**
   * Applica dead reckoning se non riceviamo update da tempo.
   * Ritorna true se è in extrapolation.
   */
  applyDeadReckoning(playerMesh: PlayerMesh): boolean {
    const timeSinceUpdate = Date.now() - playerMesh.lastUpdateTime;
    const EXTRAPOLATION_THRESHOLD = 150; // ms
    const MAX_EXTRAPOLATION_TIME = 500; // ms
    
    if (timeSinceUpdate > EXTRAPOLATION_THRESHOLD && timeSinceUpdate < MAX_EXTRAPOLATION_TIME) {
      playerMesh.isExtrapolating = true;
      
      // Predici posizione basata su velocità
      const deltaTime = timeSinceUpdate / 1000;
      const predictedPosition = playerMesh.mesh.position.clone()
        .add(playerMesh.lastKnownVelocity.clone().multiplyScalar(deltaTime * 0.1));
      
      // Applica predizione con damping
      playerMesh.mesh.position.lerp(predictedPosition, 0.05);
      
      return true;
    }
    
    return false;
  }

  /**
   * Aggiorna opacity del nameTag basato su stato extrapolation.
   */
  updateNameTagOpacity(playerMesh: PlayerMesh, isExtrapolating: boolean): void {
    playerMesh.nameLabel.material.opacity = isExtrapolating ? 0.5 : 1.0;
    playerMesh.nameLabel.material.transparent = true;
  }
}
