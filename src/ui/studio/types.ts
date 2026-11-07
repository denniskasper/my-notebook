import type { CitationView } from '@/ui/chat';
import type { ErrorCode } from '@/ui/strings';

/** What the UI shows of a Briefing; pages map module rows onto it. */
export type BriefingView = {
  id: string;
  status: 'processing' | 'complete' | 'failed';
  errorCode: ErrorCode | null;
  content: { text: string; citations: CitationView[] }[];
  createdAt: Date;
};

/** A refusal carries `retryAt` (ISO) when the Budget guard will lift it on its own. */
export type StudioActionResult =
  { ok: true } | { ok: false; error: ErrorCode; retryAt?: string } | null;

export type GenerateBriefing = (
  previous: StudioActionResult,
  formData: FormData,
) => Promise<StudioActionResult>;
