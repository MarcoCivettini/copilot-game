import { Injectable } from '@angular/core';
import * as THREE from 'three';

/**
 * Service per la gestione della scena ThreeJS.
 * Gestisce scena, camera, renderer, luci e mappa.
 */
@Injectable({ providedIn: 'root' })
export class ThreeJsSceneService {
  private readonly MAP_RADIUS = 30;
  private projectileMeshes = new Map<string, THREE.Object3D>();

  /**
   * Inizializza la scena ThreeJS completa.
   */
  initScene(container: HTMLElement): {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  } {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const width = container.clientWidth;
    const height = container.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 20, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    this.addLights(scene);
    this.createMap(scene);

    return { scene, camera, renderer };
  }

  /**
   * Aggiunge le luci alla scena.
   */
  private addLights(scene: THREE.Scene): void {
    // Luce ambientale
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Luce direzionale con ombre
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
  }

  /**
   * Crea la mappa circolare.
   */
  private createMap(scene: THREE.Scene): void {
    // Mappa circolare
    const mapGeometry = new THREE.CircleGeometry(this.MAP_RADIUS, 64);
    const mapMaterial = new THREE.MeshStandardMaterial({
      color: 0x6ab04c,
      roughness: 0.8,
      metalness: 0.2
    });
    const map = new THREE.Mesh(mapGeometry, mapMaterial);
    map.rotation.x = -Math.PI / 2;
    map.receiveShadow = true;
    scene.add(map);

    // Bordo rosso del cerchio
    const edgeGeometry = new THREE.RingGeometry(
      this.MAP_RADIUS - 0.5,
      this.MAP_RADIUS,
      64
    );
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.1;
    scene.add(edge);
  }

  /**
   * Gestisce il ridimensionamento della finestra.
   */
  handleResize(
    container: HTMLElement,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer
  ): void {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  /**
   * Cleanup risorse ThreeJS.
   */
  disposeRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.dispose();
  }

  /**
   * Crea o aggiorna un proiettile nella scena.
   */
  updateProjectile(
    projectileId: string,
    position: { x: number; y: number; z: number },
    scene: THREE.Scene,
    direction?: { x: number; z: number }
  ): void {
    let projectileObj = this.projectileMeshes.get(projectileId);

    if (!projectileObj) {
      // Crea nuovo proiettile come freccia composta (shaft + head)
      const arrowGroup = new THREE.Group();

      // Shaft - cilindro sottile (legno)
      const shaftLength = 0.6;
      const shaftRadius = 0.03;
      const shaftGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
      const shaft = new THREE.Mesh(shaftGeom, shaftMat);
      shaft.castShadow = true;
      // Orienta il cilindro lungo l'asse Z (default cilindro lungo Y)
      shaft.rotation.x = Math.PI / 2;

      // Head - punta conica
      const headGeom = new THREE.ConeGeometry(0.06, 0.16, 8);
      const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.2 });
      const head = new THREE.Mesh(headGeom, headMat);
      head.castShadow = true;
      // Posiziona la punta all'estremità frontale dello shaft
      head.position.z = shaftLength / 2 + 0.08;
      head.rotation.x = Math.PI / 2;

      // Optional: piccole piume (semplice box) sul retro
      const featherGeom = new THREE.BoxGeometry(0.06, 0.02, 0.12);
      const featherMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const feather = new THREE.Mesh(featherGeom, featherMat);
      feather.position.z = -shaftLength / 2 - 0.04;
      feather.rotation.x = Math.PI / 2;

      arrowGroup.add(shaft);
      arrowGroup.add(head);
      arrowGroup.add(feather);

      // Scala complessiva: diametro totale ~0.12 -> compatibile con 0.3 diameter target
      arrowGroup.scale.set(0.5, 0.5, 0.5);

      projectileObj = arrowGroup;
      this.projectileMeshes.set(projectileId, projectileObj);
      scene.add(projectileObj);
    }

    // Aggiorna posizione
    projectileObj.position.set(position.x, position.y, position.z);

    // Orienta la freccia sulla base della direzione X/Z (server usa sin(rotation), cos(rotation))
    if (direction && (direction.x !== 0 || direction.z !== 0)) {
      const angleY = Math.atan2(direction.x, direction.z); // dx, dz -> rotation attorno a Y
      projectileObj.rotation.set(0, angleY, 0);
    }
  }

  /**
   * Rimuove un proiettile dalla scena.
   */
  removeProjectile(projectileId: string, scene: THREE.Scene): void {
    const projectileObj = this.projectileMeshes.get(projectileId);
    if (projectileObj) {
      // Rimuovi dall'albero
      scene.remove(projectileObj);

      // Dispose ricorsivo dei figli che siano mesh
      projectileObj.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          try {
            (child as THREE.Mesh).geometry.dispose();
          } catch (e) {
            // ignore
          }
        }
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach(m => m.dispose());
          } else {
            try {
              (mat as THREE.Material).dispose();
            } catch (e) {
              // ignore
            }
          }
        }
      });

      this.projectileMeshes.delete(projectileId);
    }
  }

  /**
   * Rimuove tutti i proiettili dalla scena.
   */
  clearAllProjectiles(scene: THREE.Scene): void {
    this.projectileMeshes.forEach((mesh, id) => {
      this.removeProjectile(id, scene);
    });
  }
}
