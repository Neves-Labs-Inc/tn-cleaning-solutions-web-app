// Kept free of `server-only` so node:test can cover it; queries.ts applies it to every read.

type Filterable<Q> = { eq(column: string, value: string): Q }

// Narrows a read to one client (the client page), or leaves it whole when clientId is null.
export function scopeToClient<Q extends Filterable<Q>>(query: Q, column: string, clientId: string | null): Q {
  return clientId ? query.eq(column, clientId) : query
}
