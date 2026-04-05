'use server'

import { runAIEvaluationInternal } from '../../lib/evaluation'

export async function runAIEvaluation(
  sessionId: string,
  rubric: Array<{ criteriaId: string; description: string }>
) {
  return runAIEvaluationInternal(sessionId, rubric)
}
