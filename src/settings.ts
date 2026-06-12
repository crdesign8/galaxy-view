export interface BloomSettings {
	strength: number;
	radius: number;
	threshold: number;
}

export interface PhysicsSettings {
	repel: number; // 正值，布局内取负作 charge
	linkDistance: number;
	linkStrength: number; // 倍率：1 = d3 默认（1/min(端点度数)）
	centerPull: number;
	flatten: number; // 0=球体，>0=Y 轴压扁 → 银河盘
}

export type SizeBy = 'degree' | 'fileSize' | 'uniform';

export interface LookSettings {
	nodeSize: number; // 倍率
	linkOpacity: number;
	twinkle: number; // 亮星眨眼频率（0=关）
	sizeBy: SizeBy; // 节点「质量」依据
}

export type VisualPreset = 'deep-space' | 'adaptive';

export interface GalaxySettings {
	bloom: BloomSettings;
	physics: PhysicsSettings;
	look: LookSettings;
	cruise: boolean;
	cruiseSpeed: number; // 巡航角速度倍率
	showUnresolved: boolean;
	showOrphans: boolean;
	colorTheme: string;
	qualityOverride: 'auto' | 'high' | 'low' | 'mobile'; // mobile 档在桌面=移动模拟 // 最近应用的配色主题 id；'imported'=二维导入，'custom'=洗牌后
	preset: VisualPreset;
	/** 从 .obsidian/graph.json 一次性导入的 2D 配色（可在面板重新导入） */
	colorGroups: import('./settings/graphJsonImport').ColorGroup[];
	/** 沉降坐标缓存：暖启动用（id → [x,y,z]） */
	positionCache: Record<string, [number, number, number]>;
}

// 默认 = 「银河」风格预设：扁平星盘 + 克制辉光——新用户第一印象优先（G2 反馈）
export const DEFAULT_SETTINGS: GalaxySettings = {
	bloom: { strength: 0.35, radius: 0.35, threshold: 0.22 },
	physics: { repel: 200, linkDistance: 70, linkStrength: 1, centerPull: 0.04, flatten: 0.3 },
	look: { nodeSize: 1, linkOpacity: 0.14, twinkle: 0.5, sizeBy: 'degree' },
	cruise: true,
	cruiseSpeed: 1,
	showUnresolved: false,
	showOrphans: true,
	colorTheme: 'imported',
	qualityOverride: 'auto',
	preset: 'deep-space',
	colorGroups: [],
	positionCache: {},
};

export function mergeSettings(saved: unknown): GalaxySettings {
	const d = DEFAULT_SETTINGS;
	const s = (saved ?? {}) as Partial<Record<keyof GalaxySettings, Record<string, unknown>>>;
	const sv = (saved ?? {}) as Partial<Record<keyof GalaxySettings, unknown>> & {
		cruise?: unknown;
		showUnresolved?: unknown;
		preset?: unknown;
		colorGroups?: unknown[];
		positionCache?: unknown;
	};
	const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
	return {
		bloom: {
			strength: num(s.bloom?.['strength'], d.bloom.strength),
			radius: num(s.bloom?.['radius'], d.bloom.radius),
			threshold: num(s.bloom?.['threshold'], d.bloom.threshold),
		},
		physics: {
			repel: num(s.physics?.['repel'], d.physics.repel),
			linkDistance: num(s.physics?.['linkDistance'], d.physics.linkDistance),
			linkStrength: num(s.physics?.['linkStrength'], d.physics.linkStrength),
			centerPull: num(s.physics?.['centerPull'], d.physics.centerPull),
			flatten: num(s.physics?.['flatten'], d.physics.flatten),
		},
		look: {
			nodeSize: num(s.look?.['nodeSize'], d.look.nodeSize),
			linkOpacity: num(s.look?.['linkOpacity'], d.look.linkOpacity),
			twinkle: num(s.look?.['twinkle'], d.look.twinkle),
			sizeBy: (['degree', 'fileSize', 'uniform'] as const).includes(s.look?.['sizeBy'] as SizeBy)
				? (s.look?.['sizeBy'] as SizeBy)
				: d.look.sizeBy,
		},
		cruise: typeof sv.cruise === 'boolean' ? sv.cruise : d.cruise,
		cruiseSpeed: num((sv as Record<string, unknown>)['cruiseSpeed'], d.cruiseSpeed),
		showUnresolved: typeof sv.showUnresolved === 'boolean' ? sv.showUnresolved : d.showUnresolved,
		showOrphans:
			typeof (sv as Record<string, unknown>)['showOrphans'] === 'boolean'
				? ((sv as Record<string, unknown>)['showOrphans'] as boolean)
				: d.showOrphans,
		colorTheme:
			typeof (sv as Record<string, unknown>)['colorTheme'] === 'string'
				? ((sv as Record<string, unknown>)['colorTheme'] as string)
				: d.colorTheme,
		qualityOverride: (['auto', 'high', 'low', 'mobile'] as const).includes(
			(sv as Record<string, unknown>)['qualityOverride'] as 'auto',
		)
			? ((sv as Record<string, unknown>)['qualityOverride'] as 'auto' | 'high' | 'low' | 'mobile')
			: d.qualityOverride,
		preset: sv.preset === 'adaptive' ? 'adaptive' : 'deep-space',
		colorGroups: Array.isArray(sv.colorGroups)
			? sv.colorGroups.filter(
					(g): g is import('./settings/graphJsonImport').ColorGroup =>
						typeof (g as { query?: unknown })?.query === 'string' &&
						typeof (g as { color?: unknown })?.color === 'string',
				)
			: [],
		positionCache:
			sv.positionCache && typeof sv.positionCache === 'object'
				? (sv.positionCache as Record<string, [number, number, number]>)
				: {},
	};
}

/** 视图通过它拿设置与持久化（避免与 main.ts 循环依赖） */
export interface SettingsHost {
	settings: GalaxySettings;
	saveSettings(): Promise<void>;
}

export function toLayoutParams(p: PhysicsSettings): import('./types').LayoutParams {
	return {
		charge: -p.repel,
		linkDistance: p.linkDistance,
		linkStrength: p.linkStrength,
		centerPull: p.centerPull,
		flatten: p.flatten,
		velocityDecay: 0.6,
	};
}
