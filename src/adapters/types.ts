/**
 * Every provisioning adapter returns the same shape so `create` can merge the
 * results without caring which provider produced them.
 *
 * Adapters never throw for expected failures: a provider outage degrades to
 * `manual` and the run continues, because the project is still deployable.
 */
export type ProvisionStatus =
  | 'created'
  | 'reused'
  | 'skipped'
  | 'manual'
  | 'failed';

export interface ProvisionResult {
  status: ProvisionStatus;
  /** Option keys to merge back into the resolved `create` values. */
  values: Record<string, string>;
  /** Human-readable steps the operator still has to perform. */
  manualInstructions: string[];
  warnings: string[];
  error?: string;
}

export function provisionResult(
  status: ProvisionStatus,
  extra: Partial<Omit<ProvisionResult, 'status'>> = {}
): ProvisionResult {
  return {
    status,
    values: extra.values ?? {},
    manualInstructions: extra.manualInstructions ?? [],
    warnings: extra.warnings ?? [],
    ...(extra.error ? { error: extra.error } : {}),
  };
}

export function mergeProvisionResults(
  results: readonly ProvisionResult[]
): ProvisionResult {
  const statuses = new Set(results.map((result) => result.status));
  const status: ProvisionStatus = statuses.has('failed')
    ? 'failed'
    : statuses.has('created')
      ? 'created'
      : statuses.has('reused')
        ? 'reused'
        : statuses.has('manual')
          ? 'manual'
          : 'skipped';

  return {
    status,
    values: Object.assign({}, ...results.map((result) => result.values)),
    manualInstructions: results.flatMap(
      (result) => result.manualInstructions
    ),
    warnings: results.flatMap((result) => result.warnings),
    ...(results.find((result) => result.error)?.error
      ? { error: results.find((result) => result.error)?.error as string }
      : {}),
  };
}
