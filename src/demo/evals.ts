import { z } from 'zod';

const sourceKeySchema = z.string().regex(/^[a-z0-9-]+$/);

const keyFactSchema = z.object({
  // What the answer must say, for the report.
  fact: z.string().min(1),
  // The answer contains the fact if it contains any of these (case-insensitive).
  anyOf: z.array(z.string().min(1)).min(1),
});

const evalQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  // The storyboard scene that asks it in the video (`demo/storyboard.md`), or null.
  scene: z.string().nullable(),
  mode: z.enum(['chat', 'agent']),
  question: z.string().min(1),
  enabledSources: z.array(sourceKeySchema).min(1),
  // Sources the Citations must land in; empty means the Sources don't cover the question.
  expectedSources: z.array(sourceKeySchema),
  keyFacts: z.array(keyFactSchema),
});

export const evalSetSchema = z
  .object({
    sources: z.array(z.object({ key: sourceKeySchema, title: z.string().min(1) })).min(1),
    questions: z.array(evalQuestionSchema).min(1),
  })
  .superRefine((set, ctx) => {
    const known = new Set(set.sources.map((source) => source.key));
    const seen = new Set<string>();
    set.questions.forEach((question, index) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: 'custom', path: ['questions', index], message });

      if (seen.has(question.id)) issue(`duplicate question id ${question.id}`);
      seen.add(question.id);

      for (const key of [...question.enabledSources, ...question.expectedSources]) {
        if (!known.has(key)) issue(`unknown Source ${key}`);
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
export type EvalQuestion = z.infer<typeof evalQuestionSchema>;

/** Parses `demo/evals.json`; throws a readable error listing every problem. */
export function parseEvalSet(value: unknown): EvalSet {
  const result = evalSetSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid eval set:\n${z.prettifyError(result.error)}`);
  return result.data;
}
