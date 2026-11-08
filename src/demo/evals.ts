import { z } from 'zod';

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

const keyFactSchema = z.object({
  // What the answer must say, for the report.
  fact: z.string().min(1),
  // The answer contains the fact if it contains any of these (case-insensitive).
  anyOf: z.array(z.string().min(1)).min(1),
});

/**
 * How the eval runner gets a Source into its Notebook: a text file or PDF
 * (paths relative to `demo/`), a web page fetched like a URL Source, or a page
 * only the Agent adds during its run, recognised by its host.
 */
const sourceLoadSchema = z.union([
  z.strictObject({ file: z.string().min(1) }),
  z.strictObject({ pdf: z.string().min(1) }),
  z.strictObject({ url: z.url({ protocol: /^https?$/ }) }),
  z.strictObject({ addedByAgent: z.strictObject({ host: z.string().min(1) }) }),
]);

export type SourceLoad = z.infer<typeof sourceLoadSchema>;

const evalSourceSchema = z.object({
  key: slugSchema,
  title: z.string().min(1),
  load: sourceLoadSchema,
});

const evalQuestionSchema = z.object({
  id: slugSchema,
  // The storyboard scene that asks it in the video (`demo/storyboard.md`), or null.
  scene: z
    .string()
    .regex(/^P\d+$/)
    .nullable(),
  mode: z.enum(['chat', 'agent']),
  question: z.string().min(1),
  enabledSources: z.array(slugSchema).min(1),
  // Sources the Citations must land in; empty means the Sources don't cover the question.
  expectedSources: z.array(slugSchema),
  keyFacts: z.array(keyFactSchema),
});

export const evalSetSchema = z
  .object({
    sources: z.array(evalSourceSchema).min(1),
    questions: z.array(evalQuestionSchema).min(1),
  })
  .superRefine((set, ctx) => {
    const known = new Set(set.sources.map((source) => source.key));
    const agentOnly = new Set(
      set.sources.filter((source) => 'addedByAgent' in source.load).map((source) => source.key),
    );
    const seen = new Set<string>();
    set.questions.forEach((question, index) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: 'custom', path: ['questions', index], message });

      if (seen.has(question.id)) issue(`duplicate question id ${question.id}`);
      seen.add(question.id);

      for (const key of [...question.enabledSources, ...question.expectedSources]) {
        if (!known.has(key)) issue(`unknown Source ${key}`);
      }
      for (const key of question.enabledSources) {
        if (agentOnly.has(key))
          issue(`Source ${key} is only added by the Agent, it can't be enabled`);
      }
      // The Agent may add Sources during its run; Chat can only cite enabled ones.
      if (question.mode === 'chat') {
        for (const key of question.expectedSources) {
          if (!question.enabledSources.includes(key))
            issue(`expected Source ${key} is not enabled`);
        }
      }
      if (question.expectedSources.length === 0 && question.keyFacts.length > 0) {
        issue('a question its Sources have not covered expects no key facts');
      }
    });
  });

export type EvalSet = z.infer<typeof evalSetSchema>;
export type EvalSource = z.infer<typeof evalSourceSchema>;
export type EvalQuestion = z.infer<typeof evalQuestionSchema>;

/** Parses `demo/evals.json`; throws a readable error listing every problem. */
export function parseEvalSet(value: unknown): EvalSet {
  const result = evalSetSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid eval set:\n${z.prettifyError(result.error)}`);
  return result.data;
}
