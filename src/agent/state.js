// Graph state. Checkpointed per thread in SQLite, so a conversation (web tab or Instagram user)
// survives restarts and can pause for a human answer.
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { emptyFacts, mergeFacts } from '../governance/grounding.js';

const merge = (a, b) => ({ ...a, ...b });

export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,

  // Search origin: coarsened coordinates (governance/privacy.js) and the place name, if any.
  ctx: Annotation({ reducer: merge, default: () => ({}) }),

  // Registries the UI tools hydrate from: offer_id -> offer (product × shop), product_id -> product.
  offers: Annotation({ reducer: merge, default: () => ({}) }),
  products: Annotation({ reducer: merge, default: () => ({}) }),

  // Grounded facts the output verifier checks against.
  facts: Annotation({ reducer: mergeFacts, default: emptyFacts }),

  // Generative UI blocks emitted during the current turn. `null` resets.
  ui: Annotation({ reducer: (a, b) => (b === null ? [] : [...a, ...b]), default: () => [] }),

  // Per-turn harness bookkeeping. A new turn (new id) replaces it wholesale.
  turn: Annotation({ reducer: (a, b) => (b?.id && b.id !== a?.id ? b : { ...a, ...b }), default: () => ({}) }),

  // Channel-agnostic, renderable conversation log (what the user saw).
  transcript: Annotation({ reducer: (a, b) => [...a, ...b].slice(-60), default: () => [] }),
});

export function newTurn(flags = []) {
  return {
    id: crypto.randomUUID(),
    started: Date.now(),
    steps: 0,
    toolCalls: 0,
    groundingRetries: 0,
    scratch: [], // message ids to drop from history at the end of the turn
    fetchedOfferIds: [],
    flags,
  };
}
