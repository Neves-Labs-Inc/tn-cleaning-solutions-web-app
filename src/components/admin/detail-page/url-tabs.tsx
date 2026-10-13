"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseTabParam, tabSearch } from "@/lib/admin/tab-param";

const TAB_PARAM = "tab";

type UrlTab<T extends string> = {
  value: T;
  label: string;
  content: React.ReactNode;
};

type UrlTabsProps<T extends string> = {
  tabs: Array<UrlTab<T>>;
  activeTab: T;
  defaultTab: T;
  ariaLabel?: string;
};

// URLSearchParams lists every value; parseTabParam wants Next's shape (one string, or an array when repeated).
function getTabParam(searchParams: URLSearchParams): string | string[] | undefined {
  const values = searchParams.getAll(TAB_PARAM);
  let value: string | string[] | undefined;
  if (values.length === 1) {
    value = values[0];
  } else if (values.length > 1) {
    value = values;
  }
  return value;
}

// Assumes at most 3 short labels: triggers share the phone width and never wrap or scroll.
// Tabs kept in `?tab=`. Panels are built on the server, so a switch never waits on it or shows a skeleton.
export default function UrlTabs<T extends string>({
  tabs,
  activeTab,
  defaultTab,
  ariaLabel,
}: UrlTabsProps<T>): React.ReactNode {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = parseTabParam(
    getTabParam(searchParams),
    tabs.map((tab) => tab.value),
    defaultTab,
  );
  const [selectedTab, setSelectedTab] = useState<T>(activeTab);
  const [lastUrlTab, setLastUrlTab] = useState<T>(urlTab);

  // Back/forward (or any outside URL change) moves the tabs with it.
  if (urlTab !== lastUrlTab) {
    setLastUrlTab(urlTab);
    setSelectedTab(urlTab);
  }

  function handleValueChange(value: unknown): void {
    const tab = tabs.find((candidate) => candidate.value === value);
    if (!tab) return;

    // The trigger changes on tap; the URL follows. pushState (not router.push) skips the server
    // round trip and loading.tsx, Next syncs useSearchParams with it, and Back steps through tabs.
    setSelectedTab(tab.value);
    window.history.pushState(
      null,
      "",
      `${pathname}${tabSearch(searchParams, tab.value, defaultTab)}`,
    );
  }

  return (
    <Tabs value={selectedTab} onValueChange={handleValueChange} className="gap-4">
      <TabsList
        variant="line"
        aria-label={ariaLabel}
        // The list keeps its padding and rule inside its height, so it sizes to the triggers instead.
        className="w-full justify-start border-b py-0 group-data-horizontal/tabs:h-auto"
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="h-(--control-height) sm:flex-none group-data-horizontal/tabs:after:-bottom-px">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="space-y-4 animate-in fade-in-0 duration-base ease-out-quart"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
