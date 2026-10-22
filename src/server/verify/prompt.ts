import type { Criterion } from "./criteria.js";
import { formatWat } from "./messages.js";

export type PromptPhoto = {
  capturedAt: Date;
  distanceM: number;
  similar: boolean;
};

export function stageVerifyUserMessage(input: {
  projectName: string;
  location: string;
  stages: readonly { number: number; name: string }[];
  claimedNumber: number;
  claimedName: string;
  criteria: readonly Criterion[];
  photos: readonly PromptPhoto[];
  previousStatus: string | null;
}): string {
  const stages = input.stages.map((stage) => `${stage.number}. ${stage.name}`).join(" ");
  const criteria = input.criteria
    .map((item) => `${item.id}: ${item.text}${item.required ? " (required)" : ""}`)
    .join(" ");
  const photos = input.photos
    .map((photo, index) => {
      const similar = photo.similar ? ", similar to an earlier photo" : "";
      return `photo ${index + 1}: taken ${formatWat(photo.capturedAt)}, ${photo.distanceM} m from site${similar}`;
    })
    .join(". ");
  const previous = input.previousStatus ? ` Previous stage status: ${input.previousStatus}.` : "";
  return `Project: ${input.projectName}, ${input.location}. All stages: ${stages}. Claimed stage: ${input.claimedNumber}. ${input.claimedName}. Acceptance criteria: ${criteria}. Photo info: ${photos}.${previous}`;
}
