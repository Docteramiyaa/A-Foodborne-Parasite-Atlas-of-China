/** 初始建议问题：API 建议 + 分类示例 */

export interface SuggestionOption {
  text: string;
  tag: string;
  fromApi: boolean;
}

const CATEGORY_EXAMPLES: SuggestionOption[] = [
  { text: '昨天吃了生腌虾，现在有点担心，应该怎么办？', tag: '食后担忧', fromApi: false },
  { text: '涮羊肉要涮到全熟才安全吗？', tag: '做法与预防', fromApi: false },
  { text: '夏天吃醉蟹需要注意什么？', tag: '季节', fromApi: false },
  { text: '哪些省份有肺吸虫的文献记载？', tag: '地区', fromApi: false },
  { text: '华支睾吸虫是怎么进入人体的？', tag: '知识', fromApi: false },
  { text: '明天晚上在广东吃鱼生，风险大吗？', tag: '食前风险', fromApi: false },
];

const REGION_WORDS =
  /(省|地区|哪里|广东|广西|云南|四川|湖南|湖北|江西|浙江|福建|江苏|安徽|山东|河南|河北|辽宁|吉林|黑龙江|贵州|海南|陕西|甘肃|青海|宁夏|新疆|西藏|内蒙古|北京|上海|天津|重庆|台湾|香港|澳门)/;

/** 仅用于界面标签的粗略分类（分类不参与任何医学判断） */
function classify(text: string): string {
  if (/(已经|昨天|前天|吃了|喝过|食后|担心|症状|不适|就医)/.test(text)) return '食后担忧';
  if (REGION_WORDS.test(text)) return '地区';
  if (/(什么|怎么|为什么|如何|生活史|宿主|区别|知识|哪些虫)/.test(text)) return '知识';
  if (/(季节|月|夏天|冬天|春天|秋天)/.test(text)) return '季节';
  return '食前风险';
}

function normalize(text: string): string {
  return text.replace(/[\s？?。！!，,、；;：:]/g, '').toLowerCase();
}

/**
 * 组合初始建议：
 * 优先使用 `/api/chat/suggestions`（最多 4 条），再用分类示例补足到 6 条。
 * 去重后按顺序返回，保证任何情况下都有 4–6 条可用的问题。
 */
export function buildSuggestionOptions(apiSuggestions: string[]): SuggestionOption[] {
  const options: SuggestionOption[] = [];
  const seen = new Set<string>();
  const usedTags = new Set<string>();
  const api = Array.isArray(apiSuggestions) ? apiSuggestions : [];

  for (const raw of api) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim();
    if (!text) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = classify(text);
    usedTags.add(tag);
    options.push({ text, tag, fromApi: true });
    if (options.length >= 4) break;
  }

  // 先用尚未出现过的类别示例补足，保证建议覆盖食前/食后/知识/地区等不同场景
  for (const preferNewTag of [true, false]) {
    for (const example of CATEGORY_EXAMPLES) {
      if (options.length >= 6) break;
      if (preferNewTag && usedTags.has(example.tag)) continue;
      const key = normalize(example.text);
      if (seen.has(key)) continue;
      seen.add(key);
      usedTags.add(example.tag);
      options.push(example);
    }
  }

  return options.slice(0, 6);
}

export const SUGGESTION_FALLBACK = CATEGORY_EXAMPLES;
