export class AppError extends Error {
  constructor(
    message: string,
    public code = "BAD_REQUEST",
    public status = 400,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, "NOT_FOUND", 404);
export const conflict = (msg: string) => new AppError(msg, "CONFLICT", 409);
