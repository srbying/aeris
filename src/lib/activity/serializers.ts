import { calculateAerobicEfficiency } from "../calculations/efficiency";
import type { Activity, PublicActivity } from "./types";

export function serializePublicActivity(activity: Activity): PublicActivity {
  const efficiency = calculateAerobicEfficiency(activity);

  return {
    ...activity,
    efficiency: efficiency === null ? null : Number(efficiency.toFixed(4)),
  };
}
