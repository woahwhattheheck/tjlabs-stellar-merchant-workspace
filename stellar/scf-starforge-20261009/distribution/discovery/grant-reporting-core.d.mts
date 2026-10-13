import type { OperatingPlan } from './operating-plan.mjs';
import type { GrantReportingFullInput, GrantReportingPreparation, GrantReportingSelection } from './grant-reporting-input.mjs';

/** Validates full original native inputs and creates only planned operating work. */
export function prepareGrantReportingPlan(input: GrantReportingFullInput | GrantReportingPreparation): Promise<{
  plan: OperatingPlan;
  selection: GrantReportingSelection;
  /** The retained command path, outputDirectory/grant-reporting-plan.json. */
  procedureFile: string;
}>;
/** Same complete original OperatingPlan used by the browser and command-line creator. */
export function createGrantReportingPlan(input: GrantReportingFullInput | GrantReportingPreparation): Promise<OperatingPlan>;
