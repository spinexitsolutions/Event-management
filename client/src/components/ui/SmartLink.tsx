import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Internal paths use the router; external links open safely in a new tab. */
export function SmartLink({ href, children, newTab, ...rest }: { href: string; children: ReactNode; newTab?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (!href) return <span {...(rest as object)}>{children}</span>;
  const external = /^(https?:|mailto:|tel:)/i.test(href);
  if (external || href.startsWith('#'))
    return (
      <a href={href} {...(external && (newTab ?? /^https?:/i.test(href)) ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
        {children}
      </a>
    );
  return (
    <Link to={href} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})} {...rest}>
      {children}
    </Link>
  );
}
