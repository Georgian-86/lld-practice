/**
 * Domain errors carry a stable machine-readable code. The HTTP layer maps
 * each subclass to a status code; nothing below the HTTP layer knows about HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found.`);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation_failed';
}

export class ConflictError extends DomainError {
  readonly code: string;
  constructor(code: string, message: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'invalid_transition';
}
