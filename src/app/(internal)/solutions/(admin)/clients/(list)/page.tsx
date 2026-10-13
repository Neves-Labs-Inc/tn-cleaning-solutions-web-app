import Link from "next/link";
import { Plus } from "lucide-react";

import ClientsLoadError from "@/components/admin/clients/clients-load-error";
import ClientsOverviewList from "@/components/admin/clients/clients-overview-list";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import type { SearchParamValue } from "@/lib/admin/list-query";
import {
  clientsInView,
  owedByClient,
  parseClientsQuery,
  type ClientOverviewRow,
} from "@/lib/clients/overview";
import { loadOwedInvoices } from "@/lib/invoices/queries";
import { createClient } from "@/lib/supabase/server";

type ClientsPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type ClientRead = Omit<ClientOverviewRow, "location_count" | "owed_cents"> & {
  client_locations: Array<{ count: number }> | null;
};

function toOverviewRow(
  client: ClientRead,
  owed: Map<string, number> | null,
): ClientOverviewRow {
  const { client_locations: locations, ...rest } = client;
  return {
    ...rest,
    location_count: locations?.[0]?.count ?? 0,
    owed_cents: owed ? (owed.get(client.id) ?? 0) : null,
  };
}

export default async function ClientsPage({
  searchParams,
}: ClientsPageProps): Promise<React.ReactNode> {
  const query = parseClientsQuery(await searchParams);
  const db = await createClient();

  const [{ data: clients, error: clientsError }, owedInvoices] =
    await Promise.all([
      db
        .from("clients")
        .select(
          "id, name, email, phone, is_active, is_archived, client_locations(count)",
        )
        .order("name", { ascending: true }),
      // A balances failure only blanks Owed: the list still renders.
      loadOwedInvoices(db, null).catch((error: unknown) => {
        console.error("Failed to load owed invoices for clients", error);
        return null;
      }),
    ]);

  const owed = owedInvoices ? owedByClient(owedInvoices) : null;
  const rows = (clients ?? []).map((client) => toOverviewRow(client, owed));

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title="Clients"
        description="Manage your client accounts"
        action={
          <Button
            className="w-full sm:w-auto"
            render={<Link href="/solutions/clients/new" />}
            nativeButton={false}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            New client
          </Button>
        }
      />
      {clientsError ? (
        <ClientsLoadError
          title="Couldn't load clients"
          description={clientsError.message}
        />
      ) : (
        <ClientsOverviewList
          rows={clientsInView(rows, query)}
          hasClients={rows.length > 0}
          query={query}
          isOwedUnavailable={owed === null}
        />
      )}
    </div>
  );
}
