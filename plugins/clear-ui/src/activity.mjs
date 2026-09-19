// Pure. No I/O, no Node API.
//
// What is running, as counts. Names, descriptions and commands stay where Claude Code already
// shows them -- the agent panel and the spinner -- so the row never says the same thing twice and
// never prints text a model wrote. See docs/research/ux-distillation.md, "Implications for Phase D".

// The agent feed was measured writing every 5 s while the panel has rows. It is not known to be
// called once more when the last row goes, so a record this old means the panel is gone.
export const AGENTS_MAX_AGE_MS = 15 * 1000
// A background snapshot is only replaced when Claude next stops, and nothing fires when a shell
// ends, so it is already the weakest claim on the bar. Past this age it is not made at all.
export const BACKGROUND_MAX_AGE_MS = 12 * 60 * 60 * 1000

// Observed in the feed on 2.1.277: 'running' and 'completed'. 'failed' has not been observed;
// it is read because every comparable UI marks failure and nothing else, and costs nothing if
// the value never arrives.
const RUNNING = 'running'
const FAILED = 'failed'
// A background entry of this type is a sub-agent, which the agent feed already counts.
const AGENT_TYPE = /agent/i

const fresh = (record, now, maxAge) => Number.isFinite(record?.at) && Number.isFinite(now) && now - record.at >= 0 && now - record.at <= maxAge

/** The `background_tasks[]` of a Stop hook, reduced to the one number that is stored. */
export function backgroundCount(backgroundTasks) {
  if (!Array.isArray(backgroundTasks)) return 0
  return backgroundTasks.filter(task => typeof task === 'object' && task !== null && task.status === RUNNING && !AGENT_TYPE.test(String(task.type ?? ''))).length
}

/**
 * @returns { agents, failed, oldestStart, background } or null when nothing is running.
 */
export function activityOf(agentsRecord, backgroundRecord, now) {
  const tasks = fresh(agentsRecord, now, AGENTS_MAX_AGE_MS) && Array.isArray(agentsRecord.tasks) ? agentsRecord.tasks : []
  const running = tasks.filter(task => task?.status === RUNNING)
  const failed = tasks.filter(task => task?.status === FAILED).length
  const starts = running.map(task => task.startTime).filter(start => Number.isFinite(start) && start <= now)
  const background =
    fresh(backgroundRecord, now, BACKGROUND_MAX_AGE_MS) && Number.isInteger(backgroundRecord.running) && backgroundRecord.running > 0
      ? backgroundRecord.running
      : 0
  if (running.length === 0 && failed === 0 && background === 0) return null
  return { agents: running.length, failed, oldestStart: starts.length > 0 ? Math.min(...starts) : null, background }
}
