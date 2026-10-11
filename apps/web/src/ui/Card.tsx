import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLElement> {
  /** Names the card for screen readers and shows as its heading. */
  title?: string;
  children: ReactNode;
}

/** A surface with a border. With a title it is a labelled region. */
export function Card({ title, className, children, ...rest }: Props) {
  return (
    <section
      {...(title ? { 'aria-label': title } : {})}
      {...rest}
      className={['card', className].filter(Boolean).join(' ')}
    >
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
