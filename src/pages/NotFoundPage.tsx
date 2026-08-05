import { Link } from 'react-router';
import { Card } from '@/ui';

export function NotFoundPage() {
  return (
    <Card className="max-w-xl">
      <p className="text-sm text-ink-muted">We couldn't find that page. It may have moved, or the link may be wrong.</p>
      <Link
        to="/"
        className="mt-4 inline-flex h-10 items-center rounded-control bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        Go to home
      </Link>
    </Card>
  );
}
