import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { ScatterChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import type { RegionSummary } from '@shared/types';
import { useAtlas } from '@/lib/atlas';
import { cn } from '@/lib/utils';

echarts.use([GeoComponent, TooltipComponent, ScatterChart, CanvasRenderer]);

const MAP_NAME = 'explore-china';
const LABEL_FONT = '"Noto Sans SC Variable", "Noto Sans SC", "PingFang SC", sans-serif';

const COLORS = {
  local: '#C3CFB2',
  limited: '#DCD3C0',
  none: '#EFE9DA',
  paper: '#F3ECDD',
  border: '#FBF8F0',
  selected: '#9C3E2D',
  ink: '#25362D',
  hover: '#C9A26B',
};

export type MapEvidenceCategory = 'local' | 'limited' | 'none';

/** 地图只用三种直白状态，不再使用 7 级证据色阶 */
export function mapEvidenceCategory(region: Pick<RegionSummary, 'evidenceStatus' | 'entryCount'>): MapEvidenceCategory {
  if (region.entryCount <= 0) return 'none';
  switch (region.evidenceStatus) {
    case 'endemic':
    case 'high-burden':
    case 'reported':
      return 'local';
    case 'national-context':
    case 'limited':
      return 'limited';
    case 'not-reported':
    case 'unknown':
    default:
      return 'none';
  }
}

export const MAP_CATEGORY_LABEL: Record<MapEvidenceCategory, string> = {
  local: '有本地资料',
  limited: '资料有限',
  none: '暂无本地资料',
};

/**
 * 小省份固定编号：地图上放固定偏移的编号点，图下方给出固定文字索引。
 * 不参与标签碰撞，编号位置始终稳定；可点地图标记或下方索引选择。
 */
export const SMALL_PROVINCES: { code: string; name: string; number: number }[] = [
  { code: '640000', name: '宁夏', number: 1 },
  { code: '110000', name: '北京', number: 2 },
  { code: '120000', name: '天津', number: 3 },
  { code: '310000', name: '上海', number: 4 },
  { code: '810000', name: '香港', number: 5 },
  { code: '820000', name: '澳门', number: 6 },
  { code: '460000', name: '海南', number: 7 },
  { code: '710000', name: '台湾', number: 8 },
];

const SMALL_PROVINCE_BY_CODE = new Map(SMALL_PROVINCES.map((item) => [item.code, item]));
/** 固定屏幕偏移（像素），让 8 个编号点在任意缩放下都不重叠 */
const SMALL_MARKER_OFFSET: Record<string, [number, number]> = {
  '110000': [-2, -22],
  '120000': [22, -10],
  '310000': [24, -2],
  '810000': [20, 10],
  '820000': [-20, 10],
  '460000': [0, 18],
  '640000': [-24, -6],
  '710000': [22, 2],
};

export interface ExploreMapProps {
  selectedCode: string | null;
  onSelect: (code: string) => void;
  className?: string;
}

interface GeoFeature {
  type: string;
  properties: { adcode: string; name: string; center?: [number, number] };
}

let mapReadyPromise: Promise<void> | null = null;
function ensureMapRegistered(): Promise<void> {
  if (!mapReadyPromise) {
    mapReadyPromise = import('@/assets/geo/china.json').then((mod) => {
      const geo = ((mod as { default?: unknown }).default ?? mod) as { features: GeoFeature[] };
      echarts.registerMap(MAP_NAME, geo as never);
    });
  }
  return mapReadyPromise;
}

export function ExploreMap({ selectedCode, onSelect, className }: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const { regions } = useAtlas();
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const regionByName = useMemo(() => new Map(regions.map((region) => [region.name, region])), [regions]);
  const regionByCode = useMemo(() => new Map(regions.map((region) => [region.code, region])), [regions]);
  const selectedRegion = selectedCode ? regionByCode.get(selectedCode) ?? null : null;

  useEffect(() => {
    let alive = true;
    let chart: EChartsType | null = null;
    let observer: ResizeObserver | null = null;
    void ensureMapRegistered().then(() => {
      if (!alive) return;
      const el = containerRef.current;
      if (!el) return;
      chart = echarts.init(el, undefined, { renderer: 'canvas' });
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(el);
      setReady(true);
    });
    return () => {
      alive = false;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;

    const regionOptions = regions.map((region) => {
      const category = mapEvidenceCategory(region);
      const selected = region.code === selectedCode;
      const isSmall = SMALL_PROVINCE_BY_CODE.has(region.code);
      return {
        name: region.name,
        itemStyle: {
          areaColor: selected ? COLORS.selected : COLORS[category],
          borderColor: COLORS.border,
          borderWidth: selected ? 1.8 : 1,
          shadowBlur: selected ? 10 : 0,
          shadowColor: 'rgba(37,54,45,0.25)',
        },
        emphasis: {
          itemStyle: {
            areaColor: selected ? '#843428' : COLORS.hover,
            borderColor: selected ? '#5d231b' : COLORS.ink,
            borderWidth: 1.2,
          },
        },
        // 小省份用固定编号点 + 固定索引；其余省份直接标名，位置来自稳定的地理中心。
        label: {
          show: !isSmall,
          formatter: region.shortName ?? region.name,
          color: selected ? '#F7F1E4' : COLORS.ink,
          fontFamily: LABEL_FONT,
          fontSize: 9,
          fontWeight: 500,
          textBorderColor: selected ? 'rgba(93,35,27,0.55)' : 'rgba(243,236,221,0.92)',
          textBorderWidth: selected ? 1.4 : 2,
        },
      };
    });

    const tooltipBase = {
      trigger: 'item' as const,
      confine: true,
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      formatter: (params: unknown) => {
        const name = (params as { name?: string }).name ?? '';
        const region = regionByName.get(name);
        if (!region) return '';
        const category = mapEvidenceCategory(region);
        return `<div style="min-width:150px;max-width:230px;padding:9px 11px;background:#F7F1E4;border:1px solid #B3AA93;font-family:${LABEL_FONT};box-shadow:5px 5px 0 rgba(37,54,45,.10)">
          <div style="font-family:'Noto Serif SC Variable',serif;font-size:15px;font-weight:600;color:#25362D">${region.name}</div>
          <div style="margin-top:3px;font-family:'STKaiti','KaiTi',serif;font-size:11px;color:#536C4D">${MAP_CATEGORY_LABEL[category]}</div>
        </div>`;
      },
    };

    const smallMarkers = SMALL_PROVINCES.map((small) => {
      const region = regionByCode.get(small.code);
      if (!region) return null;
      const selected = region.code === selectedCode;
      const offset = SMALL_MARKER_OFFSET[region.code] ?? [0, 0];
      return {
        name: region.name,
        code: region.code,
        value: region.center,
        symbolOffset: offset,
        symbolSize: 16,
        itemStyle: {
          color: selected ? COLORS.selected : '#F7F1E4',
          borderColor: selected ? '#5d231b' : '#8F8875',
          borderWidth: 1,
        },
        label: {
          show: true,
          formatter: String(small.number),
          color: selected ? '#F7F1E4' : COLORS.ink,
          fontSize: 8.5,
          fontWeight: 600,
          fontFamily: LABEL_FONT,
        },
      };
    }).filter(Boolean);

    const previousGeo = (chart.getOption() as { geo?: { zoom?: number; center?: number[] | null }[] } | undefined)?.geo?.[0];
    const previousZoom = previousGeo?.zoom ?? 1;
    const previousCenter = previousGeo?.center ?? null;

    const option: EChartsCoreOption = {
      backgroundColor: 'transparent',
      animationDuration: 360,
      animationDurationUpdate: 260,
      tooltip: tooltipBase,
      geo: {
        map: MAP_NAME,
        roam: true,
        zoom: previousZoom,
        ...(previousCenter ? { center: previousCenter } : {}),
        scaleLimit: { min: 0.8, max: 6 },
        layoutCenter: ['50%', '50%'],
        layoutSize: '94%',
        label: { show: false },
        itemStyle: {
          areaColor: COLORS.none,
          borderColor: COLORS.border,
          borderWidth: 1,
          shadowBlur: 0,
        },
        emphasis: {
          label: { show: false },
          itemStyle: { areaColor: COLORS.hover, borderColor: COLORS.ink, borderWidth: 1.2 },
        },
        regions: regionOptions,
        tooltip: tooltipBase,
      },
      series: [
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          geoIndex: 0,
          z: 12,
          symbol: 'circle',
          silent: false,
          cursor: 'pointer',
          data: smallMarkers,
          tooltip: tooltipBase,
        },
      ],
    };

    chart.setOption(option, { notMerge: true });
    const currentZoom = (chart.getOption() as { geo?: { zoom?: number }[] } | undefined)?.geo?.[0]?.zoom ?? 1;
    setZoomed(currentZoom !== 1);

    chart.off('click');
    chart.on('click', (params: unknown) => {
      const p = params as { name?: string; componentType?: string };
      const name = p.name ?? '';
      const region = regionByName.get(name);
      if (region) onSelect(region.code);
    });
  }, [ready, regions, regionByName, regionByCode, selectedCode, selectedRegion, onSelect]);

  const applyZoom = (nextZoom: number, center?: [number, number]) => {
    const chart = chartRef.current;
    if (!chart) return;
    const geoOption = (chart.getOption() as { geo?: { zoom?: number; center?: number[] }[] } | undefined)?.geo?.[0];
    const zoom = Math.min(6, Math.max(0.8, nextZoom));
    chart.setOption({
      geo: {
        zoom,
        ...(center ? { center } : geoOption?.center ? { center: geoOption.center } : {}),
      },
    });
    setZoomed(zoom !== 1);
  };

  const zoomBy = (factor: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const geoOption = (chart.getOption() as { geo?: { zoom?: number }[] } | undefined)?.geo?.[0];
    applyZoom((geoOption?.zoom ?? 1) * factor);
  };

  const locateSelected = () => {
    if (!selectedRegion) return;
    applyZoom(SMALL_PROVINCE_BY_CODE.has(selectedRegion.code) ? 3.4 : 2.6, selectedRegion.center);
  };

  const resetView = () => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption({ geo: { zoom: 1, center: null } });
    setZoomed(false);
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        className="h-full min-h-[300px] w-full"
        role="img"
        aria-label="中国省级本地资料分布地图。滚轮缩放、拖拽平移；选择省份可查看该地区资料。"
      />

      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        {[
          { key: 'in', label: '放大地图', content: '+', action: () => zoomBy(1.3) },
          { key: 'out', label: '缩小地图', content: '−', action: () => zoomBy(1 / 1.3) },
          {
            key: 'locate',
            label: '定位到所选省份',
            content: '定位',
            action: locateSelected,
            disabled: !selectedRegion,
          },
          { key: 'reset', label: '复位地图', content: '复位', action: resetView, hidden: !zoomed },
        ]
          .filter((item) => !item.hidden)
          .map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              title={item.label}
              onClick={item.action}
              disabled={'disabled' in item ? item.disabled : false}
              className="inline-flex h-7 min-w-7 items-center justify-center border border-ink/35 bg-paper-light/95 px-1.5 text-[10px] font-medium text-ink-soft transition hover:border-ink hover:bg-ink hover:text-paper-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.content}
            </button>
          ))}
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center font-kai text-[11px] tracking-[0.08em] text-ink-faint">
          地图加载中…
        </div>
      )}
    </div>
  );
}

