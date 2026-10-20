import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageLoading } from '@/components/ui/States';

/**
 * 旧 /map 链接兼容：地图已并入 /explore 探索工作台。
 * 保留全部 query 参数（province/mode/food/parasite/month/prep/q），使用 replace 避免历史记录堆积。
 */
export function MapRedirectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const query = searchParams.toString();
    navigate(query ? `/explore?${query}` : '/explore', { replace: true });
  }, [navigate, searchParams]);

  return <PageLoading label="正在打开探索工作台" />;
}
