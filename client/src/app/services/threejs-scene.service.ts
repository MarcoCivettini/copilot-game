import { Injectable } from '@angular/core';
import * as THREE from 'three';

/**
 * Service per la gestione della scena ThreeJS.
 * Gestisce scena, camera, renderer, luci e mappa.
 */
@Injectable({ providedIn: 'root' })
export class ThreeJsSceneService {
  private readonly MAP_RADIUS = 30;

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
}
