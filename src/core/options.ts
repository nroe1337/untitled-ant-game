// Player options kept in the browser, not in the save (like the speed toggle).
export type QueueOrder = 'order' | 'cheapest';
const KEY = 'formicarium-queue-order';
let order: QueueOrder = 'order';
try { if (localStorage.getItem(KEY) === 'cheapest') order = 'cheapest'; } catch { /* storage blocked */ }
export const queueOrder = () => order;
export function setQueueOrder(o: QueueOrder) {
  order = o;
  try { localStorage.setItem(KEY, o); } catch { /* storage blocked */ }
}
