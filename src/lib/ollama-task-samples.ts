import { addCalendarDays } from "./action-queue.ts";
import { displayDate } from "./opportunity-model.ts";

export function ollamaTaskSamples(today: string) {
  return [
    {
      id: "resume",
      label: "Request with a deadline",
      text: `Thanks for reaching out. Please send me your résumé by ${displayDate(addCalendarDays(today, 3))} so I can share it with the lab.`,
    },
    {
      id: "availability",
      label: "Request without a deadline",
      text: "Could you send me a few times that work for a short call? We can discuss what a summer project might look like.",
    },
    {
      id: "no-action",
      label: "Reply with no task",
      text: "Thanks for your interest. We have already filled all of our summer openings.",
    },
  ] as const;
}
