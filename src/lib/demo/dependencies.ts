import {
  createSupabaseDemoAllowanceRepository,
  type DemoAllowanceRepository,
} from "./demo-allowance";

type DemoAllowanceDependencyOverrides = {
  generateVisitorToken?: () => string;
  repository?: DemoAllowanceRepository;
};

let repositoryOverride: DemoAllowanceRepository | null = null;
let generateVisitorTokenOverride: (() => string) | null = null;

export function getDemoAllowanceRepository(): DemoAllowanceRepository {
  return repositoryOverride ?? createSupabaseDemoAllowanceRepository();
}

export function generateDemoVisitorToken(): string {
  return generateVisitorTokenOverride?.() ?? crypto.randomUUID();
}

export function setDemoAllowanceDependenciesForTests(
  overrides: DemoAllowanceDependencyOverrides,
): void {
  repositoryOverride = overrides.repository ?? repositoryOverride;
  generateVisitorTokenOverride =
    overrides.generateVisitorToken ?? generateVisitorTokenOverride;
}

export function resetDemoAllowanceDependenciesForTests(): void {
  repositoryOverride = null;
  generateVisitorTokenOverride = null;
}
