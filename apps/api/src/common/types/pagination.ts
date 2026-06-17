/**
 * Shared by every service that returns a paginated list. Declared once and
 * exported so TypeScript's declaration-emit (tsconfig `declaration: true`)
 * can always name the type — defining this same shape as a private interface
 * inside each service file works at runtime but fails the build because the
 * type can't be referenced from the .d.ts output.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
