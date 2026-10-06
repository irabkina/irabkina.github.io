// Sam's scenario from "Knowing When to Re-Represent", acted out in a small 3D office.
// Mounted by layouts/_shortcodes/sam-scene.html on every .sam-scene figure.
//
// Everything on screen is a pure function of the time t, so playing, scrubbing and
// jumping to a line all go through the same apply(t).

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

/* ------------------------------------------------------------------ rounded boxes
   The vertex math of three.js's RoundedBoxGeometry (MIT, three.js authors), without UVs,
   so the scene needs no import map for three's addons. */
class RoundedBox extends THREE.BoxGeometry {
	constructor(width, height, depth, segments = 2, radius = 0.1) {
		segments = segments * 2 + 1;
		radius = Math.min(width / 2, height / 2, depth / 2, radius);
		super(1, 1, 1, segments, segments, segments);
		const flat = this.toNonIndexed();
		this.index = null;
		this.attributes.position = flat.attributes.position;
		this.attributes.normal = flat.attributes.normal;
		this.attributes.uv = flat.attributes.uv;
		const p = new THREE.Vector3(), n = new THREE.Vector3();
		const box = new THREE.Vector3(width, height, depth).divideScalar(2).subScalar(radius);
		const pos = this.attributes.position.array, nor = this.attributes.normal.array;
		const half = 0.5 / segments;
		for (let i = 0; i < pos.length; i += 3) {
			p.fromArray(pos, i);
			n.copy(p);
			n.x -= Math.sign(n.x) * half; n.y -= Math.sign(n.y) * half; n.z -= Math.sign(n.z) * half;
			n.normalize();
			pos[i] = box.x * Math.sign(p.x) + n.x * radius;
			pos[i + 1] = box.y * Math.sign(p.y) + n.y * radius;
			pos[i + 2] = box.z * Math.sign(p.z) + n.z * radius;
			nor[i] = n.x; nor[i + 1] = n.y; nor[i + 2] = n.z;
		}
	}
}

/* ------------------------------------------------------------------ helpers */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const yawOf = (dx, dz) => Math.atan2(dx, dz);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
const V = (x, z) => new THREE.Vector3(x, 0, z);
const UP = new THREE.Vector3(0, 1, 0);

// piecewise keyframes [[t, v], ...], eased between keys
function ramp(t, keys) {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
		const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
		return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
	}
	return keys[keys.length - 1][1];
}

// trapezoidal speed profile: [fraction of the distance covered, relative speed]
function trap(t, T) {
	const a = Math.min(0.35, T / 3), v = 1 / (T - a);
	if (t <= 0) return [0, 0];
	if (t >= T) return [1, 0];
	if (t < a) return [0.5 * v * t * t / a, t / a];
	if (t < T - a) return [0.5 * v * a + v * (t - a), 1];
	const r = T - t;
	return [1 - 0.5 * v * r * r / a, r / a];
}

// A character's position and heading over time, built from waits, turns and walks.
class Track {
	constructor(t, pos, yaw) {
		this.ev = []; this.t = t; this.pos = pos.clone(); this.yaw = yaw;
		this.t0 = t; this.pos0 = pos.clone(); this.yaw0 = yaw;
	}
	wait(d) { this.ev.push({ k: "hold", t0: this.t, t1: this.t + d, pos: this.pos.clone(), yaw: this.yaw }); this.t += d; return this; }
	turn(yaw, d = 0.45) { this.ev.push({ k: "turn", t0: this.t, t1: this.t + d, pos: this.pos.clone(), y0: this.yaw, y1: yaw }); this.t += d; this.yaw = yaw; return this; }
	walk(points, speed) {
		const pts = [this.pos.clone(), ...points];
		const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
		const len = curve.getLength(), d = len / speed, tan = curve.getTangentAt(1);
		this.ev.push({ k: "walk", t0: this.t, t1: this.t + d, curve, len, y0: this.yaw });
		this.t += d; this.pos = pts[pts.length - 1].clone(); this.yaw = yawOf(tan.x, tan.z);
		return this;
	}
	at(t) {
		if (t <= (this.ev[0] ? this.ev[0].t0 : this.t0)) return { pos: this.pos0.clone(), yaw: this.yaw0, move: 0, dist: 0 };
		let dist = 0;
		for (const e of this.ev) {
			if (e.k === "walk" && t > e.t1) dist += e.len;
			if (t < e.t0 || t > e.t1) continue;
			const u = t - e.t0, T = e.t1 - e.t0;
			if (e.k === "hold") return { pos: e.pos.clone(), yaw: e.yaw, move: 0, dist };
			if (e.k === "turn") return { pos: e.pos.clone(), yaw: lerpAngle(e.y0, e.y1, smooth(u / T)), move: 0, dist };
			const [f, sp] = trap(u, T);
			const tg = e.curve.getTangentAt(Math.min(f, 0.999));
			return { pos: e.curve.getPointAt(f), yaw: lerpAngle(e.y0, yawOf(tg.x, tg.z), smooth(u / 0.3)), move: sp, dist: dist + f * e.len };
		}
		return { pos: this.pos.clone(), yaw: this.yaw, move: 0, dist };
	}
}

/* ------------------------------------------------------------------ mini map: two rooms and the report */
const MINI = `
	<rect class="sam-mini__office" x="1" y="1" width="18" height="26" rx="3"/>
	<rect class="sam-mini__hall" x="20" y="9" width="8" height="18" rx="1.5"/>
	<rect class="sam-mini__conf" x="29" y="1" width="18" height="26" rx="3"/>
	<rect class="sam-mini__doc" x="5.5" y="10" width="9" height="7" rx="1.2"/>`;
const DOC_X = { office: 0, hall: 14, conf: 28 };
function setMini(svg, where) {
	const doc = svg.querySelector(".sam-mini__doc");
	doc.style.opacity = where ? 1 : 0;
	if (where) doc.style.transform = `translateX(${DOC_X[where]}px)`;
}

/* ------------------------------------------------------------------ scene colours */
const C = {
	office: "#93b7b0", conf: "#a9acd6", hall: "#f1e8d6", wall: "#e8dbc1", wallTop: "#f3ead8", slab: "#d8c7a6",
	wood: "#5b5552", woodTop: "#6a6461", sam: "#e98a6e", alex: "#4f6194", head: "#f4eadf", eye: "#2b2724",
	report: "#f2b92b", reportPage: "#fff6e3", belief: "#ee5f45", real: "#e9a800",
};

function mount(root) {
	const $ = (name) => root.querySelector(`[data-sam="${name}"]`);
	const stage = $("stage");

	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ antialias: true });
	} catch (err) {
		root.classList.add("sam-scene--no-webgl");
		return;
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.domElement.className = "sam-scene__canvas";
	stage.prepend(renderer.domElement);
	root.classList.add("sam-scene--ready");

	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 200);
	const TARGET = new THREE.Vector3(0.6, 0.4, 0.2);
	camera.position.copy(TARGET).add(new THREE.Vector3(1.0, 1.12, 1.3).normalize().multiplyScalar(60));
	camera.lookAt(TARGET);

	scene.add(new THREE.HemisphereLight("#ffffff", "#d9cbb5", 1.55));
	const sun = new THREE.DirectionalLight("#fff4e6", 2.3);
	sun.position.set(-7, 14, 9);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 });
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.03;
	scene.add(sun);

	const mats = new Map();
	const mat = (hex) => {
		if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0 }));
		return mats.get(hex);
	};
	function box(w, h, d, color, x, y, z, { r = 0.06, shadow = true } = {}) {
		const m = new THREE.Mesh(new RoundedBox(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat(color));
		m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
		scene.add(m);
		return m;
	}

	/* -------------------------------------------------------------- the diorama
	   x points right and z toward the viewer: the office on the left, the conference room
	   on the right, and a hallway between them that leads out toward the viewer. */
	const OFF = { x0: -5.4, x1: -1.2, z0: -3.2, z1: 1.4 };
	const CON = { x0: 1.2, x1: 6.2, z0: -3.2, z1: 1.4 };
	const HALL = { x0: -1.2, x1: 1.2, z0: -3.2, z1: 3.9 };
	const DOOR = { z0: -1.65, z1: -0.35 };
	const WT = 0.26, TALL = 1.95, LOW = 0.62;

	box(OFF.x1 - OFF.x0 + CON.x1 - CON.x0 + 2.9, 0.36, OFF.z1 - OFF.z0 + 0.5, C.slab, (OFF.x0 + CON.x1) / 2, -0.19, (OFF.z0 + OFF.z1) / 2, { r: 0.12 });
	box(2.9, 0.36, HALL.z1 - OFF.z1, C.slab, 0, -0.19, (OFF.z1 + HALL.z1) / 2 + 0.25, { r: 0.12 });
	box(OFF.x1 - OFF.x0, 0.04, OFF.z1 - OFF.z0, C.office, (OFF.x0 + OFF.x1) / 2, 0, (OFF.z0 + OFF.z1) / 2, { r: 0.015, shadow: false });
	box(CON.x1 - CON.x0, 0.04, CON.z1 - CON.z0, C.conf, (CON.x0 + CON.x1) / 2, 0, (CON.z0 + CON.z1) / 2, { r: 0.015, shadow: false });
	box(HALL.x1 - HALL.x0, 0.04, HALL.z1 - HALL.z0, C.hall, 0, 0, (HALL.z0 + HALL.z1) / 2, { r: 0.015, shadow: false });

	// tall walls at the back and far left; low walls wherever the camera looks in
	box(CON.x1 - OFF.x0 + WT, TALL, WT, C.wall, (OFF.x0 + CON.x1) / 2, TALL / 2, OFF.z0 - WT / 2);
	box(WT, TALL, OFF.z1 - OFF.z0 + WT, C.wall, OFF.x0 - WT / 2, TALL / 2, (OFF.z0 + OFF.z1) / 2 - WT / 2);
	box(WT, LOW, CON.z1 - CON.z0, C.wall, CON.x1 + WT / 2, LOW / 2, (CON.z0 + CON.z1) / 2);
	box(OFF.x1 - OFF.x0 + WT, LOW, WT, C.wall, (OFF.x0 + OFF.x1) / 2 - WT / 2, LOW / 2, OFF.z1 + WT / 2);
	box(CON.x1 - CON.x0 + WT, LOW, WT, C.wall, (CON.x0 + CON.x1) / 2 + WT / 2, LOW / 2, CON.z1 + WT / 2);
	for (const x of [HALL.x0, HALL.x1]) {
		box(WT, LOW, DOOR.z0 - HALL.z0, C.wall, x, LOW / 2, (HALL.z0 + DOOR.z0) / 2);
		box(WT, LOW, OFF.z1 - DOOR.z1 + WT, C.wall, x, LOW / 2, (DOOR.z1 + OFF.z1 + WT) / 2);
		const H = 2.05, P = 0.14;
		box(WT + 0.06, H, P, C.wallTop, x, H / 2, DOOR.z0 + P / 2, { r: 0.04 });
		box(WT + 0.06, H, P, C.wallTop, x, H / 2, DOOR.z1 - P / 2, { r: 0.04 });
		box(WT + 0.06, P, DOOR.z1 - DOOR.z0, C.wallTop, x, H - P / 2, (DOOR.z0 + DOOR.z1) / 2, { r: 0.04 });
	}
	box(0.18, 0.22, HALL.z1 - OFF.z1 - 0.2, C.wall, HALL.x0 - 0.14, 0.11, (OFF.z1 + HALL.z1) / 2 + 0.05, { r: 0.05 });
	box(0.18, 0.22, HALL.z1 - OFF.z1 - 0.2, C.wall, HALL.x1 + 0.14, 0.11, (OFF.z1 + HALL.z1) / 2 + 0.05, { r: 0.05 });

	function chair(x, z, yaw) {
		const g = new THREE.Group();
		const add = (w, h, d, px, py, pz, r = 0.04) => {
			const m = new THREE.Mesh(new RoundedBox(w, h, d, 3, r), mat(C.wood));
			m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m);
		};
		add(0.56, 0.08, 0.54, 0, 0.48, 0);
		add(0.56, 0.62, 0.08, 0, 0.82, -0.25);
		for (const sx of [-0.22, 0.22]) for (const sz of [-0.2, 0.2]) add(0.06, 0.46, 0.06, sx, 0.23, sz, 0.02);
		g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
	}

	const DESK = { x: -3.45, z: -1.85, w: 2.0, d: 0.95, h: 0.8 };
	box(DESK.w, 0.09, DESK.d, C.woodTop, DESK.x, DESK.h - 0.045, DESK.z, { r: 0.035 });
	box(0.62, DESK.h - 0.09, DESK.d - 0.12, C.wood, DESK.x - 0.62, (DESK.h - 0.09) / 2, DESK.z, { r: 0.05 });
	box(0.1, DESK.h - 0.09, DESK.d - 0.2, C.wood, DESK.x + DESK.w / 2 - 0.12, (DESK.h - 0.09) / 2, DESK.z, { r: 0.03 });
	chair(DESK.x - 0.15, DESK.z - 0.85, 0);

	const TABLE = { x: 3.85, z: -1.5, w: 3.0, d: 1.25, h: 0.8 };
	box(TABLE.w, 0.09, TABLE.d, C.woodTop, TABLE.x, TABLE.h - 0.045, TABLE.z, { r: 0.04 });
	for (const sx of [-1, 1]) for (const sz of [-1, 1])
		box(0.1, TABLE.h - 0.09, 0.1, C.wood, TABLE.x + sx * (TABLE.w / 2 - 0.25), (TABLE.h - 0.09) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.2), { r: 0.03 });
	for (const dx of [-0.95, 0, 0.95]) chair(TABLE.x + dx, TABLE.z - 0.95, 0);
	chair(TABLE.x + TABLE.w / 2 + 0.55, TABLE.z, -Math.PI / 2);

	// the report: a folder with a tab
	const report = new THREE.Group();
	{
		const body = new THREE.Mesh(new RoundedBox(0.5, 0.06, 0.36, 2, 0.02), mat(C.report));
		body.position.y = 0.03; body.castShadow = true; report.add(body);
		const tab = new THREE.Mesh(new RoundedBox(0.16, 0.061, 0.06, 2, 0.015), mat(C.report));
		tab.position.set(-0.12, 0.03, -0.2); report.add(tab);
		const pages = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.33), mat(C.reportPage));
		pages.position.set(0.012, 0.03, 0.006); report.add(pages);
	}
	report.scale.setScalar(1.25);
	scene.add(report);
	const REPORT_DESK = new THREE.Vector3(DESK.x + 0.35, DESK.h, DESK.z + 0.05);
	const REPORT_TABLE = new THREE.Vector3(TABLE.x + 0.15, TABLE.h, TABLE.z + 0.2);

	/* -------------------------------------------------------------- people */
	function makePerson(color) {
		const g = new THREE.Group();
		const body = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true });
		const skin = new THREE.MeshStandardMaterial({ color: C.head, roughness: 0.85, transparent: true });
		const eyes = new THREE.MeshBasicMaterial({ color: C.eye, transparent: true });
		const mesh = (geo, m, parent = g) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
		const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.4, 8, 18), body);
		torso.position.y = 0.98;
		const head = new THREE.Group();
		head.position.y = 1.63; g.add(head);
		mesh(new THREE.SphereGeometry(0.25, 28, 20), skin, head);
		for (const sx of [-0.085, 0.085]) {
			const e = mesh(new THREE.SphereGeometry(0.033, 12, 8), eyes, head);
			e.position.set(sx, 0.03, 0.225); e.castShadow = false;
		}
		const limb = (r, len, x, y) => {
			const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
			mesh(new THREE.CapsuleGeometry(r, len, 6, 12), body, pivot).position.y = -(len / 2 + r) + r * 0.6;
			return pivot;
		};
		const legL = limb(0.088, 0.42, -0.11, 0.62), legR = limb(0.088, 0.42, 0.11, 0.62);
		const armL = limb(0.07, 0.34, -0.33, 1.2), armR = limb(0.07, 0.34, 0.33, 1.2);
		armL.rotation.z = 0.12; armR.rotation.z = -0.12;
		g.scale.setScalar(1.12);
		scene.add(g);
		return { g, head, torso, legL, legR, armL, armR, mats: [body, skin, eyes] };
	}
	const sam = makePerson(C.sam);
	const alex = makePerson(C.alex);

	/* -------------------------------------------------------------- choreography */
	const EXIT = V(0, 3.65), JUNCTION = V(0, -0.1);
	const OFFICE_DOOR = V(HALL.x0, (DOOR.z0 + DOOR.z1) / 2), CONF_DOOR = V(HALL.x1, (DOOR.z0 + DOOR.z1) / 2);
	const AT_DESK = V(DESK.x + 0.45, DESK.z + DESK.d / 2 + 0.55);
	const AT_TABLE = V(TABLE.x + 0.15, TABLE.z + TABLE.d / 2 + 0.55);
	const FACE_BACK = Math.PI;
	const OUT = EXIT.clone().add(V(0, 0.4));

	const B = [];                                             // when each line starts
	B[1] = 0;
	const samT = new Track(1.1, EXIT, FACE_BACK);
	samT.walk([V(0, 0.4), V(-0.35, -0.75), OFFICE_DOOR, V(-2.2, -0.95), AT_DESK], 2.6);
	B[2] = samT.t;
	samT.turn(FACE_BACK, 0.5);
	const LOOK0 = samT.t; samT.wait(2.2); const LOOK1 = samT.t;
	samT.walk([V(-2.2, -0.95), OFFICE_DOOR, V(-0.35, -0.75), V(0, 0.4), OUT], 3.0);
	const SAM_GONE = samT.t;

	B[3] = SAM_GONE + 0.3;
	const alexT = new Track(B[3], EXIT, FACE_BACK);
	alexT.walk([V(0, 0.4), V(-0.35, -0.75), OFFICE_DOOR, V(-2.2, -0.95), AT_DESK], 3.0);
	alexT.turn(FACE_BACK, 0.4);
	const PICK0 = alexT.t; alexT.wait(0.7); const PICK1 = alexT.t;
	alexT.walk([V(-2.2, -0.95), OFFICE_DOOR, V(0, -0.85), CONF_DOOR, V(2.4, -0.7), AT_TABLE], 2.8);
	alexT.turn(FACE_BACK, 0.4);
	const PUT0 = alexT.t; alexT.wait(0.7); const PUT1 = alexT.t;
	alexT.walk([V(2.4, -0.7), CONF_DOOR, V(0.35, -0.6), V(0, 0.4), OUT], 3.4);
	const ALEX_GONE = alexT.t;

	B[4] = ALEX_GONE + 0.2;
	samT.wait(B[4] - samT.t);
	samT.walk([V(0, 1.6), JUNCTION], 2.2);
	samT.wait(0.9);
	B[5] = samT.t;
	// it ends on the question: Sam stays in the hallway and looks at each door in turn
	const ROUTES0 = B[5] + 0.25, ROUTES1 = ROUTES0 + 1.3, GLANCE = B[5] + 1.0;
	samT.wait(5.2);
	const END = samT.t;

	const samAlpha = (t) => ramp(t, [[1.1, 0], [1.5, 1], [SAM_GONE - 0.5, 1], [SAM_GONE, 0], [B[4], 0], [B[4] + 0.4, 1]]);
	const alexAlpha = (t) => ramp(t, [[B[3], 0], [B[3] + 0.4, 1], [ALEX_GONE - 0.5, 1], [ALEX_GONE, 0]]);

	const LINES = [
		"A report was originally in the office.",
		"Sam saw it there.",
		"The report was later moved to the conference room while Sam wasn’t there.",
		"Sam wants the report.",
		"Where will Sam go?",
	];

	/* -------------------------------------------------------------- overlays: what Sam believes, where the report is */
	const beliefMat = new THREE.MeshBasicMaterial({ color: C.belief, transparent: true, opacity: 0.92, depthWrite: false });
	const realMat = new THREE.MeshBasicMaterial({ color: C.real, transparent: true, opacity: 0.92, depthWrite: false });

	// Sam's gaze, an arc from the eyes to the folder
	const gaze = (() => {
		const s = samT.at((LOOK0 + LOOK1) / 2);
		const eye = new THREE.Vector3(0, 1.66, 0.2).applyAxisAngle(UP, s.yaw).add(s.pos);
		const end = REPORT_DESK.clone().add(new THREE.Vector3(0, 0.08, 0));
		const mid = eye.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.6, 0));
		const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(eye, mid, end), 64, 0.034, 10, false);
		const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.belief, transparent: true, depthWrite: false }));
		m.renderOrder = 5; scene.add(m);
		return m;
	})();
	const gazeCount = gaze.geometry.index.count;

	// a dashed outline left on the desk where Sam last saw the folder
	const dashes = [];
	{
		const w = 0.84, d = 0.64, r = 0.1, cx = REPORT_DESK.x, cz = REPORT_DESK.z, y = DESK.h + 0.006;
		const path = new THREE.Shape();
		path.moveTo(cx - w / 2 + r, cz - d / 2);
		path.lineTo(cx + w / 2 - r, cz - d / 2); path.quadraticCurveTo(cx + w / 2, cz - d / 2, cx + w / 2, cz - d / 2 + r);
		path.lineTo(cx + w / 2, cz + d / 2 - r); path.quadraticCurveTo(cx + w / 2, cz + d / 2, cx + w / 2 - r, cz + d / 2);
		path.lineTo(cx - w / 2 + r, cz + d / 2); path.quadraticCurveTo(cx - w / 2, cz + d / 2, cx - w / 2, cz + d / 2 - r);
		path.lineTo(cx - w / 2, cz - d / 2 + r); path.quadraticCurveTo(cx - w / 2, cz - d / 2, cx - w / 2 + r, cz - d / 2);
		const n = Math.round(path.getLength() / 0.14);
		const geo = new THREE.BoxGeometry(0.085, 0.008, 0.04);
		for (let i = 0; i < n; i++) {
			const u = (i + 0.25) / n, p = path.getPointAt(u), tg = path.getTangentAt(u);
			const m = new THREE.Mesh(geo, beliefMat);
			m.position.set(p.x, y, p.y); m.rotation.y = -Math.atan2(tg.y, tg.x); m.renderOrder = 4;
			scene.add(m); dashes.push(m);
		}
	}

	// the two places Sam could go, dotted on the floor; walls hide them where they pass behind
	function dotted(points, material) {
		const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
		const len = curve.getLength(), n = Math.floor((len - 0.5) / 0.27);
		const geo = new THREE.CircleGeometry(0.095, 22);
		geo.rotateX(-Math.PI / 2);
		const dots = [];
		for (let i = 0; i < n; i++) {
			const p = curve.getPointAt((0.5 + i * 0.27) / len);
			const m = new THREE.Mesh(geo, material);
			m.position.set(p.x, 0.03, p.z); m.renderOrder = 3; scene.add(m); dots.push(m);
		}
		return dots;
	}
	const beliefDots = dotted([JUNCTION, V(-0.55, -0.75), OFFICE_DOOR, V(-2.2, -0.93), AT_DESK.clone().add(V(-0.05, 0.05))], beliefMat);
	const realDots = dotted([JUNCTION, V(0.55, -0.75), CONF_DOOR, V(2.4, -0.68), AT_TABLE], realMat);

	// Sam's thought bubble, an HTML element kept above Sam's head
	const bubbleAnchor = $("bubble-anchor"), bubble = $("bubble");
	bubble.querySelector("svg").innerHTML = MINI;
	setMini(bubble.querySelector("svg"), "office");
	const BUBBLE_AT = new THREE.Vector3(0.4, 2.3, 0);

	/* -------------------------------------------------------------- state at time t */
	function pose(p, track, t, alpha, carrying = 0) {
		const s = track.at(t);
		p.g.position.copy(s.pos); p.g.rotation.y = s.yaw;
		const phase = s.dist * 4.6, swing = Math.sin(phase) * 0.55 * s.move;
		p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
		p.armL.rotation.x = -swing * 0.8 * (1 - carrying) - 1.05 * carrying;
		p.armR.rotation.x = swing * 0.8 * (1 - carrying) - 1.05 * carrying;
		const bob = Math.abs(Math.cos(phase)) * 0.035 * s.move;
		p.torso.position.y = 0.98 + bob; p.head.position.y = 1.63 + bob;
		for (const m of p.mats) { m.opacity = alpha; m.depthWrite = alpha > 0.99; }
		p.g.visible = alpha > 0.01;
		return s;
	}

	const line = $("line"), step = $("step");
	let lastLine = -1, bubbleShown = null;

	function apply(t) {
		pose(sam, samT, t, samAlpha(t));
		const carry = t < PICK0 ? 0 : t < PICK1 ? smooth((t - PICK0) / (PICK1 - PICK0)) : t < PUT0 ? 1 : t < PUT1 ? 1 - smooth((t - PUT0) / (PUT1 - PUT0)) : 0;
		const a = pose(alex, alexT, t, alexAlpha(t), carry);
		sam.head.rotation.x = t > LOOK0 && t < LOOK1 ? 0.35 * smooth((t - LOOK0) / 0.4) * smooth((LOOK1 - t) / 0.4) : 0;
		sam.head.rotation.y = ramp(t, [[GLANCE, 0], [GLANCE + 0.5, 0.6], [GLANCE + 1.3, 0.6], [GLANCE + 1.9, -0.6], [GLANCE + 2.7, -0.6], [GLANCE + 3.2, 0]]);

		if (t < PICK0 + 0.25) {
			report.position.copy(REPORT_DESK); report.rotation.y = 0.12;
		} else if (t < PUT1 - 0.25) {
			const k = smooth((t - (PICK0 + 0.25)) / 0.35), k2 = smooth((t - PUT0) / 0.45);
			const hand = new THREE.Vector3(0, 1.0, 0.46).applyAxisAngle(UP, a.yaw).add(a.pos);
			report.position.copy(REPORT_DESK).lerp(hand, k).lerp(REPORT_TABLE, t > PUT0 ? k2 : 0);
			report.rotation.y = lerpAngle(0.12, a.yaw, k);
		} else {
			report.position.copy(REPORT_TABLE); report.rotation.y = -0.18;
		}

		gaze.visible = t > LOOK0 && t < LOOK1;
		gaze.geometry.setDrawRange(0, Math.floor(gazeCount * smooth((t - (LOOK0 + 0.25)) / 0.6) / 3) * 3);
		gaze.material.opacity = 0.95 * (1 - smooth((t - (LOOK1 - 0.45)) / 0.45));

		const dashP = smooth((t - (PICK0 + 0.3)) / 0.7);
		dashes.forEach((m, i) => { m.visible = i / dashes.length < dashP; });

		const rp = smooth((t - ROUTES0) / (ROUTES1 - ROUTES0));
		for (const dots of [beliefDots, realDots])
			dots.forEach((m, i) => { const on = clamp(rp * dots.length - i); m.visible = on > 0; m.scale.setScalar(0.4 + 0.6 * on); });

		const beliefKnown = t > LOOK0 + 0.6;
		const show = beliefKnown && samAlpha(t) > 0.6;
		if (show !== bubbleShown) { bubbleShown = show; bubble.classList.toggle("sam-scene__bubble--show", show); }

		let li = 0;
		for (let i = 1; i < B.length; i++) if (t >= B[i]) li = i - 1;
		if (li !== lastLine) {
			lastLine = li;
			line.textContent = LINES[li];
			step.textContent = `${li + 1} / ${LINES.length}`;
			ticks.forEach((el, i) => el.classList.toggle("sam-scene__tick--on", i === li));
		}
	}

	/* -------------------------------------------------------------- framing, theme, drawing */
	const FRAME = [];
	for (const x of [OFF.x0 - 0.3, CON.x1 + 0.3]) for (const z of [OFF.z0 - 0.3, OFF.z1 + 0.3]) for (const y of [-0.4, TALL]) FRAME.push(new THREE.Vector3(x, y, z));
	for (const x of [HALL.x0 - 0.3, HALL.x1 + 0.3]) FRAME.push(new THREE.Vector3(x, -0.4, HALL.z1 + 0.2));
	let W = 0, H = 0;
	function resize() {
		W = stage.clientWidth; H = stage.clientHeight;
		if (!W || !H) return;
		renderer.setSize(W, H, false);
		stage.style.setProperty("--sam-bubble-scale", clamp(W / 980, 0.55, 1).toFixed(3));
		camera.updateMatrixWorld();
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const p of FRAME) {
			const v = p.clone().applyMatrix4(camera.matrixWorldInverse);
			x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
		}
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		let hw = (x1 - x0) / 2 * 1.04, hh = (y1 - y0) / 2 * 1.04;
		if (hw / hh > W / H) hh = hw * H / W; else hw = hh * W / H;
		Object.assign(camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
		camera.updateProjectionMatrix();
		draw();
	}
	function setBackground() {
		const css = getComputedStyle(root).getPropertyValue("--sam-stage").trim();
		scene.background = new THREE.Color(css || "#ecebe7");
		draw();
	}
	const tmp = new THREE.Vector3();
	function draw() {
		renderer.render(scene, camera);
		if (bubbleShown && W) {
			sam.g.updateMatrixWorld();
			tmp.copy(BUBBLE_AT).applyMatrix4(sam.g.matrixWorld).project(camera);
			bubbleAnchor.style.transform = `translate(${((tmp.x + 1) / 2) * W}px, ${((1 - tmp.y) / 2) * H}px)`;
		}
	}

	/* -------------------------------------------------------------- playback */
	const scrub = $("scrub"), play = $("play"), playLabel = $("play-label"), playIcon = $("play-icon");
	scrub.max = END.toFixed(2);
	const ticks = LINES.map((text, i) => {
		const el = document.createElement("button");
		el.type = "button"; el.className = "sam-scene__tick"; el.textContent = String(i + 1);
		el.style.left = `${(B[i + 1] / END) * 100}%`;
		el.setAttribute("aria-label", `Jump to line ${i + 1}: ${text}`);
		el.addEventListener("click", () => { seek(B[i + 1] + 0.01); });
		$("ticks").appendChild(el);
		return el;
	});

	let t = 0, playing = false, last = 0, onScreen = false, started = false;
	function setPlaying(p) {
		playing = p;
		const label = p ? "Pause" : t >= END - 0.01 ? "Replay" : "Play";
		playLabel.textContent = label;
		play.setAttribute("aria-label", label);
		playIcon.innerHTML = p ? '<path d="M4 2h3v12H4zM9 2h3v12H9z"/>' : '<path d="M4 2l10 6-10 6z"/>';
		last = performance.now();
		if (p) requestAnimationFrame(frame);
	}
	function seek(v) {
		t = clamp(v, 0, END);
		scrub.value = t;
		apply(t);
		scrub.setAttribute("aria-valuetext", `Line ${lastLine + 1} of ${LINES.length}: ${LINES[lastLine]}`);
		draw();
		if (t >= END && playing) setPlaying(false);
	}
	function frame(now) {
		if (!playing) return;
		if (onScreen) seek(t + Math.min(0.1, (now - last) / 1000));
		last = now;
		if (playing) requestAnimationFrame(frame);
	}
	play.addEventListener("click", () => { if (!playing && t >= END - 0.01) seek(0); setPlaying(!playing); });
	$("restart").addEventListener("click", () => { seek(0); setPlaying(true); });
	scrub.addEventListener("input", () => seek(parseFloat(scrub.value)));
	scrub.addEventListener("pointerdown", () => setPlaying(false));

	// start the first time the figure is mostly in view, unless the reader prefers less motion
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	new IntersectionObserver((entries) => {
		const e = entries[entries.length - 1];
		onScreen = e.isIntersecting;
		if (e.intersectionRatio >= 0.5 && !started) { started = true; if (!reduceMotion) setPlaying(true); }
	}, { threshold: [0, 0.5] }).observe(stage);
	new ResizeObserver(resize).observe(stage);
	new MutationObserver(setBackground).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

	setBackground(); resize(); setPlaying(false); seek(0);
	root.samScene = { seek, setPlaying, END, B };
}

document.querySelectorAll(".sam-scene").forEach(mount);
