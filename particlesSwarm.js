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

    setHeart(c) { this.heartCenter = c; }

    setShape(name) {
        this.activeShape = name;
        if (!name) return;
        if (!this.shapeCache) this.shapeCache = {};
        if (!this.shapeCache[name]) {
            this.shapeCache[name] = this._buildShapePoints(name, this.count);
        }
    }

    _buildShapePoints(name, n) {
        const pts = new Array(n);
        const R = 28; // yarıçap (dünya birimi)
        const edgePts = (verts) => {
            // verts: [[x,y], ...] kapalı poligon
            const segs = [];
            let total = 0;
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i], b = verts[(i + 1) % verts.length];
                const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                segs.push({ a, b, len });
                total += len;
            }
            for (let i = 0; i < n; i++) {
                let t = (i / n) * total;
                for (const s of segs) {
                    if (t <= s.len) {
                        const k = t / s.len;
                        // hafif jitter (içeri/dışarı)
                        const nx = -(s.b[1] - s.a[1]) / s.len;
                        const ny = (s.b[0] - s.a[0]) / s.len;
                        const j = (Math.random() - 0.5) * 2.5;
                        pts[i] = {
                            x: s.a[0] + (s.b[0] - s.a[0]) * k + nx * j,
                            y: s.a[1] + (s.b[1] - s.a[1]) * k + ny * j,
                        };
                        break;
                    }
                    t -= s.len;
                }
            }
        };
        if (name === 'square') {
            edgePts([[-R,-R],[R,-R],[R,R],[-R,R]]);
        } else if (name === 'triangle') {
            const h = R * Math.sqrt(3);
            edgePts([[0, R*1.1], [R*1.05, -R*0.6], [-R*1.05, -R*0.6]]);
        } else if (name === 'hexagon') {
            const v = [];
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
                v.push([Math.cos(a) * R, Math.sin(a) * R]);
            }
            edgePts(v);
        }
        return pts;
    }

    _makeTextSprite(text, color) {
        const fontPx = 200;
        const font = `900 ${fontPx}px "Segoe UI", sans-serif`;
        const probe = document.createElement('canvas').getContext('2d');
        probe.font = font;
        const w = Math.ceil(probe.measureText(text).width) + 200;
        const h = Math.ceil(fontPx * 2.2);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false,
            blending: THREE.NormalBlending,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.userData.aspect = w / h;
        sprite.visible = false;
        this.scene.add(sprite);

        const draw = (time) => {
            ctx.clearRect(0, 0, w, h);
            ctx.font = font;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            // Birbirini takip eden ışık tracer'ları (chase)
            const baseDash = [10, 26];
            const speed = 110;
            // Arka iz: 4 katman, geriye doğru sönen
            for (let k = 4; k >= 1; k--) {
                ctx.setLineDash(baseDash);
                ctx.lineDashOffset = -time * speed + k * 8;
                ctx.shadowColor = color;
                ctx.shadowBlur = 6 + k * 3;
                ctx.lineWidth = 5;
                ctx.globalAlpha = 0.18 * k;
                ctx.strokeStyle = color;
                ctx.strokeText(text, w / 2, h / 2);
            }
            ctx.globalAlpha = 1;
            // Comet baş — parlak beyaz dash
            ctx.setLineDash([6, 30]);
            ctx.lineDashOffset = -time * speed;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(text, w / 2, h / 2);
            // İnce kontur (yazıyı okunabilir tutar)
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = color;
            ctx.strokeText(text, w / 2, h / 2);
            tex.needsUpdate = true;
        };
        return { sprite, draw, type: 'text' };
    }

    _makeHeartSprite() {
        const w = 1024, h = 1024;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false,
            blending: THREE.NormalBlending,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.userData.aspect = 1;
        sprite.visible = false;
        this.scene.add(sprite);

        // Kalp eğrisi noktaları
        const heartPath = (offset) => {
            ctx.beginPath();
            const N = 240;
            const cx = w / 2, cy = h / 2 + 40;
            const scale = 26;
            for (let i = 0; i <= N; i++) {
                const t = (i / N) * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                const px = cx + x * (scale + offset);
                const py = cy + y * (scale + offset);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
        };

        const draw = (time) => {
            ctx.clearRect(0, 0, w, h);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            const pulse = 1.0 + Math.sin(time * 2.6) * 0.08;

            // Genişleyen dalga halkaları (ripple)
            for (let r = 0; r < 3; r++) {
                const phase = (time * 0.45 + r / 3) % 1;
                heartPath(phase * 18);
                ctx.shadowColor = r % 2 ? '#3ad6ff' : '#ff7a1a';
                ctx.shadowBlur = 18;
                ctx.setLineDash([]);
                ctx.lineWidth = 3;
                ctx.globalAlpha = (1 - phase) * 0.6;
                ctx.strokeStyle = r % 2 ? '#3ad6ff' : '#ff7a1a';
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Ilgaz turuncu — dış chase
            const speed = 90;
            for (let k = 4; k >= 1; k--) {
                heartPath(2);
                ctx.shadowColor = '#ff7a1a';
                ctx.shadowBlur = 8 + k * 4;
                ctx.setLineDash([16, 30]);
                ctx.lineDashOffset = -time * speed + k * 10;
                ctx.lineWidth = 10 * pulse;
                ctx.globalAlpha = 0.22 * k;
                ctx.strokeStyle = '#ff7a1a';
                ctx.stroke();
            }
            // Zeynep cyan — iç chase ters yön
            for (let k = 4; k >= 1; k--) {
                heartPath(-2);
                ctx.shadowColor = '#3ad6ff';
                ctx.shadowBlur = 8 + k * 4;
                ctx.setLineDash([14, 28]);
                ctx.lineDashOffset = time * speed + k * 10;
                ctx.lineWidth = 7 * pulse;
                ctx.globalAlpha = 0.22 * k;
                ctx.strokeStyle = '#3ad6ff';
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Net beyaz iz
            heartPath(0);
            ctx.shadowBlur = 0;
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // --- ESMA yazısı kalbin tam ortasında ---
            const fontPx = 200;
            ctx.font = `900 ${fontPx}px "Segoe UI", sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            const ex = w / 2, ey = h / 2 + 20;
            // Pembe chase
            for (let k = 4; k >= 1; k--) {
                ctx.setLineDash([10, 26]);
                ctx.lineDashOffset = -time * 110 + k * 8;
                ctx.shadowColor = '#ff4d8a';
                ctx.shadowBlur = 8 + k * 4;
                ctx.lineWidth = 7;
                ctx.globalAlpha = 0.2 * k;
                ctx.strokeStyle = '#ff4d8a';
                ctx.strokeText('Esma', ex, ey);
            }
            ctx.globalAlpha = 1;
            // Beyaz comet
            ctx.setLineDash([6, 30]);
            ctx.lineDashOffset = -time * 110;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText('Esma', ex, ey);
            // İnce okunur kontur
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ff4d8a';
            ctx.strokeText('Esma', ex, ey);

            tex.needsUpdate = true;
        };
        return { sprite, draw, type: 'heart' };
    }

    _getSprite(key, text, color) {
        if (!this.labelSprites) this.labelSprites = {};
        if (!this.labelSprites[key]) {
            this.labelSprites[key] = key === 'HEART'
                ? this._makeHeartSprite()
                : this._makeTextSprite(text, color);
        }
        return this.labelSprites[key];
    }

    /** handsData = [{points, theme, size, label?}, ...] */
    setHands(handsData) {
        for (let h = 0; h < this.hands.length; h++) {
            if (handsData[h]) {
                const d = handsData[h];
                this.hands[h].points = d.points;
                this.hands[h].theme = d.theme;
                this.hands[h].size = d.size;
                this.hands[h].label = d.label || null;
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

        const shapePts = this.activeShape ? this.shapeCache[this.activeShape] : null;

        for (let i = 0; i < this.count; i++) {
            const pd = this.pData[i];
            let hx = 0, hy = 0, hz = 0, size = 10, theme = 'water';

            if (shapePts) {
                // Şekil modu: partiküller şeklin kenarına yerleşir, hafif nefes alır
                const sp = shapePts[i];
                const breathe = 1.0 + Math.sin(time * 1.5 + i * 0.01) * 0.03;
                this.target.set(sp.x * breathe, sp.y * breathe, Math.sin(time + i) * 1.5);
                this.positions[i].lerp(this.target, 0.12);

                // Renk: gradient (theme alternatif)
                const hue = ((i / this.count) + time * 0.05) % 1.0;
                this.pColor.setHSL(hue, 0.9, 0.5);

                this.dummy.position.copy(this.positions[i]);
                this.dummy.scale.setScalar(0.9);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                this.mesh.setColorAt(i, this.pColor);
                continue;
            }

            if (hasHand) {
                const handIdx = activeIdx[i % activeIdx.length];
                const hand = this.hands[handIdx];
                const sp = this.smoothPoints[handIdx];
                const lm = sp[pd.lmIdx];
                hx = lm.x; hy = lm.y; hz = lm.z;
                size = hand.size;
                theme = hand.theme;
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

        // --- Neon etiket sprite'ları (animasyonlu) ---
        const labelDefs = {
            Ilgaz:  { color: '#ff7a1a' },
            Zeynep: { color: '#3ad6ff' },
        };
        if (this.labelSprites) {
            for (const k in this.labelSprites) this.labelSprites[k].sprite.visible = false;
        }
        const heartActive = !!this.heartCenter && this.hands.some(h => h.active && h.label === 'Esma');
        const fistLabels = this.hands.filter(h => h.active && h.label && h.label !== 'Esma');
        const anyLabel = heartActive || fistLabels.length > 0;
        // Jest aktifken parçacıklar kaybolsun
        this.mesh.visible = !anyLabel;

        if (heartActive) {
            const entry = this._getSprite('HEART');
            // Tam ekrana yakın boyut
            const dist = this.camera.position.z;
            const vFov = (this.camera.fov * Math.PI) / 180;
            const hView = 2 * Math.tan(vFov / 2) * dist;
            const s = hView * 0.85;
            entry.sprite.scale.set(s, s, 1);
            entry.sprite.position.set(0, 0, 0);
            entry.sprite.visible = true;
            entry.draw(time);
        } else {
            for (let h = 0; h < this.hands.length; h++) {
                const hand = this.hands[h];
                if (!hand.active || !hand.label) continue;
                const def = labelDefs[hand.label];
                if (!def) continue;
                const entry = this._getSprite(hand.label, hand.label, def.color);
                const palm = this.smoothPoints[h][9];
                const sH = hand.size * 1.8;
                const sW = sH * entry.sprite.userData.aspect;
                entry.sprite.scale.set(sW, sH, 1);
                entry.sprite.position.set(palm.x, palm.y + hand.size * 1.6, palm.z + 1);
                entry.sprite.visible = true;
                entry.draw(time);
            }
        }

        this.composer.render();
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.scene.remove(this.mesh);
        this.renderer.dispose();
    }
}
