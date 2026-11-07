export { currentVisitorId, ensureVisitor, VisitorLimitError } from './cookie';
// Test seam: other modules' integration tests need a Visitor to own their rows.
export { createVisitor } from './store';
