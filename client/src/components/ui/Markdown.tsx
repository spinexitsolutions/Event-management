import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/cn';
import { SmartLink } from './SmartLink';

/** Renders CMS Markdown safely (no raw HTML). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn('prose-lux', className)}>
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children: c }) => <SmartLink href={href ?? ''}>{c}</SmartLink>,
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
