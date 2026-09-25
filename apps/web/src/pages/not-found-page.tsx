import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <EmptyState
      className="py-28"
      icon={<Compass className="size-5" />}
      title="Page not found"
      description="The page you’re looking for doesn’t exist."
      action={
        <Link to="/">
          <Button variant="primary">Browse problems</Button>
        </Link>
      }
    />
  );
}
