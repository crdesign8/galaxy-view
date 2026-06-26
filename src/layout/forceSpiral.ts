export interface SpiralNode {
	x?: number;
	y?: number;
	z?: number;
	vx?: number;
	vy?: number;
	vz?: number;
}

export interface SpiralForce {
	(alpha: number): void;
	initialize(nodes: SpiralNode[]): void;
	strength(val: number): SpiralForce;
	arms(val: number): SpiralForce;
	tightness(val: number): SpiralForce;
}

export function forceSpiral(): SpiralForce {
	let nodes: SpiralNode[] = [];
	let strength = 0;
	let arms = 2;
	let tightness = 0.015; // Curvature of the spiral arms

	function force(alpha: number) {
		if (strength <= 0.001) return;
		const k = strength * alpha;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (!node) continue;
			const x = node.x ?? 0;
			const z = node.z ?? 0;
			const r = Math.sqrt(x * x + z * z);
			if (r < 0.1) continue;

			// Deterministically assign each node to a spiral arm
			const armIdx = i % arms;

			// Target angle at current radius r
			const targetAngle = (armIdx * 2 * Math.PI) / arms + r * tightness;

			const tx = r * Math.cos(targetAngle);
			const tz = r * Math.sin(targetAngle);

			// Apply rotational correction
			node.vx = (node.vx ?? 0) + (tx - x) * k;
			node.vz = (node.vz ?? 0) + (tz - z) * k;
		}
	}

	force.initialize = (initNodes: SpiralNode[]) => {
		nodes = initNodes;
	};

	force.strength = (val: number) => {
		strength = val;
		return force;
	};

	force.arms = (val: number) => {
		arms = val;
		return force;
	};

	force.tightness = (val: number) => {
		tightness = val;
		return force;
	};

	return force;
}
