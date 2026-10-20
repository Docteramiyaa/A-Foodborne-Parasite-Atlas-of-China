import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { LinesChart, ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import type { RegionStatus } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { api } from '@/lib/api';
import { MAP_LABEL_COLOR, MAP_LABEL_LIGHT, MAP_STATUS_COLORS, MAP_STATUS_HOVER, isDarkMapStatus } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LoadingDots } from '@/components/ui/States';

echarts.use([GeoComponent, TooltipComponent, ScatterChart, LinesChart, CanvasRenderer]);

const MAP_NAME = 'china-atlas';

/* ------------------------------------------------------------------ */
/* 地图集版面常量                                                       */
/* ------------------------------------------------------------------ */

const PAPER_BORDER = '#FBF8F0';
const SELECTED_BORDER = '#0C2922';
const HOVER_FILL = '#D8A15A';
const CALLOUT_LINE = 'rgba(120,134,124,0.72)';
const CALLOUT_DOT = '#7C8B80';
const HALO_LIGHT = 'rgba(251,248,240,0.92)';
const HALO_DARK = 'rgba(9,28,23,0.82)';
const LABEL_FONT = '"Noto Sans SC Variable", "Noto Sans SC", "PingFang SC", sans-serif';
const SERIF_FONT = '"Noto Serif SC Variable", "Noto Serif SC", Georgia, serif';

/** 地图内使用的短状态名（保持医学语义，压缩到标签长度） */
const SHORT_STATUS: Record<RegionStatus, string> = {
  endemic: '地方性流行',
  'high-burden': '高发区',
  reported: '省级病例记载',
  'national-context': '全国性资料',
  limited: '资料有限',
  'not-reported': '文献未见报道',
  unknown: '未知',
};

type LabelPosition = 'top' | 'bottom' | 'left' | 'right';

interface CalloutSpec {
  /** 引线终点（经纬度），标签放置于此附近 */
  anchor: [number, number];
  /** 首选方向 */
  position: LabelPosition;
}

/**
 * 小面积/拥挤区域使用引线标注（callout）：
 * 北京、天津、上海、香港、澳门、宁夏、海南、台湾。
 * 引线终点使用地理坐标，随地图缩放/平移同步移动。
 */
const CALLOUTS: Record<string, CalloutSpec> = {
  '110000': { anchor: [120.0, 40.0], position: 'bottom' }, // 北京（渤海湾）
  '120000': { anchor: [121.9, 38.2], position: 'right' }, // 天津（黄海）
  '310000': { anchor: [125.0, 30.6], position: 'right' }, // 上海（东海）
  '810000': { anchor: [118.6, 20.5], position: 'right' }, // 香港（南海）
  '820000': { anchor: [112.6, 19.1], position: 'left' }, // 澳门（南海）
  '640000': { anchor: [100.2, 45.6], position: 'left' }, // 宁夏（西北纸面）
  '460000': { anchor: [110.4, 16.5], position: 'right' }, // 海南（南海）
  '710000': { anchor: [124.9, 24.2], position: 'right' }, // 台湾（东海）
};

/**
 * 窄屏（手机）补充的引线标注：把东部沿海几个大省的省名移到海面/纸面，
 * 避免在 390px 宽的地图上被挤掉。
 */
const NARROW_CALLOUTS: Record<string, CalloutSpec> = {
  '320000': { anchor: [123.6, 36.4], position: 'top' }, // 江苏
  '330000': { anchor: [124.6, 28.2], position: 'right' }, // 浙江
  '350000': { anchor: [120.4, 20.6], position: 'bottom' }, // 福建
  '500000': { anchor: [103.6, 27.6], position: 'left' }, // 重庆
  '140000': { anchor: [109.4, 41.2], position: 'left' }, // 山西
};

/** 常规标签的布局优先级（大区域在前，重叠时优先保留） */
const LABEL_ORDER = [
  '650000',
  '540000',
  '150000',
  '630000',
  '510000',
  '530000',
  '230000',
  '620000',
  '450000',
  '520000',
  '430000',
  '610000',
  '370000',
  '410000',
  '340000',
  '360000',
  '420000',
  '320000',
  '330000',
  '350000',
  '440000',
  '220000',
  '210000',
  '130000',
  '500000',
  '140000',
];
const LABEL_ORDER_INDEX = new Map(LABEL_ORDER.map((code, index) => [code, index]));

/** 宽版地图上被移到海面/纸面的沿海省名：固定用深色字 */
const OFFSHORE_LABEL_CODES = new Set(['320000', '330000', '350000', '440000']);

/** 逐省标签微调（像素，针对宽版地图调校；窄地图会按比例缩小） */
const LABEL_OFFSETS: Record<string, [number, number]> = {
  '320000': [34, -6], // 江苏
  '340000': [-4, 11], // 安徽
  '330000': [26, 14], // 浙江
  '350000': [28, 12], // 福建
  '140000': [-9, 0], // 山西
  '130000': [8, -3], // 河北
  '370000': [11, 1], // 山东
  '410000': [-7, 9], // 河南
  '420000': [-8, 3], // 湖北
  '360000': [7, 11], // 江西
  '430000': [-7, 9], // 湖南
  '440000': [8, 14], // 广东
  '450000': [2, 11], // 广西
  '520000': [0, 9], // 贵州
  '500000': [6, 17], // 重庆
  '510000': [-4, 6], // 四川
  '610000': [-7, 2], // 陕西
  '620000': [8, 13], // 甘肃
  '630000': [-9, 0], // 青海
  '150000': [-5, 0], // 内蒙古
  '220000': [2, 2], // 吉林
  '210000': [0, 3], // 辽宁
  '230000': [0, 2], // 黑龙江
  '530000': [0, 3], // 云南
};

interface GeoFeature {
  type: string;
  properties: { adcode: string; name: string; center?: [number, number] };
  geometry?:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

/*
 * 省级 GeoJSON（约 460KB）按需动态加载：
 * 静态 import 会被 Vite 打入主包，拖慢所有页面的首屏。
 * 首次渲染地图时异步拉取独立 chunk，注册完成前组件显示轻量加载态。
 */
const NAME_BY_CODE = new Map<string, string>();
const FEATURE_NAMES = new Set<string>();
let mapReadyPromise: Promise<void> | null = null;
function ensureMapRegistered(): Promise<void> {
  if (!mapReadyPromise) {
    mapReadyPromise = import('@/assets/geo/china.json').then((mod) => {
      const geo = ((mod as { default?: unknown }).default ?? mod) as { features: GeoFeature[] };
      echarts.registerMap(MAP_NAME, geo as never);
      for (const f of geo.features) {
        if (f?.properties?.adcode != null && f.properties.name) {
          NAME_BY_CODE.set(String(f.properties.adcode), f.properties.name);
        }
        if (f?.properties?.name) FEATURE_NAMES.add(f.properties.name);
      }
    });
  }
  return mapReadyPromise;
}

export type ChinaMapMode = 'evidence' | 'parasite' | 'food';
export type ChinaMapVariant = 'hero' | 'page';

export interface ChinaMapProps {
  mode?: ChinaMapMode;
  parasiteId?: string | null;
  foodId?: string | null;
  selectedCode?: string | null;
  onSelect?: (code: string | null) => void;
  onHoverChange?: (code: string | null) => void;
  variant?: ChinaMapVariant;
  className?: string;
  /** 是否显示组件内置的提示条（页面自行放置图例时可关闭） */
  showHints?: boolean;
  /** 地图初始化完成后回调，用于外部控制缩放重置 */
  onResetReady?: (reset: () => void) => void;
}

interface TooltipParams {
  name?: string;
}

interface RegionLike {
  entryCount: number;
  parasiteIds: string[];
  evidenceStatus: RegionStatus;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/* ------------------------------------------------------------------ */
/* 标签测量与碰撞布局                                                   */
/* ------------------------------------------------------------------ */

/** 估算中文标签像素宽（含 textBorder 光晕） */
function measureLabelWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    width += (char.charCodeAt(0) > 255 ? 1 : 0.56) * fontSize;
  }
  return width + 4;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right + 1 && a.right > b.left - 1 && a.top < b.bottom + 1 && a.bottom > b.top - 1;
}

function withinBounds(rect: Rect, width: number, height: number): boolean {
  return rect.left >= 4 && rect.top >= 4 && rect.right <= width - 4 && rect.bottom <= height - 4;
}

/** 常规标签：以中心点为中心的矩形 */
function centeredRect(centerX: number, centerY: number, text: string, fontSize: number): Rect {
  const width = measureLabelWidth(text, fontSize);
  const height = fontSize + 4;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
  };
}

/** callout 标签：按方向放在锚点旁边 */
function calloutRect(anchorX: number, anchorY: number, text: string, fontSize: number, position: LabelPosition): Rect {
  const width = measureLabelWidth(text, fontSize);
  const height = fontSize + 4;
  const gap = 5;
  switch (position) {
    case 'right':
      return { left: anchorX + gap, top: anchorY - height / 2, right: anchorX + gap + width, bottom: anchorY + height / 2 };
    case 'left':
      return { left: anchorX - gap - width, top: anchorY - height / 2, right: anchorX - gap, bottom: anchorY + height / 2 };
    case 'top':
      return { left: anchorX - width / 2, top: anchorY - gap - height, right: anchorX + width / 2, bottom: anchorY - gap };
    case 'bottom':
    default:
      return { left: anchorX - width / 2, top: anchorY + gap, right: anchorX + width / 2, bottom: anchorY + gap + height };
  }
}

const CALLOUT_POSITION_ORDER: LabelPosition[] = ['right', 'left', 'bottom', 'top'];

function labelTone(status: RegionStatus): { color: string; textBorderColor: string } {
  return isDarkMapStatus(status)
    ? { color: MAP_LABEL_LIGHT, textBorderColor: HALO_DARK }
    : { color: MAP_LABEL_COLOR, textBorderColor: HALO_LIGHT };
}

/** 纸面（海面/图外）上的标签用深色字 */
const PAPER_TONE = { color: MAP_LABEL_COLOR, textBorderColor: HALO_LIGHT };


/** tooltip：地图集式小卡片；悬停即显示完整省名与状态。 */
function tooltipHtml(
  name: string,
  region: RegionLike | undefined,
  mode: ChinaMapMode,
  overlayStatus?: RegionStatus,
): string {
  const status = overlayStatus ?? region?.evidenceStatus ?? 'unknown';
  const color = MAP_STATUS_COLORS[status] ?? MAP_STATUS_COLORS.unknown;
  const eyebrow =
    mode === 'evidence' ? 'PROVINCIAL EVIDENCE' : mode === 'parasite' ? 'PARASITE EVIDENCE' : 'FOOD EVIDENCE';
  const counts = region
    ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid rgba(216,208,191,0.75);display:flex;gap:16px;font-size:11px;color:#5F7168">
        <span><b style="font-family:${SERIF_FONT};font-size:13px;color:#12211C">${region.entryCount}</b> 条文献证据</span>
        <span><b style="font-family:${SERIF_FONT};font-size:13px;color:#12211C">${region.parasiteIds.length}</b> 种寄生虫</span>
      </div>`
    : '';
  return `<div style="min-width:198px;max-width:266px;padding:13px 15px 11px;border-radius:0;background:#F2EBD9;border:1px solid #8F8875;box-shadow:6px 6px 0 rgba(37,54,45,0.1);font-family:${LABEL_FONT}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span style="font-size:9px;letter-spacing:0.18em;color:#68705F">${eyebrow}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#68705F">
        <span style="width:6px;height:6px;border-radius:0;background:${color}"></span>${SHORT_STATUS[status] ?? '未知'}
      </span>
    </div>
    <div style="margin-top:6px;font-family:${SERIF_FONT};font-size:18px;font-weight:600;color:#25362D;line-height:1.2">${name}</div>
    ${counts}
    <div style="margin-top:8px;font-size:10px;color:#68705F">点击查看该省档案 · 滚轮缩放 / 拖拽平移</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 地图组件                                                            */
/* ------------------------------------------------------------------ */

export function ChinaMap({
  mode = 'evidence',
  parasiteId,
  foodId,
  selectedCode,
  onSelect,
  onHoverChange,
  variant = 'page',
  className,
  showHints = false,
  onResetReady,
}: ChinaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const { regions, regionByCode, parasites, foods } = useAtlas();
  const [geoReady, setGeoReady] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [overlay, setOverlay] = useState<Map<string, RegionStatus>>(new Map());
  const cacheRef = useRef<Map<string, Map<string, RegionStatus>>>(new Map());

  const isHero = variant === 'hero';
  const regionByName = useMemo(() => new Map(regions.map((r) => [r.name, r])), [regions]);
  const shortNameByName = useMemo(() => new Map(regions.map((r) => [r.name, r.shortName])), [regions]);
  const codeByName = useMemo(() => new Map(regions.map((r) => [r.name, r.code])), [regions]);

  /* 按寄生虫 / 食物加载省份证据状态 */
  useEffect(() => {
    let alive = true;
    if (mode === 'evidence' || (!parasiteId && !foodId)) {
      setOverlay(new Map());
      return;
    }
    const key = mode === 'parasite' ? `p:${parasiteId}` : `f:${foodId}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setOverlay(cached);
      return;
    }
    const load =
      mode === 'parasite' && parasiteId
        ? api.parasite(parasiteId).then((detail) => {
            const map = new Map<string, RegionStatus>();
            for (const entry of detail.regionEvidence) map.set(entry.code, entry.status);
            return map;
          })
        : foodId
          ? api.food(foodId).then((detail) => {
              const map = new Map<string, RegionStatus>();
              for (const region of detail.regions) map.set(region.code, region.status);
              return map;
            })
          : Promise.resolve(new Map<string, RegionStatus>());
    load
      .then((map) => {
        if (!alive) return;
        cacheRef.current.set(key, map);
        setOverlay(map);
      })
      .catch(() => {
        if (alive) setOverlay(new Map());
      });
    return () => {
      alive = false;
    };
  }, [mode, parasiteId, foodId]);

  const focusedEntityName = useMemo(() => {
    if (mode === 'parasite' && parasiteId) return parasites.find((p) => p.id === parasiteId)?.name ?? null;
    if (mode === 'food' && foodId) return foods.find((f) => f.id === foodId)?.name ?? null;
    return null;
  }, [mode, parasiteId, foodId, parasites, foods]);

  /* 初始化图表（等待 GeoJSON 异步注册完成） */
  useEffect(() => {
    let alive = true;
    let chart: EChartsType | null = null;
    let observer: ResizeObserver | null = null;
    let lastWidth = 0;

    void ensureMapRegistered().then(() => {
      if (!alive) return;
      const el = containerRef.current;
      if (!el) return;
      chart = echarts.init(el, undefined, { renderer: 'canvas' });
      chartRef.current = chart;

      observer = new ResizeObserver(() => {
        chart?.resize();
        const width = el.clientWidth || 0;
        setNarrow(width < 520);
        if (Math.abs(width - lastWidth) > 6) {
          lastWidth = width;
          if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = window.setTimeout(() => setLayoutNonce((nonce) => nonce + 1), 180);
        }
      });
      observer.observe(el);
      lastWidth = el.clientWidth || 0;
      setNarrow(lastWidth < 520);

      // 重建版面（notMerge）以恢复初始缩放/平移；直接 restore 会回到第一次 setOption（无标签）
      onResetReady?.(() => setLayoutNonce((nonce) => nonce + 1));
      setGeoReady(true);
    });

    return () => {
      alive = false;
      observer?.disconnect();
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      chart?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 绘制：先铺 geo 版面，再按像素碰撞结果摆放标签 */
  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !geoReady || !el) return;

    const canvasWidth = el.clientWidth || 800;
    const canvasHeight = el.clientHeight || 590;
    const labelFontSize = isHero ? 8.8 : narrow ? 8.5 : 9.4;
    const calloutFontSize = isHero ? 8.6 : narrow ? 8.5 : 9.4;
    const offsetScale = narrow ? 0.95 : Math.min(Math.max(canvasWidth / 800, 0.55), 1);

    const statusFor = (code: string): RegionStatus => {
      if (mode === 'evidence') return regionByCode.get(code)?.evidenceStatus ?? 'unknown';
      return overlay.get(code) ?? 'limited';
    };

    const geoRegions = regions.map((region) => {
      const status = statusFor(region.code);
      const selected = selectedCode === region.code;
      return {
        name: region.name,
        itemStyle: {
          areaColor: MAP_STATUS_COLORS[status] ?? MAP_STATUS_COLORS.unknown,
          borderColor: selected ? SELECTED_BORDER : PAPER_BORDER,
          borderWidth: selected ? 1.7 : 0.75,
          shadowBlur: selected ? 14 : 0,
          shadowColor: 'rgba(12,41,34,0.34)',
          shadowOffsetY: selected ? 1 : 0,
        },
        emphasis: {
          itemStyle: {
            areaColor: MAP_STATUS_HOVER[status] ?? HOVER_FILL,
            borderColor: selected ? SELECTED_BORDER : '#B9AF9A',
            borderWidth: selected ? 1.7 : 1,
          },
        },
      };
    });

    const tooltipFormatter = (params: unknown) => {
      const p = params as TooltipParams;
      const name = p.name ?? '';
      const region = regionByName.get(name);
      const code = codeByName.get(name);
      return tooltipHtml(name, region, mode, code ? overlay.get(code) : undefined);
    };
    const tooltipBase = {
      trigger: 'item' as const,
      confine: true,
      className: 'atlas-map-tooltip',
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      textStyle: { color: MAP_LABEL_COLOR },
      formatter: tooltipFormatter,
    };

    const baseOption: EChartsCoreOption = {
      backgroundColor: 'transparent',
      animationDuration: 480,
      animationDurationUpdate: 420,
      animationEasingUpdate: 'cubicOut',
      tooltip: tooltipBase,
      geo: {
        map: MAP_NAME,
        roam: !isHero,
        zoom: isHero ? 1.02 : 1,
        scaleLimit: { min: 0.85, max: 6 },
        layoutCenter: isHero ? ['50%', '52%'] : ['50%', '51%'],
        layoutSize: isHero ? '100%' : '100%',
        label: { show: false },
        itemStyle: {
          areaColor: MAP_STATUS_COLORS.unknown,
          borderColor: PAPER_BORDER,
          borderWidth: 0.75,
          shadowBlur: 0,
          shadowOffsetY: 0,
        },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: HOVER_FILL,
            borderColor: '#8A5A2B',
            borderWidth: 1.1,
            shadowBlur: 12,
            shadowColor: 'rgba(18,33,28,0.2)',
          },
        },
        regions: geoRegions,
        tooltip: tooltipBase,
      },
      series: [],
    };
    chart.setOption(baseOption, { notMerge: true });

    /* geo 已就位：把经纬度转换成像素，手工做标签避让 */
    const toPixel = (coord: [number, number]): [number, number] | null => {
      try {
        const point = chart.convertToPixel({ geoIndex: 0 }, coord);
        if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
        return [point[0], point[1]];
      } catch {
        return null;
      }
    };

    const placed: Rect[] = [];
    const place = (rect: Rect): boolean => {
      if (!withinBounds(rect, canvasWidth, canvasHeight)) return false;
      if (placed.some((existing) => intersects(existing, rect))) return false;
      placed.push(rect);
      return true;
    };

    /**
     * 标签字色跟随“实际底色”：在已绘制的 geo 图层上采样标签中心像素。
     * 深色省域用浅字 + 深色 halo，浅色省域/纸面/海面用深字 + 纸色 halo。
     * ECharts 画布可能有多层（hover 层 + 主层），逐层取样直到命中不透明像素。
     */
    const chartWidth = chart.getWidth() || 1;
    const canvasLayers = Array.from(chart.getDom().querySelectorAll('canvas'))
      .map((element) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        return context ? { canvas, context } : null;
      })
      .filter((layer): layer is { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } => layer != null);
    const SAMPLE_OFFSETS: [number, number][] = [
      [0, 0],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ];
    const toneAtPixel = (x: number, y: number): { color: string; textBorderColor: string } => {
      for (const layer of canvasLayers) {
        const ratio = layer.canvas.width / chartWidth;
        let red = 0;
        let green = 0;
        let blue = 0;
        let samples = 0;
        for (const [dx, dy] of SAMPLE_OFFSETS) {
          try {
            const pixel = layer.context.getImageData(
              Math.max(0, Math.round((x + dx) * ratio)),
              Math.max(0, Math.round((y + dy) * ratio)),
              1,
              1,
            ).data;
            if (pixel[3] < 24) continue;
            red += pixel[0];
            green += pixel[1];
            blue += pixel[2];
            samples += 1;
          } catch {
            // 忽略越界像素
          }
        }
        if (!samples) continue;
        const luminance = (0.2126 * (red / samples) + 0.7152 * (green / samples) + 0.0722 * (blue / samples)) / 255;
        return luminance < 0.52
          ? { color: MAP_LABEL_LIGHT, textBorderColor: HALO_DARK }
          : { color: MAP_LABEL_COLOR, textBorderColor: HALO_LIGHT };
      }
      return PAPER_TONE;
    };

    const calloutSpecs = narrow ? { ...CALLOUTS, ...NARROW_CALLOUTS } : CALLOUTS;
    const calloutEntries = regions.flatMap((region) => {
      const spec = calloutSpecs[region.code];
      return spec ? [{ region, spec }] : [];
    });

    const calloutPoints: Record<string, unknown>[] = [];
    const calloutLines: { coords: [number, number][] }[] = [];
    for (const { region, spec } of calloutEntries) {
      const anchor = toPixel(spec.anchor);
      if (!anchor) continue;
      const text = shortNameByName.get(region.name) ?? region.name;
      const preferred = [spec.position, ...CALLOUT_POSITION_ORDER.filter((item) => item !== spec.position)];
      let chosen: { position: LabelPosition; rect: Rect } | null = null;
      for (const candidate of preferred) {
        const rect = calloutRect(anchor[0], anchor[1], text, calloutFontSize, candidate);
        if (place(rect)) {
          chosen = { position: candidate, rect };
          break;
        }
      }
      if (!chosen) continue;
      const tone = NARROW_CALLOUTS[region.code]
        ? toneAtPixel((chosen.rect.left + chosen.rect.right) / 2, (chosen.rect.top + chosen.rect.bottom) / 2)
        : PAPER_TONE;
      calloutPoints.push({
        name: region.name,
        value: spec.anchor,
        label: {
          show: true,
          formatter: text,
          position: chosen.position,
          distance: 3,
          color: tone.color,
          textBorderColor: tone.textBorderColor,
          textBorderWidth: tone.color === MAP_LABEL_LIGHT ? 1.1 : 0.6,
        },
        itemStyle: { color: CALLOUT_DOT, borderWidth: 0, opacity: 0.85 },
        symbolSize: 2.2,
      });
      calloutLines.push({ coords: [region.center, spec.anchor] });
    }

    const normalPoints: Record<string, unknown>[] = [];
    /** 窄屏时在省域中心附近尝试多个落点，尽量让主要省份都有标签 */
    const NARROW_NUDGES: [number, number][] = [
      [0, 0],
      [0, -13],
      [0, 13],
      [-17, 0],
      [17, 0],
      [0, -22],
      [0, 22],
      [-18, -13],
      [18, -13],
      [-18, 13],
      [18, 13],
      [-28, 0],
      [28, 0],
      [0, -32],
      [0, 32],
    ];
    const candidates = regions
      .filter((region) => !calloutSpecs[region.code])
      .sort((a, b) => (LABEL_ORDER_INDEX.get(a.code) ?? 99) - (LABEL_ORDER_INDEX.get(b.code) ?? 99));
    for (const region of candidates) {
      const center = toPixel(region.center);
      if (!center) continue;
      const text = shortNameByName.get(region.name) ?? region.name;
      const baseOffset = LABEL_OFFSETS[region.code] ?? [0, 0];
      const preferred = narrow
        ? [
            [baseOffset[0] * offsetScale, baseOffset[1] * offsetScale] as [number, number],
            ...NARROW_NUDGES,
          ]
        : [[baseOffset[0] * offsetScale, baseOffset[1] * offsetScale] as [number, number]];
      let chosenOffset: [number, number] | null = null;
      for (const offset of preferred) {
        const x = center[0] + offset[0];
        const y = center[1] + offset[1];
        if (place(centeredRect(x, y, text, labelFontSize))) {
          chosenOffset = offset;
          break;
        }
      }
      if (!chosenOffset) continue;
      const x = center[0] + chosenOffset[0];
      const y = center[1] + chosenOffset[1];
      const tone = OFFSHORE_LABEL_CODES.has(region.code) ? PAPER_TONE : toneAtPixel(x, y);
      normalPoints.push({
        name: region.name,
        value: region.center,
        label: {
          show: true,
          formatter: text,
          position: [chosenOffset[0], chosenOffset[1]],
          align: 'center',
          verticalAlign: 'middle',
          color: tone.color,
          textBorderColor: tone.textBorderColor,
          textBorderWidth: tone.color === MAP_LABEL_LIGHT ? 1.1 : 0.6,
        },
        symbolSize: 0.1,
      });
    }

    chart.setOption(
      {
        series: [
          {
            // 小区域引线
            type: 'lines',
            coordinateSystem: 'geo',
            geoIndex: 0,
            z: 9,
            silent: true,
            symbol: 'none',
            animation: false,
            lineStyle: {
              color: CALLOUT_LINE,
              width: isHero ? 0.7 : 0.9,
              opacity: 0.85,
              curveness: 0.16,
              type: [3, 3],
            },
            data: calloutLines,
          },
          {
            // 常规省名（按像素碰撞结果只保留不重叠的标签）
            type: 'scatter',
            coordinateSystem: 'geo',
            geoIndex: 0,
            z: 11,
            silent: true,
            symbol: 'circle',
            symbolSize: 0.1,
            itemStyle: { color: 'transparent', borderWidth: 0 },
            animation: false,
            label: {
              show: true,
              fontFamily: LABEL_FONT,
              fontSize: labelFontSize,
              fontWeight: 600,
              lineHeight: labelFontSize + 3,
            },
            data: normalPoints,
          },
          {
            // 小区域 callout 标签
            type: 'scatter',
            coordinateSystem: 'geo',
            geoIndex: 0,
            z: 12,
            silent: true,
            symbol: 'circle',
            animation: false,
            label: {
              show: true,
              fontFamily: LABEL_FONT,
              fontSize: calloutFontSize,
              fontWeight: 600,
              lineHeight: calloutFontSize + 3,
            },
            data: calloutPoints,
          },
        ],
      },
      { replaceMerge: ['series'] },
    );

    chart.off('click');
    chart.on('click', (params: unknown) => {
      const p = params as TooltipParams;
      const name = p.name ?? '';
      if (!FEATURE_NAMES.has(name)) return;
      const code = codeByName.get(name) ?? [...NAME_BY_CODE.entries()].find(([, n]) => n === name)?.[0];
      if (code && regionByCode.has(code)) onSelect?.(code);
    });
    chart.off('mouseover');
    chart.off('mouseout');
    chart.off('globalout');
    chart.on('mouseover', (params: unknown) => {
      const p = params as TooltipParams;
      const name = p.name ?? '';
      const code = codeByName.get(name) ?? [...NAME_BY_CODE.entries()].find(([, n]) => n === name)?.[0];
      if (code) onHoverChange?.(code);
    });
    chart.on('mouseout', () => onHoverChange?.(null));
    chart.on('globalout', () => onHoverChange?.(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoReady, mode, variant, selectedCode, overlay, regions, regionByCode, regionByName, shortNameByName, codeByName, narrow, isHero, parasiteId, foodId, layoutNonce]);

  const focusedLabel = focusedEntityName ? ` · ${focusedEntityName}` : '';
  const selectedName = selectedCode ? regionByCode.get(selectedCode)?.name ?? null : null;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* 纸面 / 海面底纹（纯 CSS，不依赖外部图片） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(125% 90% at 50% 36%, #FCF9F1 0%, #F7F1E4 52%, #EFE7D6 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(62% 46% at 82% 82%, rgba(116,152,140,0.20), rgba(116,152,140,0) 72%), radial-gradient(44% 36% at 14% 22%, rgba(201,138,61,0.07), rgba(201,138,61,0) 72%)',
        }}
      />
      <div aria-hidden className="geo-grid-fine pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden className="paper-grain pointer-events-none absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className={cn('pointer-events-none absolute border border-ink/20', isHero ? 'inset-2.5' : 'inset-3')}
      />

      <div
        ref={containerRef}
        className="map-canvas relative z-10 h-full w-full"
        role="img"
        aria-label={`中国省级食源性寄生虫证据地图${focusedLabel}。颜色表示文献证据状态，不代表量化风险概率；点击省份可查看相关资料。`}
      />

      {!geoReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper-light/50 backdrop-blur-[1px]">
          <LoadingDots label="地图加载中" />
        </div>
      )}

      {selectedName && !isHero && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 border border-ink/30 bg-paper-light/90 px-2.5 py-1 font-kai text-[10.5px] text-ink-muted shadow-[3px_3px_0_rgba(37,54,45,0.07)]">
          <span className="h-1.5 w-1.5 bg-terracotta-600" aria-hidden />
          已选
          <b className="font-medium text-ink">{selectedName}</b>
        </div>
      )}

      {showHints && (
        <>
          <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden items-center gap-1.5 border border-ink/25 bg-paper-light/90 px-2.5 py-1 font-kai text-[10px] text-ink-muted sm:flex">
            <span className="inline-block h-1.5 w-1.5 bg-ochre-500" />
            地图用于定位省份
          </div>
          {variant === 'page' && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden border border-ink/25 bg-paper-light/90 px-2.5 py-1 font-kai text-[10px] text-ink-muted sm:block">
              滚轮缩放 · 拖拽平移 · 点击省份查看
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 地区详情页使用的小地图：高亮当前省份与邻近省份 */
export function ProvinceMiniMap({
  code,
  neighborCodes = [],
  className,
  height = 240,
}: {
  code: string;
  neighborCodes?: string[];
  className?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const { regionByCode } = useAtlas();
  const [geoReady, setGeoReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let observer: ResizeObserver | null = null;
    void ensureMapRegistered().then(() => {
      if (!alive) return;
      const el = containerRef.current;
      if (!el) return;
      const chart = echarts.init(el, undefined, { renderer: 'canvas' });
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(el);
      setGeoReady(true);
    });
    return () => {
      alive = false;
      observer?.disconnect();
      const chart = chartRef.current;
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!geoReady) return;
    const chart = chartRef.current;
    if (!chart) return;
    const region = regionByCode.get(code);
    const name = region?.name ?? NAME_BY_CODE.get(code) ?? '';
    const neighborNames = new Set(
      neighborCodes.map((c) => regionByCode.get(c)?.name ?? NAME_BY_CODE.get(c)).filter(Boolean),
    );
    const data = [...regionByCode.values()].map((r) => {
      const isFocus = r.code === code;
      const isNeighbor = neighborNames.has(r.name);
      return {
        name: r.name,
        itemStyle: {
          areaColor: isFocus ? '#2B5A4A' : isNeighbor ? '#8AB5A0' : '#DAD3C5',
          borderColor: '#FBF8F0',
          borderWidth: 0.9,
        },
      };
    });
    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      tooltip: { show: false },
      geo: {
        map: MAP_NAME,
        roam: false,
        zoom: name === '海南省' ? 1.1 : 1.55,
        center: region?.center,
        label: { show: false },
        itemStyle: {
          areaColor: '#E4DED0',
          borderColor: '#FBF8F0',
          borderWidth: 0.9,
        },
        emphasis: { disabled: true },
        regions: data,
      },
      series: [],
    };
    chart.setOption(option, { notMerge: true });
  }, [geoReady, code, neighborCodes, regionByCode]);

  return (
    <div className={cn('relative overflow-hidden border border-ink/25 bg-paper-light/40', className)}>
      <div aria-hidden className="geo-grid-fine pointer-events-none absolute inset-0 opacity-50" />
      <div
        ref={containerRef}
        className="relative h-full w-full"
        style={{ height }}
        role="img"
        aria-label="该省份在全国地图中的位置"
      />
    </div>
  );
}






















