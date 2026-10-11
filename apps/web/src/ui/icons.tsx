import type { ReactNode } from 'react';

interface Props {
  /** What the icon says, for screen readers. Leave out when text beside it says the same. */
  label?: string;
}

function Icon({ label, children }: Props & { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  );
}

export const TickIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CrossIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const UpIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const DownIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const PencilIcon = (props: Props) => (
  <Icon {...props}>
    <path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3" />
  </Icon>
);
