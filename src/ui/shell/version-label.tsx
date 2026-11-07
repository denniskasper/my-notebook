import type { BuildInfo } from '@/platform/build';
import { strings } from '@/ui/strings';

import { versionLabel } from './version';

/** The running build at the foot of the sidebar, so anyone can tell which release is live. */
export function VersionLabel({ build }: { build: BuildInfo }) {
  const { text, href } = versionLabel(build);
  return (
    <div className="shrink-0 border-t border-line px-3.5 py-1.5 text-[11px] leading-none text-faint tabular-nums">
      {href === null ? (
        <span>{text}</span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={strings.sidebar.versionLink}
          className="rounded-[3px] underline-offset-2 hover:text-muted hover:underline focus-visible:text-text focus-visible:underline focus-visible:outline-none"
        >
          {text}
        </a>
      )}
    </div>
  );
}
