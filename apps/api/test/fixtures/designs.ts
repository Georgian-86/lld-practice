import type { DesignModel, Entity, EntityKind, Relationship, RelationshipType } from '@blueprint/shared';
import { emptyDesign } from '@blueprint/shared';

let seq = 0;
export function entity(name: string, kind: EntityKind = 'class', extra: Partial<Entity> = {}): Entity {
  return {
    id: `e${++seq}`,
    name,
    kind,
    responsibilities: [`Responsible for ${name} behaviour`],
    attributes: [],
    methods: kind === 'interface' ? ['operate()'] : [],
    ...extra,
  };
}

export function rel(from: string, type: RelationshipType, to: string): Relationship {
  return { id: `r${++seq}`, from, to, type };
}

export function design(partial: Partial<DesignModel>): DesignModel {
  return { ...emptyDesign(), ...partial };
}

/** A reasonable Parking Lot design used as a "good" baseline across tests. */
export function goodParkingDesign(): DesignModel {
  return design({
    entities: [
      entity('ParkingLot', 'class', { responsibilities: ['Coordinates entry and exit', 'Owns floors and gates'] }),
      entity('Floor', 'class', { responsibilities: ['Holds spots and counts free spots per type'] }),
      entity('ParkingSpot', 'abstract', { responsibilities: ['Knows size and occupancy'], methods: ['canFit(v)'] }),
      entity('CompactSpot'),
      entity('LargeSpot'),
      entity('Vehicle', 'abstract', { responsibilities: ['Has a size'] }),
      entity('Car'),
      entity('Truck'),
      entity('Ticket', 'class', { responsibilities: ['Records entry time and spot'] }),
      entity('EntryGate', 'class', { responsibilities: ['Issues tickets'] }),
      entity('DisplayBoard', 'class', { responsibilities: ['Shows free spot counts'] }),
      entity('PricingStrategy', 'interface', { methods: ['fee(ticket)'] }),
      entity('HourlyPricing'),
      entity('SpotAllocationStrategy', 'interface', { methods: ['allocate(vehicle)'] }),
      entity('NearestSpotAllocation'),
      entity('PaymentProcessor', 'interface', { methods: ['pay(amount)'] }),
      entity('CardPayment'),
    ],
    relationships: [
      rel('ParkingLot', 'composition', 'Floor'),
      rel('Floor', 'composition', 'ParkingSpot'),
      rel('CompactSpot', 'inheritance', 'ParkingSpot'),
      rel('LargeSpot', 'inheritance', 'ParkingSpot'),
      rel('Car', 'inheritance', 'Vehicle'),
      rel('Truck', 'inheritance', 'Vehicle'),
      rel('ParkingLot', 'association', 'PricingStrategy'),
      rel('HourlyPricing', 'implementation', 'PricingStrategy'),
      rel('ParkingLot', 'association', 'SpotAllocationStrategy'),
      rel('NearestSpotAllocation', 'implementation', 'SpotAllocationStrategy'),
      rel('CardPayment', 'implementation', 'PaymentProcessor'),
      rel('ParkingLot', 'dependency', 'PaymentProcessor'),
      rel('EntryGate', 'dependency', 'ParkingLot'),
      rel('Ticket', 'association', 'ParkingSpot'),
      rel('EntryGate', 'dependency', 'Ticket'),
      rel('Floor', 'composition', 'DisplayBoard'),
      rel('ParkingSpot', 'association', 'Vehicle'),
    ],
    requirementMap: {
      'FR-1': ['Floor', 'ParkingSpot'],
      'FR-2': ['Vehicle', 'ParkingSpot'],
      'FR-3': ['EntryGate', 'SpotAllocationStrategy', 'Ticket'],
      'FR-4': ['PricingStrategy', 'PaymentProcessor'],
      'FR-5': ['DisplayBoard'],
      'FR-6': ['EntryGate'],
      'NFR-1': ['SpotAllocationStrategy'],
      'NFR-2': ['PricingStrategy'],
    },
    patterns: [
      {
        id: 'p1',
        name: 'Strategy',
        appliedTo: ['PricingStrategy', 'HourlyPricing'],
        justification: 'Pricing rules change often; the lot depends on the interface so new tariffs are new classes, not edits.',
      },
    ],
    tradeOffs: [
      'I chose strategy objects over an enum for pricing because tariffs change often, at the cost of more classes.',
      'Allocation locks per floor instead of globally, which is simpler to reason about but can reduce throughput.',
    ],
    extensionAnswer:
      'Add an EvSpot extending ParkingSpot that only fits electric vehicles, and an EvPricing implementing PricingStrategy that adds the per-kWh fee. ParkingLot, Ticket and EntryGate stay untouched.',
  });
}
