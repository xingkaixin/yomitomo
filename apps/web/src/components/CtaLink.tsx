import type { ReactNode } from 'react';

type CtaLinkProps = {
  children: ReactNode;
  href: string;
};

export function CtaLink({ children, href }: CtaLinkProps) {
  return (
    <a
      className="inline-block cursor-pointer border border-accent bg-accent px-[32px] py-[13px] text-[0.9rem] font-medium tracking-normal text-accent-fg no-underline transition-opacity duration-150 hover:opacity-[0.82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      href={href}
    >
      {children}
    </a>
  );
}
