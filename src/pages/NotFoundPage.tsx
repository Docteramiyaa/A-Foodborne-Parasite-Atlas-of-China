import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { PageHeader } from '@/components/ui/SectionHeading';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  useDocumentTitle('页面不存在');
  return (
    <div className="field-paper">
      <PageHeader eyebrow="页面不存在" title="找不到这个页面。" lead="链接可能已经失效或输入有误。" />
      <div className="mx-auto max-w-shell px-5 py-16 md:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 border border-line bg-paper-light px-5 py-2.5 font-sans text-sm tracking-[0.04em] text-ink transition hover:border-ink hover:bg-ink hover:text-paper-light"
        >
          <ArrowLeft size={15} /> 返回首页
        </Link>
      </div>
    </div>
  );
}
