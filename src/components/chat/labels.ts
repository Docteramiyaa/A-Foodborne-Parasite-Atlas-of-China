/** 对话页界面标签（仅界面文案，不含医学结论） */
import type { ChatSectionKind } from '@shared/types';

/** 分段缺省标题：用自然说法代替内部类型名 */
export const SECTION_LABELS: Record<ChatSectionKind, string> = {
  why: '为什么会这样',
  consequence: '可能后果',
  prevention: '可以怎么做',
  'post-exposure': '已经吃了怎么办',
  treatment: '就医与治疗',
  region: '当地资料',
  season: '季节背景',
  evidence: '资料说明',
  note: '说明',
};

export const EXPOSURE_LABELS: Record<'before' | 'after' | 'unknown', string> = {
  before: '尚未食用',
  after: '已经食用',
  unknown: '未说明',
};
