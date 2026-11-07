import { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const MQ = '(max-width: 768px)';

export function useIsMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ).matches);
  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const h = () => setM(mql.matches);
    mql.addEventListener('change', h);
    return () => mql.removeEventListener('change', h);
  }, []);
  return m;
}

interface Props {
  title: string;
  children: ComponentChildren;
  className?: string;
  defaultOpen?: boolean;
  testId?: string;
}

/** On mobile: collapsed section with a summary header. On desktop: plain wrapper. */
export function Collapsible({ title, children, className = '', defaultOpen = false, testId }: Props) {
  const mobile = useIsMobile();
  if (!mobile) return <div className={className} data-testid={testId}>{children}</div>;
  return (
    <details className={`m-collapse ${className}`} open={defaultOpen} data-testid={testId}>
      <summary className="m-collapse-summary">{title}</summary>
      <div className="m-collapse-body">{children}</div>
    </details>
  );
}
