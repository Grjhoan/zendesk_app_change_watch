import schemaDefinition from '../../schema/custom-objects.json';
import {
  classifyAuditLog,
  createEmptyRuleCatalog,
  validateLivePayloads
} from '../domain/classifier';
import type {
  AlertRule,
  AlertRuleInput,
  AuditActionKey,
  ClarificationReply,
  ClarificationStatus,
  ClarificationThread,
  ClassifiedAuditEvent,
  ConfigModuleKey,
  LiveDiagnosticReport,
  RawAuditLog,
  ReadStateRecord,
  RuleCatalogIndex,
  SchemaInspectionResult,
  SchemaObjectStatus,
  ZendeskStaffUser
} from '../types/zendesk';
import {
  normalizeZafError,
  zafJsonRequest,
  ZendeskApiError,
  type ZafClientLike
} from './zafClient';

export const CUSTOM_OBJECT_KEYS = {
  alertRule: 'cw_alert_rule',
  readState: 'cw_alert_read_state',
  clarificationThread: 'cw_clarification_thread',
  clarificationReply: 'cw_clarification_reply'
} as const;

interface CustomObjectRecordPayload {
  id: string;
  name: string;
  external_id?: string | null;
  created_at?: string;
  updated_at?: string;
  custom_object_fields?: Record<string, unknown>;
}

interface CustomObjectListResponse {
  custom_object_records?: CustomObjectRecordPayload[];
  meta?: {
    has_more?: boolean;
    after_cursor?: string;
  };
}

interface AuditLogListResponse {
  audit_logs?: RawAuditLog[];
  meta?: {
    has_more?: boolean;
    after_cursor?: string;
  };
  next_page?: string | null;
}

export interface FetchAuditLogsParams {
  afterCursor?: string | null;
  pageSize?: number;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  action?: string;
}

export interface FetchAuditLogsResult {
  rawLogs: RawAuditLog[];
  events: ClassifiedAuditEvent[];
  hasMore: boolean;
  afterCursor: string | null;
}

function buildAuditLogsUrl(params: FetchAuditLogsParams): string {
  const qs = new URLSearchParams();
  qs.set('page[size]', String(params.pageSize ?? 100));
  qs.set('sort', '-created_at');

  if (params.afterCursor) {
    qs.set('page[after]', params.afterCursor);
  }
  if (params.actorId && params.actorId !== 'all' && params.actorId !== 'system') {
    qs.set('filter[actor_id]', params.actorId);
  }
  if (params.action && ['create', 'update', 'destroy'].includes(params.action)) {
    qs.set('filter[action]', params.action);
  }
  if (params.dateFrom && params.dateTo) {
    qs.append('filter[created_at][]', `${params.dateFrom}T00:00:00Z`);
    qs.append('filter[created_at][]', `${params.dateTo}T23:59:59Z`);
  }

  return `/api/v2/audit_logs.json?${qs.toString()}`;
}

export async function fetchAuditLogs(
  client: ZafClientLike,
  catalog: RuleCatalogIndex,
  params: FetchAuditLogsParams = {}
): Promise<FetchAuditLogsResult> {
  const url = buildAuditLogsUrl(params);
  const res = await zafJsonRequest<AuditLogListResponse>(client, { url });
  const rawLogs = res.audit_logs ?? [];
  const events = rawLogs.map((log) => classifyAuditLog(log, catalog));

  return {
    rawLogs,
    events,
    hasMore: Boolean(res.meta?.has_more && res.meta?.after_cursor),
    afterCursor: res.meta?.after_cursor ?? null
  };
}

async function fetchPaginatedIds(
  client: ZafClientLike,
  endpoint: string,
  collectionKey: string,
  maxPages = 5
): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const qs = new URLSearchParams({ 'page[size]': '100' });
    if (cursor) {
      qs.set('page[after]', cursor);
    }
    const res = await zafJsonRequest<Record<string, unknown>>(client, {
      url: `${endpoint}?${qs.toString()}`
    });
    const items = (res[collectionKey] as Array<{ id: number | string }> | undefined) ?? [];
    for (const item of items) {
      if (item?.id !== undefined && item?.id !== null) {
        ids.add(String(item.id));
      }
    }
    const meta = res.meta as { has_more?: boolean; after_cursor?: string } | undefined;
    if (!meta?.has_more || !meta.after_cursor) {
      break;
    }
    cursor = meta.after_cursor;
    pages += 1;
  }

  return ids;
}

/**
 * Loads rule IDs from triggers, automations, views, and macros so source_type=rule
 * audit logs can be classified deterministically by source_id.
 * Respects native Zendesk permissions: any 403/401 endpoint is recorded without failing the app.
 */
export async function fetchRuleCatalog(client: ZafClientLike): Promise<RuleCatalogIndex> {
  const catalog = createEmptyRuleCatalog();
  const sources: Array<{
    key: 'triggers' | 'automations' | 'views' | 'macros';
    endpoint: string;
  }> = [
    { key: 'triggers', endpoint: '/api/v2/triggers.json' },
    { key: 'automations', endpoint: '/api/v2/automations.json' },
    { key: 'views', endpoint: '/api/v2/views.json' },
    { key: 'macros', endpoint: '/api/v2/macros.json' }
  ];

  await Promise.all(
    sources.map(async ({ key, endpoint }) => {
      try {
        catalog[key] = await fetchPaginatedIds(client, endpoint, key);
        catalog.loadedSources.push(key);
      } catch (err) {
        const info = normalizeZafError(err);
        if (info.isPermissionDenied) {
          catalog.deniedSources.push(key);
        }
      }
    })
  );

  return catalog;
}

export async function fetchStaffUsers(client: ZafClientLike): Promise<ZendeskStaffUser[]> {
  const users: ZendeskStaffUser[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 5) {
    const qs = new URLSearchParams();
    qs.append('role[]', 'admin');
    qs.append('role[]', 'agent');
    qs.set('page[size]', '100');
    if (cursor) {
      qs.set('page[after]', cursor);
    }

    const res = await zafJsonRequest<{
      users?: Array<Record<string, unknown>>;
      meta?: { has_more?: boolean; after_cursor?: string };
    }>(client, { url: `/api/v2/users.json?${qs.toString()}` });

    for (const u of res.users ?? []) {
      users.push({
        id: Number(u.id),
        name: String(u.name ?? ''),
        email: String(u.email ?? ''),
        role: String(u.role ?? ''),
        active: u.active !== false,
        suspended: Boolean(u.suspended),
        locale: u.locale ? String(u.locale) : undefined
      });
    }

    if (!res.meta?.has_more || !res.meta.after_cursor) {
      break;
    }
    cursor = res.meta.after_cursor;
    pages += 1;
  }

  return users.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchUserById(
  client: ZafClientLike,
  userId: string
): Promise<ZendeskStaffUser | null> {
  try {
    const res = await zafJsonRequest<{ user?: Record<string, unknown> }>(client, {
      url: `/api/v2/users/${encodeURIComponent(userId)}.json`
    });
    if (!res.user) {
      return null;
    }
    return {
      id: Number(res.user.id),
      name: String(res.user.name ?? ''),
      email: String(res.user.email ?? ''),
      role: String(res.user.role ?? ''),
      active: res.user.active !== false,
      suspended: Boolean(res.user.suspended),
      locale: res.user.locale ? String(res.user.locale) : undefined
    };
  } catch (err) {
    const info = normalizeZafError(err);
    if (info.isNotFound || info.isPermissionDenied) {
      return null;
    }
    throw err;
  }
}

export async function fetchAccountLocales(client: ZafClientLike): Promise<string[]> {
  try {
    const res = await zafJsonRequest<{ locales?: Array<{ locale?: string }> }>(client, {
      url: '/api/v2/locales.json'
    });
    return (res.locales ?? [])
      .map((l) => l.locale)
      .filter((loc): loc is string => Boolean(loc));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Custom Objects Schema Inspection & Repeatable Setup
// ---------------------------------------------------------------------------

export async function inspectCustomObjectsSchema(
  client: ZafClientLike
): Promise<SchemaInspectionResult> {
  try {
    const res = await zafJsonRequest<{ custom_objects?: Array<{ key: string }> }>(client, {
      url: '/api/v2/custom_objects.json'
    });
    const existingKeys = new Set((res.custom_objects ?? []).map((obj) => obj.key));
    const statuses: SchemaObjectStatus[] = [];

    for (const objDef of schemaDefinition.objects) {
      if (!existingKeys.has(objDef.key)) {
        statuses.push({
          key: objDef.key,
          exists: false,
          missingFields: objDef.fields.map((f) => f.key),
          existingFieldCount: 0,
          requiredFieldCount: objDef.fields.length
        });
        continue;
      }

      const fieldsRes = await zafJsonRequest<{ custom_object_fields?: Array<{ key: string }> }>(
        client,
        { url: `/api/v2/custom_objects/${objDef.key}/fields.json` }
      );
      const existingFieldKeys = new Set(
        (fieldsRes.custom_object_fields ?? []).map((f) => f.key)
      );
      const missingFields = objDef.fields
        .map((f) => f.key)
        .filter((key) => !existingFieldKeys.has(key));

      statuses.push({
        key: objDef.key,
        exists: true,
        missingFields,
        existingFieldCount: objDef.fields.length - missingFields.length,
        requiredFieldCount: objDef.fields.length
      });
    }

    return {
      ready: statuses.every((s) => s.exists && s.missingFields.length === 0),
      accessDenied: false,
      objects: statuses
    };
  } catch (err) {
    const info = normalizeZafError(err);
    return {
      ready: false,
      accessDenied: info.isPermissionDenied,
      error: info,
      objects: schemaDefinition.objects.map((o) => ({
        key: o.key,
        exists: false,
        missingFields: o.fields.map((f) => f.key),
        existingFieldCount: 0,
        requiredFieldCount: o.fields.length
      }))
    };
  }
}

export async function ensureCustomObjectsSchema(
  client: ZafClientLike
): Promise<SchemaInspectionResult> {
  const inspection = await inspectCustomObjectsSchema(client);
  if (inspection.accessDenied) {
    throw new ZendeskApiError(
      inspection.error ?? {
        status: 403,
        isPermissionDenied: true,
        isNotFound: false,
        message: 'Permission denied'
      }
    );
  }

  const statusByKey = new Map(inspection.objects.map((s) => [s.key, s]));

  for (const objDef of schemaDefinition.objects) {
    const status = statusByKey.get(objDef.key);
    if (!status?.exists) {
      await zafJsonRequest(client, {
        url: '/api/v2/custom_objects.json',
        method: 'POST',
        body: {
          custom_object: {
            key: objDef.key,
            title: objDef.title,
            title_pluralized: objDef.title_pluralized,
            description: objDef.description,
            include_in_list_view: objDef.include_in_list_view,
            allows_attachments: objDef.allows_attachments
          }
        }
      });
    }

    const missingSet = new Set(status?.missingFields ?? objDef.fields.map((f) => f.key));
    for (const fieldDef of objDef.fields) {
      if (missingSet.has(fieldDef.key)) {
        await zafJsonRequest(client, {
          url: `/api/v2/custom_objects/${objDef.key}/fields.json`,
          method: 'POST',
          body: {
            custom_object_field: {
              key: fieldDef.key,
              title: fieldDef.title,
              type: fieldDef.type,
              description: fieldDef.description
            }
          }
        });
      }
    }
  }

  return inspectCustomObjectsSchema(client);
}

// ---------------------------------------------------------------------------
// Generic Custom Object Record Helpers
// ---------------------------------------------------------------------------

async function listAllCustomObjectRecords(
  client: ZafClientLike,
  objectKey: string,
  maxPages = 10
): Promise<CustomObjectRecordPayload[]> {
  const all: CustomObjectRecordPayload[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const qs = new URLSearchParams({
      'page[size]': '100',
      sort: '-updated_at'
    });
    if (cursor) {
      qs.set('page[after]', cursor);
    }

    const res = await zafJsonRequest<CustomObjectListResponse>(client, {
      url: `/api/v2/custom_objects/${objectKey}/records.json?${qs.toString()}`
    });

    all.push(...(res.custom_object_records ?? []));

    if (!res.meta?.has_more || !res.meta.after_cursor) {
      break;
    }
    cursor = res.meta.after_cursor;
    pages += 1;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Alert Rules Repository (cw_alert_rule)
// ---------------------------------------------------------------------------

function mapAlertRuleRecord(rec: CustomObjectRecordPayload): AlertRule {
  const f = rec.custom_object_fields ?? {};
  return {
    recordId: rec.id,
    name: rec.name,
    ownerUserId: String(f.owner_user_id ?? ''),
    moduleKey: (String(f.module_key ?? 'all_config') as ConfigModuleKey),
    actionKey: (String(f.action_key ?? 'any') as AuditActionKey),
    enabled: Boolean(f.enabled),
    notes: String(f.rule_notes ?? ''),
    updatedAt: rec.updated_at
  };
}

export async function listUserAlertRules(
  client: ZafClientLike,
  userId: string
): Promise<AlertRule[]> {
  const records = await listAllCustomObjectRecords(client, CUSTOM_OBJECT_KEYS.alertRule);
  return records.map(mapAlertRuleRecord).filter((rule) => rule.ownerUserId === userId);
}

export async function createAlertRule(
  client: ZafClientLike,
  userId: string,
  input: AlertRuleInput
): Promise<AlertRule> {
  const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.alertRule}/records.json`,
    method: 'POST',
    body: {
      custom_object_record: {
        name: input.name.trim(),
        custom_object_fields: {
          owner_user_id: userId,
          module_key: input.moduleKey,
          action_key: input.actionKey,
          enabled: input.enabled,
          rule_notes: (input.notes ?? '').trim()
        }
      }
    }
  });
  return mapAlertRuleRecord(res.custom_object_record);
}

export async function updateAlertRule(
  client: ZafClientLike,
  recordId: string,
  input: Partial<AlertRuleInput>
): Promise<AlertRule> {
  const fields: Record<string, unknown> = {};
  if (input.moduleKey !== undefined) fields.module_key = input.moduleKey;
  if (input.actionKey !== undefined) fields.action_key = input.actionKey;
  if (input.enabled !== undefined) fields.enabled = input.enabled;
  if (input.notes !== undefined) fields.rule_notes = input.notes.trim();

  const payload: Record<string, unknown> = { custom_object_fields: fields };
  if (input.name !== undefined) {
    payload.name = input.name.trim();
  }

  const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.alertRule}/records/${encodeURIComponent(recordId)}.json`,
    method: 'PATCH',
    body: { custom_object_record: payload }
  });
  return mapAlertRuleRecord(res.custom_object_record);
}

export async function deleteAlertRule(client: ZafClientLike, recordId: string): Promise<void> {
  await zafJsonRequest(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.alertRule}/records/${encodeURIComponent(recordId)}.json`,
    method: 'DELETE'
  });
}

// ---------------------------------------------------------------------------
// Per-User Read State Repository (cw_alert_read_state)
// ---------------------------------------------------------------------------

function mapReadStateRecord(rec: CustomObjectRecordPayload): ReadStateRecord {
  const f = rec.custom_object_fields ?? {};
  return {
    recordId: rec.id,
    userId: String(f.user_id ?? ''),
    auditEventId: String(f.audit_event_id ?? ''),
    readAt: String(f.read_at ?? rec.updated_at ?? '')
  };
}

export async function listUserReadStates(
  client: ZafClientLike,
  userId: string
): Promise<ReadStateRecord[]> {
  const records = await listAllCustomObjectRecords(client, CUSTOM_OBJECT_KEYS.readState);
  return records.map(mapReadStateRecord).filter((r) => r.userId === userId);
}

export async function markAuditEventRead(
  client: ZafClientLike,
  userId: string,
  auditEventId: string
): Promise<ReadStateRecord> {
  const externalId = `cw_read_${userId}_${auditEventId}`;
  const readAt = new Date().toISOString();

  try {
    const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
      url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.readState}/records.json`,
      method: 'POST',
      body: {
        custom_object_record: {
          name: `${userId}:${auditEventId}`,
          external_id: externalId,
          custom_object_fields: {
            user_id: userId,
            audit_event_id: auditEventId,
            read_at: readAt
          }
        }
      }
    });
    return mapReadStateRecord(res.custom_object_record);
  } catch (err) {
    const info = normalizeZafError(err);
    // If duplicate external_id (422), update existing record idempotently
    if (info.status === 422) {
      const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(
        client,
        {
          url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.readState}/records/update_by_unique_identifier.json?external_id=${encodeURIComponent(externalId)}`,
          method: 'PATCH',
          body: {
            custom_object_record: {
              custom_object_fields: {
                read_at: readAt
              }
            }
          }
        }
      );
      return mapReadStateRecord(res.custom_object_record);
    }
    throw err;
  }
}

export async function markAuditEventUnread(
  client: ZafClientLike,
  recordId: string
): Promise<void> {
  await zafJsonRequest(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.readState}/records/${encodeURIComponent(recordId)}.json`,
    method: 'DELETE'
  });
}

// ---------------------------------------------------------------------------
// Clarifications Repository (cw_clarification_thread & cw_clarification_reply)
// ---------------------------------------------------------------------------

function mapClarificationThread(rec: CustomObjectRecordPayload): ClarificationThread {
  const f = rec.custom_object_fields ?? {};
  const rawStatus = String(f.status ?? 'open').toLowerCase();
  const status: ClarificationStatus = rawStatus === 'resolved' ? 'resolved' : 'open';

  return {
    recordId: rec.id,
    auditEventId: String(f.audit_event_id ?? ''),
    eventModule: String(f.event_module ?? 'other_config'),
    eventAction: String(f.event_action ?? 'other'),
    eventSourceLabel: String(f.event_source_label ?? rec.name),
    eventSummary: String(f.event_summary ?? ''),
    eventCreatedAt: String(f.event_created_at ?? ''),
    requesterUserId: String(f.requester_user_id ?? ''),
    requesterName: String(f.requester_name ?? ''),
    recipientUserId: String(f.recipient_user_id ?? ''),
    recipientName: String(f.recipient_name ?? ''),
    isSystemEvent: Boolean(f.is_system_event),
    question: String(f.question ?? ''),
    status,
    resolvedAt: f.resolved_at ? String(f.resolved_at) : null,
    resolvedByUserId: f.resolved_by_user_id ? String(f.resolved_by_user_id) : null,
    lastActivityAt: String(f.last_activity_at ?? rec.updated_at ?? rec.created_at ?? '')
  };
}

function mapClarificationReply(rec: CustomObjectRecordPayload): ClarificationReply {
  const f = rec.custom_object_fields ?? {};
  return {
    recordId: rec.id,
    threadRecordId: String(f.thread_record_id ?? ''),
    auditEventId: String(f.audit_event_id ?? ''),
    authorUserId: String(f.author_user_id ?? ''),
    authorName: String(f.author_name ?? ''),
    body: String(f.body ?? ''),
    repliedAt: String(f.replied_at ?? rec.created_at ?? '')
  };
}

export async function listClarificationThreads(
  client: ZafClientLike
): Promise<ClarificationThread[]> {
  const records = await listAllCustomObjectRecords(client, CUSTOM_OBJECT_KEYS.clarificationThread);
  return records
    .map(mapClarificationThread)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}

export async function createClarificationThread(
  client: ZafClientLike,
  input: {
    event: ClassifiedAuditEvent;
    requesterUserId: string;
    requesterName: string;
    recipientUserId: string;
    recipientName: string;
    isSystemEvent: boolean;
    question: string;
  }
): Promise<ClarificationThread> {
  const now = new Date().toISOString();
  const title = `${input.event.sourceLabel} (#${input.event.id})`.slice(0, 200);

  const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.clarificationThread}/records.json`,
    method: 'POST',
    body: {
      custom_object_record: {
        name: title,
        custom_object_fields: {
          audit_event_id: input.event.id,
          event_module: input.event.moduleKey,
          event_action: input.event.actionKey,
          event_source_label: input.event.sourceLabel,
          event_summary: input.event.changeDescription,
          event_created_at: input.event.createdAt,
          requester_user_id: input.requesterUserId,
          requester_name: input.requesterName,
          recipient_user_id: input.recipientUserId,
          recipient_name: input.recipientName,
          is_system_event: input.isSystemEvent,
          question: input.question.trim(),
          status: 'open',
          resolved_at: '',
          resolved_by_user_id: '',
          last_activity_at: now
        }
      }
    }
  });

  return mapClarificationThread(res.custom_object_record);
}

export async function resolveClarificationThread(
  client: ZafClientLike,
  threadRecordId: string,
  resolvedByUserId: string
): Promise<ClarificationThread> {
  const now = new Date().toISOString();
  const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.clarificationThread}/records/${encodeURIComponent(threadRecordId)}.json`,
    method: 'PATCH',
    body: {
      custom_object_record: {
        custom_object_fields: {
          status: 'resolved',
          resolved_at: now,
          resolved_by_user_id: resolvedByUserId,
          last_activity_at: now
        }
      }
    }
  });
  return mapClarificationThread(res.custom_object_record);
}

export async function listClarificationReplies(
  client: ZafClientLike,
  threadRecordId: string
): Promise<ClarificationReply[]> {
  const records = await listAllCustomObjectRecords(client, CUSTOM_OBJECT_KEYS.clarificationReply);
  return records
    .map(mapClarificationReply)
    .filter((reply) => reply.threadRecordId === threadRecordId)
    .sort((a, b) => new Date(a.repliedAt).getTime() - new Date(b.repliedAt).getTime());
}

export async function createClarificationReply(
  client: ZafClientLike,
  input: {
    threadRecordId: string;
    auditEventId: string;
    authorUserId: string;
    authorName: string;
    body: string;
  }
): Promise<ClarificationReply> {
  const now = new Date().toISOString();
  const res = await zafJsonRequest<{ custom_object_record: CustomObjectRecordPayload }>(client, {
    url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.clarificationReply}/records.json`,
    method: 'POST',
    body: {
      custom_object_record: {
        name: `Reply ${input.threadRecordId} ${now}`.slice(0, 200),
        custom_object_fields: {
          thread_record_id: input.threadRecordId,
          audit_event_id: input.auditEventId,
          author_user_id: input.authorUserId,
          author_name: input.authorName,
          body: input.body.trim(),
          replied_at: now
        }
      }
    }
  });

  // Update thread last_activity_at best-effort
  try {
    await zafJsonRequest(client, {
      url: `/api/v2/custom_objects/${CUSTOM_OBJECT_KEYS.clarificationThread}/records/${encodeURIComponent(input.threadRecordId)}.json`,
      method: 'PATCH',
      body: {
        custom_object_record: {
          custom_object_fields: {
            last_activity_at: now
          }
        }
      }
    });
  } catch {
    // Non-fatal if user only has create reply permission
  }

  return mapClarificationReply(res.custom_object_record);
}

// ---------------------------------------------------------------------------
// Live Diagnostics & Payload Verification
// ---------------------------------------------------------------------------

export async function runLiveDiagnostics(
  client: ZafClientLike,
  currentUserLocale: string,
  catalog: RuleCatalogIndex
): Promise<LiveDiagnosticReport> {
  const [accountLocales, staffUsers, schemaStatus] = await Promise.all([
    fetchAccountLocales(client),
    fetchStaffUsers(client).catch(() => [] as ZendeskStaffUser[]),
    inspectCustomObjectsSchema(client)
  ]);

  const localeCounts = new Map<string, number>();
  for (const user of staffUsers) {
    const loc = user.locale || 'unknown';
    localeCounts.set(loc, (localeCounts.get(loc) ?? 0) + 1);
  }

  let auditLogsAccessible = false;
  let auditLogsError: string | undefined;
  let rawLogs: RawAuditLog[] = [];

  try {
    const res = await fetchAuditLogs(client, catalog, { pageSize: 100 });
    auditLogsAccessible = true;
    rawLogs = res.rawLogs;
  } catch (err) {
    const info = normalizeZafError(err);
    auditLogsError = info.message;
  }

  const distinctSourceTypes = Array.from(
    new Set(rawLogs.map((l) => l.source_type).filter(Boolean))
  ).sort();

  const payloadValidation = validateLivePayloads(rawLogs, catalog);

  return {
    generatedAt: new Date().toISOString(),
    currentUserLocale,
    accountLocales,
    agentLocales: Array.from(localeCounts.entries())
      .map(([locale, count]) => ({ locale, count }))
      .sort((a, b) => b.count - a.count),
    auditLogsAccessible,
    auditLogsError,
    sampledAuditLogCount: rawLogs.length,
    distinctSourceTypes,
    ruleCatalogLoaded: catalog.loadedSources,
    ruleCatalogDenied: catalog.deniedSources,
    schemaStatus,
    payloadValidation
  };
}
