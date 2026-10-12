"use client";

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

type AdminQueryProviderProps = {
  children: React.ReactNode;
};

// Cached data is fresh for a minute, then refetches quietly on the next view or tab focus.
const STALE_TIME_MS = 60_000;
// One quick retry for a blip; a read that keeps failing shows its error instead of hanging.
const QUERY_RETRIES = 1;

let browserQueryClient: QueryClient | null = null;

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        refetchOnWindowFocus: true,
        retry: QUERY_RETRIES,
      },
    },
  });
}

// One cache per browser session: it outlives the admin layout remounting, and a full reload
// starts empty. The server gets a fresh one per render so requests never share data.
function getQueryClient(): QueryClient {
  if (isServer) return createQueryClient();

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

// Sign-out returns to /login without a full reload, so the next account must not see this one's rows.
export function clearBrowserQueryCache(): void {
  browserQueryClient?.clear();
}

export default function AdminQueryProvider({
  children,
}: AdminQueryProviderProps): React.ReactNode {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
