import type { App } from 'obsidian';
import type { SpikeGraphData, SpikeLink, SpikeNode } from '../types';

// FNV-1a：确定性种子布局用（基准可复现的前提）
function hash32(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

function unit(s: string): number {
	return hash32(s) / 0xffffffff;
}

/** 把节点确定性地撒进半径 R 的球内（替代 d3 默认初始化，保证基准可复现） */
function seedPosition(node: SpikeNode, radius: number): void {
	const u = unit(node.id);
	const v = unit(node.id + ':v');
	const w = unit(node.id + ':w');
	const r = radius * Math.cbrt(u);
	const theta = 2 * Math.PI * v;
	const phi = Math.acos(2 * w - 1);
	node.x = r * Math.sin(phi) * Math.cos(theta);
	node.y = r * Math.sin(phi) * Math.sin(theta);
	node.z = r * Math.cos(phi);
}

export function buildGraphData(app: App, includeUnresolved: boolean): SpikeGraphData {
	const nodeMap = new Map<string, SpikeNode>();

	for (const f of app.vault.getMarkdownFiles()) {
		nodeMap.set(f.path, {
			id: f.path,
			name: f.basename,
			folder: f.parent?.path ?? '',
			folderTop: f.path.split('/')[0] === f.name ? '' : (f.path.split('/')[0] ?? ''),
			degree: 0,
			unresolved: false,
		});
	}

	const links: SpikeLink[] = [];
	const resolved = app.metadataCache.resolvedLinks;
	for (const src of Object.keys(resolved)) {
		const srcNode = nodeMap.get(src);
		if (!srcNode) continue;
		const targets = resolved[src] ?? {};
		for (const dst of Object.keys(targets)) {
			const dstNode = nodeMap.get(dst);
			if (!dstNode) continue; // 附件等非 md 目标，V1 不渲染
			links.push({ source: src, target: dst });
			srcNode.degree++;
			dstNode.degree++;
		}
	}

	if (includeUnresolved) {
		const unresolvedLinks = app.metadataCache.unresolvedLinks;
		for (const src of Object.keys(unresolvedLinks)) {
			const srcNode = nodeMap.get(src);
			if (!srcNode) continue;
			const targets = unresolvedLinks[src] ?? {};
			for (const name of Object.keys(targets)) {
				const ghostId = `unresolved:${name}`;
				let ghost = nodeMap.get(ghostId);
				if (!ghost) {
					ghost = {
						id: ghostId,
						name,
						folder: '',
						folderTop: '__unresolved__',
						degree: 0,
						unresolved: true,
					};
					nodeMap.set(ghostId, ghost);
				}
				links.push({ source: src, target: ghostId });
				srcNode.degree++;
				ghost.degree++;
			}
		}
	}

	const nodes = [...nodeMap.values()];
	const radius = 80 * Math.cbrt(Math.max(nodes.length, 1) / 1000);
	for (const n of nodes) seedPosition(n, radius);

	return { nodes, links };
}
