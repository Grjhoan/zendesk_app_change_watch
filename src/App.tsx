import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Spinner } from '@zendeskgarden/react-loaders';
import { Alert, Title } from '@zendeskgarden/react-notifications';
import { Tab, TabList, TabPanel, Tabs } from '@zendeskgarden/react-tabs';
import { Tag } from '@zendeskgarden/react-tags';
import { SM, XL } from '@zendeskgarden/react-typography';
import { ActivityTab, type ActivityFilters } from './components/ActivityTab';
import { AlertsTab } from './components/AlertsTab';
import { AskClarificationModal } from './components/AskClarificationModal';
import { ClarificationsTab } from './components/ClarificationsTab';
import { DiagnosticsDrawer } from './components/DiagnosticsDrawer';
import { EventDetailDrawer } from './components/EventDetailDrawer';
import {
  createEmptyRuleCatalog,
  evaluateAlertsForUser,
  validateLivePayloads
} from './domain/classifier';
import { DEFAULT_VERIFIED_CAPABILITIES } from './domain/verifiedCapabilities';
import { createI18n } from './i18n';
import {
  getCurrentZafUser,
  initZafClient,
  normalizeZafError,
  type ZafClientLike
} from './services/zafClient';
import {
  createAlertRule,
  createClarificationReply,
  createClarificationThread,
  deleteAlertRule,
  ensureCustomObjectsSchema,
  fetchAuditLogs,
  fetchRuleCatalog,
  fetchStaffUsers,
  fetchUserById,
  inspectCustomObjectsSchema,
  listClarificationReplies,
  listClarificationThreads,
  listUserAlertRules,
  listUserReadStates,
  markAuditEventRead,
  markAuditEventUnread,
  resolveClarificationThread,
  runLiveDiagnostics,
  updateAlertRule
} from './services/zendeskApi';
import type {
  AlertRule,
  AlertRuleInput,
  ApiErrorInfo,
  ClarificationReply,
  ClarificationThread,
  ClassifiedAuditEvent,
  LiveDiagnosticReport,
  ReadStateRecord,
  RuleCatalogIndex,
  SchemaInspectionResult,
  VerifiedPayloadCapabilities,
  ZafUser,
  ZendeskStaffUser
} from './types/zendesk';

const AUTO_REFRESH_INTERVAL_MS = 45_000;

const Shell = styled.div`
  min-height: 100vh;
  padding: ${(p) => p.theme.space.md} ${(p) => p.theme.space.lg};
  background: ${(p) => p.theme.palette.white};
  color: ${(p) => p.theme.palette.grey[800]};
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif;
  box-sizing: border-box;
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${(p) => p.theme.space.xs};
  flex-wrap: wrap;
`;

const Byline = styled(SM)`
  color: ${(p) => p.theme.palette.grey[600]};
`;

const TopBar = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${(p) => p.theme.space.md};
  margin-bottom: ${(p) => p.theme.space.md};
  flex-wrap: wrap;
`;

const TopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${(p) => p.theme.space.xs};
  flex-wrap: wrap;
`;

const CenterState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${(p) => p.theme.space.sm};
  min-height: 50vh;
`;

const TabLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

export const App: React.FC = () => {
  const clientRef = useRef<ZafClientLike | null>(null);
  const isVisibleRef = useRef<boolean>(true);
  const catalogRef = useRef<RuleCatalogIndex>(createEmptyRuleCatalog());

  const [booting, setBooting] = useState(true);
  const [zafMissing, setZafMissing] = useState(false);
  const [currentUser, setCurrentUser] = useState<ZafUser | null>(null);
  const [selectedTab, setSelectedTab] = useState<'activity' | 'alerts' | 'clarifications'>('activity');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Activity state
  const [events, setEvents] = useState<ClassifiedAuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [afterCursor, setAfterCursor] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [auditError, setAuditError] = useState<ApiErrorInfo | null>(null);
  const [filters, setFilters] = useState<ActivityFilters>({
    moduleKey: 'all',
    actionKey: 'all',
    actorId: 'all',
    dateFrom: '',
    dateTo: ''
  });

  // Staff & Custom Objects state
  const [staffUsers, setStaffUsers] = useState<ZendeskStaffUser[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [readStates, setReadStates] = useState<ReadStateRecord[]>([]);
  const [threads, setThreads] = useState<ClarificationThread[]>([]);
  const [customObjectsError, setCustomObjectsError] = useState<ApiErrorInfo | null>(null);
  const [alertsBusy, setAlertsBusy] = useState(false);

  // Selection / modals / drawers
  const [selectedEvent, setSelectedEvent] = useState<ClassifiedAuditEvent | null>(null);
  const [askEvent, setAskEvent] = useState<ClassifiedAuditEvent | null>(null);
  const [selectedThread, setSelectedThread] = useState<ClarificationThread | null>(null);
  const [threadReplies, setThreadReplies] = useState<ClarificationReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  // Schema & live payload verification
  const [schemaStatus, setSchemaStatus] = useState<SchemaInspectionResult | null>(null);
  const [capabilities, setCapabilities] = useState<VerifiedPayloadCapabilities>(
    DEFAULT_VERIFIED_CAPABILITIES
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<LiveDiagnosticReport | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<ApiErrorInfo | null>(null);

  const i18n = useMemo(() => createI18n(currentUser?.locale), [currentUser?.locale]);

  const eventsById = useMemo(() => {
    const map = new Map<string, ClassifiedAuditEvent>();
    for (const ev of events) {
      map.set(ev.id, ev);
    }
    return map;
  }, [events]);

  const matchedAlerts = useMemo(() => {
    if (!currentUser) return [];
    return evaluateAlertsForUser(String(currentUser.id), events, rules, readStates);
  }, [currentUser, events, rules, readStates]);

  const unreadCount = useMemo(
    () => matchedAlerts.filter((item) => !item.isRead).length,
    [matchedAlerts]
  );

  const pendingForMeCount = useMemo(() => {
    if (!currentUser) return 0;
    const myId = String(currentUser.id);
    return threads.filter((t) => t.status === 'open' && t.recipientUserId === myId).length;
  }, [threads, currentUser]);

  const refreshCustomObjectsData = useCallback(async (client: ZafClientLike, userId: string) => {
    try {
      const [userRules, userReads, allThreads] = await Promise.all([
        listUserAlertRules(client, userId),
        listUserReadStates(client, userId),
        listClarificationThreads(client)
      ]);
      setRules(userRules);
      setReadStates(userReads);
      setThreads(allThreads);
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    }
  }, []);

  const refreshActivity = useCallback(
    async (client: ZafClientLike, activeFilters: ActivityFilters, showSpinner = false) => {
      if (showSpinner) setActivityLoading(true);
      try {
        const result = await fetchAuditLogs(client, catalogRef.current, {
          pageSize: 100,
          actorId: activeFilters.actorId,
          action: activeFilters.actionKey,
          dateFrom: activeFilters.dateFrom,
          dateTo: activeFilters.dateTo
        });
        setEvents(result.events);
        setHasMore(result.hasMore);
        setAfterCursor(result.afterCursor);
        setAuditError(null);

        // Update runtime payload validation capabilities when real payloads match
        const liveValidation = validateLivePayloads(result.rawLogs, catalogRef.current);
        setCapabilities((prev) => ({
          triggerEdits: prev.triggerEdits || liveValidation.capabilities.triggerEdits,
          userDeletions: prev.userDeletions || liveValidation.capabilities.userDeletions,
          roleChanges: prev.roleChanges || liveValidation.capabilities.roleChanges
        }));
      } catch (err) {
        setAuditError(normalizeZafError(err));
      } finally {
        if (showSpinner) setActivityLoading(false);
      }
    },
    []
  );

  const refreshAll = useCallback(
    async (showSpinner = false) => {
      const client = clientRef.current;
      if (!client || !currentUser) return;
      await Promise.all([
        refreshActivity(client, filters, showSpinner),
        refreshCustomObjectsData(client, String(currentUser.id))
      ]);
      setLastUpdated(new Date());
    },
    [currentUser, filters, refreshActivity, refreshCustomObjectsData]
  );

  // Initial ZAF boot
  useEffect(() => {
    let mounted = true;
    const client = initZafClient();
    if (!client) {
      setZafMissing(true);
      setBooting(false);
      return;
    }
    clientRef.current = client;

    async function boot() {
      try {
        const user = await getCurrentZafUser(client!);
        if (!mounted) return;
        setCurrentUser(user);

        const [catalog, users, schema] = await Promise.all([
          fetchRuleCatalog(client!),
          fetchStaffUsers(client!).catch(() => [] as ZendeskStaffUser[]),
          inspectCustomObjectsSchema(client!)
        ]);
        if (!mounted) return;

        catalogRef.current = catalog;
        setStaffUsers(users);
        setSchemaStatus(schema);

        await Promise.all([
          refreshActivity(client!, filters, true),
          schema.ready
            ? refreshCustomObjectsData(client!, String(user.id))
            : Promise.resolve()
        ]);
        if (mounted) {
          setLastUpdated(new Date());
        }
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    }

    void boot();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when server-backed filters change after boot
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !currentUser || booting) return;
    void refreshActivity(client, filters, true);
  }, [filters.actorId, filters.actionKey, filters.dateFrom, filters.dateTo, currentUser, booting, refreshActivity]);

  // Refresh on open (`pane.activated`), on visibility return, and periodically while visible
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !currentUser) return;

    const handlePaneActivated = () => {
      isVisibleRef.current = true;
      void refreshAll(false);
    };

    const handlePaneDeactivated = () => {
      isVisibleRef.current = false;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        isVisibleRef.current = true;
        void refreshAll(false);
      } else {
        isVisibleRef.current = false;
      }
    };

    client.on('pane.activated', handlePaneActivated);
    client.on('pane.deactivated', handlePaneDeactivated);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (isVisibleRef.current && document.visibilityState === 'visible') {
        void refreshAll(false);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      client.off?.('pane.activated', handlePaneActivated);
      client.off?.('pane.deactivated', handlePaneDeactivated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentUser, refreshAll]);

  // Load replies when a thread is selected
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !selectedThread) {
      setThreadReplies([]);
      return;
    }
    let active = true;
    setRepliesLoading(true);
    listClarificationReplies(client, selectedThread.recordId)
      .then((res) => {
        if (active) setThreadReplies(res);
      })
      .catch((err) => {
        if (active) setCustomObjectsError(normalizeZafError(err));
      })
      .finally(() => {
        if (active) setRepliesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedThread]);

  async function handleLoadMore() {
    const client = clientRef.current;
    if (!client || !afterCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchAuditLogs(client, catalogRef.current, {
        pageSize: 100,
        afterCursor,
        actorId: filters.actorId,
        action: filters.actionKey,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      });
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const next = [...prev];
        for (const ev of res.events) {
          if (!seen.has(ev.id)) {
            next.push(ev);
          }
        }
        return next;
      });
      setHasMore(res.hasMore);
      setAfterCursor(res.afterCursor);
    } catch (err) {
      setAuditError(normalizeZafError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreateRule(input: AlertRuleInput) {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    setAlertsBusy(true);
    try {
      const created = await createAlertRule(client, String(currentUser.id), input);
      setRules((prev) => [created, ...prev]);
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  async function handleUpdateRule(recordId: string, input: Partial<AlertRuleInput>) {
    const client = clientRef.current;
    if (!client) return;
    setAlertsBusy(true);
    try {
      const updated = await updateAlertRule(client, recordId, input);
      setRules((prev) => prev.map((r) => (r.recordId === recordId ? updated : r)));
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  async function handleDeleteRule(recordId: string) {
    const client = clientRef.current;
    if (!client) return;
    setAlertsBusy(true);
    try {
      await deleteAlertRule(client, recordId);
      setRules((prev) => prev.filter((r) => r.recordId !== recordId));
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  async function handleMarkRead(eventId: string) {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    setAlertsBusy(true);
    try {
      const rec = await markAuditEventRead(client, String(currentUser.id), eventId);
      setReadStates((prev) => [...prev.filter((r) => r.auditEventId !== eventId), rec]);
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  async function handleMarkUnread(readRecordId: string) {
    const client = clientRef.current;
    if (!client) return;
    setAlertsBusy(true);
    try {
      await markAuditEventUnread(client, readRecordId);
      setReadStates((prev) => prev.filter((r) => r.recordId !== readRecordId));
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  async function handleMarkAllRead() {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    const unreadEvents = matchedAlerts.filter((item) => !item.isRead);
    if (unreadEvents.length === 0) return;

    setAlertsBusy(true);
    try {
      const created: ReadStateRecord[] = [];
      for (const item of unreadEvents) {
        const rec = await markAuditEventRead(client, String(currentUser.id), item.event.id);
        created.push(rec);
      }
      setReadStates((prev) => {
        const map = new Map(prev.map((r) => [r.auditEventId, r]));
        for (const rec of created) {
          map.set(rec.auditEventId, rec);
        }
        return Array.from(map.values());
      });
      setCustomObjectsError(null);
    } catch (err) {
      setCustomObjectsError(normalizeZafError(err));
    } finally {
      setAlertsBusy(false);
    }
  }

  const handleResolveActorAccess = useCallback(async (actorId: string) => {
    const client = clientRef.current;
    if (!client) return null;
    return fetchUserById(client, actorId);
  }, []);

  async function handleCreateClarification(payload: {
    event: ClassifiedAuditEvent;
    recipientUserId: string;
    recipientName: string;
    isSystemEvent: boolean;
    question: string;
  }) {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    const created = await createClarificationThread(client, {
      event: payload.event,
      requesterUserId: String(currentUser.id),
      requesterName: currentUser.name,
      recipientUserId: payload.recipientUserId,
      recipientName: payload.recipientName,
      isSystemEvent: payload.isSystemEvent,
      question: payload.question
    });
    setThreads((prev) => [created, ...prev]);
    setSelectedThread(created);
    setSelectedTab('clarifications');
  }

  async function handlePostReply(thread: ClarificationThread, body: string) {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    const created = await createClarificationReply(client, {
      threadRecordId: thread.recordId,
      auditEventId: thread.auditEventId,
      authorUserId: String(currentUser.id),
      authorName: currentUser.name,
      body
    });
    setThreadReplies((prev) => [...prev, created]);
    setThreads((prev) =>
      prev.map((t) =>
        t.recordId === thread.recordId ? { ...t, lastActivityAt: created.repliedAt } : t
      )
    );
  }

  async function handleResolveThread(thread: ClarificationThread) {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    const updated = await resolveClarificationThread(
      client,
      thread.recordId,
      String(currentUser.id)
    );
    setThreads((prev) => prev.map((t) => (t.recordId === thread.recordId ? updated : t)));
    setSelectedThread(updated);
  }

  async function handleRunSchemaSetup() {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    setSetupBusy(true);
    setSetupSuccess(false);
    setDiagnosticsError(null);
    try {
      const nextSchema = await ensureCustomObjectsSchema(client);
      setSchemaStatus(nextSchema);
      setSetupSuccess(nextSchema.ready);
      if (nextSchema.ready) {
        await refreshCustomObjectsData(client, String(currentUser.id));
      }
    } catch (err) {
      setDiagnosticsError(normalizeZafError(err));
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleRunVerification() {
    const client = clientRef.current;
    if (!client || !currentUser) return;
    setVerifyBusy(true);
    setDiagnosticsError(null);
    try {
      const catalog = await fetchRuleCatalog(client);
      catalogRef.current = catalog;
      const report = await runLiveDiagnostics(client, currentUser.locale, catalog);
      setDiagnosticReport(report);
      setSchemaStatus(report.schemaStatus);
      setCapabilities((prev) => ({
        triggerEdits: prev.triggerEdits || report.payloadValidation.capabilities.triggerEdits,
        userDeletions: prev.userDeletions || report.payloadValidation.capabilities.userDeletions,
        roleChanges: prev.roleChanges || report.payloadValidation.capabilities.roleChanges
      }));
    } catch (err) {
      setDiagnosticsError(normalizeZafError(err));
    } finally {
      setVerifyBusy(false);
    }
  }

  if (booting) {
    return (
      <Shell>
        <CenterState>
          <Spinner size="32" />
          <SM>{i18n.t('app.loading')}</SM>
        </CenterState>
      </Shell>
    );
  }

  if (zafMissing || !currentUser) {
    return (
      <Shell>
        <Alert type="warning">{i18n.t('app.zafUnavailable')}</Alert>
      </Shell>
    );
  }

  const linkedEventThreads = selectedEvent
    ? threads.filter((t) => t.auditEventId === selectedEvent.id)
    : [];

  return (
    <Shell>
      <TopBar>
        <TitleGroup>
          <XL tag="h1" isBold>
            {i18n.t('app.title')}
          </XL>
          <Byline tag="span">{i18n.t('app.byline')}</Byline>
        </TitleGroup>
        <TopBarRight>
          {lastUpdated && (
            <SM>{i18n.t('app.lastUpdated', { time: i18n.formatTimeOnly(lastUpdated) })}</SM>
          )}
          <Button size="small" onClick={() => void refreshAll(false)}>
            {i18n.t('app.refresh')}
          </Button>
          <Button size="small" isBasic onClick={() => setDiagnosticsOpen(true)}>
            {i18n.t('app.diagnostics')}
          </Button>
        </TopBarRight>
      </TopBar>

      {schemaStatus && !schemaStatus.ready && !schemaStatus.accessDenied && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="info">
            <Title>{i18n.t('errors.schemaBannerTitle')}</Title>
            <div>{i18n.t('errors.schemaBannerBody')}</div>
            <div style={{ marginTop: 8 }}>
              <Button size="small" isPrimary onClick={() => setDiagnosticsOpen(true)}>
                {i18n.t('errors.openSetup')}
              </Button>
            </div>
          </Alert>
        </div>
      )}

      <Tabs
        selectedItem={selectedTab}
        onChange={(item) => setSelectedTab(item as 'activity' | 'alerts' | 'clarifications')}
      >
        <TabList>
          <Tab item="activity">{i18n.t('tabs.activity')}</Tab>
          <Tab item="alerts">
            <TabLabel>
              <span>{i18n.t('tabs.alerts')}</span>
              {unreadCount > 0 && (
                <Tag size="small" hue="red">
                  <span>{unreadCount}</span>
                </Tag>
              )}
            </TabLabel>
          </Tab>
          <Tab item="clarifications">
            <TabLabel>
              <span>{i18n.t('tabs.clarifications')}</span>
              {pendingForMeCount > 0 && (
                <Tag size="small" hue="yellow">
                  <span>{pendingForMeCount}</span>
                </Tag>
              )}
            </TabLabel>
          </Tab>
        </TabList>

        <TabPanel item="activity">
          <ActivityTab
            events={events}
            staffUsers={staffUsers}
            filters={filters}
            onFiltersChange={setFilters}
            loading={activityLoading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => void handleLoadMore()}
            error={auditError}
            onSelectEvent={setSelectedEvent}
            onAskClarification={setAskEvent}
            i18n={i18n}
          />
        </TabPanel>

        <TabPanel item="alerts">
          <AlertsTab
            rules={rules}
            matchedAlerts={matchedAlerts}
            unreadCount={unreadCount}
            capabilities={capabilities}
            error={customObjectsError}
            busy={alertsBusy}
            onCreateRule={handleCreateRule}
            onUpdateRule={handleUpdateRule}
            onDeleteRule={handleDeleteRule}
            onMarkRead={handleMarkRead}
            onMarkUnread={handleMarkUnread}
            onMarkAllRead={handleMarkAllRead}
            onSelectEvent={setSelectedEvent}
            onAskClarification={setAskEvent}
            i18n={i18n}
          />
        </TabPanel>

        <TabPanel item="clarifications">
          <ClarificationsTab
            threads={threads}
            currentUser={currentUser}
            eventsById={eventsById}
            selectedThread={selectedThread}
            replies={threadReplies}
            repliesLoading={repliesLoading}
            error={customObjectsError}
            onSelectThread={setSelectedThread}
            onPostReply={handlePostReply}
            onResolveThread={handleResolveThread}
            onInspectEvent={setSelectedEvent}
            i18n={i18n}
          />
        </TabPanel>
      </Tabs>

      <EventDetailDrawer
        event={selectedEvent}
        linkedThreads={linkedEventThreads}
        onClose={() => setSelectedEvent(null)}
        onAskClarification={(ev) => {
          setSelectedEvent(null);
          setAskEvent(ev);
        }}
        onOpenThread={(thread) => {
          setSelectedEvent(null);
          setSelectedTab('clarifications');
          setSelectedThread(thread);
        }}
        i18n={i18n}
      />

      <AskClarificationModal
        event={askEvent}
        currentUser={currentUser}
        staffUsers={staffUsers}
        onResolveActorAccess={handleResolveActorAccess}
        onSubmit={handleCreateClarification}
        onClose={() => setAskEvent(null)}
        i18n={i18n}
      />

      <DiagnosticsDrawer
        isOpen={diagnosticsOpen}
        schemaStatus={schemaStatus}
        diagnosticReport={diagnosticReport}
        setupBusy={setupBusy}
        verifyBusy={verifyBusy}
        setupSuccess={setupSuccess}
        error={diagnosticsError}
        onClose={() => setDiagnosticsOpen(false)}
        onRunSchemaSetup={handleRunSchemaSetup}
        onRunVerification={handleRunVerification}
        i18n={i18n}
      />
    </Shell>
  );
};
