const DEFAULT_ACTIVITY_CONTEXT_MONTHS = 12;

export function getActivityContextMonths(): number {
  const rawValue = process.env.ACTIVITY_CONTEXT_MONTHS;

  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_ACTIVITY_CONTEXT_MONTHS;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("ACTIVITY_CONTEXT_MONTHS must be a positive integer.");
  }

  return parsed;
}
