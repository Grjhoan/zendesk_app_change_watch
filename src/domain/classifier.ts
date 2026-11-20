import type {
  AlertRule,
  AuditActionKey,
  ClassifiedAuditEvent,
  ConfigModuleKey,
  DeduplicatedAlertItem,
  PayloadValidationSample,
  RawAuditLog,
  ReadStateRecord,
  RuleCatalogIndex,
  RuleClassificationSource,
  RuleSubtype,
  VerifiedPayloadCapabilities
} from '../types/zendesk';

const NON_CONFIG_SOURCE_TYPES = new Set([
  'ticket',
  'ticket_comment',
  'comment',
  'session',
  'user_session',
  'login',
  'logout',
  'export',
  'view_export',
  'report_export',
  'audit_log_export',
  'attachment',
  'upload',
  'chat_transcript',
  'voice_call'
]);

const NON_CONFIG_ACTIONS = new Set(['login', 'logout', 'exported']);

export function createEmptyRuleCatalog(): RuleCatalogIndex {
  return {
    triggers: new Set(),
    automations: new Set(),
    views: new Set(),
    macros: new Set(),
    loadedSources: [],
    deniedSources: []
  };
}

export function normalizeSourceType(rawSourceType: string | null | undefined): string {
  return (rawSourceType ?? '').trim().toLowerCase();
}

export function normalizeAction(rawAction: string | null | undefined): string {
  return (rawAction ?? '').trim().toLowerCase();
}

export function isSystemAuditActor(actorId: number | null | undefined, actorName?: string | null): boolean {
  if (actorId === null || actorId === undefined || Number(actorId) <= 0) {
    return true;
  }
  const normalized = (actorName ?? '').trim().toLowerCase();
  return normalized === 'system' || normalized === 'zendesk' || normalized === 'zendesk system';
}

export function classifyRuleSubtype(
  log: RawAuditLog,
  catalog: RuleCatalogIndex
): { subtype: RuleSubtype; source: RuleClassificationSource } {
  const sourceId = log.source_id !== null && log.source_id !== undefined ? String(log.source_id) : null;

  if (sourceId) {
    if (catalog.triggers.has(sourceId)) {
      return { subtype: 'trigger', source: 'catalog_id' };
    }
    if (catalog.automations.has(sourceId)) {
      return { subtype: 'automation', source: 'catalog_id' };
    }
    if (catalog.views.has(sourceId)) {
      return { subtype: 'view', source: 'catalog_id' };
    }
    if (catalog.macros.has(sourceId)) {
      return { subtype: 'macro', source: 'catalog_id' };
    }
  }

  const label = (log.source_label ?? '').trim();
  const desc = (log.change_description ?? '').trim();
  const combined = `${label}\n${desc}`;

  if (/^trigger\s*:/i.test(label) || /\b(trigger|disparador)\b/i.test(desc)) {
    return { subtype: 'trigger', source: 'payload_heuristic' };
  }
  if (/^automation\s*:/i.test(label) || /\b(automation|automatizaci[oó]n)\b/i.test(desc)) {
    return { subtype: 'automation', source: 'payload_heuristic' };
  }
  if (/^view\s*:/i.test(label) || /\b(view|vista)\b/i.test(combined)) {
    return { subtype: 'view', source: 'payload_heuristic' };
  }
  if (/^macro\s*:/i.test(label) || /\bmacro\b/i.test(combined)) {
    return { subtype: 'macro', source: 'payload_heuristic' };
  }

  return { subtype: 'unknown', source: 'unclassified' };
}

export function isRoleChangePayload(sourceType: string, action: string, changeDescription: string): boolean {
  if (sourceType !== 'user' || action !== 'update') {
    return false;
  }
  return /\b(role|custom role|permission set|rol|conjunto de permisos)\b/i.test(changeDescription);
}

export function mapSourceTypeToModule(
  sourceType: string,
  ruleSubtype?: RuleSubtype
): Exclude<ConfigModuleKey, 'all_config'> {
  if (sourceType === 'trigger' || sourceType === 'triggers') {
    return 'triggers';
  }
  if (sourceType === 'rule') {
    return ruleSubtype === 'trigger' ? 'triggers' : 'rules';
  }
  if (sourceType === 'automation' || sourceType === 'macro' || sourceType === 'view') {
    return 'rules';
  }
  if (sourceType === 'user' || sourceType === 'user_identity' || sourceType.includes('user_')) {
    if (sourceType === 'user_field') {
      return 'fields';
    }
    return 'users';
  }
  if (
    sourceType === 'custom_role' ||
    sourceType === 'permission_set' ||
    sourceType === 'role' ||
    sourceType.includes('role')
  ) {
    return 'roles';
  }
  if (sourceType === 'group' || sourceType === 'group_membership' || sourceType.includes('group')) {
    return 'groups';
  }
  if (
    sourceType === 'ticket_field' ||
    sourceType === 'user_field' ||
    sourceType === 'organization_field' ||
    sourceType === 'custom_field' ||
    sourceType.includes('_field')
  ) {
    return 'fields';
  }
  if (sourceType === 'ticket_form' || sourceType.includes('form')) {
    return 'forms';
  }
  if (sourceType === 'brand' || sourceType.includes('brand')) {
    return 'brands';
  }
  if (
    sourceType.includes('app_market') ||
    sourceType.includes('app_installation') ||
    sourceType === 'app'
  ) {
    return 'apps';
  }
  if (sourceType.includes('webhook') || sourceType === 'target') {
    return 'webhooks';
  }
  if (
    sourceType === 'apitoken' ||
    sourceType === 'api_token' ||
    sourceType.includes('oauth') ||
    sourceType.includes('security') ||
    sourceType.includes('sso') ||
    sourceType.includes('ip_restriction') ||
    sourceType.includes('two_factor')
  ) {
    return 'security';
  }
  if (sourceType.includes('schedule') || sourceType.includes('business_hour')) {
    return 'schedules';
  }
  if (sourceType.includes('sla')) {
    return 'sla';
  }
  if (sourceType.includes('custom_object')) {
    return 'custom_objects';
  }
  if (
    sourceType === 'account_setting' ||
    sourceType === 'account' ||
    sourceType === 'setting' ||
    sourceType.includes('setting') ||
    sourceType.includes('channel') ||
    sourceType.includes('dynamic_content') ||
    sourceType.includes('locale') ||
    sourceType.includes('recipient_address') ||
    sourceType.includes('routing')
  ) {
    return 'settings';
  }
  return 'other_config';
}

export function isConfigurationAuditLog(log: RawAuditLog): boolean {
  const sourceType = normalizeSourceType(log.source_type);
  const action = normalizeAction(log.action);
  if (!sourceType || NON_CONFIG_SOURCE_TYPES.has(sourceType)) {
    return false;
  }
  if (NON_CONFIG_ACTIONS.has(action)) {
    return false;
  }
  return true;
}

export function classifyAuditLog(
  log: RawAuditLog,
  catalog: RuleCatalogIndex = createEmptyRuleCatalog()
): ClassifiedAuditEvent {
  const sourceType = normalizeSourceType(log.source_type);
  const rawAction = normalizeAction(log.action);
  const changeDescription = (log.change_description ?? '').trim();
  const isConfiguration = isConfigurationAuditLog(log);

  let ruleSubtype: RuleSubtype | undefined;
  let ruleClassificationSource: RuleClassificationSource | undefined;

  if (sourceType === 'rule') {
    const classification = classifyRuleSubtype(log, catalog);
    ruleSubtype = classification.subtype;
    ruleClassificationSource = classification.source;
  } else if (sourceType === 'trigger' || sourceType === 'triggers') {
    ruleSubtype = 'trigger';
    ruleClassificationSource = 'catalog_id';
  }

  const moduleKey = mapSourceTypeToModule(sourceType, ruleSubtype);
  const isRoleChange = isRoleChangePayload(sourceType, rawAction, changeDescription);
  const isUserDeletion = sourceType === 'user' && rawAction === 'destroy';
  const isTriggerEdit =
    (sourceType === 'trigger' || (sourceType === 'rule' && ruleSubtype === 'trigger')) &&
    rawAction === 'update';

  let actionKey: Exclude<AuditActionKey, 'any'>;
  if (isRoleChange) {
    actionKey = 'role_change';
  } else if (rawAction === 'create' || rawAction === 'update' || rawAction === 'destroy') {
    actionKey = rawAction;
  } else {
    actionKey = 'other';
  }

  const isSystemEvent = isSystemAuditActor(log.actor_id, log.actor_name);

  return {
    id: String(log.id),
    raw: log,
    isConfiguration,
    moduleKey,
    actionKey,
    ruleSubtype,
    ruleClassificationSource,
    isRoleChange,
    isUserDeletion,
    isTriggerEdit,
    isSystemEvent,
    actorId: isSystemEvent || log.actor_id === null || log.actor_id === undefined ? null : String(log.actor_id),
    actorName: (log.actor_name ?? '').trim(),
    sourceType,
    sourceId: log.source_id !== null && log.source_id !== undefined ? String(log.source_id) : null,
    sourceLabel: (log.source_label ?? '').trim() || String(log.source_id ?? log.source_type),
    changeDescription,
    createdAt: log.created_at,
    ipAddress: log.ip_address ?? null
  };
}

export function ruleMatchesEvent(rule: AlertRule, event: ClassifiedAuditEvent): boolean {
  if (!rule.enabled || !event.isConfiguration) {
    return false;
  }

  const moduleMatches =
    rule.moduleKey === 'all_config' ||
    rule.moduleKey === event.moduleKey ||
    (rule.moduleKey === 'rules' && event.moduleKey === 'triggers');

  if (!moduleMatches) {
    return false;
  }

  if (rule.actionKey === 'any') {
    return true;
  }
  if (rule.actionKey === 'role_change') {
    return event.isRoleChange;
  }
  if (rule.actionKey === 'update') {
    return event.actionKey === 'update' || event.isRoleChange;
  }
  return rule.actionKey === event.actionKey;
}

/**
 * Evaluates all enabled rules for a specific user against configuration events
 * and deduplicates matching events strictly by audit event ID per user.
 */
export function evaluateAlertsForUser(
  userId: string,
  events: ClassifiedAuditEvent[],
  rules: AlertRule[],
  readStates: ReadStateRecord[]
): DeduplicatedAlertItem[] {
  const userRules = rules.filter((r) => r.enabled && r.ownerUserId === userId);
  if (userRules.length === 0) {
    return [];
  }

  const readByEventId = new Map<string, ReadStateRecord>();
  for (const state of readStates) {
    if (state.userId === userId) {
      readByEventId.set(state.auditEventId, state);
    }
  }

  const deduplicated = new Map<string, DeduplicatedAlertItem>();

  for (const event of events) {
    if (!event.isConfiguration) {
      continue;
    }

    const matched = userRules.filter((rule) => ruleMatchesEvent(rule, event));
    if (matched.length === 0) {
      continue;
    }

    const existing = deduplicated.get(event.id);
    if (existing) {
      const seenRuleIds = new Set(existing.matchedRules.map((r) => r.recordId));
      for (const rule of matched) {
        if (!seenRuleIds.has(rule.recordId)) {
          existing.matchedRules.push(rule);
        }
      }
    } else {
      const readRecord = readByEventId.get(event.id);
      deduplicated.set(event.id, {
        event,
        matchedRules: matched,
        isRead: Boolean(readRecord),
        readRecordId: readRecord?.recordId
      });
    }
  }

  return Array.from(deduplicated.values()).sort(
    (a, b) => new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime()
  );
}

/**
 * Inspects real Audit Log payloads to determine which sensitive alert options
 * have been validated against live payloads from the Zendesk instance.
 */
export function validateLivePayloads(
  rawLogs: RawAuditLog[],
  catalog: RuleCatalogIndex
): {
  capabilities: VerifiedPayloadCapabilities;
  triggerEditSamples: PayloadValidationSample[];
  userDeletionSamples: PayloadValidationSample[];
  roleChangeSamples: PayloadValidationSample[];
  ruleSamples: PayloadValidationSample[];
} {
  const triggerEditSamples: PayloadValidationSample[] = [];
  const userDeletionSamples: PayloadValidationSample[] = [];
  const roleChangeSamples: PayloadValidationSample[] = [];
  const ruleSamples: PayloadValidationSample[] = [];

  for (const raw of rawLogs) {
    const classified = classifyAuditLog(raw, catalog);
    const toSample = (note: string): PayloadValidationSample => ({
      id: classified.id,
      source_type: raw.source_type,
      action: raw.action,
      source_id: classified.sourceId,
      source_label: classified.sourceLabel,
      change_description: classified.changeDescription,
      actor_id: raw.actor_id,
      created_at: raw.created_at,
      classificationNote: note
    });

    if (classified.sourceType === 'rule' && ruleSamples.length < 10) {
      ruleSamples.push(
        toSample(`${classified.ruleSubtype ?? 'unknown'} via ${classified.ruleClassificationSource ?? 'unclassified'}`)
      );
    }

    if (
      classified.isTriggerEdit &&
      (classified.ruleClassificationSource === 'catalog_id' ||
        classified.ruleClassificationSource === 'payload_heuristic')
    ) {
      if (triggerEditSamples.length < 5) {
        triggerEditSamples.push(
          toSample(`trigger edit verified via ${classified.ruleClassificationSource}`)
        );
      }
    }

    if (classified.isUserDeletion) {
      if (userDeletionSamples.length < 5) {
        userDeletionSamples.push(toSample('user destroy payload verified'));
      }
    }

    if (classified.isRoleChange) {
      if (roleChangeSamples.length < 5) {
        roleChangeSamples.push(toSample('user role change payload verified'));
      }
    }
  }

  return {
    capabilities: {
      triggerEdits: triggerEditSamples.length > 0,
      userDeletions: userDeletionSamples.length > 0,
      roleChanges: roleChangeSamples.length > 0
    },
    triggerEditSamples,
    userDeletionSamples,
    roleChangeSamples,
    ruleSamples
  };
}

export function getAvailableAlertModules(capabilities: VerifiedPayloadCapabilities): ConfigModuleKey[] {
  const modules: ConfigModuleKey[] = [
    'all_config',
    'rules',
    'users',
    'roles',
    'groups',
    'fields',
    'forms',
    'brands',
    'apps',
    'webhooks',
    'settings',
    'security',
    'schedules',
    'sla',
    'custom_objects',
    'other_config'
  ];

  if (capabilities.triggerEdits) {
    modules.splice(1, 0, 'triggers');
  }
  return modules;
}

export function getAvailableAlertActions(
  moduleKey: ConfigModuleKey,
  capabilities: VerifiedPayloadCapabilities
): AuditActionKey[] {
  const actions: AuditActionKey[] = ['any', 'create', 'update'];

  if (moduleKey === 'users') {
    if (capabilities.userDeletions) {
      actions.push('destroy');
    }
    if (capabilities.roleChanges) {
      actions.push('role_change');
    }
    return actions;
  }

  if (moduleKey === 'triggers') {
    // Only expose trigger-specific actions when trigger payloads are verified
    return capabilities.triggerEdits ? ['any', 'create', 'update', 'destroy'] : ['any'];
  }

  actions.push('destroy');
  return actions;
}
