import type { DesignRule } from '../evaluator';
import { CoreConceptRule, DesignSizeRule, NamingRule } from './modelling-rules';
import { ExtensionScenarioRule, PatternJustificationRule, VariationPointRule } from './extensibility-rules';
import { CyclicDependencyRule, DanglingReferenceRule, HierarchyRule, IsolatedEntityRule } from './relationship-rules';
import { RequirementConcentrationRule, RequirementCoverageRule } from './requirement-rules';
import { GodClassRule, UndefinedResponsibilityRule } from './responsibility-rules';
import { ScenarioRule } from './scenario-rules';
import { TradeOffRule } from './tradeoff-rules';

export function defaultRules(): DesignRule[] {
  return [
    new RequirementCoverageRule(),
    new CoreConceptRule(),
    new DesignSizeRule(),
    new NamingRule(),
    new GodClassRule(),
    new UndefinedResponsibilityRule(),
    new RequirementConcentrationRule(),
    new DanglingReferenceRule(),
    new IsolatedEntityRule(),
    new CyclicDependencyRule(),
    new HierarchyRule(),
    new VariationPointRule(),
    new PatternJustificationRule(),
    new ExtensionScenarioRule(),
    new TradeOffRule(),
    new ScenarioRule(),
  ];
}

export * from './modelling-rules';
export * from './extensibility-rules';
export * from './relationship-rules';
export * from './requirement-rules';
export * from './responsibility-rules';
export * from './tradeoff-rules';
export * from './scenario-rules';
