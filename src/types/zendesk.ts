export interface ZafUser {
  id: number;
  name: string;
  email?: string;
  role?: string;
  locale: string;
}

export interface ZendeskStaffUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  suspended: boolean;
  locale?: string;
}

export interface RawAuditLog {
  id: number | string;
  url?: string;
  action: string;
  action_label?: string;
  actor_id: number | null;
  actor_name?: string | null;
  ip_address?: string | null;
  source_type: string;
  source_id?: number | string | null;
  source_label?: string | null;
  change_description?: string | null;
  created_at: string;
}

export type ConfigModuleKey =
  | 'all_config'
  | 'triggers'
  | 'rules'
  | 'users'
  | 'roles'
  | 'groups'
  | 'fields'
  | 'forms'
  | 'brands'
  | 'apps'
  | 'webhooks'
  | 'settings'
  | 'security'
  | 'schedules'
  | 'sla'
  | 'custom_objects'
  | 'other_config';

export type AuditActionKey =
  | 'any'
  | 'create'
  | 'update'
  | 'destroy'
  | 'role_change'
  | 'other';

export type RuleSubtype = 'trigger' | 'automation' | 'view' | 'macro' | 'unknown';

export type RuleClassificationSource = 'catalog_id' | 'payload_heuristic' | 'unclassified';

export interface ClassifiedAuditEvent {
  id: string;
  raw: RawAuditLog;
  isConfiguration: boolean;
  moduleKey: Exclude<ConfigModuleKey, 'all_config'>;
  actionKey: Exclude<AuditActionKey, 'any'>;
  ruleSubtype?: RuleSubtype;
  ruleClassificationSource?: RuleClassificationSource;
  isRoleChange: boolean;
  isUserDeletion: boolean;
  isTriggerEdit: boolean;
  isSystemEvent: boolean;
  actorId: string | null;
  actorName: string;
  sourceType: string;
  sourceId: string | null;
  sourceLabel: string;
  changeDescription: string;
  createdAt: string;
  ipAddress: string | null;
}

export interface RuleCatalogIndex {
  triggers: Set<string>;
  automations: Set<string>;
  views: Set<string>;
  macros: Set<string>;
  loadedSources: string[];
  deniedSources: string[];
}

export interface AlertRule {
  recordId: string;
  name: string;
  ownerUserId: string;
  moduleKey: ConfigModuleKey;
  actionKey: AuditActionKey;
  enabled: boolean;
  notes: string;
  updatedAt?: string;
}

export interface AlertRuleInput {
  name: string;
  moduleKey: ConfigModuleKey;
  actionKey: AuditActionKey;
  enabled: boolean;
  notes?: string;
}

export interface ReadStateRecord {
  recordId: string;
  userId: string;
  auditEventId: string;
  readAt: string;
}

export interface DeduplicatedAlertItem {
  event: ClassifiedAuditEvent;
  matchedRules: AlertRule[];
  isRead: boolean;
  readRecordId?: string;
}

export type ClarificationStatus = 'open' | 'resolved';

export interface ClarificationThread {
  recordId: string;
  auditEventId: string;
  eventModule: string;
  eventAction: string;
  eventSourceLabel: string;
  eventSummary: string;
  eventCreatedAt: string;
  requesterUserId: string;
  requesterName: string;
  recipientUserId: string;
  recipientName: string;
  isSystemEvent: boolean;
  question: string;
  status: ClarificationStatus;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  lastActivityAt: string;
}

export interface ClarificationReply {
  recordId: string;
  threadRecordId: string;
  auditEventId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  repliedAt: string;
}

export interface ApiErrorInfo {
  status: number;
  message: string;
  isPermissionDenied: boolean;
  isNotFound: boolean;
  rawDetail?: string;
}

export interface SchemaObjectStatus {
  key: string;
  exists: boolean;
  missingFields: string[];
  existingFieldCount: number;
  requiredFieldCount: number;
}

export interface SchemaInspectionResult {
  ready: boolean;
  accessDenied: boolean;
  error?: ApiErrorInfo;
  objects: SchemaObjectStatus[];
}

export interface PayloadValidationSample {
  id: string;
  source_type: string;
  action: string;
  source_id: string | null;
  source_label: string;
  change_description: string;
  actor_id: number | null;
  created_at: string;
  classificationNote: string;
}

export interface VerifiedPayloadCapabilities {
  triggerEdits: boolean;
  userDeletions: boolean;
  roleChanges: boolean;
}

export interface LiveDiagnosticReport {
  generatedAt: string;
  currentUserLocale: string;
  accountLocales: string[];
  agentLocales: Array<{ locale: string; count: number }>;
  auditLogsAccessible: boolean;
  auditLogsError?: string;
  sampledAuditLogCount: number;
  distinctSourceTypes: string[];
  ruleCatalogLoaded: string[];
  ruleCatalogDenied: string[];
  schemaStatus: SchemaInspectionResult;
  payloadValidation: {
    capabilities: VerifiedPayloadCapabilities;
    triggerEditSamples: PayloadValidationSample[];
    userDeletionSamples: PayloadValidationSample[];
    roleChangeSamples: PayloadValidationSample[];
    ruleSamples: PayloadValidationSample[];
  };
}
