export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'The requested Python resource was not found.');
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to modify this Python resource.');
