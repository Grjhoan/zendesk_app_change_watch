import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Label, Textarea } from '@zendeskgarden/react-forms';
import { Spinner } from '@zendeskgarden/react-loaders';
import { Drawer } from '@zendeskgarden/react-modals';
import { Alert } from '@zendeskgarden/react-notifications';
import { Tag } from '@zendeskgarden/react-tags';
import { Code, MD, SM, Span } from '@zendeskgarden/react-typography';
import type { I18nInstance } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import type {
  ApiErrorInfo,
  ClarificationReply,
  ClarificationThread,
  ClassifiedAuditEvent,
  ZafUser
} from '../types/zendesk';
import { ErrorBanner } from './ErrorBanner';

type ClarificationView = 'pending' | 'requested' | 'resolved' | 'all';

interface ClarificationsTabProps {
  threads: ClarificationThread[];
  currentUser: ZafUser;
  eventsById: Map<string, ClassifiedAuditEvent>;
  selectedThread: ClarificationThread | null;
  replies: ClarificationReply[];
  repliesLoading: boolean;
  error: ApiErrorInfo | null;
  onSelectThread: (thread: ClarificationThread | null) => void;
  onPostReply: (thread: ClarificationThread, body: string) => Promise<void>;
  onResolveThread: (thread: ClarificationThread) => Promise<void>;
  onInspectEvent: (event: ClassifiedAuditEvent) => void;
  i18n: I18nInstance;
}

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${(p) => p.theme.space.md};
  flex-wrap: wrap;
  gap: ${(p) => p.theme.space.sm};
`;

const ThreadList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.theme.space.sm};
`;

const ThreadCard = styled.div`
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  padding: ${(p) => p.theme.space.sm} ${(p) => p.theme.space.md};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${(p) => p.theme.space.md};
  background: ${(p) => p.theme.palette.white};
`;

const ThreadMeta = styled.div`
  display: flex;
  gap: ${(p) => p.theme.space.xs};
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: ${(p) => p.theme.space.xxs};
`;

const ThreadQuestion = styled.div`
  margin: ${(p) => p.theme.space.xs} 0;
  font-size: ${(p) => p.theme.fontSizes.md};
`;

const SubMeta = styled.div`
  display: flex;
  gap: ${(p) => p.theme.space.sm};
  flex-wrap: wrap;
  color: ${(p) => p.theme.palette.grey[600]};
  font-size: ${(p) => p.theme.fontSizes.sm};
`;

const EmptyBox = styled.div`
  padding: ${(p) => p.theme.space.lg};
  border: 1px dashed ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  text-align: center;
  color: ${(p) => p.theme.palette.grey[600]};
`;

const EventSnapshot = styled.div`
  padding: ${(p) => p.theme.space.sm};
  background: ${(p) => p.theme.palette.grey[100]};
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  margin-bottom: ${(p) => p.theme.space.md};
`;

const QuestionBlock = styled.div`
  padding: ${(p) => p.theme.space.sm};
  border-left: 3px solid ${(p) => p.theme.palette.blue[600]};
  background: ${(p) => p.theme.palette.blue[100]};
  border-radius: 0 ${(p) => p.theme.borderRadii.sm} ${(p) => p.theme.borderRadii.sm} 0;
  margin-bottom: ${(p) => p.theme.space.md};
`;

const ReplyItem = styled.div`
  border: 1px solid ${(p) => p.theme.palette.grey[200]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  padding: ${(p) => p.theme.space.sm};
  margin-top: ${(p) => p.theme.space.xs};
`;

const ReplyHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${(p) => p.theme.space.sm};
  margin-bottom: ${(p) => p.theme.space.xxs};
`;

const ReplyForm = styled.form`
  margin-top: ${(p) => p.theme.space.md};
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.theme.space.sm};
`;

export const ClarificationsTab: React.FC<ClarificationsTabProps> = ({
  threads,
  currentUser,
  eventsById,
  selectedThread,
  replies,
  repliesLoading,
  error,
  onSelectThread,
  onPostReply,
  onResolveThread,
  onInspectEvent,
  i18n
}) => {
  const [view, setView] = useState<ClarificationView>('pending');
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const currentUserId = String(currentUser.id);

  const pendingForMe = useMemo(
    () => threads.filter((t) => t.status === 'open' && t.recipientUserId === currentUserId),
    [threads, currentUserId]
  );

  const visibleThreads = useMemo(() => {
    switch (view) {
      case 'pending':
        return pendingForMe;
      case 'requested':
        return threads.filter((t) => t.requesterUserId === currentUserId);
      case 'resolved':
        return threads.filter((t) => t.status === 'resolved');
      case 'all':
      default:
        return threads;
    }
  }, [view, threads, pendingForMe, currentUserId]);

  const emptyKey: MessageKey =
    view === 'pending'
      ? 'clarifications.emptyPending'
      : view === 'requested'
        ? 'clarifications.emptyRequested'
        : view === 'resolved'
          ? 'clarifications.emptyResolved'
          : 'clarifications.emptyAll';

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedThread || !replyBody.trim()) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onPostReply(selectedThread, replyBody.trim());
      setReplyBody('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve() {
    if (!selectedThread) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onResolveThread(selectedThread);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canResolve =
    Boolean(selectedThread) &&
    selectedThread!.status === 'open' &&
    selectedThread!.requesterUserId === currentUserId;

  const linkedEvent = selectedThread ? eventsById.get(selectedThread.auditEventId) : undefined;

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBanner error={error} context="custom_objects" i18n={i18n} />
        </div>
      )}

      <Toolbar>
        <div role="group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button
            size="small"
            isPrimary={view === 'pending'}
            aria-pressed={view === 'pending'}
            onClick={() => setView('pending')}
          >
            {i18n.t('clarifications.pendingForMe')} ({pendingForMe.length})
          </Button>
          <Button
            size="small"
            isPrimary={view === 'requested'}
            aria-pressed={view === 'requested'}
            onClick={() => setView('requested')}
          >
            {i18n.t('clarifications.requestedByMe')}
          </Button>
          <Button
            size="small"
            isPrimary={view === 'resolved'}
            aria-pressed={view === 'resolved'}
            onClick={() => setView('resolved')}
          >
            {i18n.t('clarifications.resolved')}
          </Button>
          <Button
            size="small"
            isPrimary={view === 'all'}
            aria-pressed={view === 'all'}
            onClick={() => setView('all')}
          >
            {i18n.t('clarifications.all')}
          </Button>
        </div>
      </Toolbar>

      {visibleThreads.length === 0 ? (
        <EmptyBox>{i18n.t(emptyKey)}</EmptyBox>
      ) : (
        <ThreadList>
          {visibleThreads.map((thread) => (
            <ThreadCard key={thread.recordId}>
              <div style={{ flex: 1 }}>
                <ThreadMeta>
                  <Tag
                    size="small"
                    hue={thread.status === 'resolved' ? 'green' : 'yellow'}
                  >
                    <span>
                      {thread.status === 'resolved'
                        ? i18n.t('clarifications.statusResolved')
                        : i18n.t('clarifications.statusOpen')}
                    </span>
                  </Tag>
                  <Tag size="small" hue="kale">
                    <span>
                      {i18n.t(`modules.${thread.eventModule}` as MessageKey)}
                    </span>
                  </Tag>
                  <Span isBold>{thread.eventSourceLabel}</Span>
                  <Code>{i18n.t('clarifications.eventRef', { id: thread.auditEventId })}</Code>
                </ThreadMeta>

                <ThreadQuestion>{thread.question}</ThreadQuestion>

                <SubMeta>
                  <span>{i18n.t('clarifications.askedBy', { name: thread.requesterName })}</span>
                  <span>
                    {i18n.t('clarifications.assignedTo', { name: thread.recipientName })}
                  </span>
                  <span>{i18n.formatDateTime(thread.lastActivityAt, 'short')}</span>
                </SubMeta>
              </div>
              <Button size="small" onClick={() => onSelectThread(thread)}>
                {i18n.t('clarifications.openThread')}
              </Button>
            </ThreadCard>
          ))}
        </ThreadList>
      )}

      <Drawer
        isOpen={Boolean(selectedThread)}
        onClose={() => {
          setActionError(null);
          setReplyBody('');
          onSelectThread(null);
        }}
        style={{ width: 540, maxWidth: '95vw' }}
      >
        <Drawer.Header tag="h2">{i18n.t('clarifications.threadTitle')}</Drawer.Header>
        <Drawer.Body>
          {selectedThread && (
            <>
              <EventSnapshot>
                <ThreadMeta>
                  <Tag
                    size="small"
                    hue={selectedThread.status === 'resolved' ? 'green' : 'yellow'}
                  >
                    <span>
                      {selectedThread.status === 'resolved'
                        ? i18n.t('clarifications.statusResolved')
                        : i18n.t('clarifications.statusOpen')}
                    </span>
                  </Tag>
                  <Tag size="small" hue="kale">
                    <span>
                      {i18n.t(`modules.${selectedThread.eventModule}` as MessageKey)}
                    </span>
                  </Tag>
                  <Code>
                    {i18n.t('clarifications.eventRef', { id: selectedThread.auditEventId })}
                  </Code>
                </ThreadMeta>
                <MD isBold>{selectedThread.eventSourceLabel}</MD>
                {selectedThread.eventSummary && <SM>{selectedThread.eventSummary}</SM>}
                {linkedEvent && (
                  <div style={{ marginTop: 8 }}>
                    <Button size="small" isBasic onClick={() => onInspectEvent(linkedEvent)}>
                      {i18n.t('clarifications.viewEvent')}
                    </Button>
                  </div>
                )}
              </EventSnapshot>

              <QuestionBlock>
                <SubMeta style={{ marginBottom: 4 }}>
                  <Span isBold>
                    {i18n.t('clarifications.askedBy', { name: selectedThread.requesterName })}
                  </Span>
                  <span>
                    {i18n.t('clarifications.assignedTo', { name: selectedThread.recipientName })}
                  </span>
                </SubMeta>
                <div>{selectedThread.question}</div>
              </QuestionBlock>

              {selectedThread.status === 'resolved' && selectedThread.resolvedAt && (
                <div style={{ marginBottom: 12 }}>
                  <Alert type="success">
                    {i18n.t('clarifications.resolvedNotice', {
                      time: i18n.formatDateTime(selectedThread.resolvedAt, 'full')
                    })}
                  </Alert>
                </div>
              )}

              {actionError && (
                <div style={{ marginBottom: 12 }}>
                  <Alert type="error">{actionError}</Alert>
                </div>
              )}

              <MD isBold>
                {i18n.t('clarifications.repliesHeading', { count: replies.length })}
              </MD>

              {repliesLoading ? (
                <div style={{ padding: 16 }}>
                  <Spinner size="24" />
                </div>
              ) : replies.length === 0 ? (
                <SM style={{ marginTop: 6 }}>{i18n.t('clarifications.noReplies')}</SM>
              ) : (
                replies.map((reply) => (
                  <ReplyItem key={reply.recordId}>
                    <ReplyHeader>
                      <Span isBold>{reply.authorName}</Span>
                      <SM>{i18n.formatDateTime(reply.repliedAt, 'short')}</SM>
                    </ReplyHeader>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{reply.body}</div>
                  </ReplyItem>
                ))
              )}

              {selectedThread.status === 'open' && (
                <ReplyForm onSubmit={handleSendReply}>
                  <Field>
                    <Label>{i18n.t('clarifications.replyLabel')}</Label>
                    <Textarea
                      minRows={3}
                      placeholder={i18n.t('clarifications.replyPlaceholder')}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                  </Field>
                  <div>
                    <Button
                      size="small"
                      isPrimary
                      type="submit"
                      disabled={submitting || !replyBody.trim()}
                    >
                      {i18n.t('clarifications.sendReply')}
                    </Button>
                  </div>
                </ReplyForm>
              )}
            </>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.FooterItem>
            <Button isBasic onClick={() => onSelectThread(null)}>
              {i18n.t('detail.close')}
            </Button>
          </Drawer.FooterItem>
          {canResolve && (
            <Drawer.FooterItem>
              <Button isPrimary disabled={submitting} onClick={() => void handleResolve()}>
                {i18n.t('clarifications.markResolved')}
              </Button>
            </Drawer.FooterItem>
          )}
        </Drawer.Footer>
        <Drawer.Close aria-label={i18n.t('detail.close')} />
      </Drawer>
    </div>
  );
};
