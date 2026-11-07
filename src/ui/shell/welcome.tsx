import { Plus } from 'lucide-react';

import { SubmitButton } from '@/ui/components/submit-button';
import { strings } from '@/ui/strings';

/** The start page centre: what this is, and one way in. */
export function Welcome({
  createNotebook,
  error = null,
}: {
  createNotebook: () => Promise<void>;
  /** Why the last attempt to start failed, as German text. */
  error?: string | null;
}) {
  const { welcome } = strings;
  return (
    <div className="flex scroll-area flex-1 px-6">
      <section className="m-auto w-full max-w-[560px] py-16">
        <h1 className="font-read text-[30px] leading-[1.15] font-normal tracking-[-0.015em]">
          {welcome.title}
        </h1>
        <p className="mt-4 font-read text-[17px] leading-[1.6] text-soft">{welcome.body}</p>
        <form action={createNotebook} className="mt-8">
          <SubmitButton variant="primary" size="lg">
            <Plus size={15} aria-hidden />
            {welcome.cta}
          </SubmitButton>
        </form>
        {error && (
          <p role="alert" className="mt-4 max-w-[52ch] text-[12.5px] leading-snug text-danger">
            {error}
          </p>
        )}
        <p className="mt-4 text-[12px] text-faint">{welcome.hint}</p>
      </section>
    </div>
  );
}
