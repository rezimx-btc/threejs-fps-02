// Kestrel Terminal: BREAKLINE's original map. A 52 x 40 m night container
// terminal — attackers push up from the south gate, defenders hold the Depot
// (Site A, west) and the Silos (Site B, east). Four lanes: A-long along the west
// wall, B-long past the stacked containers, mid through the gantry, and the north
// underpass that flanks both sites from behind. Cover is containers, crates,
// silo drums and a gantry frame; every box is both a bullet stop and a
// collider. Waypoints form the graph the bots navigate. Sodium lamps light the
// lanes; the two sites glow amber.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  bounds: { minX: -26, maxX: 26, minZ: -20, maxZ: 20 },
  attackerSpawn: { x: 0, z: 17 },
  defenderSpawn: { x: 0, z: -17 },
  sites: {
    A: { name: 'Depot', minX: -22.5, maxX: -11.5, minZ: -17.5, maxZ: -8.5, cx: -17, cz: -13 },
    B: { name: 'Silos', minX: 11.5, maxX: 22.5, minZ: -17.5, maxZ: -8.5, cx: 17, cz: -13 },
  },
};

// Waypoint graph: [x, z] nodes, edges by index. Bots run BFS over this.
const NODES = [
  [0, 17], // 0 attacker spawn
  [-15, 14], // 1 west approach
  [15, 14], // 2 east approach
  [0, 11], // 3 south mid
  [0, 5], // 4 mid south
  [0, -1], // 5 mid (gantry)
  [0, -7], // 6 mid north
  [-20, 6], // 7 A-long south
  [-20, -3], // 8 A-long north
  [-17, -13], // 9 site A
  [-11, -14], // 10 A east edge
  [20, 6], // 11 B-long south
  [20, -3], // 12 B-long north
  [17, -13], // 13 site B
  [11, -14], // 14 B west edge
  [-9, -17], // 15 defender A
  [9, -17], // 16 defender B
  [0, -17], // 17 defender mid
  [-23, -8], // 18 A corner
  [23, -8], // 19 B corner
  [-24, -17], // 20 underpass west
  [24, -17], // 21 underpass east
  [0, -12], // 22 north connector
  [-6, 8], // 23 south-west pocket
  [6, 8], // 24 south-east pocket
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [5, 6], [6, 17], [6, 10], [6, 14],
  [1, 7], [7, 8], [8, 9], [9, 10], [10, 15], [2, 11], [11, 12], [12, 13],
  [13, 14], [14, 16], [15, 17], [16, 17], [5, 8], [5, 12], [4, 7], [4, 11],
  [8, 18], [9, 18], [12, 19], [13, 19], [15, 10], [16, 14],
  [18, 20], [20, 15], [19, 21], [21, 16], [15, 22], [16, 22], [22, 6],
  [3, 23], [3, 24], [23, 7], [24, 11], [1, 23], [2, 24],
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

  // Ground: wet asphalt with darker worn patches and scrub at the edges.
  box(53, 0.4, 41, 0, -0.2, 0, 'ground');
  box(11, 0.06, 8, -18, 0.03, 9, 'groundDark', false);
  box(10, 0.06, 7, 17, 0.03, 7, 'groundDark', false);
  box(8, 0.06, 5, 0, 0.03, -14, 'groundDark', false);
  box(6, 0.06, 4, -22, 0.03, -2, 'grass', false);
  box(6, 0.06, 4, 22, 0.03, 1, 'grass', false);

  // Perimeter walls, 5 m, open night sky above.
  box(0.5, 5, 41, -26.2, 2.5, 0, 'wall');
  box(0.5, 5, 41, 26.2, 2.5, 0, 'wall');
  box(53, 5, 0.5, 0, 2.5, -20.2, 'wall');
  box(53, 5, 0.5, 0, 2.5, 20.2, 'wall');

  // --- Site A: the Depot (west). Container stacks, drum rows, a low wall. ---
  box(5.2, 2.6, 2.4, -21.5, 1.3, -15.5, 'rust');
  box(5.2, 2.6, 2.4, -21.5, 3.9, -15.5, 'tealBox');
  box(2.4, 2.6, 2.4, -13.5, 1.3, -16.5, 'ochreBox');
  cylinder(1.1, 2.4, -12.5, 1.2, -10.5, 'metalLight');
  cylinder(1.1, 2.4, -14.8, 1.2, -10.2, 'metal');
  box(3.4, 1.1, 1.4, -17.5, 0.55, -9.5, 'crate');
  box(1.4, 1.1, 1.4, -13.5, 0.55, -12.5, 'crateDark');
  box(4.2, 1.0, 0.8, -12, 0.5, -8.8, 'wallLight');

  // --- Site B: the Silos (east). Two tall silos, container stacks, crane legs. ---
  cylinder(1.8, 6.4, 20, 3.2, -15.5, 'metalLight', 18);
  cylinder(1.8, 5.2, 15.8, 2.6, -16.8, 'metal', 18);
  box(4.4, 2.6, 2.4, 12.5, 1.3, -10.5, 'tealBox');
  box(1.4, 1.1, 1.4, 15.5, 0.55, -9.5, 'crateDark');
  box(3.4, 1.1, 1.4, 19.5, 0.55, -10.5, 'crate');
  box(0.7, 5.6, 0.7, 11, 2.8, -12.5, 'metalLight');
  box(0.7, 5.6, 0.7, 19, 2.8, -12.5, 'metalLight');
  box(8.8, 0.6, 0.9, 15, 5.4, -12.5, 'metal');

  // --- Mid: the gantry frame, central pillar, sandbags. ---
  box(0.8, 4.4, 0.8, -3.5, 2.2, -1, 'metalLight');
  box(0.8, 4.4, 0.8, 3.5, 2.2, -1, 'metalLight');
  box(7.8, 0.7, 1.0, 0, 4.2, -1, 'metal');
  box(1.3, 3.4, 1.3, 0, 1.7, -4.5, 'wallLight');
  box(1.2, 1.0, 3.4, -5, 0.5, 2.5, 'crate');
  box(1.2, 1.0, 3.4, 5, 0.5, 2.5, 'crateDark');
  box(2.2, 0.9, 1.0, -2.5, 0.45, 8, 'crateDark');
  box(2.2, 0.9, 1.0, 2.5, 0.45, 8, 'crate');
  box(3.0, 1.0, 1.0, 0, 0.5, -8, 'wallLight');

  // --- Lanes: A-long crates, B-long containers, spawn cover, underpass walls. ---
  box(1.5, 1.1, 1.5, -22.5, 0.55, 5, 'crate');
  box(1.5, 1.1, 1.5, -22.5, 0.55, 1, 'crateDark');
  box(1.5, 2.2, 1.5, -23, 1.1, -4, 'metal');
  box(1.5, 1.1, 1.5, 22.5, 0.55, 5, 'crateDark');
  box(1.5, 1.1, 1.5, 22.5, 0.55, 1, 'crate');
  box(3.2, 2.4, 1.6, 23, 1.2, -3, 'rust');
  box(1.6, 1.1, 1.6, -8, 0.55, 14, 'crate');
  box(1.6, 1.1, 1.6, 8, 0.55, 14, 'crateDark');
  box(2.4, 0.9, 1.2, -3, 0.45, 18, 'crate');
  box(2.4, 0.9, 1.2, 3, 0.45, 18, 'crateDark');
  box(1.6, 1.1, 1.6, -9, 0.55, -17, 'crate');
  box(1.6, 1.1, 1.6, 9, 0.55, -17, 'crateDark');
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
    // A beacon pole with a glowing lamp over each site.
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

  // Sodium lamps along the lanes.
  for (const [lx, lz] of [[-20, 6], [20, 6], [-12, 2], [-8, 14], [8, 14]]) {
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

  // Light: cold moonlight from the north-east, warm sodium pools at the lamps,
  // and a dim blue hemisphere so shadows stay readable.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x2c3a55), new THREE.Color(PALETTE.ground), 1.0);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color(0xaac4e8), 1.3);
  moon.position.set(14, 22, -16);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -32;
  moon.shadow.camera.right = 32;
  moon.shadow.camera.top = 26;
  moon.shadow.camera.bottom = -26;
  moon.shadow.camera.far = 70;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  for (const lamp of lampPositions) {
    const point = new THREE.PointLight(new THREE.Color(0xffc46b), 26, 22, 1.8);
    point.position.set(lamp.x, lamp.y, lamp.z);
    scene.add(point);
  }

  return { colliders, shootables, minimapWalls, group };
}
