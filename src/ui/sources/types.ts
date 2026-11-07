import type { ErrorCode } from '@/ui/strings';

/** What the UI shows of a Source; pages map module rows onto it. */
export type SourceView = {
  id: string;
  kind: 'text' | 'pdf' | 'url';
  title: string;
  status: 'processing' | 'ready' | 'failed';
  errorCode: ErrorCode | null;
  enabled: boolean;
  tokenCount: number | null;
  /** Where a web page Source was fetched from; null for other kinds. */
  url: string | null;
};

export type PassageView = { ordinal: number; text: string; page: number | null };

/** Values the Source error messages fill in. */
export type SourceLimits = {
  tokenCap: number;
  titleMax: number;
  textMax: number;
  pdfMaxBytes: number;
  urlMax: number;
};
