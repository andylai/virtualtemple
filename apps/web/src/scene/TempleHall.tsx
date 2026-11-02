import type { Point } from '@temple/shared';
import { BlockoutFurniture, FloorClickArea, Lamps } from './BlockoutHall';
import type { HallLayout } from './hallLayout';
import { ModelSlot, PictureSlot } from './slots/LazySlots';
import type { SlotUrls } from './slots/slotUrls';

interface TempleHallProps {
  layout: HallLayout;
  /** The models and pictures the manifest names; null parts use the placeholder. */
  slots: SlotUrls;
  /** The lamp places that have a lit lamp. */
  litLamps?: ReadonlySet<string> | undefined;
  /** Called with the spot on the floor that was clicked or tapped. */
  onFloorClick?: ((point: Point) => void) | undefined;
}

/**
 * The hall as the manifest describes it: the whole-hall model if there is one, otherwise the
 * placeholder with the manifest's statue on the altar, then its pictures on the back wall.
 * The placeholder also shows while a model downloads and if it cannot be loaded.
 */
export function TempleHall({ layout, slots, litLamps, onFloorClick }: TempleHallProps) {
  const blockout = <BlockoutFurniture layout={layout} statueUrl={slots.statue} />;
  return (
    <group>
      <FloorClickArea layout={layout} onFloorClick={onFloorClick} />
      {slots.hallModel === null ? (
        blockout
      ) : (
        <ModelSlot url={slots.hallModel} fallback={blockout} />
      )}
      {slots.altarBackdrop !== null && (
        <PictureSlot url={slots.altarBackdrop} plane={layout.pictures.altarBackdrop} />
      )}
      {slots.banner !== null && <PictureSlot url={slots.banner} plane={layout.pictures.banner} />}
      {slots.plaque !== null && <PictureSlot url={slots.plaque} plane={layout.pictures.plaque} />}
      <Lamps layout={layout} litLamps={litLamps} />
    </group>
  );
}
