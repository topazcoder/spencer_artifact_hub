import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

/** True when a query failed on a unique constraint, optionally a specific one. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; constraint?: string };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    (constraint === undefined || driverError.constraint === constraint)
  );
}
