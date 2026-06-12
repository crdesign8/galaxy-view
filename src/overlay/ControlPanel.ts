import type { GalaxySettings } from '../settings';

export interface ControlPanelCallbacks {
	onBloom: () => void;
	onPhysics: () => void;
	onLook: () => void;
	onCruise: (on: boolean) => void;
	onReset: () => void;
	runScenario: (s: 'S1' | 'S2' | 'S3') => void;
}

interface SliderSpec {
	label: string;
	min: number;
	max: number;
	step: number;
	get: () => number;
	set: (v: number) => void;
	fmt?: (v: number) => string;
	onInput: () => void;
}

/**
 * 画布左上角的参数面板（可玩性即生产力）。
 * 滑杆直接改 settings 对象并即时生效；持久化由调用方在回调里做。
 */
export class ControlPanel {
	readonly statsEl: HTMLElement;
	private root: HTMLElement;
	private refreshers: (() => void)[] = [];
	private cruiseBtn: HTMLButtonElement | null = null;

	constructor(
		parent: HTMLElement,
		private settings: GalaxySettings,
		private cb: ControlPanelCallbacks,
	) {
		this.root = parent.createDiv({ cls: 'galaxy-panel' });

		const header = this.root.createDiv({ cls: 'galaxy-panel-header' });
		this.statsEl = header.createDiv({ cls: 'galaxy-panel-stats', text: '…' });
		const collapseBtn = header.createEl('button', { cls: 'galaxy-panel-collapse', text: '−' });
		const body = this.root.createDiv({ cls: 'galaxy-panel-body' });
		collapseBtn.addEventListener('click', () => {
			const hidden = body.hasClass('is-hidden');
			body.toggleClass('is-hidden', !hidden);
			collapseBtn.setText(hidden ? '−' : '+');
		});

		const s = this.settings;

		this.section(body, '辉光', [
			{ label: '强度', min: 0, max: 2.5, step: 0.05, get: () => s.bloom.strength, set: (v) => (s.bloom.strength = v), onInput: cb.onBloom },
			{ label: '扩散', min: 0, max: 1.2, step: 0.05, get: () => s.bloom.radius, set: (v) => (s.bloom.radius = v), onInput: cb.onBloom },
			{ label: '阈值', min: 0, max: 1, step: 0.05, get: () => s.bloom.threshold, set: (v) => (s.bloom.threshold = v), onInput: cb.onBloom },
		]);

		this.section(body, '力学', [
			{ label: '斥力', min: 20, max: 400, step: 5, get: () => s.physics.repel, set: (v) => (s.physics.repel = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics },
			{ label: '链接距离', min: 20, max: 200, step: 5, get: () => s.physics.linkDistance, set: (v) => (s.physics.linkDistance = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics },
			{ label: '链接强度', min: 0.1, max: 2, step: 0.1, get: () => s.physics.linkStrength, set: (v) => (s.physics.linkStrength = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onPhysics },
			{ label: '向心力', min: 0, max: 0.2, step: 0.005, get: () => s.physics.centerPull, set: (v) => (s.physics.centerPull = v), fmt: (v) => v.toFixed(3), onInput: cb.onPhysics },
		]);

		this.section(body, '外观', [
			{ label: '节点大小', min: 0.3, max: 2.5, step: 0.05, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: cb.onLook },
			{ label: '链接透明度', min: 0.02, max: 0.6, step: 0.01, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: cb.onLook },
		]);

		const btnRow = body.createDiv({ cls: 'galaxy-panel-row' });
		this.cruiseBtn = btnRow.createEl('button', { text: s.cruise ? '巡航：开' : '巡航：关' });
		this.cruiseBtn.addEventListener('click', () => {
			s.cruise = !s.cruise;
			this.cruiseBtn?.setText(s.cruise ? '巡航：开' : '巡航：关');
			cb.onCruise(s.cruise);
		});
		const resetBtn = btnRow.createEl('button', { text: '重置默认' });
		resetBtn.addEventListener('click', () => {
			cb.onReset();
			this.refreshAll();
			this.cruiseBtn?.setText(this.settings.cruise ? '巡航：开' : '巡航：关');
		});

		const dev = body.createEl('details', { cls: 'galaxy-panel-dev' });
		dev.createEl('summary', { text: '基准（开发）' });
		const devRow = dev.createDiv({ cls: 'galaxy-panel-row' });
		for (const sc of ['S1', 'S2', 'S3'] as const) {
			const b = devRow.createEl('button', { text: sc });
			b.addEventListener('click', () => cb.runScenario(sc));
		}
	}

	private section(parent: HTMLElement, title: string, sliders: SliderSpec[]): void {
		const sec = parent.createDiv({ cls: 'galaxy-panel-section' });
		sec.createDiv({ cls: 'galaxy-panel-section-title', text: title });
		for (const spec of sliders) {
			const row = sec.createDiv({ cls: 'galaxy-panel-slider' });
			row.createSpan({ cls: 'galaxy-panel-label', text: spec.label });
			const input = row.createEl('input', { type: 'range' });
			input.min = String(spec.min);
			input.max = String(spec.max);
			input.step = String(spec.step);
			const valueEl = row.createSpan({ cls: 'galaxy-panel-value' });
			const fmt = spec.fmt ?? ((v: number) => v.toFixed(2));
			const refresh = () => {
				input.value = String(spec.get());
				valueEl.setText(fmt(spec.get()));
			};
			refresh();
			this.refreshers.push(refresh);
			input.addEventListener('input', () => {
				spec.set(Number(input.value));
				valueEl.setText(fmt(spec.get()));
				spec.onInput();
			});
		}
	}

	refreshAll(): void {
		for (const r of this.refreshers) r();
	}

	dispose(): void {
		this.root.remove();
		this.refreshers = [];
	}
}
