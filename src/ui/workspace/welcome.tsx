import { Plus } from 'lucide-react';

import { SubmitButton } from '@/ui/components/submit-button';
import { strings } from '@/ui/strings';

/** The start page centre: what this is, and one way in. */
export function Welcome({ createNotebook }: { createNotebook: () => Promise<void> }) {
  const { welcome } = strings;
  return (
    <div className="flex scroll-area flex-1 px-6">
      <section className="m-auto w-full max-w-[560px] py-16">
        <h1 className="font-read text-[30px] leading-[1.15] font-normal tracking-[-0.015em]">
          {welcome.title}
        </h1>
        <p className="mt-4 font-read text-[17px] leading-[1.6] text-[#c4c9cf]">{welcome.body}</p>
        <form action={createNotebook} className="mt-8">
          <SubmitButton variant="primary" size="lg">
            <Plus size={15} aria-hidden />
            {welcome.cta}
          </SubmitButton>
        </form>
        <p className="mt-4 text-[12px] text-faint">{welcome.hint}</p>
      </section>
    </div>
  );
}
