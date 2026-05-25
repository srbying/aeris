import { getActivityRepository } from "../activity/activity-repository";
import type { ActivityRepository } from "../activity/types";
import { createLlmProvider } from ".";
import type { LLMProvider } from "./types";

type ChatDependencyOverrides = {
  provider?: LLMProvider;
  repository?: ActivityRepository;
};

let providerOverride: LLMProvider | null = null;
let repositoryOverride: ActivityRepository | null = null;

export function getChatProvider(): LLMProvider {
  return providerOverride ?? createLlmProvider();
}

export function getChatActivityRepository(): ActivityRepository {
  return repositoryOverride ?? getActivityRepository();
}

export function setChatDependenciesForTests(overrides: ChatDependencyOverrides): void {
  providerOverride = overrides.provider ?? providerOverride;
  repositoryOverride = overrides.repository ?? repositoryOverride;
}

export function resetChatDependenciesForTests(): void {
  providerOverride = null;
  repositoryOverride = null;
}
