import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export default function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps): React.ReactNode {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}
