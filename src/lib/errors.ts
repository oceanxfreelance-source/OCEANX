/** An error whose message is safe to show to the end user. */
export class UserError extends Error {
  constructor(message: string, public code = "BAD_REQUEST") {
    super(message);
    this.name = "UserError";
  }
}

export class ForbiddenError extends UserError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "FORBIDDEN");
  }
}

export class NotFoundError extends UserError {
  constructor(message = "Not found.") {
    super(message, "NOT_FOUND");
  }
}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new UserError(message);
}
