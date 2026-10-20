import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  ChatAnswer,
  ChatContext,
  ChatRequest,
  FoodSummary,
  ParasiteSummary,
  PreparationTag,
  RegionSummary,
} from '@shared/types';
import { api, ApiError } from '@/lib/api';
import { normalizeRegionCode, useAtlas } from '@/lib/atlas';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useAsync } from '@/lib/useAsync';
import { cn } from '@/lib/utils';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { AnswerCard } from '@/components/chat/AnswerCard';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ErrorMessage, TypingMessage, UserMessage } from '@/components/chat/ChatMessage';
import { ContextPanel, ContextPanelMobile, type ContextPanelHandlers } from '@/components/chat/ContextPanel';
import { WelcomePanel } from '@/components/chat/WelcomePanel';
import { buildSuggestionOptions } from '@/components/chat/suggestions';
import { useMediaQuery } from '@/components/chat/useMediaQuery';
import {
  buildHistory,
  clearSession,
  EMPTY_CONTEXT,
  loadSession,
  makeId,
  mergeContext,
  normalizeAnswer,
  normalizeContext,
  saveSession,
  type ChatItem,
  type ErrorChatItem,
  type HistoryTurn,
  type UserChatItem,
} from '@/components/chat/session';

const MAX_MESSAGE_LENGTH = 1000;

/* ------------------------------------------------------------------ */
/* URL 预填                                                             */
/* ------------------------------------------------------------------ */

interface PrefillLookups {
  regionByCode: ReadonlyMap<string, RegionSummary>;
  foodById: ReadonlyMap<string, FoodSummary>;
  parasiteById: ReadonlyMap<string, ParasiteSummary>;
  preparationIds: ReadonlySet<string>;
}

function splitParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 读取 ?province=&food=&prep=&month=&parasite=&q= 初始化上下文与待发送问题 */
function parsePrefill(params: URLSearchParams, lookups: PrefillLookups): { context: Partial<ChatContext>; q: string } {
  const provinceCodes = Array.from(
    new Set(
      splitParam(params.get('province'))
        .map((value) => normalizeRegionCode(value))
        .filter((code): code is string => Boolean(code) && lookups.regionByCode.has(code as string)),
    ),
  );
  const months = Array.from(
    new Set(
      splitParam(params.get('month'))
        .map((value) => Number.parseInt(value, 10))
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  );
  const foodIds = Array.from(new Set(splitParam(params.get('food')).filter((id) => lookups.foodById.has(id))));
  const preparationTags = Array.from(
    new Set(
      splitParam(params.get('prep')).filter((tag): tag is PreparationTag => lookups.preparationIds.has(tag)),
    ),
  );
  const parasiteIds = Array.from(new Set(splitParam(params.get('parasite')).filter((id) => lookups.parasiteById.has(id))));
  const q = (params.get('q') ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);

  const context: Partial<ChatContext> = {};
  if (provinceCodes.length > 0) context.provinceCodes = provinceCodes;
  if (months.length > 0) context.months = months;
  if (foodIds.length > 0) context.foodIds = foodIds;
  if (preparationTags.length > 0) context.preparationTags = preparationTags;
  if (parasiteIds.length > 0) context.parasiteIds = parasiteIds;
  return { context, q };
}

/* ------------------------------------------------------------------ */
/* 消息工具                                                             */
/* ------------------------------------------------------------------ */

function markUserFailed(items: ChatItem[], userId: string | undefined, failed: boolean): ChatItem[] {
  if (!userId) return items;
  return items.map((item) => (item.role === 'user' && item.id === userId ? { ...item, failed } : item));
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return '无法连接到知识服务。请稍后重试；也可以先使用地图与条件查询直接浏览资料。';
    if (error.status === 429) return '请求过于频繁，请稍等片刻再试。';
    if (error.status === 501) return '对话服务仍在构建中，暂时不可用。你仍可以使用地图、条件查询与知识页面浏览资料。';
    if (error.status === 400) return error.message || '这条消息无法处理，请调整后重试。';
    return error.message || `知识服务暂时不可用（${error.status}）。`;
  }
  if (error instanceof Error && error.message) return error.message;
  return '请求失败，请稍后重试。';
}

/* ------------------------------------------------------------------ */
/* 页面                                                                 */
/* ------------------------------------------------------------------ */

export function ChatPage() {
  useDocumentTitle(
    '对话提问',
    '用自然语言描述地区、时间、食物与做法，由知识库检索生成有来源、有边界的中文回答。',
  );

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { regionByCode, foodById, parasiteById, taxonomy } = useAtlas();
  // 真正桌面（≥1280）才把上下文面板放到右栏；1024–1279 保持单栏以获得足够阅读宽度
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prefill] = useState(() =>
    parsePrefill(searchParams, {
      regionByCode,
      foodById,
      parasiteById,
      preparationIds: new Set(taxonomy.preparations.map((preparation) => preparation.id)),
    }),
  );
  const [initialSession] = useState(() => loadSession());
  const [items, setItems] = useState<ChatItem[]>(() => initialSession?.items ?? []);
  const [context, setContext] = useState<ChatContext>(() =>
    mergeContext(initialSession?.context ?? EMPTY_CONTEXT, prefill.context),
  );
  const [restored] = useState(() => (initialSession?.items.length ?? 0) > 0);
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [sessionSuggestions, setSessionSuggestions] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const contextRef = useRef(context);
  contextRef.current = context;
  const sendingRef = useRef(false);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const lastItemRef = useRef<HTMLLIElement>(null);
  /** 用户主动发送后跟随回答滚动；若用户在等待期间向上滚动离开，则不再强行滚动 */
  const followAnswerRef = useRef(false);
  const sendScrollYRef = useRef(0);
  const countRef = useRef(items.length);
  const autoSentRef = useRef(false);
  const wasSendingRef = useRef(false);

  const {
    data: suggestionData,
    error: suggestionError,
    loading: suggestionLoading,
    reload: reloadSuggestions,
  } = useAsync(() => api.chatSuggestions(), []);

  const suggestionOptions = useMemo(
    () => buildSuggestionOptions(suggestionData?.suggestions ?? []),
    [suggestionData],
  );

  /* ---------------------------- 滚动 ---------------------------- */

  const scrollToBottom = useCallback((smooth = true) => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = smooth && !reduce ? 'smooth' : 'instant';
    const contentEnd = contentEndRef.current;
    const composer = composerWrapRef.current;
    if (contentEnd) {
      // 以“最后一条内容 + 输入区”为滚动目标，避免滚到页脚下方
      const composerHeight = composer ? composer.offsetHeight : 0;
      const endBottomDoc = contentEnd.getBoundingClientRect().bottom + window.scrollY;
      const visibleBottom = window.innerHeight - composerHeight - 32;
      window.scrollTo({ top: Math.max(0, Math.round(endBottomDoc - visibleBottom)), behavior });
      return;
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }, []);

  /** 判断当前滚动位置是否接近对话底部（用于“回到底部”按钮与跟随策略） */
  const measureNearBottom = useCallback(() => {
    if (typeof window === 'undefined') return;
    const contentEnd = contentEndRef.current;
    let near: boolean;
    if (contentEnd) {
      const endBottomDoc = contentEnd.getBoundingClientRect().bottom + window.scrollY;
      near = window.innerHeight + window.scrollY >= endBottomDoc - 240;
    } else {
      near = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 280;
    }
    // 等待回答期间用户主动向上滚动较远：尊重阅读位置，不再强制滚动
    if (followAnswerRef.current && window.scrollY < sendScrollYRef.current - 160) {
      followAnswerRef.current = false;
    }
    setAtBottom((prev) => (prev === near ? prev : near));
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measureNearBottom();
      });
    };
    measureNearBottom();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [measureNearBottom]);

  // 内容或布局变化后重新评估（例如欢迎区切换为对话、错误气泡出现、移动端折叠面板开合）
  useEffect(() => {
    const frame = requestAnimationFrame(measureNearBottom);
    return () => cancelAnimationFrame(frame);
  }, [items, sending, isDesktop, measureNearBottom]);

  // 恢复会话后定位到最新一条消息
  useEffect(() => {
    if (!restored) return;
    const frame = requestAnimationFrame(() => {
      followAnswerRef.current = true;
      scrollToBottom(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [restored, scrollToBottom]);

  // 新消息到达时：用户主动发送的对话自动跟随到底部；
  // 超长回答则把“问题 + 回答开头”带到视口上方，避免一屏被跳过。
  useEffect(() => {
    if (items.length <= countRef.current || !followAnswerRef.current) {
      countRef.current = items.length;
      return;
    }
    const last = items[items.length - 1];
    if (last?.role === 'assistant' && lastItemRef.current) {
      const element = lastItemRef.current;
      const isLongAnswer = element.getBoundingClientRect().height > window.innerHeight * 0.8;
      if (isLongAnswer) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const anchor = (element.previousElementSibling as HTMLElement | null) ?? element;
        const top = anchor.getBoundingClientRect().top + window.scrollY - 88;
        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'instant' : 'smooth' });
        followAnswerRef.current = false;
        countRef.current = items.length;
        return;
      }
    }
    scrollToBottom(last?.role === 'assistant');
    // 用户消息出现后继续等待回答，收到回答/错误后再结束跟随
    if (last?.role !== 'user') followAnswerRef.current = false;
    countRef.current = items.length;
  }, [items, scrollToBottom]);

  /* ---------------------------- 会话持久化 ---------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return;
    saveSession({ items, context });
  }, [items, context]);

  /* ---------------------------- 发送 ---------------------------- */

  const submit = useCallback(
    async (
      rawText: string,
      options: { historyOverride?: HistoryTurn[]; retryErrorId?: string; retryUserId?: string } = {},
    ) => {
      const text = rawText.trim();
      if (!text || sendingRef.current || text.length > MAX_MESSAGE_LENGTH) return;

      sendingRef.current = true;
      setSending(true);
      setAnnouncement('正在检索知识库…');
      // 用户主动发送：记录当前位置并跟随最新消息
      sendScrollYRef.current = window.scrollY;
      followAnswerRef.current = true;

      const history = options.historyOverride ?? buildHistory(itemsRef.current);
      let userId = options.retryUserId;
      if (!options.historyOverride) {
        userId = makeId();
        const userItem: UserChatItem = { id: userId, role: 'user', content: text };
        setItems((prev) => [...prev, userItem]);
      }
      if (options.retryErrorId) {
        const errorId = options.retryErrorId;
        setItems((prev) => prev.filter((item) => item.id !== errorId));
      }

      const body: ChatRequest = {
        message: text,
        ...(history.length > 0 ? { history } : {}),
        context: contextRef.current,
      };

      try {
        const response = await api.chat(body);
        const answer = normalizeAnswer(response?.answer);
        if (!answer) {
          throw new ApiError('知识服务返回的数据格式无法解析，请稍后再试。', 0, 'BAD_RESPONSE');
        }
        setItems((prev) => {
          const cleaned = markUserFailed(prev, userId, false);
          return [...cleaned, { id: makeId(), role: 'assistant', answer, at: Date.now() }];
        });
        const nextContext =
          response && response.context ? normalizeContext(response.context) : normalizeContext(answer.context);
        setContext(nextContext);
        setSessionSuggestions(
          Array.isArray(response?.suggestions)
            ? response.suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string').slice(0, 6)
            : [],
        );
        setAnnouncement(`回答已生成：${answer.title}`);
      } catch (error) {
        const message = describeError(error);
        setItems((prev) => {
          const marked = markUserFailed(prev, userId, true);
          const errorItem: ErrorChatItem = {
            id: makeId(),
            role: 'error',
            message,
            retryText: text,
            history,
            ...(userId ? { retryUserId: userId } : {}),
            at: Date.now(),
          };
          return [...marked, errorItem];
        });
        setAnnouncement('生成失败，可重试');
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [],
  );

  const handleAsk = useCallback(
    (text: string) => {
      if (sendingRef.current) return;
      void submit(text);
    },
    [submit],
  );

  const handleRetry = useCallback(
    (item: ErrorChatItem) => {
      if (sendingRef.current) return;
      void submit(item.retryText, {
        historyOverride: item.history,
        retryErrorId: item.id,
        retryUserId: item.retryUserId,
      });
    },
    [submit],
  );

  /* ---------------------------- URL 预填自动提问 ---------------------------- */

  useEffect(() => {
    if (autoSentRef.current) return;
    autoSentRef.current = true;
    const question = prefill.q;
    if (!question) return;
    // 清除 URL 参数，避免刷新页面时因 q 仍存在而重复发送
    navigate('/chat', { replace: true });
    void submit(question);
  }, [navigate, prefill.q, submit]);

  /* ---------------------------- 桌面端自动聚焦 ---------------------------- */

  useEffect(() => {
    if (!isDesktop || prefill.q) return;
    const element = textareaRef.current;
    if (element) element.focus({ preventScroll: true });
  }, [isDesktop, prefill.q]);

  // 回答结束后保持输入焦点（桌面端）；不打断移动端键盘
  useEffect(() => {
    if (wasSendingRef.current && !sending && isDesktop) {
      textareaRef.current?.focus({ preventScroll: true });
    }
    wasSendingRef.current = sending;
  }, [sending, isDesktop]);

  /* ---------------------------- 上下文操作 ---------------------------- */

  const handlers = useMemo<ContextPanelHandlers>(
    () => ({
      onRemoveProvince: (code: string) =>
        setContext((prev) => ({ ...prev, provinceCodes: prev.provinceCodes.filter((item) => item !== code) })),
      onRemoveMonth: (month: number) =>
        setContext((prev) => ({ ...prev, months: prev.months.filter((item) => item !== month) })),
      onRemoveFood: (id: string) => setContext((prev) => ({ ...prev, foodIds: prev.foodIds.filter((item) => item !== id) })),
      onRemovePreparation: (tag: PreparationTag) =>
        setContext((prev) => ({
          ...prev,
          preparationTags: prev.preparationTags.filter((item) => item !== tag),
        })),
      onRemoveParasite: (id: string) =>
        setContext((prev) => ({ ...prev, parasiteIds: prev.parasiteIds.filter((item) => item !== id) })),
      onRemoveSymptom: (symptom: string) =>
        setContext((prev) => ({ ...prev, symptoms: prev.symptoms.filter((item) => item !== symptom) })),
      onClearExposure: () => setContext((prev) => ({ ...prev, exposure: 'unknown' })),
      onClearTime: () => setContext((prev) => ({ ...prev, timeExpression: undefined })),
      onClearContext: () => setContext({ ...EMPTY_CONTEXT }),
      onClearConversation: () => {
        setItems([]);
        setContext({ ...EMPTY_CONTEXT });
        setSessionSuggestions([]);
        setAnnouncement('');
        clearSession();
        countRef.current = 0;
        followAnswerRef.current = false;
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (isDesktop) textareaRef.current?.focus();
      },
    }),
    [isDesktop],
  );

  /* ---------------------------- 追问建议 ---------------------------- */

  const lastAnswer = useMemo<ChatAnswer | null>(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.role === 'assistant') return item.answer;
    }
    return null;
  }, [items]);

  const quickPrompts = useMemo(() => {
    if (!lastAnswer) return [];
    const own = Array.isArray(lastAnswer.followUps) ? lastAnswer.followUps : [];
    if (own.length > 0) return [];
    return sessionSuggestions.slice(0, 3);
  }, [lastAnswer, sessionSuggestions]);

  const showJump = items.length > 0 && !atBottom;

  const composer = (
    <ChatComposer
      onSend={handleAsk}
      sending={sending}
      textareaRef={textareaRef}
      quickPrompts={quickPrompts}
      onQuickPrompt={handleAsk}
    />
  );

  return (
    <div data-testid="chat-page" className="field-paper">
      <header className="border-b border-ink/25">
        <div className="mx-auto w-full max-w-shell px-5 pt-4 md:px-8">
          <Breadcrumbs items={[{ label: '首页', to: '/' }, { label: '对话提问' }]} />
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-3.5">
            <h1 className="font-serif text-[1.55rem] font-semibold leading-tight text-ink md:text-[1.8rem]">对话提问</h1>
            <p className="font-kai text-[11.5px] leading-5 tracking-[0.02em] text-ink-muted">
              说明地区、时间、食物与做法，得到针对当前情况的回答。
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-shell px-5 pb-10 md:px-8">
        {!isDesktop && (
          <div className="mx-auto mt-3 w-full max-w-[820px]">
            <ContextPanelMobile context={context} itemsCount={items.length} handlers={handlers} />
          </div>
        )}

        <div className="mt-4 grid gap-8 xl:mt-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-10">
          <div className="min-w-0">
            <div className="mx-auto w-full max-w-[820px]">
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {announcement}
              </div>

              {items.length === 0 ? (
                <WelcomePanel
                  suggestions={suggestionOptions}
                  loading={suggestionLoading}
                  error={suggestionError ? suggestionError.message : null}
                  onPick={handleAsk}
                  onRetry={reloadSuggestions}
                  disabled={sending}
                  composer={composer}
                />
              ) : (
                <>
                  {restored && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-y border-ink/20 bg-paper-deep/25 px-3 py-1.5 font-kai text-[10.5px] tracking-[0.03em] text-ink-muted">
                      <span>已恢复上次对话</span>
                      <button
                        type="button"
                        onClick={handlers.onClearConversation}
                        className="border-b border-line-strong/50 text-[10.5px] text-terracotta-700 transition hover:border-terracotta-600"
                      >
                        新对话
                      </button>
                    </div>
                  )}

                  <ol className="space-y-8 md:space-y-10" aria-label="对话记录">
                    {items.map((item, index) => {
                      const isLast = index === items.length - 1;
                      if (item.role === 'user') {
                        return <UserMessage key={item.id} item={item} liRef={isLast ? lastItemRef : undefined} />;
                      }
                      if (item.role === 'assistant') {
                        return (
                          <li key={item.id} ref={isLast ? lastItemRef : undefined}>
                            <AnswerCard answer={item.answer} onAsk={handleAsk} disabled={sending} />
                          </li>
                        );
                      }
                      return (
                        <ErrorMessage
                          key={item.id}
                          item={item}
                          onRetry={handleRetry}
                          disabled={sending}
                          liRef={isLast ? lastItemRef : undefined}
                        />
                      );
                    })}
                    {sending && <TypingMessage />}
                  </ol>

                  <div ref={contentEndRef} aria-hidden />

                  <div
                    ref={composerWrapRef}
                    className={cn(
                      'sticky bottom-0 z-30 -mx-1 mt-8 px-1 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-4',
                      'bg-gradient-to-t from-paper via-paper/95 to-paper/0',
                    )}
                  >
                    {showJump && (
                      <button
                        type="button"
                        onClick={() => {
                          followAnswerRef.current = false;
                          scrollToBottom(true);
                        }}
                        aria-label="回到对话底部"
                        className="absolute -top-9 right-1 border border-ink/40 bg-paper-light px-2.5 py-1 font-kai text-[10.5px] text-ink-soft shadow-[3px_3px_0_rgba(37,54,45,0.07)] transition hover:border-terracotta-600 hover:text-terracotta-700"
                      >
                        回到底部
                      </button>
                    )}
                    <div aria-live="polite" className="sr-only">
                      {sending ? '正在检索知识库' : ''}
                    </div>
                    {composer}
                  </div>
                </>
              )}
            </div>
          </div>

          {isDesktop && (
            <aside className="min-w-0">
              <div className="xl:sticky xl:top-[102px]">
                <ContextPanel context={context} itemsCount={items.length} handlers={handlers} />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
