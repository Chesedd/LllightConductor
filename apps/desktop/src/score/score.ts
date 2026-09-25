/**
 * Versioned placeholder only. The timeline/event contract is intentionally deferred;
 * consumers must not infer a final event model from this shape.
 */
export interface ProvisionalScore {
  format: 'provisional';
  version: 1;
}

export const emptyScore = (): ProvisionalScore => ({ format: 'provisional', version: 1 });
