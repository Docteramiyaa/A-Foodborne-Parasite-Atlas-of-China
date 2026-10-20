import type { ChatAnswer } from '@shared/types';
import { motion, useReducedMotion } from 'framer-motion';
import { uniq } from '@/lib/utils';
import { AnswerSections } from './AnswerSections';
import { CitationList } from './CitationList';
import { ClarifyOptions } from './ClarifyOptions';
import { FollowUps } from './FollowUps';
import { MapJumpButton } from './MapJumpButton';
import { RelatedEntities } from './RelatedEntities';
import { VerdictBanner } from './VerdictBanner';

const CARE_INTENTS = new Set(['post-exposure', 'treatment', 'symptoms']);

/**
 * 助手回答：先给当前情况的直接回答，再给原因/后果与做法，来源收在最后。
 * 医疗边界只在回答确实涉及食后、症状或就医时出现一次。
 */
export function AnswerCard({
  answer,
  onAsk,
  disabled = false,
}: {
  answer: ChatAnswer;
  onAsk: (text: string) => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const lead = typeof answer.lead === 'string' ? answer.lead.trim() : '';
  const verdict = answer.verdict ?? null;
  const sections = Array.isArray(answer.sections) ? answer.sections : [];
  const clarify = answer.clarify ?? null;
  const citations = Array.isArray(answer.citations) ? answer.citations : [];
  const followUps = Array.isArray(answer.followUps) ? answer.followUps : [];

  const related = answer.related;
  const parasiteIds = uniq([...(related?.parasiteIds ?? []), ...(verdict?.parasiteIds ?? [])]);
  const foodIds = uniq([...(related?.foodIds ?? []), ...(answer.mapQuery?.foodIds ?? [])]);
  const regionCodes = uniq([...(related?.regionCodes ?? []), ...(answer.mapQuery?.provinceCodes ?? [])]);

  const careIntent = CARE_INTENTS.has(answer.intent);
  const hasCareSection = sections.some((section) => section.kind === 'post-exposure' || section.kind === 'treatment');
  // 回答内容里已经带有医疗边界时不再叠加（最多一条）
  const contentText = [
    lead,
    ...sections.flatMap((section) => [
      ...(Array.isArray(section.paragraphs) ? section.paragraphs : []),
      ...(Array.isArray(section.bullets) ? section.bullets : []),
    ]),
    clarify?.question ?? '',
  ].join(' ');
  const hasBoundaryInContent = /不能替代|不构成.{0,8}(诊断|治疗)|遵医嘱|及时就医|及时就诊|及时前往/.test(contentText);
  const needsCareBoundary = (careIntent || hasCareSection) && !hasBoundaryInContent;

  return (
    <motion.article
      data-testid="chat-answer"
      aria-label="知识库回答"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-3xl border border-line bg-white p-5 shadow-card md:p-7"
    >
      <div className="relative">
        {answer.title && (
          <h2 className="font-serif text-[clamp(1.3rem,2.1vw,1.6rem)] font-semibold leading-snug tracking-tight text-ink">
            {answer.title}
          </h2>
        )}

        {lead && (
          <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.9] text-ink-soft">{lead}</p>
        )}

        {verdict && (
          <div className="mt-4">
            <VerdictBanner verdict={verdict} />
          </div>
        )}

        <AnswerSections sections={sections} />

        {clarify && (
          <div className="mt-5">
            <ClarifyOptions clarify={clarify} onPick={onAsk} disabled={disabled} />
          </div>
        )}

        <div className="mt-5">
          <RelatedEntities parasiteIds={parasiteIds} foodIds={foodIds} regionCodes={regionCodes} />
          <MapJumpButton query={answer.mapQuery} />
        </div>

        {needsCareBoundary && (
          <p className="mt-4 border-t border-ink/20 pt-2 font-sans text-[12px] leading-5 tracking-[0.02em] text-ink-muted">
            以上内容不能替代医生的诊断或治疗建议；如症状持续或加重，请及时就医。
          </p>
        )}

        <CitationList citations={citations} className="mt-4" />
        <FollowUps followUps={followUps} onPick={onAsk} disabled={disabled} />
      </div>
    </motion.article>
  );
}
