import type { VerifiedPayloadCapabilities } from '../types/zendesk';

/**
 * Compile-time payload verification gate.
 *
 * Trigger edits, user deletions, and role changes stay unexposed in alert rule
 * options until validated against real Zendesk Audit Log payloads from the target
 * instance. When live diagnostics verify matching real payloads in the current
 * instance, the app can surface verified options dynamically or after updating
 * these flags with confirmed payload fixtures.
 */
export const DEFAULT_VERIFIED_CAPABILITIES: VerifiedPayloadCapabilities = {
  triggerEdits: false,
  userDeletions: false,
  roleChanges: false
};
