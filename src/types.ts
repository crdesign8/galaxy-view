import type { NodeObject, LinkObject } from '3d-force-graph';

export interface SpikeNode extends NodeObject {
	id: string;
	name: string;
	folder: string;
	folderTop: string;
	degree: number;
	unresolved: boolean;
}

export type SpikeLink = LinkObject<SpikeNode>;

export interface SpikeGraphData {
	nodes: SpikeNode[];
	links: SpikeLink[];
}

export interface FrameStats {
	frames: number;
	avgFps: number;
	p95FrameMs: number;
	worstFrameMs: number;
	durationMs: number;
}

export interface BenchResult {
	scenario: string;
	timestamp: string;
	nodes: number;
	links: number;
	bloom: boolean;
	[key: string]: unknown;
}
