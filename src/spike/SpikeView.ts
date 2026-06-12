import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { BenchResult, SpikeLink, SpikeNode } from '../types';
import { buildGraphData } from './buildGraphData';
import { collectFrames, observeLongTasks, writeBenchResult, sleep } from './bench';

export const VIEW_TYPE_GALAXY = 'galaxy-view';

const ORBIT_DURATION_MS = 20_000;
const SETTLE_TIMEOUT_MS = 90_000;

export class SpikeView extends ItemView {
	navigation = true;

	private graph: ForceGraph3DInstance<SpikeNode, SpikeLink> | null = null;
	private bloomPass: UnrealBloomPass | null = null;
	private outputPass: OutputPass | null = null;
	private hudEl: HTMLElement | null = null;
	private hudRafId = 0;
	private settled = false;
	private settleResolvers: (() => void)[] = [];
	private tickCount = 0;
	private layoutStartedAt = 0;
	private benchRunning = false;
	counts = { nodes: 0, links: 0 };

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_GALAXY;
	}

	getDisplayText(): string {
		return 'Galaxy view';
	}

	getIcon(): string {
		return 'orbit';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('galaxy-view-content');
		// WebGL 初始化推迟到首个非零尺寸（deferred/恢复布局下 onOpen 时可能是 0×0）
		this.tryInit();
	}

	onResize(): void {
		if (!this.graph) {
			this.tryInit();
			return;
		}
		const { clientWidth: w, clientHeight: h } = this.contentEl;
		if (w > 0 && h > 0) this.graph.width(w).height(h);
	}

	private tryInit(): void {
		if (this.graph) return;
		const { clientWidth: w, clientHeight: h } = this.contentEl;
		if (w < 10 || h < 10) return;

		const container = this.contentEl.createDiv({ cls: 'galaxy-view-canvas' });
		// 库的构造器常量未导出泛型形参，这里显式收窄到本插件的节点/边类型
		const graph = new ForceGraph3D(container) as unknown as ForceGraph3DInstance<SpikeNode, SpikeLink>;
		graph
			.width(w)
			.height(h)
			.backgroundColor('#000003')
			.showNavInfo(false)
			.nodeLabel('name')
			.nodeVal((n) => 1 + Math.sqrt(n.degree))
			.nodeAutoColorBy((n) => (n.unresolved ? '__unresolved__' : n.folderTop))
			.nodeOpacity(0.9)
			.linkColor(() => '#7a87a8')
			.linkOpacity(0.15)
			.enableNodeDrag(false)
			.warmupTicks(0)
			.cooldownTime(60_000)
			.onEngineTick(() => {
				this.tickCount++;
			})
			.onEngineStop(() => {
				this.settled = true;
				const resolvers = this.settleResolvers;
				this.settleResolvers = [];
				for (const r of resolvers) r();
			});
		this.graph = graph;

		this.buildHud();
		this.startHudLoop();
		void this.loadData(false);
		this.setBloom(true);
	}

	/** 重建并加载图数据；fresh 节点对象 + 确定性种子 → 触发完整重布局 */
	private async loadData(includeUnresolved: boolean): Promise<void> {
		if (!this.graph) return;
		await this.ensureCacheReady();
		const data = buildGraphData(this.app, includeUnresolved);
		this.counts = { nodes: data.nodes.length, links: data.links.length };
		this.settled = false;
		this.tickCount = 0;
		this.layoutStartedAt = performance.now();
		this.graph.graphData(data);
	}

	private async ensureCacheReady(): Promise<void> {
		if (Object.keys(this.app.metadataCache.resolvedLinks).length > 0) return;
		await new Promise<void>((resolve) => {
			this.registerEvent(this.app.metadataCache.on('resolved', () => resolve()));
		});
	}

	private awaitSettle(): Promise<void> {
		if (this.settled) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.settleResolvers.push(resolve);
			window.setTimeout(resolve, SETTLE_TIMEOUT_MS);
		});
	}

	setBloom(on: boolean): void {
		if (!this.graph) return;
		const composer = this.graph.postProcessingComposer();
		if (on && !this.bloomPass) {
			const { clientWidth: w, clientHeight: h } = this.contentEl;
			this.bloomPass = new UnrealBloomPass(new Vector2(w, h), 0.9, 0.45, 0.1);
			this.outputPass = new OutputPass();
			composer.addPass(this.bloomPass);
			composer.addPass(this.outputPass);
		} else if (!on && this.bloomPass) {
			if (this.outputPass) composer.removePass(this.outputPass);
			composer.removePass(this.bloomPass);
			this.bloomPass.dispose();
			this.outputPass?.dispose();
			this.bloomPass = null;
			this.outputPass = null;
		}
	}

	// ---------- HUD ----------

	private buildHud(): void {
		this.hudEl = this.contentEl.createDiv({ cls: 'galaxy-hud' });
		const stats = this.hudEl.createDiv({ cls: 'galaxy-hud-stats', text: '…' });
		const row = this.hudEl.createDiv({ cls: 'galaxy-hud-row' });
		const mkBtn = (label: string, fn: () => void) => {
			const b = row.createEl('button', { text: label });
			b.addEventListener('click', fn);
		};
		mkBtn('辉光开关', () => this.setBloom(!this.bloomPass));
		mkBtn('S1 环绕', () => void this.runScenario('S1'));
		mkBtn('S2 冷布局', () => void this.runScenario('S2'));
		mkBtn('S3 含未解析', () => void this.runScenario('S3'));
		this.hudStatsEl = stats;
	}

	private hudStatsEl: HTMLElement | null = null;
	private hudFrames: number[] = [];

	private startHudLoop(): void {
		let lastText = 0;
		const loop = (now: number) => {
			this.hudFrames.push(now);
			while (this.hudFrames.length > 0 && now - (this.hudFrames[0] ?? 0) > 1000) {
				this.hudFrames.shift();
			}
			if (now - lastText > 500 && this.hudStatsEl && this.graph) {
				const calls = this.graph.renderer().info.render.calls;
				const fps = this.hudFrames.length;
				this.hudStatsEl.setText(
					`${fps} fps · ${calls} calls · ${this.counts.nodes}n/${this.counts.links}l · ` +
						`bloom ${this.bloomPass ? 'on' : 'off'} · ${this.settled ? '已沉降' : `布局中 t${this.tickCount}`}`,
				);
				lastText = now;
			}
			this.hudRafId = window.requestAnimationFrame(loop);
		};
		this.hudRafId = window.requestAnimationFrame(loop);
	}

	// ---------- 基准场景 ----------

	async runScenario(scenario: 'S1' | 'S2' | 'S3'): Promise<BenchResult | null> {
		if (!this.graph || this.benchRunning) return null;
		this.benchRunning = true;
		try {
			switch (scenario) {
				case 'S1':
					return await this.benchOrbit('S1', false);
				case 'S2':
					return await this.benchColdLayout();
				case 'S3':
					return await this.benchOrbit('S3', true);
			}
		} finally {
			this.benchRunning = false;
		}
	}

	/** 沉降后 20s 脚本环绕（bloom on）测帧率 */
	private async benchOrbit(scenario: 'S1' | 'S3', includeUnresolved: boolean): Promise<BenchResult> {
		const graph = this.graph;
		if (!graph) throw new Error('graph not ready');
		const wantUnresolved = includeUnresolved;
		const hasUnresolved = graph.graphData().nodes.some((n) => n.unresolved);
		if (wantUnresolved !== hasUnresolved) {
			await this.loadData(wantUnresolved);
		}
		new Notice(`${scenario}：等待布局沉降…`);
		await this.awaitSettle();
		this.setBloom(true);
		await sleep(500);

		const start = graph.cameraPosition();
		const radius = Math.max(Math.hypot(start.x, start.y, start.z), 200);
		const startAngle = Math.atan2(start.z, start.x);
		new Notice(`${scenario}：20s 环绕测帧率…`);
		const stats = await collectFrames(ORBIT_DURATION_MS, (elapsed) => {
			const angle = startAngle + (elapsed / ORBIT_DURATION_MS) * Math.PI * 2;
			graph.cameraPosition(
				{ x: radius * Math.cos(angle), y: start.y, z: radius * Math.sin(angle) },
				{ x: 0, y: 0, z: 0 },
				0,
			);
		});

		const result: BenchResult = {
			scenario,
			timestamp: new Date().toISOString(),
			nodes: this.counts.nodes,
			links: this.counts.links,
			bloom: true,
			drawCalls: graph.renderer().info.render.calls,
			...stats,
		};
		await writeBenchResult(this.app, result);
		new Notice(`${scenario} 完成：avg ${result.avgFps as number | string} fps`.replace(/(\.\d\d)\d+/, '$1'));
		return result;
	}

	/** 冷启动布局：沉降时间 + 主线程 longtask */
	private async benchColdLayout(): Promise<BenchResult> {
		const graph = this.graph;
		if (!graph) throw new Error('graph not ready');
		new Notice('S2：冷布局开始（界面会卡是预期现象，这正是要测的）…');
		await sleep(300);
		const longTasks = observeLongTasks();
		const t0 = performance.now();
		await this.loadData(false); // fresh 种子 → 完整重布局
		await this.awaitSettle();
		const settleMs = performance.now() - t0;
		const lt = longTasks.stop();

		const result: BenchResult = {
			scenario: 'S2',
			timestamp: new Date().toISOString(),
			nodes: this.counts.nodes,
			links: this.counts.links,
			bloom: this.bloomPass !== null,
			settleMs,
			ticks: this.tickCount,
			avgTickMs: this.tickCount > 0 ? settleMs / this.tickCount : -1,
			longTaskCount: lt.count,
			longestTaskMs: lt.longestMs,
			longTaskTotalMs: lt.totalMs,
		};
		await writeBenchResult(this.app, result);
		new Notice(`S2 完成：沉降 ${(settleMs / 1000).toFixed(1)}s，最长阻塞 ${lt.longestMs.toFixed(0)}ms`);
		return result;
	}

	// ---------- 销毁合同（前人头号 bug） ----------

	async onClose(): Promise<void> {
		window.cancelAnimationFrame(this.hudRafId);
		this.settleResolvers = [];
		const graph = this.graph;
		this.graph = null;
		if (graph) {
			graph.pauseAnimation();
			const composer = graph.postProcessingComposer();
			if (this.outputPass) {
				composer.removePass(this.outputPass);
				this.outputPass.dispose();
				this.outputPass = null;
			}
			if (this.bloomPass) {
				composer.removePass(this.bloomPass);
				this.bloomPass.dispose();
				this.bloomPass = null;
			}
			const renderer = graph.renderer();
			graph._destructor();
			try {
				renderer.forceContextLoss();
			} catch {
				// 上下文可能已被 _destructor 释放
			}
		}
		this.hudEl = null;
		this.hudStatsEl = null;
		this.contentEl.empty();
	}
}
