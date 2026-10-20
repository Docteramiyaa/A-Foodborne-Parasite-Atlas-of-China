import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SearchDialog } from './SearchDialog';

interface SearchContextValue {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  initialQuery: string;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');

  const openSearch = useCallback(() => {
    setInitialQuery('');
    setOpen(true);
  }, []);
  const closeSearch = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ open, openSearch, closeSearch, initialQuery }), [open, openSearch, closeSearch, initialQuery]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      <SearchDialog open={open} onClose={closeSearch} initialQuery={initialQuery} />
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch 必须在 SearchProvider 内使用');
  return ctx;
}
