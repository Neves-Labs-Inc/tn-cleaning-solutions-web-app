"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

type ListSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  // Opt-in: lets a caller move focus to the input, e.g. after Clear filters.
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

const SEARCH_DEBOUNCE_MS = 300;

// The URL is the source of truth: `onChange` turns each settled value into a
// navigation. Remount this (via `key`) to reset the box after a parent clears
// its filters.
export default function ListSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  inputRef,
}: ListSearchProps): React.ReactNode {
  const [draft, setDraft] = useState(value);
  const [urlValue, setUrlValue] = useState(value);
  // Follow the URL when the value changes from outside (a sidebar link,
  // back/forward). Our own pushes already match the box, so typing is never
  // overwritten.
  if (value !== urlValue) {
    setUrlValue(value);
    if (value !== draft.trim()) setDraft(value);
  }

  const ownRef = useRef<HTMLInputElement>(null);
  const searchRef = inputRef ?? ownRef;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The debounce timer fires renders later; it must call the parent's latest
  // onChange.
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function pushValue(next: string): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChangeRef.current(next.trim());
  }

  function handleDraftChange(next: string): void {
    setDraft(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pushValue(next), SEARCH_DEBOUNCE_MS);
  }

  function handleClear(): void {
    setDraft("");
    pushValue("");
    searchRef.current?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    pushValue(draft);
  }

  return (
    <form role="search" onSubmit={handleSubmit}>
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          className="[&::-webkit-search-cancel-button]:appearance-none"
        />
        {draft ? (
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              aria-label="Clear search"
              onClick={handleClear}
            >
              <X aria-hidden="true" />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
