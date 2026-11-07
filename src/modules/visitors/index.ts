export { currentVisitorId, ensureVisitor, VisitorLimitError } from './cookie';
export { purgeInactiveVisitors, startVisitorPurge, VISITOR_INACTIVE_AFTER_MS } from './purge';
// Test seam: other modules' integration tests need a Visitor to own their rows.
export { createVisitor } from './store';
