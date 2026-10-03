export type HealthStatus = 'up' | 'down';

export interface HealthChecks {
  database: HealthStatus;
  storage: HealthStatus;
}
