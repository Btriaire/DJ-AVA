import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false on the server and during hydration, true once the client is running.
// Lets a component read browser storage during render without a hydration mismatch
// and without calling setState in an effect.
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
