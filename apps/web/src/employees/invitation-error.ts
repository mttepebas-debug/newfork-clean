import type { InvitationFailureCode } from "@newfork/shared";

/**
 * An invitation that could not be answered, carrying the server's word for why.
 *
 * It lives in its own module, like lib/request-error, because tests mock
 * employee-data wholesale; a class exported from there comes back undefined
 * and every `instanceof` against it quietly fails (BL-331).
 */
export class InvitationError extends Error {
  readonly code: InvitationFailureCode;

  constructor(code: InvitationFailureCode) {
    super(code);
    this.name = "InvitationError";
    this.code = code;
  }
}
