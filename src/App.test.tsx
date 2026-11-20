import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_THEME, ThemeProvider } from '@zendeskgarden/react-theming';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import schemaDefinition from '../schema/custom-objects.json';
import type { ZafRequestOptions } from './services/zafClient';

function mockZafClient(options: {
  user: { id: number; name: string; email: string; role: string; locale: string };
  auditLogs?: unknown[];
  auditLogsStatus?: number;
  alertRules?: unknown[];
  readStates?: unknown[];
  threads?: unknown[];
  replies?: unknown[];
  staffUsers?: unknown[];
}) {
  const createdThreads: unknown[] = [...(options.threads ?? [])];
  const createdReplies: unknown[] = [...(options.replies ?? [])];

  const requestImpl = async <T = unknown,>(req: ZafRequestOptions): Promise<T> => {
    const method = (req.type ?? 'GET').toUpperCase();
    const url = req.url;

    if (url.startsWith('/api/v2/custom_objects.json') && method === 'GET') {
      return {
        custom_objects: schemaDefinition.objects.map((o) => ({ key: o.key }))
      } as T;
    }

    const fieldMatch = url.match(/^\/api\/v2\/custom_objects\/([^/]+)\/fields\.json/);
    if (fieldMatch && method === 'GET') {
      const def = schemaDefinition.objects.find((o) => o.key === fieldMatch[1]);
      return {
        custom_object_fields: (def?.fields ?? []).map((f) => ({ key: f.key }))
      } as T;
    }

    if (url.startsWith('/api/v2/audit_logs.json')) {
      if (options.auditLogsStatus && options.auditLogsStatus >= 400) {
        throw { status: options.auditLogsStatus, responseJSON: { error: 'Forbidden' } };
      }
      return {
        audit_logs: options.auditLogs ?? [],
        meta: { has_more: false }
      } as T;
    }

    if (url.startsWith('/api/v2/triggers.json')) {
      return { triggers: [{ id: 5001 }], meta: { has_more: false } } as T;
    }
    if (url.startsWith('/api/v2/automations.json')) {
      return { automations: [], meta: { has_more: false } } as T;
    }
    if (url.startsWith('/api/v2/views.json')) {
      return { views: [], meta: { has_more: false } } as T;
    }
    if (url.startsWith('/api/v2/macros.json')) {
      return { macros: [], meta: { has_more: false } } as T;
    }

    if (url.startsWith('/api/v2/users.json')) {
      return {
        users: options.staffUsers ?? [
          {
            id: 10,
            name: 'Admin One',
            email: 'admin1@example.com',
            role: 'admin',
            active: true,
            suspended: false,
            locale: 'en-US'
          },
          {
            id: 20,
            name: 'Agent Two',
            email: 'agent2@example.com',
            role: 'agent',
            active: true,
            suspended: false,
            locale: 'es-419'
          }
        ],
        meta: { has_more: false }
      } as T;
    }

    if (url.startsWith('/api/v2/custom_objects/cw_alert_rule/records.json') && method === 'GET') {
      return { custom_object_records: options.alertRules ?? [], meta: { has_more: false } } as T;
    }

    if (
      url.startsWith('/api/v2/custom_objects/cw_alert_read_state/records.json') &&
      method === 'GET'
    ) {
      return { custom_object_records: options.readStates ?? [], meta: { has_more: false } } as T;
    }

    if (
      url.startsWith('/api/v2/custom_objects/cw_clarification_thread/records.json') &&
      method === 'GET'
    ) {
      return { custom_object_records: createdThreads, meta: { has_more: false } } as T;
    }

    if (
      url.startsWith('/api/v2/custom_objects/cw_clarification_thread/records.json') &&
      method === 'POST'
    ) {
      const parsed = JSON.parse(typeof req.data === 'string' ? req.data : '{}');
      const rec = {
        id: 'thread-new-1',
        name: parsed.custom_object_record.name,
        custom_object_fields: parsed.custom_object_record.custom_object_fields
      };
      createdThreads.unshift(rec);
      return { custom_object_record: rec } as T;
    }

    if (
      url.startsWith('/api/v2/custom_objects/cw_clarification_reply/records.json') &&
      method === 'GET'
    ) {
      return { custom_object_records: createdReplies, meta: { has_more: false } } as T;
    }

    if (
      url.startsWith('/api/v2/custom_objects/cw_clarification_reply/records.json') &&
      method === 'POST'
    ) {
      const parsed = JSON.parse(typeof req.data === 'string' ? req.data : '{}');
      const rec = {
        id: 'reply-new-1',
        name: parsed.custom_object_record.name,
        custom_object_fields: parsed.custom_object_record.custom_object_fields
      };
      createdReplies.push(rec);
      return { custom_object_record: rec } as T;
    }

    return {} as T;
  };

  const request = vi.fn(requestImpl) as unknown as <T = unknown>(
    options: ZafRequestOptions
  ) => Promise<T>;

  window.ZAFClient = {
    init: () => ({
      get: vi.fn(async () => ({
        currentUser: options.user,
        'currentUser.locale': options.user.locale
      })),
      request,
      on: vi.fn(),
      off: vi.fn()
    })
  };

  return { request };
}

afterEach(() => {
  delete window.ZAFClient;
});

describe('Zendesk Change Watch App', () => {
  it('localizes UI using currentUser.locale and shows concise native 403 error without role checks', async () => {
    mockZafClient({
      user: {
        id: 20,
        name: 'Agent Two',
        email: 'agent2@example.com',
        role: 'agent',
        locale: 'es-419'
      },
      auditLogsStatus: 403
    });

    render(
      <ThemeProvider theme={DEFAULT_THEME}>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Actividad')).toBeInTheDocument();
    });
    expect(screen.getByText('Acceso denegado por los permisos de Zendesk')).toBeInTheDocument();
    expect(
      screen.getByText('Tus permisos de Zendesk no permiten leer los registros de auditoría.')
    ).toBeInTheDocument();
  });

  it('deduplicates unread alert count when multiple rules match one audit event and lets requester choose recipient for system events', async () => {
    mockZafClient({
      user: {
        id: 10,
        name: 'Admin One',
        email: 'admin1@example.com',
        role: 'admin',
        locale: 'en-US'
      },
      auditLogs: [
        {
          id: 777,
          action: 'update',
          actor_id: -1,
          actor_name: 'System',
          source_type: 'rule',
          source_id: 5001,
          source_label: 'System Billing Trigger',
          change_description: 'Updated condition',
          created_at: '2026-11-19T16:00:00Z'
        }
      ],
      alertRules: [
        {
          id: 'rule-1',
          name: 'Watch All Config',
          custom_object_fields: {
            owner_user_id: '10',
            module_key: 'all_config',
            action_key: 'any',
            enabled: true
          }
        },
        {
          id: 'rule-2',
          name: 'Watch Rules',
          custom_object_fields: {
            owner_user_id: '10',
            module_key: 'rules',
            action_key: 'update',
            enabled: true
          }
        }
      ]
    });

    render(
      <ThemeProvider theme={DEFAULT_THEME}>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('System Billing Trigger')).toBeInTheDocument();
    });

    // Unread count badge should be deduplicated to 1 even though 2 rules matched event #777
    const alertsTab = screen.getByRole('tab', { name: /My Alerts/i });
    expect(alertsTab).toHaveTextContent('1');

    // Clicking Ask for clarification on a System event prompts recipient selection
    fireEvent.click(screen.getByRole('button', { name: 'Ask for clarification' }));
    await waitFor(() => {
      expect(
        screen.getByText('System or inaccessible actor event — choose a staff recipient.')
      ).toBeInTheDocument();
    });
  });

  it('shows pending clarification for recipient and allows reply while reserving Mark Resolved for requester', async () => {
    mockZafClient({
      user: {
        id: 20,
        name: 'Agent Two',
        email: 'agent2@example.com',
        role: 'agent',
        locale: 'en-US'
      },
      threads: [
        {
          id: 'thread-1',
          name: 'Updated SLA (#888)',
          custom_object_fields: {
            audit_event_id: '888',
            event_module: 'sla',
            event_action: 'update',
            event_source_label: 'Enterprise SLA',
            event_summary: 'Target changed from 4h to 2h',
            event_created_at: '2026-11-19T15:00:00Z',
            requester_user_id: '10',
            requester_name: 'Admin One',
            recipient_user_id: '20',
            recipient_name: 'Agent Two',
            is_system_event: false,
            question: 'Was this SLA target change approved?',
            status: 'open',
            last_activity_at: '2026-11-19T15:10:00Z'
          }
        }
      ]
    });

    render(
      <ThemeProvider theme={DEFAULT_THEME}>
        <App />
      </ThemeProvider>
    );

    const clarificationsTab = await screen.findByRole('tab', { name: /Clarifications/i });
    expect(clarificationsTab).toHaveTextContent('1');

    fireEvent.click(clarificationsTab);
    expect(screen.getByText('Was this SLA target change approved?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View thread' }));
    await waitFor(() => {
      expect(screen.getByText('Clarification thread')).toBeInTheDocument();
    });

    // Recipient cannot mark resolved (only requester can)
    expect(screen.queryByRole('button', { name: 'Mark Resolved' })).not.toBeInTheDocument();

    // Recipient can post a reply
    fireEvent.change(screen.getByPlaceholderText('Write your explanation or follow-up...'), {
      target: { value: 'Approved in weekly ops review.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => {
      expect(screen.getByText('Approved in weekly ops review.')).toBeInTheDocument();
    });
  });

  it('paginates activity table to 10 records per page', async () => {
    const auditLogs = Array.from({ length: 14 }, (_, idx) => ({
      id: 1000 + idx,
      action: 'update',
      actor_id: 10,
      actor_name: 'Admin One',
      source_type: 'account_setting',
      source_label: `Config Item ${idx + 1}`,
      change_description: `Updated setting ${idx + 1}`,
      created_at: `2026-11-19T10:${String(idx).padStart(2, '0')}:00Z`
    }));

    mockZafClient({
      user: {
        id: 10,
        name: 'Admin One',
        email: 'admin1@example.com',
        role: 'admin',
        locale: 'en-US'
      },
      auditLogs
    });

    render(
      <ThemeProvider theme={DEFAULT_THEME}>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Config Item 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Config Item 10')).toBeInTheDocument();
    expect(screen.queryByText('Config Item 11')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1–10 of 14')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText('Config Item 11')).toBeInTheDocument();
    });
    expect(screen.getByText('Config Item 14')).toBeInTheDocument();
    expect(screen.queryByText('Config Item 1')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 11–14 of 14')).toBeInTheDocument();
  });
});
