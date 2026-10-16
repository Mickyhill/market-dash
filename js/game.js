// Market Dash: collect coins in a busy market before the bell rings.
// The player's start.ng character, name and scores all come from start.ng.
import * as THREE from 'three';
import { buildCharacter, animateCharacter, disposeCharacter, normalizeStyle, DEFAULT_STYLE } from './character.js';
import { whoami, saveRun, readBoard, signInUrl } from './startng.js';

// ---------- Settings ----------
const ARENA = 18; // half the width of the market floor
const ROUND_SECONDS = 60;
const COIN_COUNT = 9;
const GEM_CHANCE = 0.16;
const GEM_VALUE = 3;
const PLAYER_SPEED = 6.6;
const PLAYER_RADIUS = 0.45;
const PICKUP_RADIUS = 1.0;

// ---------- Page elements ----------
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const hud = $('hud');
const hudScore = $('hud-score');
const hudTime = $('hud-time');
const panelWrap = $('panel-wrap');
const panelTitle = $('panel-title');
const panelLead = $('panel-lead');
const panelScore = $('panel-score');
const panelMessage = $('panel-message');
const boardEl = $('board');
const playButton = $('play-button');
const panelSignIn = $('panel-sign-in');
const cardFace = $('player-face');
const cardName = $('player-name');
const cardAccount = $('player-account');
const cardSignIn = $('player-sign-in');

const guestMode = new URLSearchParams(location.search).has('guest');
panelSignIn.href = signInUrl();
cardSignIn.href = signInUrl();

// ---------- Renderer, scene and light ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  panelTitle.textContent = 'No 3D here';
  panelLead.textContent = 'Your browser could not start 3D graphics. Try another browser or device.';
  playButton.hidden = true;
  throw new Error('WebGL is not available');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const SKY = new THREE.Color('#f4d9a6');
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 32, 70);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

scene.add(new THREE.HemisphereLight('#fff4dc', '#b08a5a', 1.05));
const sun = new THREE.DirectionalLight('#fff0cc', 1.5);
sun.position.set(12, 22, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0006;
scene.add(sun);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the whole action visible on tall phone screens.
  camera.fov = w / h < 0.8 ? 60 : 45;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- The market ----------
const obstacles = []; // circles the player cannot walk through: { x, z, r }

function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

// Floor: warm paving stones.
const floorTex = canvasTexture(256, (g, s) => {
  g.fillStyle = '#d9b27c';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(120, 82, 44, 0.45)';
  g.lineWidth = 3;
  const n = 4;
  for (let i = 0; i <= n; i += 1) {
    const p = (i * s) / n;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
  }
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(110, 72, 36, ${0.04 + Math.random() * 0.06})`;
    g.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 22, 10 + Math.random() * 22);
  }
}, 9);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2 + 14, ARENA * 2 + 14),
  new THREE.MeshLambertMaterial({ map: floorTex }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Stall awnings use bold stripes.
function stripeTexture(a, b) {
  return canvasTexture(128, (g, s) => {
    const n = 4;
    for (let i = 0; i < n; i += 1) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect((i * s) / n, 0, s / n, s);
    }
  });
}

const wood = new THREE.MeshLambertMaterial({ color: '#8a5a33' });
const darkWood = new THREE.MeshLambertMaterial({ color: '#5e3b20' });
const crateWood = new THREE.MeshLambertMaterial({ color: '#b07a45' });

function addBox(w, h, d, material, x, y, z, { shadow = true, ry = 0, parent = scene } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addStall(x, z, ry, awningA, awningB, goods) {
  const stall = new THREE.Group();
  stall.position.set(x, 0, z);
  stall.rotation.y = ry;
  scene.add(stall);
  addBox(3, 1, 1.7, wood, 0, 0.5, 0, { parent: stall });
  addBox(3.15, 0.12, 1.85, darkWood, 0, 1.03, 0, { parent: stall });
  for (const px of [-1.4, 1.4]) {
    for (const pz of [-0.75, 0.75]) addBox(0.12, 2.6, 0.12, darkWood, px, 1.3, pz, { parent: stall });
  }
  const awning = addBox(3.5, 0.12, 2.3, new THREE.MeshLambertMaterial({ map: stripeTexture(awningA, awningB) }), 0, 2.65, 0.05, { parent: stall });
  awning.rotation.x = 0.16;
  // Goods on the table.
  goods.forEach((hex, i) => {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    const gx = -1.05 + i * 0.7;
    const item = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), m);
    item.position.set(gx, 1.3, 0.05);
    item.castShadow = true;
    stall.add(item);
  });
  obstacles.push({ x, z, r: 1.75 });
}

addStall(-11, -15, 0, '#e8553d', '#fff3df', ['#ff9f1c', '#ffbf69', '#ff9f1c', '#ffbf69']);
addStall(0, -15.5, 0, '#2f8f6b', '#fff3df', ['#70c55a', '#a3d977', '#70c55a', '#a3d977']);
addStall(11, -15, 0, '#3d6fe8', '#fff3df', ['#e84a6f', '#f4a3b6', '#e84a6f', '#f4a3b6']);
addStall(-16, -2, Math.PI / 2, '#d4a017', '#fff3df', ['#8a2be2', '#b57bee', '#8a2be2', '#b57bee']);
addStall(16, 0, -Math.PI / 2, '#8a4bd6', '#fff3df', ['#f2b82e', '#ffd966', '#f2b82e', '#ffd966']);

// Crates the player has to run around.
[[-6, -4, 0.3], [6.5, -5, -0.4], [-7.5, 6, 0.8], [8, 7, 0.1], [0, 1.5, 0.5], [-1, -8.5, -0.2]].forEach(([x, z, ry]) => {
  addBox(1.4, 1.4, 1.4, crateWood, x, 0.7, z, { ry });
  addBox(1.15, 1.15, 1.15, crateWood, x + 0.2, 1.95, z - 0.1, { ry: ry + 0.5 });
  obstacles.push({ x, z, r: 1.15 });
});

// A low fence marks the edge of the market.
const fenceLength = ARENA * 2 + 2;
[[0, -ARENA - 1, 0], [0, ARENA + 1, 0], [-ARENA - 1, 0, Math.PI / 2], [ARENA + 1, 0, Math.PI / 2]].forEach(([x, z, ry]) => {
  addBox(fenceLength, 0.12, 0.12, darkWood, x, 0.85, z, { ry, shadow: false });
  addBox(fenceLength, 0.12, 0.12, darkWood, x, 0.45, z, { ry, shadow: false });
  for (let i = -ARENA; i <= ARENA; i += 4) {
    const px = ry ? x : i;
    const pz = ry ? i : z;
    addBox(0.16, 1.1, 0.16, wood, px, 0.55, pz, { shadow: false });
  }
});

// Bunting strung across the market.
(function addBunting() {
  const colors = ['#e8553d', '#f2b82e', '#2f8f6b', '#3d6fe8', '#8a4bd6'];
  const geo = new THREE.ConeGeometry(0.3, 0.55, 3);
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }));
    m.position.set(-ARENA + t * ARENA * 2, 5.4 - Math.sin(t * Math.PI) * 0.9, -ARENA - 0.8);
    m.rotation.x = Math.PI;
    scene.add(m);
  }
})();

// ---------- Player ----------
const player = {
  pos: new THREE.Vector3(0, 0, 5),
  facing: 0,
  walk: 0,
  character: null,
};
let currentStyle = normalizeStyle(DEFAULT_STYLE);
let currentStyleKey = JSON.stringify(currentStyle);

const characterHolder = new THREE.Group();
scene.add(characterHolder);

function setCharacterStyle(rawStyle) {
  const style = normalizeStyle(rawStyle);
  const key = JSON.stringify(style);
  if (player.character && key === currentStyleKey) return;
  currentStyle = style;
  currentStyleKey = key;
  if (player.character) {
    characterHolder.remove(player.character);
    disposeCharacter(player.character);
  }
  player.character = buildCharacter(style);
  player.character.scale.setScalar(0.92);
  characterHolder.add(player.character);
}
setCharacterStyle(DEFAULT_STYLE);

// ---------- Coins and gems ----------
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24).rotateX(Math.PI / 2);
const coinInnerGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.13, 24).rotateX(Math.PI / 2);
const gemGeo = new THREE.OctahedronGeometry(0.5);
const coinMat = new THREE.MeshLambertMaterial({ color: '#f2b82e', emissive: '#6a4300' });
const coinInnerMat = new THREE.MeshLambertMaterial({ color: '#ffd96a', emissive: '#7a5200' });
const gemMat = new THREE.MeshLambertMaterial({ color: '#5ce1e6', emissive: '#0b5f66' });

const coins = [];
const popping = [];

function makeCollectible(isGem) {
  const group = new THREE.Group();
  if (isGem) {
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.scale.y = 1.35;
    gem.castShadow = true;
    group.add(gem);
  } else {
    const face = new THREE.Mesh(coinGeo, coinMat);
    face.castShadow = true;
    group.add(face, new THREE.Mesh(coinInnerGeo, coinInnerMat));
  }
  return group;
}

function freeSpot() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = (Math.random() * 2 - 1) * (ARENA - 2);
    const z = (Math.random() * 2 - 1) * (ARENA - 2);
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1)) continue;
    if (Math.hypot(player.pos.x - x, player.pos.z - z) < 4) continue;
    if (coins.some((c) => Math.hypot(c.group.position.x - x, c.group.position.z - z) < 2)) continue;
    return { x, z };
  }
  return { x: (Math.random() * 2 - 1) * 10, z: (Math.random() * 2 - 1) * 10 };
}

function spawnCollectible() {
  const isGem = Math.random() < GEM_CHANCE;
  const { x, z } = freeSpot();
  const group = makeCollectible(isGem);
  group.position.set(x, 0.9, z);
  group.scale.setScalar(0.01);
  scene.add(group);
  coins.push({ group, isGem, value: isGem ? GEM_VALUE : 1, spin: Math.random() * 6, born: 0 });
}

function clearCollectibles() {
  for (const c of coins) scene.remove(c.group);
  coins.length = 0;
  for (const p of popping) scene.remove(p.group);
  popping.length = 0;
}

// ---------- Sparkles ----------
const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const sparks = [];
function burst(x, z, hex) {
  const material = new THREE.MeshBasicMaterial({ color: hex });
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, material);
    mesh.position.set(x, 0.9, z);
    const a = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    sparks.push({ mesh, vx: Math.cos(a) * speed, vy: 3 + Math.random() * 3, vz: Math.sin(a) * speed, life: 0.5 });
    scene.add(mesh);
  }
}

// ---------- Sound (made in code, no files) ----------
let audio;
function beep(freq, duration = 0.09, type = 'triangle') {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch {
    // Sound is optional.
  }
}

// ---------- Input ----------
const keys = new Set();
const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
window.addEventListener('keydown', (e) => {
  const dir = KEY_MAP[e.code];
  if (dir) {
    keys.add(dir);
    if (state === 'playing') e.preventDefault();
  }
  if ((e.code === 'Enter' || e.code === 'Space') && state !== 'playing' && !panelWrap.hidden) {
    e.preventDefault();
    startRound();
  }
});
window.addEventListener('keyup', (e) => {
  const dir = KEY_MAP[e.code];
  if (dir) keys.delete(dir);
});
window.addEventListener('blur', () => keys.clear());

// Touch: drag anywhere to steer.
const touch = { active: false, id: null, x0: 0, y0: 0, x: 0, z: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  touch.active = true;
  touch.id = e.pointerId;
  touch.x0 = e.clientX;
  touch.y0 = e.clientY;
  touch.x = 0;
  touch.z = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch.active || e.pointerId !== touch.id) return;
  const dx = (e.clientX - touch.x0) / 55;
  const dy = (e.clientY - touch.y0) / 55;
  const len = Math.hypot(dx, dy);
  const scale = len > 1 ? 1 / len : 1;
  touch.x = dx * scale;
  touch.z = dy * scale;
});
const endTouch = (e) => {
  if (e.pointerId !== touch.id) return;
  touch.active = false;
  touch.x = 0;
  touch.z = 0;
};
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

function inputVector() {
  let x = 0;
  let z = 0;
  if (keys.has('left')) x -= 1;
  if (keys.has('right')) x += 1;
  if (keys.has('up')) z -= 1;
  if (keys.has('down')) z += 1;
  if (x === 0 && z === 0 && touch.active) return { x: touch.x, z: touch.z, mag: Math.min(1, Math.hypot(touch.x, touch.z)) };
  const len = Math.hypot(x, z);
  return len ? { x: x / len, z: z / len, mag: 1 } : { x: 0, z: 0, mag: 0 };
}

// ---------- start.ng player ----------
let startPlayer = null; // { user, guest } or null when start.ng does not answer

function showPlayer() {
  const person = startPlayer?.user ?? startPlayer?.guest ?? null;
  setCharacterStyle(person?.style);
  cardName.textContent = person?.name ?? 'Guest';
  if (startPlayer?.user) cardAccount.textContent = startPlayer.user.account ? `@${startPlayer.user.account}` : 'start.ng player';
  else if (startPlayer) cardAccount.textContent = 'Not signed in';
  else cardAccount.textContent = 'Playing offline';
  const face = person?.face;
  if (typeof face === 'string' && face.startsWith('data:image/')) {
    cardFace.src = face;
    cardFace.hidden = false;
  } else {
    cardFace.hidden = true;
  }
  const showSignIn = !startPlayer?.user && !guestMode && Boolean(startPlayer);
  cardSignIn.hidden = !showSignIn;
  panelSignIn.hidden = !showSignIn || state !== 'over';
}

async function loadPlayer() {
  const result = await whoami();
  if (result || !startPlayer) startPlayer = result;
  showPlayer();
}

// ---------- Leaderboard ----------
async function showBoard() {
  const entries = await readBoard(5);
  boardEl.replaceChildren();
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'board-empty';
    li.textContent = startPlayer ? 'No scores yet. Be the first.' : 'Scores show up once the game is live on start.ng.';
    boardEl.append(li);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement('li');
    if (startPlayer?.user && entry.player_id === startPlayer.user.id) li.className = 'me';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${entry.rank}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = entry.name;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${entry.stats?.coins ?? entry.score ?? 0}`;
    li.append(rank, who, score);
    boardEl.append(li);
  }
}

// ---------- Round flow ----------
let state = 'ready'; // ready, playing, over
let score = 0;
let timeLeft = ROUND_SECONDS;

function setHud() {
  hudScore.textContent = String(score);
  hudTime.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  hudTime.parentElement.classList.toggle('warn', timeLeft <= 10);
}

function startRound() {
  if (state === 'playing') return;
  state = 'playing';
  score = 0;
  timeLeft = ROUND_SECONDS;
  player.pos.set(0, 0, 5);
  clearCollectibles();
  for (let i = 0; i < COIN_COUNT; i += 1) spawnCollectible();
  panelWrap.hidden = true;
  hud.hidden = false;
  setHud();
  beep(520, 0.12);
  loadPlayer();
}

async function endRound() {
  state = 'over';
  keys.clear();
  touch.active = false;
  beep(330, 0.25, 'sawtooth');
  hud.hidden = true;
  panelWrap.hidden = false;
  panelTitle.textContent = 'Bell rings!';
  panelLead.textContent = 'The market is closing.';
  panelScore.hidden = false;
  panelScore.textContent = `You grabbed ${score} ${score === 1 ? 'coin' : 'coins'}`;
  playButton.textContent = 'Play again';
  panelMessage.hidden = false;
  panelMessage.textContent = 'Saving your score';
  showPlayer();

  if (startPlayer?.user) {
    const saved = await saveRun(score);
    if (saved.ok && saved.result) {
      panelMessage.textContent = saved.result.improved
        ? `New best! You are number ${saved.result.rank}.`
        : `Your best is ${saved.result.best}. You are number ${saved.result.rank}.`;
    } else {
      panelMessage.textContent = saved.error ?? 'Your score could not be saved.';
    }
  } else if (startPlayer) {
    panelMessage.textContent = 'Sign in with start.ng to save your score.';
  } else {
    panelMessage.textContent = 'Scores save once the game is live on start.ng.';
  }
  showBoard();
}

playButton.addEventListener('click', startRound);

// ---------- Game loop ----------
const clock = new THREE.Clock();
let orbit = 0.35;
const camTarget = new THREE.Vector3();
const camGoal = new THREE.Vector3();

function movePlayer(dt) {
  const input = state === 'playing' ? inputVector() : { x: 0, z: 0, mag: 0 };
  if (input.mag > 0) {
    player.pos.x += input.x * PLAYER_SPEED * dt;
    player.pos.z += input.z * PLAYER_SPEED * dt;
    const goal = Math.atan2(input.x, input.z);
    let diff = goal - player.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.facing += diff * Math.min(1, dt * 14);
  }
  player.walk += ((input.mag > 0 ? 1 : 0) - player.walk) * Math.min(1, dt * 12);

  // Stay inside the market and out of the stalls and crates.
  const limit = ARENA - PLAYER_RADIUS;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -limit, limit);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -limit, limit);
  for (const o of obstacles) {
    const dx = player.pos.x - o.x;
    const dz = player.pos.z - o.z;
    const dist = Math.hypot(dx, dz);
    const min = o.r + PLAYER_RADIUS;
    if (dist < min && dist > 0.0001) {
      player.pos.x = o.x + (dx / dist) * min;
      player.pos.z = o.z + (dz / dist) * min;
    }
  }
  characterHolder.position.set(player.pos.x, 0, player.pos.z);
  characterHolder.rotation.y = player.facing;
}

function collect(dt, elapsed) {
  for (let i = coins.length - 1; i >= 0; i -= 1) {
    const c = coins[i];
    c.born = Math.min(1, c.born + dt * 4);
    c.group.scale.setScalar(c.born);
    c.group.rotation.y = elapsed * 3 + c.spin;
    c.group.position.y = 0.9 + Math.sin(elapsed * 3 + c.spin) * 0.12;
    if (state !== 'playing') continue;
    const d = Math.hypot(c.group.position.x - player.pos.x, c.group.position.z - player.pos.z);
    if (d < PICKUP_RADIUS) {
      score += c.value;
      burst(c.group.position.x, c.group.position.z, c.isGem ? '#5ce1e6' : '#ffd96a');
      popping.push({ group: c.group, t: 0 });
      coins.splice(i, 1);
      spawnCollectible();
      beep(c.isGem ? 988 : 740, c.isGem ? 0.16 : 0.08);
      setHud();
      hudScore.parentElement.classList.remove('pop');
      void hudScore.parentElement.offsetWidth; // restart the pop animation
      hudScore.parentElement.classList.add('pop');
    }
  }
  for (let i = popping.length - 1; i >= 0; i -= 1) {
    const p = popping[i];
    p.t += dt * 5;
    p.group.scale.setScalar(Math.max(0.001, 1 + p.t * 0.6 - p.t * p.t * 1.6));
    p.group.position.y += dt * 4;
    if (p.t >= 1) {
      scene.remove(p.group);
      popping.splice(i, 1);
    }
  }
}

function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const s = sparks[i];
    s.life -= dt;
    s.vy -= 12 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y = Math.max(0.05, s.mesh.position.y + s.vy * dt);
    s.mesh.position.z += s.vz * dt;
    s.mesh.scale.setScalar(Math.max(0.01, s.life * 2));
    if (s.life <= 0) {
      scene.remove(s.mesh);
      sparks.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  if (state === 'playing') {
    camGoal.set(player.pos.x, 13, player.pos.z + 10.5);
    camTarget.set(player.pos.x, 0.8, player.pos.z - 1.5);
  } else {
    orbit += dt * 0.18;
    const wide = window.innerWidth >= 900;
    const radius = wide ? 5 : 4.2;
    camGoal.set(player.pos.x + Math.sin(orbit) * radius, 2.2, player.pos.z + Math.cos(orbit) * radius);
    // Wide screens: panel on the right, so aim right of the character.
    // Phones: panel at the bottom, so aim below the character to lift it up the screen.
    const side = wide ? 1.4 : 0;
    camTarget.set(player.pos.x + Math.cos(orbit) * side, wide ? 1.4 : 0.35, player.pos.z - Math.sin(orbit) * side);
  }
  camera.position.lerp(camGoal, Math.min(1, dt * 3));
  camera.lookAt(camTarget);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (state === 'playing') {
    timeLeft -= dt;
    if (Math.ceil(timeLeft) !== Number(hudTime.textContent)) setHud();
    if (timeLeft <= 0) {
      timeLeft = 0;
      setHud();
      endRound();
    }
  }
  movePlayer(dt);
  animateCharacter(player.character, elapsed, player.walk);
  collect(dt, elapsed);
  updateSparks(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Start with a few coins on the floor so the opening screen looks alive.
for (let i = 0; i < COIN_COUNT; i += 1) spawnCollectible();
camera.position.set(Math.sin(orbit) * 7, 3.6, player.pos.z + Math.cos(orbit) * 7);
requestAnimationFrame(frame);

// Ask start.ng who is playing, and ask again when the player returns to this tab:
// they may have signed in or out on start.ng.
loadPlayer().then(showBoard);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadPlayer();
});
window.addEventListener('focus', loadPlayer);

// Local testing only: try a character style with ?style={"hat":"crown"} on localhost.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const raw = new URLSearchParams(location.search).get('style');
  if (raw) {
    try {
      startPlayer = { user: { id: 0, name: 'Test Player', account: 'tester', style: JSON.parse(raw), face: '' }, guest: null };
      showPlayer();
    } catch {
      // Ignore bad test input.
    }
  }
}
