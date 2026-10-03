import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button.tsx';

interface PaginationProps {
  page: number;
  pageCount: number;
  /** The link to a page (e.g. the current URL with `?page=n`). */
  hrefFor: (page: number) => string;
}

/** Previous / "Page x of y" / Next. Renders nothing for a single page. */
export function Pagination({ page, pageCount, hrefFor }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
      <PageLink to={page > 1 ? hrefFor(page - 1) : null} label="Previous page">
        <ChevronLeftIcon aria-hidden="true" />
        Previous
      </PageLink>
      <span className="text-sm text-muted-foreground" aria-current="page">
        Page {page} of {pageCount}
      </span>
      <PageLink to={page < pageCount ? hrefFor(page + 1) : null} label="Next page">
        Next
        <ChevronRightIcon aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: ReactNode;
}) {
  if (!to) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
