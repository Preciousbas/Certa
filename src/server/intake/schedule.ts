/** Drain only after the webhook handler has finished queueing its jobs. */
export async function drainAfterHandler(handler: Promise<unknown>, drain: () => Promise<unknown>): Promise<void> {
  await handler.catch(() => undefined);
  await drain();
}
