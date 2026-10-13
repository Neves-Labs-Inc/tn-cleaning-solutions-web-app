type TabToolbarProps = {
  description: string;
  action?: React.ReactNode;
};

// The line above a tab's list: what the tab holds, and its main action (one or two buttons).
export default function TabToolbar({
  description,
  action,
}: TabToolbarProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{description}</p>
      {action ? (
        <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:shrink-0">
          {action}
        </div>
      ) : null}
    </div>
  );
}
