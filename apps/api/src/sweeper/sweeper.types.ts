/** One kind of leftover the sweeper removes, and how: returns how many it removed. */
export interface SweepTask {
  name: string;
  run(): Promise<number>;
}

/** What one sweep removed, per task; a task that failed has `null`. */
export type SweepReport = Record<string, number | null>;
