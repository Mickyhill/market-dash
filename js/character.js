// Builds a blocky 3D character from a start.ng character style.
// Every start.ng game shows the player's own character, so the whole look
// (body, colours, hair, hat and accessory) comes from the style object.
import * as THREE from 'three';

export const BODIES = ['female', 'male'];
export const HAIRS = ['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald'];
export const HATS = ['none', 'cap', 'beanie', 'tophat', 'crown'];
export const ACCESSORIES = ['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack'];

// Used for guests and whenever start.ng does not answer (for example when testing locally).
export const DEFAULT_STYLE = Object.freeze({
  body: 'male',
  primaryColor: '#4b7bec',
  secondaryColor: '#2b2f4a',
  skinColor: '#8d5524',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
});

const HEX = /^#[0-9a-f]{6}$/i;

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const color = (value, fallback) => (typeof value === 'string' && HEX.test(value) ? value : fallback);

// start.ng may add more options later, so anything unknown falls back to something sensible.
export function normalizeStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  return {
    body: pick(s.body, BODIES, DEFAULT_STYLE.body),
    primaryColor: color(s.primaryColor, DEFAULT_STYLE.primaryColor),
    secondaryColor: color(s.secondaryColor, DEFAULT_STYLE.secondaryColor),
    skinColor: color(s.skinColor, DEFAULT_STYLE.skinColor),
    hairColor: color(s.hairColor, DEFAULT_STYLE.hairColor),
    hair: pick(s.hair, HAIRS, DEFAULT_STYLE.hair),
    hat: pick(s.hat, HATS, DEFAULT_STYLE.hat),
    accessory: pick(s.accessory, ACCESSORIES, DEFAULT_STYLE.accessory),
  };
}

// How far the hair lifts a hat above the top of the head.
const HAIR_LIFT = { short: 0.12, afro: 0.3, braids: 0.12, bun: 0.12, ponytail: 0.12, dreads: 0.12, bald: 0 };

const HEAD_CENTER_Y = 1.72;
const HEAD_TOP_Y = HEAD_CENTER_Y + 0.25;

export function buildCharacter(rawStyle) {
  const style = normalizeStyle(rawStyle);
  const root = new THREE.Group();
  root.name = 'character';
  const materials = [];

  const mat = (hex, extra = {}) => {
    const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...extra });
    materials.push(m);
    return m;
  };
  const skin = mat(style.skinColor);
  const top = mat(style.primaryColor);
  const bottom = mat(style.secondaryColor);
  const hairMat = mat(style.hairColor);
  const dark = mat('#14110f');

  const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, w, h, d, material, x, y, z) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);

  const female = style.body === 'female';
  const torsoW = female ? 0.5 : 0.58;

  // Legs swing from the hip.
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.8, 0);
    box(pivot, 0.2, 0.8, 0.22, female ? skin : bottom, 0, -0.4, 0);
    box(pivot, 0.22, 0.1, 0.3, dark, 0, -0.76, 0.04); // shoe
    root.add(pivot);
    return pivot;
  });

  // Torso, plus a skirt for the female body.
  box(root, torsoW, 0.66, 0.32, top, 0, 1.13, 0);
  if (female) {
    add(root, new THREE.CylinderGeometry(0.27, 0.38, 0.46, 14), bottom, 0, 0.74, 0);
  } else {
    box(root, torsoW, 0.12, 0.34, bottom, 0, 0.84, 0);
  }

  // Arms swing from the shoulder.
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW / 2 + 0.1), 1.4, 0);
    box(pivot, 0.17, 0.3, 0.17, top, 0, -0.15, 0);
    box(pivot, 0.15, 0.32, 0.15, skin, 0, -0.46, 0);
    root.add(pivot);
    return pivot;
  });

  // Neck and head.
  box(root, 0.16, 0.1, 0.16, skin, 0, 1.47, 0);
  const head = new THREE.Group();
  head.position.set(0, HEAD_CENTER_Y, 0);
  root.add(head);
  box(head, 0.5, 0.5, 0.5, skin, 0, 0, 0);
  box(head, 0.08, 0.1, 0.02, dark, -0.12, 0.02, 0.255); // eyes
  box(head, 0.08, 0.1, 0.02, dark, 0.12, 0.02, 0.255);
  box(head, 0.14, 0.03, 0.02, dark, 0, -0.13, 0.255); // mouth

  // Hair is built in root space so hats sit on top of it.
  const hairGroup = new THREE.Group();
  hairGroup.position.set(0, HEAD_CENTER_Y, 0);
  head.add(hairGroup);
  hairGroup.position.set(0, 0, 0);
  const cap = () => {
    box(hairGroup, 0.54, 0.14, 0.54, hairMat, 0, 0.26, 0);
    box(hairGroup, 0.54, 0.4, 0.12, hairMat, 0, 0.06, -0.21);
  };
  switch (style.hair) {
    case 'short':
      cap();
      break;
    case 'afro':
      add(hairGroup, new THREE.SphereGeometry(0.42, 18, 14), hairMat, 0, 0.2, -0.04);
      break;
    case 'braids':
      cap();
      for (let i = -3; i <= 3; i += 1) box(hairGroup, 0.07, 0.62, 0.07, hairMat, i * 0.075, -0.12, -0.29);
      box(hairGroup, 0.07, 0.4, 0.07, hairMat, -0.29, -0.02, -0.05);
      box(hairGroup, 0.07, 0.4, 0.07, hairMat, 0.29, -0.02, -0.05);
      break;
    case 'bun':
      cap();
      add(hairGroup, new THREE.SphereGeometry(0.17, 14, 12), hairMat, 0, 0.4, -0.05);
      break;
    case 'ponytail':
      cap();
      box(hairGroup, 0.12, 0.12, 0.12, dark, 0, 0.12, -0.32);
      box(hairGroup, 0.16, 0.5, 0.14, hairMat, 0, -0.18, -0.36);
      break;
    case 'dreads':
      cap();
      for (let i = 0; i < 9; i += 1) {
        const angle = (i / 9) * Math.PI * 2;
        const len = 0.45 + (i % 3) * 0.12;
        box(hairGroup, 0.09, len, 0.09, hairMat, Math.sin(angle) * 0.29, 0.1 - len / 2 + 0.08, Math.cos(angle) * -0.29);
      }
      break;
    default:
      break; // bald
  }

  // Hat.
  const hatY = HAIR_LIFT[style.hair] + 0.25; // relative to the head centre
  const hatMat = mat(style.secondaryColor);
  const gold = mat('#f2c230');
  switch (style.hat) {
    case 'cap':
      box(head, 0.57, 0.15, 0.57, hatMat, 0, hatY + 0.05, 0);
      box(head, 0.5, 0.04, 0.3, hatMat, 0, hatY - 0.01, 0.4);
      break;
    case 'beanie': {
      const dome = add(head, new THREE.SphereGeometry(0.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, hatY - 0.04, 0);
      dome.scale.set(1, 0.9, 1);
      add(head, new THREE.SphereGeometry(0.07, 10, 8), top, 0, hatY + 0.3, 0);
      break;
    }
    case 'tophat':
      add(head, new THREE.CylinderGeometry(0.38, 0.38, 0.05, 18), dark, 0, hatY, 0);
      add(head, new THREE.CylinderGeometry(0.23, 0.23, 0.42, 18), dark, 0, hatY + 0.23, 0);
      add(head, new THREE.CylinderGeometry(0.235, 0.235, 0.08, 18), top, 0, hatY + 0.08, 0);
      break;
    case 'crown':
      add(head, new THREE.CylinderGeometry(0.27, 0.23, 0.16, 16), gold, 0, hatY + 0.06, 0);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        add(head, new THREE.ConeGeometry(0.055, 0.16, 6), gold, Math.sin(a) * 0.2, hatY + 0.22, Math.cos(a) * 0.2);
      }
      break;
    default:
      break;
  }

  // Accessory.
  switch (style.accessory) {
    case 'glasses': {
      const lens = mat('#9fd8ff', { transparent: true, opacity: 0.45 });
      for (const side of [-1, 1]) {
        box(head, 0.23, 0.18, 0.03, dark, side * 0.13, 0.02, 0.27);
        box(head, 0.17, 0.12, 0.035, lens, side * 0.13, 0.02, 0.278);
        box(head, 0.025, 0.025, 0.27, dark, side * 0.26, 0.04, 0.14); // arm over the ear
      }
      box(head, 0.06, 0.03, 0.03, dark, 0, 0.05, 0.27); // bridge
      break;
    }
    case 'earrings':
      for (const side of [-1, 1]) add(head, new THREE.SphereGeometry(0.05, 10, 8), gold, side * 0.27, -0.12, 0.02);
      break;
    case 'beard':
      box(head, 0.4, 0.18, 0.1, hairMat, 0, -0.2, 0.2);
      box(head, 0.2, 0.05, 0.05, hairMat, 0, -0.09, 0.26);
      break;
    case 'scarf':
      box(root, torsoW + 0.08, 0.14, 0.4, bottom, 0, 1.43, 0);
      box(root, 0.13, 0.32, 0.05, bottom, 0.14, 1.25, 0.21);
      break;
    case 'backpack':
      box(root, 0.42, 0.52, 0.22, bottom, 0, 1.14, -0.27);
      box(root, 0.1, 0.5, 0.04, dark, -0.18, 1.18, 0.17);
      box(root, 0.1, 0.5, 0.04, dark, 0.18, 1.18, 0.17);
      break;
    default:
      break;
  }

  root.userData = { style, legs, arms, head, materials };
  return root;
}

// Walking animation. walk is 0 when standing still and 1 at full speed.
export function animateCharacter(character, time, walk) {
  const { legs, arms, head } = character.userData;
  const swing = Math.sin(time * 11) * 0.75 * walk;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.9;
  arms[1].rotation.x = swing * 0.9;
  head.rotation.z = Math.sin(time * 5.5) * 0.05 * walk;
  character.position.y = Math.abs(Math.sin(time * 11)) * 0.08 * walk;
}

export function disposeCharacter(character) {
  character.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
  for (const m of character.userData.materials ?? []) m.dispose();
}
