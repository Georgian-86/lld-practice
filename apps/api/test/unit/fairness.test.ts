import { describe, expect, it } from 'vitest';
import type { DesignModel } from '@blueprint/shared';
import { EvaluationPipeline } from '../../src/evaluation/pipeline';
import { RuleBasedEvaluator } from '../../src/evaluation/rule-based-evaluator';
import { defaultRules } from '../../src/evaluation/rules';
import { ScoreAggregator } from '../../src/evaluation/score-aggregator';
import { LlmDesignReviewer } from '../../src/evaluation/llm/llm-reviewer';
import { design, entity, goodParkingDesign, rel } from '../fixtures/designs';
import { FakeClock, fakeLlm, problem, sequentialIds } from '../fixtures/harness';

/**
 * The design question "what makes feedback useful when there is more than one
 * valid solution?" is answered by scoring *properties*, never similarity to a
 * reference. These tests are the evidence: two structurally different valid
 * designs must score alike, and a weak design must score clearly lower.
 */

/** Same problem, different valid choices: enums instead of subclasses, and different names for every seam. */
function enumBasedParkingDesign(): DesignModel {
  return design({
    entities: [
      entity('Garage', 'class', { responsibilities: ['Coordinates check-in and check-out'], methods: ['checkIn(vehicle): ParkingTicket', 'checkOut(ticket): Receipt'] }),
      entity('Level', 'class', { responsibilities: ['Owns its slots and counts free slots per size'], methods: ['freeSlots(size)'] }),
      entity('ParkingSlot', 'class', { responsibilities: ['Knows its size and whether it is taken'], attributes: ['size: SlotSize'], methods: ['fits(vehicle): boolean'] }),
      entity('SlotSize', 'enum', { responsibilities: ['Lists slot sizes: compact, regular, large'], attributes: ['COMPACT', 'REGULAR', 'LARGE'] }),
      entity('Vehicle', 'class', { responsibilities: ['Has a plate and a type'], attributes: ['type: VehicleType'] }),
      entity('VehicleType', 'enum', { responsibilities: ['Lists vehicle types and the smallest slot each needs'], attributes: ['MOTORCYCLE', 'CAR', 'TRUCK'] }),
      entity('ParkingTicket', 'class', { responsibilities: ['Records entry time, slot and vehicle'] }),
      entity('Gate', 'class', { responsibilities: ['Admits or refuses vehicles and hands out tickets'], methods: ['admit(vehicle)'] }),
      entity('OccupancyDisplay', 'class', { responsibilities: ['Shows free slots per size for a level'] }),
      entity('TariffPolicy', 'interface', { methods: ['charge(ticket): Money'] }),
      entity('WeekdayTariff'),
      entity('SlotFinder', 'interface', { methods: ['find(vehicle, levels): ParkingSlot'] }),
      entity('LowestLevelFirst'),
      entity('PaymentGateway', 'interface', { methods: ['pay(amount): Receipt'] }),
      entity('UpiPayment'),
    ],
    relationships: [
      rel('Garage', 'composition', 'Level'),
      rel('Level', 'composition', 'ParkingSlot'),
      rel('ParkingSlot', 'association', 'SlotSize'),
      rel('Vehicle', 'association', 'VehicleType'),
      rel('ParkingTicket', 'association', 'ParkingSlot'),
      rel('ParkingTicket', 'association', 'Vehicle'),
      rel('Gate', 'dependency', 'Garage'),
      rel('Gate', 'dependency', 'ParkingTicket'),
      rel('Level', 'composition', 'OccupancyDisplay'),
      rel('Garage', 'association', 'TariffPolicy'),
      rel('WeekdayTariff', 'implementation', 'TariffPolicy'),
      rel('Garage', 'association', 'SlotFinder'),
      rel('LowestLevelFirst', 'implementation', 'SlotFinder'),
      rel('Garage', 'dependency', 'PaymentGateway'),
      rel('UpiPayment', 'implementation', 'PaymentGateway'),
    ],
    requirementMap: {
      'FR-1': ['Level', 'ParkingSlot'],
      'FR-2': ['VehicleType', 'ParkingSlot'],
      'FR-3': ['Gate', 'SlotFinder', 'ParkingTicket'],
      'FR-4': ['TariffPolicy', 'PaymentGateway'],
      'FR-5': ['OccupancyDisplay'],
      'FR-6': ['Gate'],
      'NFR-1': ['SlotFinder'],
      'NFR-2': ['TariffPolicy'],
    },
    patterns: [
      {
        id: 'p1',
        name: 'Strategy',
        appliedTo: ['SlotFinder', 'LowestLevelFirst'],
        justification: 'The rule for choosing a slot is expected to change, so Garage depends on SlotFinder and each rule is a new class.',
      },
    ],
    tradeOffs: [
      'Slot and vehicle types are enums rather than subclasses: sizes are a fixed, closed set, so a lookup is simpler than a hierarchy, at the cost of editing the enum for a new size.',
      'SlotFinder locks one level at a time, which keeps allocation simple but lets two gates on the same level wait for each other.',
    ],
    extensionAnswer:
      'Add an EV size to SlotSize and an EvTariff implementing TariffPolicy that adds the per-kWh fee. SlotFinder implementations already match by size, so Garage, Gate and ParkingTicket stay untouched.',
  });
}

/** A design that "works" but puts everything in one class and has no seams. */
function weakParkingDesign(): DesignModel {
  return design({
    entities: [
      entity('ParkingLot', 'class', {
        responsibilities: ['Parks cars', 'Finds spots', 'Prints tickets', 'Computes fees', 'Takes payment', 'Updates the display', 'Handles exits', 'Stores all data'],
        methods: ['park()', 'unpark()', 'pay()', 'display()'],
      }),
      entity('Car', 'class', { responsibilities: [] }),
      entity('Spot', 'class', { responsibilities: [] }),
    ],
    relationships: [rel('ParkingLot', 'association', 'Car')],
    requirementMap: { 'FR-1': ['ParkingLot'], 'FR-3': ['ParkingLot'], 'FR-4': ['ParkingLot'] },
    extensionAnswer: 'Change the code.',
  });
}

const pipeline = (withAi: boolean) =>
  new EvaluationPipeline([new RuleBasedEvaluator(defaultRules())], withAi ? [new LlmDesignReviewer(fakeLlm())] : [], new ScoreAggregator(), new FakeClock(), sequentialIds());

async function score(design: DesignModel, withAi: boolean) {
  const report = await pipeline(withAi).run({ submissionId: 'sub', problem: problem('parking-lot'), design });
  return report.overallScore;
}

describe.each([
  ['rules only', false],
  ['rules + offline AI reviewer', true],
])('fairness to different valid designs (%s)', (_label, withAi) => {
  it('scores two structurally different valid designs alike, and a weak one clearly lower', async () => {
    const strategyAndInheritance = await score(goodParkingDesign(), withAi);
    const enumsAndOtherNames = await score(enumBasedParkingDesign(), withAi);
    const weak = await score(weakParkingDesign(), withAi);
    expect(strategyAndInheritance).toBeGreaterThanOrEqual(80);
    expect(enumsAndOtherNames).toBeGreaterThanOrEqual(80);
    expect(Math.abs(strategyAndInheritance - enumsAndOtherNames)).toBeLessThanOrEqual(10);
    expect(weak).toBeLessThanOrEqual(55);
    expect(Math.min(strategyAndInheritance, enumsAndOtherNames) - weak).toBeGreaterThanOrEqual(30);
  });
});
