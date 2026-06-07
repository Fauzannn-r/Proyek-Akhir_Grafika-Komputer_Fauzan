// ============================================
// KUMPUL MOBIL - Game Three.js
// ============================================

// Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f1e);
scene.fog = new THREE.Fog(0x0f0f1e, 800, 1500);

const canvas = document.getElementById('canvas');
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;  // FIX: warna GLB lebih akurat
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// ============================================
// VARIABEL GAME
// ============================================
const gameState = {
    score: 0,
    collected: 0,
    combo: 0,
    isGameRunning: true,
    startTime: Date.now(),
};

const keys = {};
let cameraAngle = 0;

// Array menyimpan data AABB setiap obstacle untuk collision
const obstacles = [];

// ============================================
// RAYCASTER UNTUK HOVER MOUSE
// ============================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObjek = null;

// Tooltip element
const tooltip = document.createElement('div');
tooltip.id = 'hoverTooltip';
tooltip.style.cssText = `
    position: absolute; pointer-events: none; z-index: 500;
    background: rgba(0,0,0,0.8); border: 1px solid #00ff88;
    border-radius: 6px; padding: 5px 10px; color: #00ff88;
    font-size: 13px; font-weight: bold; display: none;
    transition: opacity 0.15s;
`;
document.getElementById('gameContainer').appendChild(tooltip);

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
});

// Klik mouse — kumpulkan objek yang di-hover
canvas.addEventListener('click', () => {
    if (hoveredObjek && !hoveredObjek.dikumpulkan) {
        const idx = objekKumpul.indexOf(hoveredObjek);
        if (idx !== -1) {
            const posKumpul = hoveredObjek.getPosition();
            // Cek jarak — hanya bisa klik jika dekat (radius 20)
            const dist = mobil.getPosition().distanceTo(posKumpul);
            if (dist < 20) {
                hoveredObjek.remove();
                gameState.collected++;
                gameState.combo++;
                gameState.score += 100 * gameState.combo;
                buatEfekKumpul(posKumpul);
                const newX = (Math.random() - 0.5) * 280;
                const newZ = (Math.random() - 0.5) * 280;
                objekKumpul[idx] = new ObjekKumpul(newX, newZ);
                hoveredObjek = null;
                tooltip.style.display = 'none';
            } else {
                // Terlalu jauh — flash tooltip merah
                tooltip.textContent = '❌ Terlalu jauh!';
                tooltip.style.borderColor = '#ff4444';
                tooltip.style.color = '#ff4444';
                tooltip.style.display = 'block';
                setTimeout(() => { tooltip.style.display = 'none'; tooltip.style.borderColor = '#00ff88'; tooltip.style.color = '#00ff88'; }, 800);
            }
        }
    }
});

function updateHover() {
    raycaster.setFromCamera(mouse, camera);

    // Kumpulkan semua mesh dari objekKumpul
    const meshes = objekKumpul
        .filter(o => !o.dikumpulkan)
        .map(o => ({ objek: o, mesh: o.mesh }));

    const targets = meshes.map(m => m.mesh);
    const intersects = raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const found = meshes.find(m => m.mesh === hitMesh);
        if (found) {
            if (hoveredObjek !== found.objek) {
                // Reset objek sebelumnya
                if (hoveredObjek) {
                    hoveredObjek.mesh.material.emissiveIntensity = 0.5;
                    hoveredObjek.group.scale.setScalar(1.0);
                }
                hoveredObjek = found.objek;
            }
            // Efek hover: terang + scale up
            hoveredObjek.mesh.material.emissiveIntensity = 1.5;
            hoveredObjek.group.scale.setScalar(1.25);

            const dist = Math.round(mobil.getPosition().distanceTo(hoveredObjek.getPosition()));
            const bisa = dist < 20;
            tooltip.textContent = bisa ? `✅ Klik untuk kumpulkan! (${dist}m)` : `🚗 Dekati dulu... (${dist}m)`;
            tooltip.style.borderColor = bisa ? '#00ff88' : '#ffb703';
            tooltip.style.color = bisa ? '#00ff88' : '#ffb703';
            tooltip.style.display = 'block';
            canvas.style.cursor = bisa ? 'pointer' : 'not-allowed';
        }
    } else {
        // Tidak ada yang di-hover
        if (hoveredObjek) {
            hoveredObjek.mesh.material.emissiveIntensity = 0.5;
            hoveredObjek.group.scale.setScalar(1.0);
            hoveredObjek = null;
        }
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
    }
}

// ============================================
// CLASS: MOBIL
// ============================================
class Mobil {
    constructor() {
        this.group = new THREE.Group();
        this.collisionRadius = 2;
        this.wheels = [];
        this.fallbackModel = null;
        this.glbModel = null;
        this.isGLBLoaded = false;

        this.createFallbackModel();
        this.tryLoadGLB();

        this.group.position.set(0, 2, 0);
        scene.add(this.group);

        this.velocity = new THREE.Vector3();
        this.acceleration = 0.03;
        this.friction = 0.92;
        this.maxVelocity = 0.5;
    }

    showToast(msg, color = '#00d4ff') {
        const el = document.getElementById('glbStatus');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.borderColor = color;
        el.style.color = color;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    tryLoadGLB() {
        // Tunggu sampai GLTFLoader benar-benar tersedia (kadang script belum selesai load)
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('GLTFLoader belum tersedia, coba lagi 500ms...');
            setTimeout(() => this.tryLoadGLB(), 500);
            return;
        }

        this.showToast('⏳ Memuat Mobil.glb...', '#00d4ff');
        const loader = new THREE.GLTFLoader();

        loader.load(
            './Mobil.glb',

            // onLoad
            (gltf) => {
                const model = gltf.scene;

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.visible = true;

                        if (!child.material) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0xff0055, metalness: 0.5, roughness: 0.4,
                            });
                        }

                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach((mat) => {
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.depthWrite = true;
                            mat.side = THREE.FrontSide;
                            mat.needsUpdate = true;
                            if (mat.color && mat.color.r === 0 && mat.color.g === 0 && mat.color.b === 0) {
                                mat.color.set(0xcccccc);
                            }
                        });
                    }
                });

                // Auto-scale berdasarkan bounding box
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const targetSize = 4;
                const scale = targetSize / maxDim;
                model.scale.setScalar(scale);

                // Dudukkan di atas ground
                const box2 = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                box2.getCenter(center);
                model.position.sub(center);
                model.position.y += box2.getSize(new THREE.Vector3()).y / 2;

                // Tidak dirotasi — biarkan model menghadap default (+Z)
                // Grup yang akan dirotasi sesuai arah gerak

                if (this.fallbackModel) {
                    this.group.remove(this.fallbackModel);
                    this.fallbackModel = null;
                }

                this.glbModel = model;
                this.group.add(model);
                this.isGLBLoaded = true;

                this.showToast('✅ Model mobil berhasil dimuat!', '#00ff88');
                console.log('✅ Mobil.glb berhasil dimuat, skala:', scale.toFixed(3));
            },

            // onProgress
            (xhr) => {
                if (xhr.total > 0) {
                    const pct = Math.round(xhr.loaded / xhr.total * 100);
                    this.showToast(`⏳ Memuat... ${pct}%`, '#00d4ff');
                }
            },

            // onError
            (error) => {
                const msg = error.message || error;
                console.error('❌ Gagal load Mobil.glb:', msg);
                this.showToast('❌ Mobil.glb tidak ditemukan — pastikan file ada di folder proyek', '#ff4444');
            }
        );
    }

    createFallbackModel() {
        const group = new THREE.Group();

        // Body
        const bodyGeo = new THREE.BoxGeometry(2, 1.5, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0055, metalness: 0.6, roughness: 0.3 });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        group.add(this.body);

        // Roof
        const roofGeo = new THREE.BoxGeometry(1.8, 0.8, 2);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xff0055, metalness: 0.6, roughness: 0.3 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 1.3;
        roof.position.z = -0.2;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);

        // Windshield (kaca)
        const windGeo = new THREE.BoxGeometry(1.6, 0.7, 0.1);
        const windMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.1, roughness: 0.0, transparent: true, opacity: 0.6 });
        const windshield = new THREE.Mesh(windGeo, windMat);
        windshield.position.set(0, 0.85, 0.8);
        windshield.rotation.x = -0.3;
        group.add(windshield);

        // Lampu depan
        const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 0.8 });
        [-0.6, 0.6].forEach(x => {
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(x, 0, 2.1);
            group.add(head);
        });

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.8 });
        const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.55, 8);
        const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });

        const wPositions = [[-1.15, -0.2, 1.3], [1.15, -0.2, 1.3], [-1.15, -0.2, -1.3], [1.15, -0.2, -1.3]];
        wPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(...pos);
            wheel.castShadow = true;
            this.wheels.push(wheel);
            group.add(wheel);

            const hub = new THREE.Mesh(hubGeo, hubMat);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(...pos);
            group.add(hub);
        });

        this.group.add(group);
        this.fallbackModel = group;
    }

    update(keys) {
        const maju   = keys['w'] || keys['W'] || keys['ArrowUp'];
        const mundur = keys['s'] || keys['S'] || keys['ArrowDown'];
        const kiri   = keys['a'] || keys['A'] || keys['ArrowLeft'];
        const kanan  = keys['d'] || keys['D'] || keys['ArrowRight'];

        // Sudut hadap mobil saat ini
        const angle = this.group.rotation.y;

        // Vektor maju = arah hadap mobil di bidang XZ
        const forwardX = Math.sin(angle);
        const forwardZ = Math.cos(angle);

        const move = new THREE.Vector3();

        if (maju) {
            move.x += forwardX * this.acceleration;
            move.z += forwardZ * this.acceleration;
        }
        if (mundur) {
            move.x -= forwardX * this.acceleration;
            move.z -= forwardZ * this.acceleration;
        }
        if (kiri) {
            // Belok: putar badan mobil saja, bukan geser samping
            this.group.rotation.y += 0.04;
        }
        if (kanan) {
            this.group.rotation.y -= 0.04;
        }

        this.velocity.add(move);
        this.velocity.multiplyScalar(this.friction);

        if (this.velocity.length() > this.maxVelocity) {
            this.velocity.normalize().multiplyScalar(this.maxVelocity);
        }

        this.group.position.add(this.velocity);

        this.wheels.forEach(wheel => {
            wheel.rotation.x += this.velocity.length() * 0.3;
        });

        this.group.position.x = Math.max(-150, Math.min(150, this.group.position.x));
        this.group.position.z = Math.max(-150, Math.min(150, this.group.position.z));

        const speed = Math.round((this.velocity.length() / this.maxVelocity) * 100);
        document.getElementById('speedValue').textContent = speed;
        document.getElementById('speedBar').style.width = speed + '%';
    }

    getPosition() { return this.group.position.clone(); }
    getCollisionSphere() { return { center: this.getPosition(), radius: this.collisionRadius }; }
}

// ============================================
// CLASS: OBJEK KUMPUL
// ============================================
class ObjekKumpul {
    constructor(x, z) {
        // Buat grup dengan beberapa bentuk biar lebih menarik
        this.group = new THREE.Group();

        const geo = new THREE.IcosahedronGeometry(0.8, 1);
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1, 0.6),
            metalness: 0.8,
            roughness: 0.2,
            emissive: new THREE.Color().setHSL(Math.random(), 1, 0.4),
            emissiveIntensity: 0.5,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.group.add(this.mesh);

        // Cincin di sekeliling
        const ringGeo = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.rotation.x = Math.PI / 2;
        this.group.add(this.ring);

        this.group.position.set(x, 1.5, z);
        scene.add(this.group);

        this.dikumpulkan = false;
        this.rotationSpeed = (Math.random() - 0.5) * 0.06;
        this.floatSpeed = Math.random() * 0.02 + 0.01;
        this.baseY = 1.5;
        this.floatAmount = Math.random() * Math.PI * 2;
        this.collisionRadius = 1.4;
    }

    update() {
        if (!this.dikumpulkan) {
            this.mesh.rotation.x += this.rotationSpeed;
            this.mesh.rotation.y += this.rotationSpeed * 1.2;
            this.ring.rotation.z += 0.02;

            this.floatAmount += this.floatSpeed;
            this.group.position.y = this.baseY + Math.sin(this.floatAmount) * 0.5;
            this.mesh.material.emissiveIntensity = 0.4 + Math.sin(this.floatAmount * 2) * 0.3;
        }
    }

    getPosition() { return this.group.position.clone(); }

    remove() {
        scene.remove(this.group);
        this.dikumpulkan = true;
    }
}

// ============================================
// EFEK PARTIKEL SAAT KUMPUL
// ============================================
function buatEfekKumpul(pos) {
    const count = 12;
    for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(0.15, 4, 4);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1, 0.6),
        });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        scene.add(p);

        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 0.4 + 0.2,
            (Math.random() - 0.5) * 0.5
        );
        let life = 1.0;

        function tick() {
            if (life <= 0) { scene.remove(p); return; }
            p.position.add(vel);
            vel.y -= 0.02;
            life -= 0.04;
            p.material.opacity = life;
            p.material.transparent = true;
            requestAnimationFrame(tick);
        }
        tick();
    }
}

// ============================================
// BUAT LINGKUNGAN
// ============================================
function buatLingkungan() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.1, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(400, 40, 0x00d4ff, 0x004080);
    grid.position.y = 0.01;
    scene.add(grid);

    // Obstacles - lebih beragam
    const obsData = [
        { pos: [-80, -80], color: 0x334455, h: 20 },
        { pos: [80, 80],   color: 0x334455, h: 15 },
        { pos: [-100, 50], color: 0x445566, h: 25 },
        { pos: [60, -120], color: 0x334455, h: 18 },
        { pos: [0, 80],    color: 0x445566, h: 22 },
        { pos: [120, -30], color: 0x334455, h: 12 },
        { pos: [-60, 110], color: 0x445566, h: 17 },
    ];

    obsData.forEach(d => {
        const hw = 15 / 2; // half-width
        const obsGeo = new THREE.BoxGeometry(15, d.h, 15);
        const obsMat = new THREE.MeshStandardMaterial({ color: d.color, metalness: 0.4, roughness: 0.6 });
        const obs = new THREE.Mesh(obsGeo, obsMat);
        obs.position.set(d.pos[0], d.h / 2, d.pos[1]);
        obs.castShadow = true;
        obs.receiveShadow = true;
        scene.add(obs);

        // Simpan AABB (axis-aligned bounding box) obstacle di bidang XZ
        obstacles.push({
            mesh: obs,
            minX: d.pos[0] - hw,
            maxX: d.pos[0] + hw,
            minZ: d.pos[1] - hw,
            maxZ: d.pos[1] + hw,
        });

        // Garis neon di tepi bangunan
        const edgeGeo = new THREE.EdgesGeometry(obsGeo);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.position.copy(obs.position);
        scene.add(edges);
    });

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const direct = new THREE.DirectionalLight(0xffffff, 1.2);
    direct.position.set(50, 100, 50);
    direct.castShadow = true;
    direct.shadow.mapSize.width = 2048;
    direct.shadow.mapSize.height = 2048;
    direct.shadow.camera.left = -300;
    direct.shadow.camera.right = 300;
    direct.shadow.camera.top = 300;
    direct.shadow.camera.bottom = -300;
    direct.shadow.camera.far = 500;
    scene.add(direct);

    // Hemisphere light untuk ambient lebih natural
    const hemi = new THREE.HemisphereLight(0x0033ff, 0x001100, 0.3);
    scene.add(hemi);

    const point1 = new THREE.PointLight(0x00d4ff, 0.6, 300);
    point1.position.set(100, 80, 100);
    scene.add(point1);

    const point2 = new THREE.PointLight(0xff006e, 0.6, 300);
    point2.position.set(-100, 80, -100);
    scene.add(point2);
}

// ============================================
// INISIALISASI
// ============================================
buatLingkungan();

const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

const mobil = new Mobil();
const objekKumpul = [];

function spawnObjekKumpul(count = 15) {
    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * 280;
        const z = (Math.random() - 0.5) * 280;
        objekKumpul.push(new ObjekKumpul(x, z));
    }
}

spawnObjekKumpul(15);

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (e.key === ' ') {
        gameState.isGameRunning = !gameState.isGameRunning;
        document.getElementById('gameOverMessage').style.display =
            gameState.isGameRunning ? 'none' : 'block';
        e.preventDefault();
    }

    if (e.key === 'r' || e.key === 'R') {
        cameraAngle += Math.PI / 2;
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================
// DETEKSI TABRAKAN TEMBOK / BALOK
// ============================================
let flashTimer = 0;
let lastHitObstacle = null;

function deteksiTabrakanTembok() {
    const pos   = mobil.group.position;
    const vel   = mobil.velocity;
    const r     = mobil.collisionRadius;
    let   hit   = false;

    obstacles.forEach(ob => {
        // Temukan titik terdekat di AABB ke pusat mobil
        const nearX = Math.max(ob.minX, Math.min(pos.x, ob.maxX));
        const nearZ = Math.max(ob.minZ, Math.min(pos.z, ob.maxZ));

        const dx = pos.x - nearX;
        const dz = pos.z - nearZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < r) {
            hit = true;

            // Kedalaman penetrasi
            const penetrasi = r - dist;

            // Arah dorong (normal keluar dari obstacle)
            const nx = dist > 0 ? dx / dist : 1;
            const nz = dist > 0 ? dz / dist : 0;

            // Dorong mobil keluar dari tembok
            pos.x += nx * penetrasi;
            pos.z += nz * penetrasi;

            // Pantulkan komponen velocity searah normal (bounce + redaman)
            const dot = vel.x * nx + vel.z * nz;
            if (dot < 0) { // hanya saat menuju tembok
                const restitusi = 0.35; // koefisien pantul (0=nyerap, 1=elastis penuh)
                vel.x -= (1 + restitusi) * dot * nx;
                vel.z -= (1 + restitusi) * dot * nz;
                vel.multiplyScalar(0.6); // redaman ekstra saat tabrak
            }

            // Flash tembok yang kena tabrak
            if (ob.mesh !== lastHitObstacle) {
                lastHitObstacle = ob.mesh;
                const origColor = ob.mesh.material.color.clone();
                ob.mesh.material.color.set(0xff2200);
                setTimeout(() => {
                    ob.mesh.material.color.copy(origColor);
                    lastHitObstacle = null;
                }, 150);
            }
        }
    });

    // Flash layar merah saat tabrak
    if (hit) {
        flashTimer = 8; // frame
    }
    if (flashTimer > 0) {
        flashTimer--;
        // Overlay merah di canvas — pakai HUD sederhana
        let overlay = document.getElementById('hitOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hitOverlay';
            overlay.style.cssText = `
                position:absolute; inset:0; pointer-events:none; z-index:150;
                background: radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.45) 100%);
                transition: opacity 0.08s;
            `;
            document.getElementById('gameContainer').appendChild(overlay);
        }
        overlay.style.opacity = (flashTimer / 8).toFixed(2);
    }
}


function deteksiTabrakan() {
    const posMobil = mobil.getPosition();
    const sphere = mobil.getCollisionSphere();

    objekKumpul.forEach((objek, idx) => {
        if (!objek.dikumpulkan) {
            const dist = posMobil.distanceTo(objek.getPosition());
            const threshold = sphere.radius + objek.collisionRadius;

            if (dist < threshold) {
                const posKumpul = objek.getPosition();
                objek.remove();
                gameState.collected++;
                gameState.combo++;
                gameState.score += 100 * gameState.combo;

                buatEfekKumpul(posKumpul);

                const newX = (Math.random() - 0.5) * 280;
                const newZ = (Math.random() - 0.5) * 280;
                objekKumpul[idx] = new ObjekKumpul(newX, newZ);
            }
        }
    });
}

// ============================================
// UPDATE UI
// ============================================
let frameCount = 0;
let lastTime = Date.now();

function updateUI() {
    frameCount++;
    const now = Date.now();

    if (now - lastTime >= 1000) {
        document.getElementById('fps').textContent = frameCount;
        frameCount = 0;
        lastTime = now;
    }

    document.getElementById('score').textContent = gameState.score;
    document.getElementById('collected').textContent = gameState.collected;
    document.getElementById('combo').textContent = gameState.combo + 'x';
    document.getElementById('objCount').textContent = objekKumpul.length;

    const elapsed = Math.floor((now - gameState.startTime) / 1000);
    document.getElementById('time').textContent = elapsed + 's';
}

// ============================================
// CAMERA FOLLOW
// ============================================
function updateCamera() {
    const pos = mobil.getPosition();
    const dist = 20;
    const height = 12;

    // Ikuti arah hadap mobil, bukan cameraAngle manual saja
    // cameraAngle dipakai sebagai offset tambahan (tombol R)
    const carAngle = mobil.group.rotation.y;
    const angle = carAngle + cameraAngle;

    // Kamera di belakang mobil (tambah PI = balik 180 derajat dari arah hadap)
    const tx = pos.x - Math.sin(angle) * dist;
    const tz = pos.z - Math.cos(angle) * dist;

    camera.position.x += (tx - camera.position.x) * 0.08;
    camera.position.y += (pos.y + height - camera.position.y) * 0.08;
    camera.position.z += (tz - camera.position.z) * 0.08;

    camera.lookAt(pos.x, pos.y + 1, pos.z);
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);

    if (gameState.isGameRunning) {
        mobil.update(keys);
        deteksiTabrakanTembok();  // cek tembok dulu sebelum collectible
        deteksiTabrakan();
    }

    objekKumpul.forEach(obj => obj.update());
    updateHover();
    updateCamera();
    updateUI();

    renderer.render(scene, camera);
}

animate();
