import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class ParticlesSwarm {
    constructor(container, count = 12000) {
        this.count = count;
        this.container = container;

        // Her el: 21 landmark world-pos + tema + boyut
        this.hands = [
            { points: null, theme: 'water', size: 10, active: false },
            { points: null, theme: 'fire',  size: 10, active: false },
        ];
        // Yumuşatılmış kopyalar
        this.smoothPoints = [
            Array.from({length: 21}, () => new THREE.Vector3()),
            Array.from({length: 21}, () => new THREE.Vector3()),
        ];
        this.smoothInit = [false, false];

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 100);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.3, 0.85);
        this.composer.addPass(bloomPass);

        this.dummy = new THREE.Object3D();
        this.color = new THREE.Color();
        this.target = new THREE.Vector3();
        this.pColor = new THREE.Color();

        this.geometry = new THREE.SphereGeometry(0.28, 6, 6);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.mesh);

        // Her partikülün rastgele faz, hız, landmark indexi
        this.pData = new Array(this.count);
        for (let i = 0; i < this.count; i++) {
            this.pData[i] = {
                lmIdx: Math.floor(Math.random() * 21),
                phase: Math.random() * Math.PI * 2,
                speed: 0.6 + Math.random() * 0.9,
                offX: (Math.random() - 0.5),
                offZ: (Math.random() - 0.5),
                life: Math.random(),
            };
        }

        this.positions = [];
        for (let i = 0; i < this.count; i++) {
            this.positions.push(new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50));
            this.mesh.setColorAt(i, this.color.setHex(0xffffff));
        }

        this.clock = new THREE.Clock();
        this.lastT = 0;
        this.animate = this.animate.bind(this);
        this.animate();
    }

    setHeart(c) { this.heartCenter = c; } // {x,y,z} ya da null

    /** handsData = [{points, theme, size, label?, labelPoints?}, ...] */
    setHands(handsData) {
        for (let h = 0; h < this.hands.length; h++) {
            if (handsData[h]) {
                const d = handsData[h];
                this.hands[h].points = d.points;
                this.hands[h].theme = d.theme;
                this.hands[h].size = d.size;
                this.hands[h].label = d.label || null;
                this.hands[h].labelPoints = d.labelPoints || null;
                this.hands[h].active = true;

                // Yumuşatma
                const sp = this.smoothPoints[h];
                if (!this.smoothInit[h]) {
                    for (let k = 0; k < 21; k++) sp[k].set(d.points[k].x, d.points[k].y, d.points[k].z);
                    this.smoothInit[h] = true;
                } else {
                    for (let k = 0; k < 21; k++) sp[k].lerp(d.points[k], 0.45);
                }
            } else {
                this.hands[h].active = false;
                this.smoothInit[h] = false;
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        const time = this.clock.getElapsedTime();
        const dt = Math.min(0.05, time - this.lastT);
        this.lastT = time;

        const activeIdx = [];
        for (let h = 0; h < this.hands.length; h++) if (this.hands[h].active) activeIdx.push(h);

        const hasHand = activeIdx.length > 0;

        for (let i = 0; i < this.count; i++) {
            const pd = this.pData[i];
            let hx = 0, hy = 0, hz = 0, size = 10, theme = 'water';
            let labelMode = false, lpx = 0, lpy = 0, lpz = 0;

            if (hasHand) {
                const handIdx = activeIdx[i % activeIdx.length];
                const hand = this.hands[handIdx];
                const sp = this.smoothPoints[handIdx];
                const lm = sp[pd.lmIdx];
                hx = lm.x; hy = lm.y; hz = lm.z;
                size = hand.size;
                theme = hand.theme;

                // --- Etiket modu: parçacıklar ismi nokta nokta yazsın ---
                if (hand.label && hand.labelPoints && hand.labelPoints.length > 0) {
                    labelMode = true;
                    const pts = hand.labelPoints;
                    const tp = pts[i % pts.length];
                    // Yumruk boyutuna ölçeklenmiş yazı; ekranı aşmasın
                    const scale = size * 0.85;
                    // Jitter yok — keskin harfler
                    const jx = 0, jy = 0;
                    let cx, cy, cz;
                    if (hand.label === 'Esma' && this.heartCenter) {
                        cx = this.heartCenter.x;
                        cy = this.heartCenter.y + size * 1.1;
                        cz = this.heartCenter.z;
                    } else {
                        const palm = sp[9];
                        cx = palm.x;
                        cy = palm.y + size * 1.2; // yumruğun hemen üstü
                        cz = palm.z;
                    }
                    lpx = cx + (tp.x + jx) * scale;
                    lpy = cy + (tp.y + jy) * scale;
                    lpz = cz;
                }
            }

            if (labelMode) {
                this.target.set(lpx, lpy, lpz);
                this.positions[i].lerp(this.target, 0.30);
                // Renk
                if (theme === 'fire') this.pColor.setHSL(0.07, 0.95, 0.55);
                else if (theme === 'water') this.pColor.setHSL(0.55, 0.95, 0.6);
                else this.pColor.setHSL(0.95, 0.85, 0.65);
                // Esma için pembe override
                if (this.hands[activeIdx[i % activeIdx.length]].label === 'Esma') {
                    this.pColor.setHSL(0.95, 0.9, 0.65);
                }
                this.dummy.position.copy(this.positions[i]);
                this.dummy.scale.setScalar(0.22);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                this.mesh.setColorAt(i, this.pColor);
                continue;
            }

            // Yaşam — yukarı doğru alev hareketi
            pd.life += dt * pd.speed;
            if (pd.life > 1) {
                pd.life = 0;
                pd.lmIdx = Math.floor(Math.random() * 21);
                pd.phase = Math.random() * Math.PI * 2;
                pd.offX = (Math.random() - 0.5);
                pd.offZ = (Math.random() - 0.5);
            }
            const life = pd.life;

            // Alev dalgası
            const wave = Math.sin(time * 3 + pd.phase + life * 4);
            const lateralX = (pd.offX + wave * 0.3) * size * 0.9;
            const lateralZ = pd.offZ * size * 0.6;
            const rise = life * size * 1.8; // yukarı yükseliş
            const shrink = 1.0 - life * 0.3;

            const x = hx + lateralX * shrink;
            const y = hy + rise;
            const z = hz + lateralZ * shrink;

            this.target.set(x, y, z);
            this.positions[i].lerp(this.target, 0.35);

            // Renk: tema + yaşam
            let hue, sat, light;
            if (theme === 'fire') {
                // ateş: sarı → turuncu → kırmızı
                hue = 0.10 - life * 0.10;
                sat = 0.95;
                light = 0.45 - life * 0.15;
            } else {
                hue = 0.55 + life * 0.05;
                sat = 0.95;
                light = 0.45 - life * 0.15;
            }
            this.pColor.setHSL(hue, sat, Math.max(0.25, light));

            this.dummy.position.copy(this.positions[i]);
            const s = (1.0 - life * 0.6) * (0.6 + size * 0.04);
            this.dummy.scale.setScalar(Math.max(0.2, s));
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.mesh.setColorAt(i, this.pColor);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;

        this.composer.render();
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.scene.remove(this.mesh);
        this.renderer.dispose();
    }
}
