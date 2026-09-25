import { describe, expect, it } from 'vitest';
import { emptyDesign } from '@blueprint/shared';
import { autoLayout, fillMissingPositions, findFreeSpot, NODE_WIDTH } from './layout';

const entity = (id: string, name: string) => ({ id, name, kind: 'class' as const, responsibilities: [], attributes: [], methods: [] });

describe('canvas layout', () => {
  it('puts parents above children and wholes above parts', () => {
    const design = {
      ...emptyDesign(),
      entities: [entity('car', 'Car'), entity('vehicle', 'Vehicle'), entity('lot', 'Lot'), entity('floor', 'Floor')],
      relationships: [
        { id: 'r1', from: 'Car', to: 'Vehicle', type: 'inheritance' as const },
        { id: 'r2', from: 'Lot', to: 'Floor', type: 'composition' as const },
      ],
    };
    const layout = autoLayout(design);
    expect(layout.vehicle!.y).toBeLessThan(layout.car!.y);
    expect(layout.lot!.y).toBeLessThan(layout.floor!.y);
  });

  it('only fills in classes that have no position yet', () => {
    const design = { ...emptyDesign(), entities: [entity('a', 'A'), entity('b', 'B')] };
    const filled = fillMissingPositions(design, { a: { x: 100, y: 100 } });
    expect(Object.keys(filled!)).toEqual(['b']);
    expect(fillMissingPositions(design, { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } })).toBeNull();
  });

  it('finds a spot that does not overlap existing boxes', () => {
    const occupied = [{ x: 0, y: 0, width: NODE_WIDTH, height: 150 }];
    const spot = findFreeSpot({ x: 0, y: 0 }, occupied);
    const overlaps = spot.x < NODE_WIDTH && spot.x + NODE_WIDTH > 0 && spot.y < 150 && spot.y + 150 > 0;
    expect(overlaps).toBe(false);
  });
});
