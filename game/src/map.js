// Foundry Yard: SANDLINE's original map. A 46 x 36 m dusk industrial yard —
// attackers push up from the south gate, defenders hold the foundry (Site A, west)
// and the crane yard (Site B, east). Three lanes: A-long along the west wall, mid
// through the double doors, B-long past the stacked containers. Cover is crates,
// containers, furnace blocks and sandbags; every box is both a bullet stop and a
// collider. Waypoints form the graph the bots navigate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -23, maxX: 23, minZ: -18, maxZ: 18 },
  attackerSpawn: { x: 0, z: 15 },
  defenderSpawn: { x: 0, z: -15 },
  sites: {
    A: { name: 'Foundry', minX: -19.5, maxX: -9.5, minZ: -15.5, maxZ: -6.5, cx: -14.5, cz: -11 },
    B: { name: 'Crane Yard', minX: 9.5, maxX: 19.5, minZ: -15.5, maxZ: -6.5, cx: 14.5, cz: -11 },
  },
};

// Waypoint graph: [x, z] nodes, edges by index. Bots run BFS over this.
const NODES = [
  [0, 15], // 0 attacker spawn
  [-13, 12], // 1 west approach
  [13, 12], // 2 east approach
  [0, 9], // 3 south mid
  [0, 4], // 4 mid south
  [0, -1], // 5 mid
  [0, -7], // 6 mid north
  [-17, 4], // 7 A-long south
  [-16, -4], // 8 A-long north
  [-14.5, -11], // 9 site A
  [-9, -12], // 10 A east edge
  [17, 4], // 11 B-long south
  [16, -4], // 12 B-long north
  [14.5, -11], // 13 site B
  [9, -12], // 14 B west edge
  [-8, -14.5], // 15 defender A
  [8, -14.5], // 16 defender B
  [0, -14.5], // 17 defender mid
  [-19, -8], // 18 A corner
  [19, -8], // 19 B corner
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [5, 6], [6, 17], [6, 10], [6, 14],
  [1, 7], [7, 8], [8, 9], [9, 10], [10, 15], [2, 11], [11, 12], [12, 13],
  [13, 14], [14, 16], [15, 17], [16, 17], [5, 8], [5, 12], [4, 7], [4, 11],
  [8, 18], [9, 18], [12, 19], [13, 19], [15, 10], [16, 14],
];

export function buildGraph() {
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return { nodes: NODES, adjacency };
}

// Breadth-first path between nearest nodes. Returns node indices, start excluded.
export function findPath(graph, fromX, fromZ, toX, toZ) {
  let start = 0;
  let goal = 0;
  let bestStart = Infinity;
  let bestGoal = Infinity;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const dx = graph.nodes[i][0] - fromX;
    const dz = graph.nodes[i][1] - fromZ;
    const d = dx * dx + dz * dz;
    if (d < bestStart) { bestStart = d; start = i; }
    const gx = graph.nodes[i][0] - toX;
    const gz = graph.nodes[i][1] - toZ;
    const g = gx * gx + gz * gz;
    if (g < bestGoal) { bestGoal = g; goal = i; }
  }
  const prev = new Array(graph.nodes.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of graph.adjacency[cur]) {
      if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
    }
  }
  const path = [];
  let cur = goal;
  if (prev[cur] === -1) return path;
  while (cur !== start) { path.unshift(cur); cur = prev[cur]; }
  return path;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'metalLight' ? 0.5 : 0.92,
      metalness: name.startsWith('metal') ? 0.35 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];
  const minimapWalls = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      if (h > 1.2) minimapWalls.push({ x: x - w / 2, z: z - d / 2, w, d });
    }
    return mesh;
  }

  // Ground: sand-packed yard with darker worn patches and scrub at the edges.
  box(47, 0.4, 37, 0, -0.2, 0, 'ground');
  box(10, 0.06, 8, -16, 0.03, 8, 'groundDark', false);
  box(9, 0.06, 7, 15, 0.03, 6, 'groundDark', false);
  box(6, 0.06, 4, -18, 0.03, -2, 'grass', false);
  box(6, 0.06, 4, 18, 0.03, 1, 'grass', false);

  // Perimeter walls, 4.6 m, open sky above.
  box(0.5, 4.6, 37, -23.2, 2.3, 0, 'wall');
  box(0.5, 4.6, 37, 23.2, 2.3, 0, 'wall');
  box(47, 4.6, 0.5, 0, 2.3, -18.2, 'wall');
  box(47, 4.6, 0.5, 0, 2.3, 18.2, 'wall');

  // --- Site A: the Foundry (west). Furnace blocks, ingot stacks, a low wall. ---
  box(2.2, 3.4, 2.2, -19, 1.7, -13.5, 'metal');
  box(2.2, 2.6, 2.2, -19, 1.3, -9.5, 'metalLight');
  box(3.4, 1.1, 1.4, -15.5, 0.55, -14.5, 'crate');
  box(1.4, 1.1, 1.4, -12, 0.55, -8.5, 'crateDark');
  box(1.4, 1.1, 1.4, -11, 0.55, -13.8, 'crate');
  box(4.2, 1.0, 0.8, -10.5, 0.5, -7.2, 'wallLight');

  // --- Site B: the Crane Yard (east). Stacked containers, crane legs. ---
  box(4.4, 2.6, 2.4, 18.5, 1.3, -13.5, 'metal');
  box(4.4, 2.6, 2.4, 18.5, 3.9, -13.5, 'metalLight');
  box(2.4, 2.6, 2.4, 12.5, 1.3, -14.5, 'metal');
  box(1.4, 1.1, 1.4, 11.5, 0.55, -8.5, 'crateDark');
  box(3.4, 1.1, 1.4, 15.5, 0.55, -8.2, 'crate');
  box(0.7, 5.2, 0.7, 10.8, 2.6, -10.5, 'metalLight');
  box(0.7, 5.2, 0.7, 18.8, 2.6, -10.5, 'metalLight');
  box(8.8, 0.6, 0.9, 14.8, 5.0, -10.5, 'metal');

  // --- Mid: double-door frame, central pillar, sandbags. ---
  box(1.3, 3.4, 1.3, 0, 1.7, -1, 'wallLight');
  box(1.2, 1.0, 3.4, -4.5, 0.5, 1.5, 'crate');
  box(1.2, 1.0, 3.4, 4.5, 0.5, 1.5, 'crateDark');
  box(2.2, 0.9, 1.0, -2.5, 0.45, 6.5, 'crateDark');
  box(2.2, 0.9, 1.0, 2.5, 0.45, 6.5, 'crate');
  box(3.0, 1.0, 1.0, 0, 0.5, -6.5, 'wallLight');

  // --- Lanes: A-long crates, B-long containers, spawn cover. ---
  box(1.5, 1.1, 1.5, -19.5, 0.55, 4, 'crate');
  box(1.5, 1.1, 1.5, -19.5, 0.55, 0.5, 'crateDark');
  box(1.5, 2.2, 1.5, -20, 1.1, -4, 'metal');
  box(1.5, 1.1, 1.5, 19.5, 0.55, 4, 'crateDark');
  box(1.5, 1.1, 1.5, 19.5, 0.55, 0.5, 'crate');
  box(3.2, 2.4, 1.6, 20, 1.2, -2, 'metal');
  box(1.6, 1.1, 1.6, -7, 0.55, 12, 'crate');
  box(1.6, 1.1, 1.6, 7, 0.55, 12, 'crateDark');
  box(2.4, 0.9, 1.2, -3, 0.45, 15.5, 'crate');
  box(2.4, 0.9, 1.2, 3, 0.45, 15.5, 'crateDark');
  box(1.6, 1.1, 1.6, -8, 0.55, -14.5, 'crate');
  box(1.6, 1.1, 1.6, 8, 0.55, -14.5, 'crateDark');

  // Site markers: flat amber pads that read as the objective at a glance.
  const siteMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 3.2), siteMat);
    pad.position.set(site.cx, 0.04, site.cz);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // Light: low amber sun from the south-west, cool fill, warm sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a94a8), new THREE.Color(PALETTE.ground), 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffd9a0), 2.6);
  sun.position.set(-14, 18, 16);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x7a86a0), 0.5);
  fill.position.set(12, 10, -14);
  scene.add(fill);

  return { colliders, shootables, minimapWalls, group };
}
