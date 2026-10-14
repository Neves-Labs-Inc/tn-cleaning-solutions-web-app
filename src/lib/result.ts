// What every service method returns: a value, or a readable error and the HTTP status it maps to.
export type Result<T> = {
  value: T | null;
  error: string | null;
  status: number;
};
