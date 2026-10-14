"use client";

import { useState } from "react";
import { toast } from "sonner";

// Downloads a generated file (Payroll export, summary PDF, Pay statement) through fetch rather than
// a bare <a download> link, so the control can show pending and turn a 403 or 404 into a toast
// instead of saving a broken file.

export type FileDownloadMessages = {
  notFound?: string;
  forbidden?: string;
  failed?: string;
};

export type FileDownloadOptions = {
  messages?: FileDownloadMessages;
  // Called after a 404, e.g. to refresh a stale page.
  onNotFound?: () => void;
};

type FileDownload = {
  download: (href: string, options?: FileDownloadOptions) => Promise<void>;
  // The href in flight, or null when idle.
  pendingHref: string | null;
};

const NOT_FOUND_MESSAGE = "Nothing to export yet. Finalize a run first.";
const FORBIDDEN_MESSAGE = "You don't have access to payroll exports.";
const FAILED_MESSAGE = "Couldn't download the export. Try again.";
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const FILENAME_PATTERN = /filename="?([^";]+)"?/i;

// The name the server gave the file, else the URL's last path segment.
function getFilename(response: Response, href: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const fromHeader = FILENAME_PATTERN.exec(header)?.[1];
  const fromPath = href.split("?")[0].split("/").pop() ?? "";
  return fromHeader ?? decodeURIComponent(fromPath);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Deferred: some browsers cancel the save if the URL dies in the same task as the click.
  setTimeout(() => URL.revokeObjectURL(url));
}

function getErrorMessage(
  status: number,
  messages: FileDownloadMessages,
): string {
  let message = messages.failed ?? FAILED_MESSAGE;
  if (status === HTTP_NOT_FOUND) {
    message = messages.notFound ?? NOT_FOUND_MESSAGE;
  } else if (status === HTTP_FORBIDDEN) {
    message = messages.forbidden ?? FORBIDDEN_MESSAGE;
  }
  return message;
}

export function useFileDownload(): FileDownload {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  async function download(
    href: string,
    options: FileDownloadOptions = {},
  ): Promise<void> {
    const messages = options.messages ?? {};
    setPendingHref(href);
    try {
      const response = await fetch(href, { cache: "no-store" });
      // A lost session redirects to the login page, which isn't the file.
      if (response.redirected) {
        toast.error(messages.forbidden ?? FORBIDDEN_MESSAGE);
      } else if (response.ok) {
        const filename = getFilename(response, href);
        saveBlob(await response.blob(), filename);
        toast.success(`Downloaded ${filename}`);
      } else {
        console.warn("file download: refused", href, response.status);
        toast.error(getErrorMessage(response.status, messages));
        if (response.status === HTTP_NOT_FOUND) options.onNotFound?.();
      }
    } catch (error) {
      console.error("file download: failed", href, error);
      toast.error(messages.failed ?? FAILED_MESSAGE);
    } finally {
      setPendingHref(null);
    }
  }

  return { download, pendingHref };
}
