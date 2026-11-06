import { FileText, Globe, Type, type LucideProps } from 'lucide-react';

import type { SourceView } from './types';

const ICONS = { text: Type, pdf: FileText, url: Globe } as const;

export function SourceKindIcon({ kind, ...props }: { kind: SourceView['kind'] } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden {...props} />;
}
