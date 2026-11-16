export class HttpError extends Error {
  // Create an application error with an HTTP status and message.
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
