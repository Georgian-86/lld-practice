// A realistic, imperfect Parking Lot design used by the e2e walkthrough.
const e = (id, name, kind, responsibilities, methods = [], attributes = []) => ({ id, name, kind, responsibilities, methods, attributes });
const r = (id, from, type, to, label) => ({ id, from, to, type, ...(label ? { label } : {}) });

export function parkingDesign({ improved = false } = {}) {
  const entities = [
    e('e1', 'ParkingLot', 'class', ['Entry point for park and unpark flows', 'Delegates spot selection and pricing'], ['park(vehicle): Ticket', 'unpark(ticket): Receipt'], ['floors: List<Floor>']),
    e('e2', 'Floor', 'class', ['Holds spots and tracks free spots per type'], ['findFree(type): ParkingSpot'], ['spots: List<ParkingSpot>']),
    e('e3', 'ParkingSpot', 'abstract', ['Knows its size and whether it is occupied'], ['canFit(vehicle): boolean', 'occupy(vehicle)', 'release()']),
    e('e4', 'CompactSpot', 'class', ['Fits motorcycles and cars']),
    e('e5', 'LargeSpot', 'class', ['Fits any vehicle including trucks']),
    e('e6', 'Vehicle', 'abstract', ['Has a plate and a size'], [], ['plate: String']),
    e('e7', 'Car', 'class', ['Regular sized vehicle']),
    e('e8', 'Truck', 'class', ['Large vehicle']),
    e('e9', 'Ticket', 'class', ['Records entry time, spot and vehicle'], [], ['entryTime: Instant']),
    e('e10', 'PricingStrategy', 'interface', ['Computes the fee for a ticket'], ['fee(ticket): Money']),
    e('e11', 'HourlyPricing', 'class', ['Charges per started hour']),
    e('e12', 'EntryGate', 'class', ['Issues tickets and refuses entry when full'], ['enter(vehicle): Ticket']),
  ];
  const relationships = [
    r('r1', 'ParkingLot', 'composition', 'Floor', 'has'),
    r('r2', 'Floor', 'composition', 'ParkingSpot'),
    r('r3', 'CompactSpot', 'inheritance', 'ParkingSpot'),
    r('r4', 'LargeSpot', 'inheritance', 'ParkingSpot'),
    r('r5', 'Car', 'inheritance', 'Vehicle'),
    r('r6', 'Truck', 'inheritance', 'Vehicle'),
    r('r7', 'HourlyPricing', 'implementation', 'PricingStrategy'),
    r('r8', 'ParkingLot', 'association', 'PricingStrategy', 'prices with'),
    r('r9', 'Ticket', 'association', 'ParkingSpot'),
    r('r10', 'EntryGate', 'dependency', 'ParkingLot'),
  ];
  const design = {
    entities,
    relationships,
    requirementMap: {
      'FR-1': ['Floor', 'ParkingSpot'],
      'FR-2': ['Vehicle', 'ParkingSpot'],
      'FR-3': ['EntryGate', 'Ticket'],
      'FR-4': ['PricingStrategy'],
      'NFR-2': ['PricingStrategy'],
    },
    patterns: [
      { id: 'p1', name: 'Strategy', appliedTo: ['PricingStrategy', 'HourlyPricing'], justification: 'Pricing changes often, so ParkingLot depends on an interface and each tariff is a new class instead of an edit.' },
    ],
    tradeOffs: ['I chose a pricing strategy over an enum because tariffs change often, at the cost of more classes.'],
    extensionAnswer: 'Add an EvSpot extending ParkingSpot that only fits electric vehicles, plus an EvPricing implementing PricingStrategy.',
    notes: '',
  };
  if (improved) {
    design.entities.push(
      e('e13', 'SpotAllocationStrategy', 'interface', ['Chooses a free spot for a vehicle'], ['allocate(vehicle, floors): ParkingSpot']),
      e('e14', 'NearestFirstAllocation', 'class', ['Picks the free spot closest to the gate; locks per floor']),
      e('e15', 'PaymentProcessor', 'interface', ['Takes payment for a fee'], ['pay(amount): Receipt']),
      e('e16', 'CardPayment', 'class', ['Pays by card through the external gateway']),
      e('e17', 'DisplayBoard', 'class', ['Shows free spot counts per type for a floor'], ['refresh(counts)']),
    );
    design.relationships.push(
      r('r11', 'ParkingLot', 'association', 'SpotAllocationStrategy'),
      r('r12', 'NearestFirstAllocation', 'implementation', 'SpotAllocationStrategy'),
      r('r13', 'CardPayment', 'implementation', 'PaymentProcessor'),
      r('r14', 'ParkingLot', 'dependency', 'PaymentProcessor'),
      r('r15', 'Floor', 'composition', 'DisplayBoard'),
    );
    Object.assign(design.requirementMap, {
      'FR-3': ['EntryGate', 'SpotAllocationStrategy', 'Ticket'],
      'FR-4': ['PricingStrategy', 'PaymentProcessor'],
      'FR-5': ['DisplayBoard'],
      'FR-6': ['EntryGate'],
      'NFR-1': ['SpotAllocationStrategy'],
    });
    design.tradeOffs.push('Allocation locks per floor rather than globally: simpler than optimistic compare-and-set, but two gates on the same floor wait for each other.');
    design.extensionAnswer += ' ParkingLot, Floor, Ticket and EntryGate stay untouched because they only depend on the ParkingSpot and PricingStrategy abstractions.';
  }
  return { format: 'structured', design };
}
