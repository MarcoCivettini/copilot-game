import { Component, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-threejs-scene',
  template: '<div #rendererContainer class="threejs-canvas"></div>',
  styleUrls: ['./threejs-scene.component.scss']
})
export class ThreejsSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) rendererContainer!: ElementRef;
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private animationId?: number;

  ngAfterViewInit() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 30);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight * 0.7);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);

    // Luce base
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    this.scene.add(light);

    // Mappa circolare low-poly (placeholder)
    const geometry = new THREE.CircleGeometry(30, 32);
    const material = new THREE.MeshLambertMaterial({ color: 0x6ab04c, flatShading: true });
    const circle = new THREE.Mesh(geometry, material);
    circle.rotation.x = -Math.PI / 2;
    this.scene.add(circle);

    this.animate();
  }

  animate = () => {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
