import { StatTileSkeleton } from "@/components/ui/stat-tile";

const TILES = 4;
// Only the two "Needs …" labels are long enough to wrap in a narrow tile.
const WRAPPING_LABEL_TILES = 2;

export default function AppointmentsOverviewTilesSkeleton(): React.ReactNode {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: TILES }, (_, tile) => (
        <StatTileSkeleton
          key={tile}
          icon
          caption
          fitValue
          reserveLabelWrap={tile < WRAPPING_LABEL_TILES}
          reserveCaptionWrap
        />
      ))}
    </div>
  );
}
