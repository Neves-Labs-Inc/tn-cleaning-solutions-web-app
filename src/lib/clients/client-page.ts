// The client page's tabs, in display order. Pure, so node --test can load it.

export const CLIENT_TABS = ["locations", "pricing", "billing"] as const;

export type ClientTab = (typeof CLIENT_TABS)[number];

export const DEFAULT_CLIENT_TAB: ClientTab = "locations";
