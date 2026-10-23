import type { ValidationIssue } from '@flowboard/contracts';

type Details = Record<string, unknown>[];

/** An expected failure. The error handler turns it into { error: { code, message, details? } }. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Details | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = (message: string) => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message: string) => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: Details) =>
  new AppError(409, code, message, details);
export const validationFailed = (issues: ValidationIssue[], message = 'Invalid input') =>
  new AppError(400, 'VALIDATION_FAILED', message, issues);
export const invalid = (path: string, code: string, message: string) =>
  validationFailed([{ path, code, message }], message);
