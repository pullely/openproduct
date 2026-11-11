// Who is reading, as far as this browser knows (openproduct-performance
// OPP14).
//
// ONE FACT, WRITTEN ONCE. `shell/account-chip.tsx` asks `/auth/session` on
// every document load — it is the only thing on the page that does — and
// used to keep the answer to itself in component state. A post somebody
// makes needs the same answer: an optimistic comment has to carry a name
// before the server has said one, and asking `/auth/session` a second time
// for it would double the one personal request every page makes.
//
// So the chip PUBLISHES here and anything that needs the name subscribes.
// Nothing in this module fetches. The server snapshot is "unknown" for
// everybody, which is I6 in one line: the document renders no visitor.

export interface Visitor {
  /** Whether `/auth/session` has answered at all. */
  readonly known: boolean;
  readonly signedIn: boolean;
  readonly displayName: string | null;
}

type Listener = () => void;

const UNKNOWN: Visitor = Object.freeze({ known: false, signedIn: false, displayName: null });

let state: Visitor = UNKNOWN;
const listeners = new Set<Listener>();

export function visitorSnapshot(): Visitor {
  return state;
}

/** The server snapshot, and the same frozen instance every time. */
export function unknownVisitor(): Visitor {
  return UNKNOWN;
}

export function subscribeVisitor(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishVisitor(next: { signedIn: boolean; displayName: string | null }): void {
  state = Object.freeze({
    known: true,
    signedIn: next.signedIn,
    displayName: next.signedIn ? next.displayName : null,
  });
  for (const listener of listeners) listener();
}

/** Test seam. */
export function resetVisitorForTests(): void {
  state = UNKNOWN;
  listeners.clear();
}
