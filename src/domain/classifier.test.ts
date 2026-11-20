import { describe, expect, it } from 'vitest';
import {
  classifyAuditLog,
  createEmptyRuleCatalog,
  evaluateAlertsForUser,
  getAvailableAlertActions,
  getAvailableAlertModules,
  validateLivePayloads
} from './classifier';
import { DEFAULT_VERIFIED_CAPABILITIES } from './verifiedCapabilities';
import type { AlertRule, RawAuditLog, ReadStateRecord } from '../types/zendesk';

describe('classifier & configuration scoping', () => {
  it('excludes non-configuration events and keeps configuration changes', () => {
    const ticketLog: RawAuditLog = {
      id: 1,
      action: 'update',
      actor_id: 10,
      actor_name: 'Alex',
      source_type: 'ticket',
      source_label: 'Ticket #42',
      created_at: '2026-11-19T12:00:00Z'
    };
    const settingLog: RawAuditLog = {
      id: 2,
      action: 'update',
      actor_id: 10,
      actor_name: 'Alex',
      source_type: 'account_setting',
      source_label: 'Two-factor authentication',
      change_description: 'Changed from false to true',
      created_at: '2026-11-19T12:05:00Z'
    };

    expect(classifyAuditLog(ticketLog).isConfiguration).toBe(false);
    const classifiedSetting = classifyAuditLog(settingLog);
    expect(classifiedSetting.isConfiguration).toBe(true);
    expect(classifiedSetting.moduleKey).toBe('settings');
  });

  it('classifies source_type=rule deterministically via rule catalog IDs', () => {
    const catalog = createEmptyRuleCatalog();
    catalog.triggers.add('5001');
    catalog.automations.add('5002');
    catalog.views.add('5003');

    const triggerEdit: RawAuditLog = {
      id: 100,
      action: 'update',
      actor_id: 10,
      actor_name: 'Admin A',
      source_type: 'rule',
      source_id: 5001,
      source_label: 'Notify VIP escalation',
      change_description: 'Conditions updated',
      created_at: '2026-11-19T13:00:00Z'
    };

    const automationEdit: RawAuditLog = {
      id: 101,
      action: 'update',
      actor_id: 10,
      actor_name: 'Admin A',
      source_type: 'rule',
      source_id: 5002,
      source_label: 'Close solved tickets',
      change_description: 'Actions updated',
      created_at: '2026-11-19T13:01:00Z'
    };

    const classifiedTrigger = classifyAuditLog(triggerEdit, catalog);
    expect(classifiedTrigger.moduleKey).toBe('triggers');
    expect(classifiedTrigger.ruleSubtype).toBe('trigger');
    expect(classifiedTrigger.ruleClassificationSource).toBe('catalog_id');
    expect(classifiedTrigger.isTriggerEdit).toBe(true);

    const classifiedAuto = classifyAuditLog(automationEdit, catalog);
    expect(classifiedAuto.moduleKey).toBe('rules');
    expect(classifiedAuto.ruleSubtype).toBe('automation');
    expect(classifiedAuto.isTriggerEdit).toBe(false);
  });

  it('does not falsely classify ambiguous source_type=rule payloads as triggers', () => {
    const ambiguousRule: RawAuditLog = {
      id: 102,
      action: 'update',
      actor_id: 10,
      actor_name: 'Admin A',
      source_type: 'rule',
      source_id: 9999,
      source_label: 'Generic Rule Name',
      change_description: 'Updated position from 2 to 3',
      created_at: '2026-11-19T13:02:00Z'
    };

    const classified = classifyAuditLog(ambiguousRule, createEmptyRuleCatalog());
    expect(classified.moduleKey).toBe('rules');
    expect(classified.ruleSubtype).toBe('unknown');
    expect(classified.isTriggerEdit).toBe(false);
  });

  it('gates trigger edits, user deletions, and role changes until validated against payloads', () => {
    expect(getAvailableAlertModules(DEFAULT_VERIFIED_CAPABILITIES)).not.toContain('triggers');
    expect(getAvailableAlertActions('users', DEFAULT_VERIFIED_CAPABILITIES)).not.toContain(
      'destroy'
    );
    expect(getAvailableAlertActions('users', DEFAULT_VERIFIED_CAPABILITIES)).not.toContain(
      'role_change'
    );

    const catalog = createEmptyRuleCatalog();
    catalog.triggers.add('7001');

    const validation = validateLivePayloads(
      [
        {
          id: 201,
          action: 'update',
          actor_id: 1,
          actor_name: 'Admin',
          source_type: 'rule',
          source_id: 7001,
          source_label: 'Route Tier 2',
          change_description: 'Updated trigger conditions',
          created_at: '2026-11-19T14:00:00Z'
        },
        {
          id: 202,
          action: 'destroy',
          actor_id: 1,
          actor_name: 'Admin',
          source_type: 'user',
          source_id: 8001,
          source_label: 'Former Agent',
          change_description: 'Deleted user',
          created_at: '2026-11-19T14:01:00Z'
        },
        {
          id: 203,
          action: 'update',
          actor_id: 1,
          actor_name: 'Admin',
          source_type: 'user',
          source_id: 8002,
          source_label: 'Support Lead',
          change_description: 'Role changed from Agent to Administrator',
          created_at: '2026-11-19T14:02:00Z'
        }
      ],
      catalog
    );

    expect(validation.capabilities).toEqual({
      triggerEdits: true,
      userDeletions: true,
      roleChanges: true
    });
    expect(getAvailableAlertModules(validation.capabilities)).toContain('triggers');
    expect(getAvailableAlertActions('users', validation.capabilities)).toContain('destroy');
    expect(getAvailableAlertActions('users', validation.capabilities)).toContain('role_change');
  });

  it('deduplicates matched alerts by audit event ID per user even when multiple rules match', () => {
    const catalog = createEmptyRuleCatalog();
    catalog.triggers.add('3001');

    const event = classifyAuditLog(
      {
        id: 9001,
        action: 'update',
        actor_id: 11,
        actor_name: 'Admin',
        source_type: 'rule',
        source_id: 3001,
        source_label: 'Auto-assign billing',
        change_description: 'Updated actions',
        created_at: '2026-11-19T15:00:00Z'
      },
      catalog
    );

    const rules: AlertRule[] = [
      {
        recordId: 'r1',
        name: 'All configuration',
        ownerUserId: '42',
        moduleKey: 'all_config',
        actionKey: 'any',
        enabled: true,
        notes: ''
      },
      {
        recordId: 'r2',
        name: 'Business rules updates',
        ownerUserId: '42',
        moduleKey: 'rules',
        actionKey: 'update',
        enabled: true,
        notes: ''
      },
      {
        recordId: 'r3',
        name: 'Trigger updates',
        ownerUserId: '42',
        moduleKey: 'triggers',
        actionKey: 'update',
        enabled: true,
        notes: ''
      },
      {
        recordId: 'r4',
        name: 'Other user rule',
        ownerUserId: '99',
        moduleKey: 'all_config',
        actionKey: 'any',
        enabled: true,
        notes: ''
      }
    ];

    const readStates: ReadStateRecord[] = [
      {
        recordId: 'rs-other-user',
        userId: '99',
        auditEventId: '9001',
        readAt: '2026-11-19T15:05:00Z'
      }
    ];

    const alertsUser42 = evaluateAlertsForUser('42', [event, event], rules, readStates);
    expect(alertsUser42).toHaveLength(1);
    expect(alertsUser42[0].event.id).toBe('9001');
    expect(alertsUser42[0].matchedRules.map((r) => r.recordId)).toEqual(['r1', 'r2', 'r3']);
    expect(alertsUser42[0].isRead).toBe(false);

    const alertsUser99 = evaluateAlertsForUser('99', [event], rules, readStates);
    expect(alertsUser99).toHaveLength(1);
    expect(alertsUser99[0].isRead).toBe(true);
  });
});
