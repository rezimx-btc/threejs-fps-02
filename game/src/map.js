// Crosscurrent Quay: CROSSCURRENT's original map. A 56 x 40 m dawn harbour
// quay — attackers push up from the south gate, defenders hold the Crane Yard
// (Site A, west) and the Fuel Dock (Site B, east). Four ground lanes: A-long
// along the west wall, B-long past the fuel tanks, mid through the crane legs,
// and the underpass beneath the north gantry walkway. The walkway itself is a
// second floor: two stepped staircases climb to a raised deck that overlooks
// both sites, so the high ground is a real fight. Cover is containers, crates,
// fuel drums and crane steel; every box is both a bullet stop and a collider.
// Waypoints form the graph the bots navigate; deck nodes only connect through
// the stair chains, so a bot never tries to walk off the deck.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -28, maxX: 28, minZ: -20, maxZ: 20 },
  attackerSpawn: { x: 0, z: 17 },
  defenderSpawn: { x: 0, z: -17 },
  sites: {
    A: { name: 'Crane Yard', minX: -24, maxX: -13, minZ: -17, maxZ: -8, cx: -18.5, cz: -12.5 },
    B: { name: 'Fuel Dock', minX: 13, maxX: 24, minZ: -17, maxZ: -8, cx: 18.5, cz: -12.5 },
  },
  deck: { minX: -28, maxX: 28, minZ: -19.5, maxZ: -15.8, top: 2.7 },
  stairs: [
    { minX: -26.2, maxX: -23.8, z0: -8, z1: -16.5 }, // west staircase
    { minX: 23.8, maxX: 26.2, z0: -8, z1: -16.5 }, // east staircase
  ],
};

// The floor height under any (x, z): the gantry deck, a staircase step, or the
// quay itself. Bots settle onto it after moving; the player climbs the same
// steps through the step-up in player.js.
export function groundHeightAt(x, z) {
  if (x >= MAP.deck.minX && x <= MAP.deck.maxX && z >= MAP.deck.minZ && z <= MAP.deck.maxZ) return MAP.deck.top;
  for (const s of MAP.stairs) {
    if (x >= s.minX && x <= s.maxX && z <= s.z0 && z >= s.z1) {
      const depth = s.z0 - z;
      const step = Math.min(7, Math.floor(depth / 1.06));
      return 0.3 * (step + 1);
    }
  }
  return 0;
}

// Waypoint graph: [x, z, y] nodes, edges by index. Bots run BFS over this.
// Deck nodes (y 2.7) connect to the ground only through the stair chains.
const NODES = [
  [0, 17, 0], // 0 attacker spawn
  [-16, 14, 0], // 1 west approach
  [16, 14, 0], // 2 east approach
  [0, 11, 0], // 3 south mid
  [0, 5, 0], // 4 mid south
  [0, -1, 0], // 5 mid (crane legs)
  [0, -7, 0], // 6 mid north
  [-22, 6, 0], // 7 A-long south
  [-22, -3, 0], // 8 A-long north
  [-18.5, -12.5, 0], // 9 site A
  [-12, -13, 0], // 10 A east edge
  [22, 6, 0], // 11 B-long south
  [22, -3, 0], // 12 B-long north
  [18.5, -12.5, 0], // 13 site B
  [12, -13, 0], // 14 B west edge
  [-10, -18.5, 0], // 15 underpass west
  [10, -18.5, 0], // 16 underpass east
  [0, -18.5, 0], // 17 underpass mid
  [-25, -5, 0], // 18 A corner
  [25, -5, 0], // 19 B corner
  [-24.5, -18.5, 0], // 20 underpass far west
  [24.5, -18.5, 0], // 21 underpass far east
  [-7, 8, 0], // 22 south-west pocket
  [7, 8, 0], // 23 south-east pocket
  [-25, -8, 0], // 24 west stair foot
  [25, -8, 0], // 25 east stair foot
  [-25, -12, 1.2], // 26 west stair mid
  [25, -12, 1.2], // 27 east stair mid
  [-25, -15.5, 2.4], // 28 west stair head
  [25, -15.5, 2.4], // 29 east stair head
  [-18, -17.5, 2.7], // 30 deck west (overlooks A)
  [0, -17.5, 2.7], // 31 deck mid
  [18, -17.5, 2.7], // 32 deck east (overlooks B)
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [5, 6], [6, 10], [6, 14],
  [1, 7], [7, 8], [8, 9], [9, 10], [10, 15], [2, 11], [11, 12], [12, 13],
  [13, 14], [14, 16], [15, 17], [16, 17], [5, 8], [5, 12], [4, 7], [4, 11],
  [8, 18], [9, 18], [12, 19], [13, 19], [15, 20], [16, 21],
  [18, 20], [19, 21], [15, 22], [16, 22], [22, 6],
  [3, 22], [3, 23], [22, 7], [23, 11], [1, 22], [2, 23],
  [7, 24], [11, 25], [24, 26], [25, 27], [26, 28], [27, 29],
  [28, 30], [29, 32], [30, 31], [31, 32],
  [20, 24], [21, 25], [15, 10], [16, 14],
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
      roughness: name === 'accent' || name === 'metalLight' || name === 'lamp' ? 0.5 : 0.92,
      metalness: name.startsWith('metal') || name === 'rust' ? 0.4 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];
  const minimapWalls = [];
  const lampPositions = [];

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

  function cylinder(r, h, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (h > 1.2) minimapWalls.push({ x: x - r, z: z - r, w: r * 2, d: r * 2 });
    return mesh;
  }

  // Ground: damp concrete with darker worn patches and scrub at the edges.
  box(57, 0.4, 41, 0, -0.2, 0, 'ground');
  box(11, 0.06, 8, -19, 0.03, 9, 'groundDark', false);
  box(10, 0.06, 7, 18, 0.03, 7, 'groundDark', false);
  box(8, 0.06, 5, 0, 0.03, -14, 'groundDark', false);
  box(6, 0.06, 4, -24, 0.03, -2, 'grass', false);
  box(6, 0.06, 4, 24, 0.03, 1, 'grass', false);

  // Harbour water beyond the low north wall: a flat blue plane, visual only.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 40),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.water), roughness: 0.25, metalness: 0.55 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.1, -42);
  group.add(water);
  // A distant crane silhouette across the water, so the horizon reads.
  box(1.2, 14, 1.2, -18, 7, -34, 'metal', false);
  box(1.2, 14, 1.2, -10, 7, -34, 'metal', false);
  box(10, 1.2, 1.2, -14, 13.5, -34, 'metal', false);

  // Perimeter walls: 4.5 m, the north wall lower (2.5 m) so the water shows.
  box(0.5, 4.5, 41, -28.2, 2.25, 0, 'wall');
  box(0.5, 4.5, 41, 28.2, 2.25, 0, 'wall');
  box(57, 2.5, 0.5, 0, 1.25, -20.2, 'wall');
  box(57, 4.5, 0.5, 0, 2.25, 20.2, 'wall');

  // --- Gantry walkway: the raised deck along the north edge, two staircases. ---
  box(56, 0.3, 3.7, 0, 2.55, -17.65, 'metalLight');
  // Deck edge railing on the south side, low enough to shoot over — with a
  // gap at each staircase head, or nobody could step onto the deck.
  box(1.8, 0.9, 0.12, -27.1, 3.15, -15.85, 'metal');
  box(47.6, 0.9, 0.12, 0, 3.15, -15.85, 'metal');
  box(1.8, 0.9, 0.12, 27.1, 3.15, -15.85, 'metal');
  // Staircases: eight 0.3 m steps each, climbing northward.
  for (const s of MAP.stairs) {
    for (let i = 0; i < 8; i += 1) {
      const z = s.z0 - 0.53 - i * 1.06;
      box(2.4, 0.3 * (i + 1), 1.06, (s.minX + s.maxX) / 2, 0.15 * (i + 1), z, 'wallLight');
    }
    // Stair side rails.
    box(0.12, 1.0, 8.5, s.minX - 0.1, 2.0, -12.25, 'metal');
    box(0.12, 1.0, 8.5, s.maxX + 0.1, 2.0, -12.25, 'metal');
  }

  // --- Site A: the Crane Yard (west). Gantry crane legs, container stacks. ---
  box(0.9, 7.5, 0.9, -23, 3.75, -10, 'metalLight');
  box(0.9, 7.5, 0.9, -14, 3.75, -10, 'metalLight');
  box(10.5, 1.0, 1.1, -18.5, 7.6, -10, 'metal');
  box(5.2, 2.6, 2.4, -22, 1.3, -15.5, 'rust');
  box(5.2, 2.6, 2.4, -22, 3.9, -15.5, 'tealBox');
  box(2.4, 2.6, 2.4, -14, 1.3, -16.5, 'ochreBox');
  cylinder(1.1, 2.4, -13.5, 1.2, -10.5, 'metalLight');
  cylinder(1.1, 2.4, -16, 1.2, -10.2, 'metal');
  box(3.4, 1.1, 1.4, -18, 0.55, -9.5, 'crate');
  box(1.4, 1.1, 1.4, -14.5, 0.55, -12.5, 'crateDark');
  box(4.2, 1.0, 0.8, -13, 0.5, -8.8, 'wallLight');

  // --- Site B: the Fuel Dock (east). Two tall fuel tanks, pipes, containers. ---
  cylinder(2.0, 5.5, 21, 2.75, -15.5, 'metalLight', 18);
  cylinder(2.0, 4.4, 16, 2.2, -16.8, 'metal', 18);
  box(4.4, 2.6, 2.4, 13.5, 1.3, -10.5, 'tealBox');
  box(1.4, 1.1, 1.4, 16.5, 0.55, -9.5, 'crateDark');
  box(3.4, 1.1, 1.4, 20.5, 0.55, -10.5, 'crate');
  box(0.7, 5.2, 0.7, 12.5, 2.6, -12.5, 'metalLight');
  box(0.7, 5.2, 0.7, 20, 2.6, -12.5, 'metalLight');
  box(8.8, 0.6, 0.9, 16, 5.0, -12.5, 'metal');
  // A pipe run along the east wall, low cover in the lane.
  box(0.8, 0.8, 14, 26.5, 0.4, -4, 'rust');

  // --- Mid: container stack island, crane legs, forklift boxes. ---
  box(1.0, 4.4, 1.0, -3.5, 2.2, -1, 'metalLight');
  box(1.0, 4.4, 1.0, 3.5, 2.2, -1, 'metalLight');
  box(8.0, 0.7, 1.1, 0, 4.2, -1, 'metal');
  box(1.3, 3.4, 1.3, 0, 1.7, -4.5, 'wallLight');
  box(2.6, 2.6, 2.4, -6.5, 1.3, 3.5, 'rust');
  box(2.6, 2.6, 2.4, 6.5, 1.3, 3.5, 'tealBox');
  box(1.2, 1.0, 3.4, -5, 0.5, 2.5, 'crate');
  box(1.2, 1.0, 3.4, 5, 0.5, 2.5, 'crateDark');
  box(2.2, 0.9, 1.0, -2.5, 0.45, 8, 'crateDark');
  box(2.2, 0.9, 1.0, 2.5, 0.45, 8, 'crate');
  box(3.0, 1.0, 1.0, 0, 0.5, -8, 'wallLight');

  // --- Lanes: A-long crates, B-long containers, spawn cover, underpass walls. ---
  box(1.5, 1.1, 1.5, -24.5, 0.55, 5, 'crate');
  box(1.5, 1.1, 1.5, -24.5, 0.55, 1, 'crateDark');
  box(1.5, 2.2, 1.5, -25, 1.1, -4, 'metal');
  box(1.5, 1.1, 1.5, 24.5, 0.55, 5, 'crateDark');
  box(1.5, 1.1, 1.5, 24.5, 0.55, 1, 'crate');
  box(3.2, 2.4, 1.6, 25, 1.2, -3, 'rust');
  box(1.6, 1.1, 1.6, -9, 0.55, 14, 'crate');
  box(1.6, 1.1, 1.6, 9, 0.55, 14, 'crateDark');
  box(2.4, 0.9, 1.2, -3, 0.45, 18, 'crate');
  box(2.4, 0.9, 1.2, 3, 0.45, 18, 'crateDark');
  box(1.6, 1.1, 1.6, -10, 0.55, -17, 'crate');
  box(1.6, 1.1, 1.6, 10, 0.55, -17, 'crateDark');
  box(6.0, 2.6, 1.0, -12, 1.3, -19.2, 'wallLight');
  box(6.0, 2.6, 1.0, 12, 1.3, -19.2, 'wallLight');

  // Site beacons: flat amber pads that read as the objective at a glance.
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.55,
  });
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 3.4), siteMat);
    pad.position.set(site.cx, 0.04, site.cz);
    pad.receiveShadow = true;
    group.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8), materials.metalLight);
    pole.position.set(site.cx + 3.2, 2.3, site.cz + 2.6);
    group.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 1.6,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
    lamp.position.set(site.cx + 3.2, 4.7, site.cz + 2.6);
    group.add(lamp);
    lampPositions.push({ x: site.cx + 3.2, y: 4.7, z: site.cz + 2.6 });
  }

  // Quay lamps along the lanes.
  for (const [lx, lz] of [[-22, 6], [22, 6], [-12, 2], [-8, 14], [8, 14]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 8), materials.metalLight);
    pole.position.set(lx, 2.1, lz);
    group.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 1.4,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lampMat);
    lamp.position.set(lx, 4.3, lz);
    group.add(lamp);
    lampPositions.push({ x: lx, y: 4.3, z: lz });
  }

  // Light: low amber sun from the east, warm lamp pools, a cool blue
  // hemisphere so shadows stay readable at dawn.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x51698a), new THREE.Color(PALETTE.ground), 1.05);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffd9a0), 1.6);
  sun.position.set(26, 12, -6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  for (const lamp of lampPositions) {
    const point = new THREE.PointLight(new THREE.Color(0xffc46b), 26, 22, 1.8);
    point.position.set(lamp.x, lamp.y, lamp.z);
    scene.add(point);
  }

  return { colliders, shootables, minimapWalls, group };
}
