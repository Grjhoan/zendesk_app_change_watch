import React from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Drawer } from '@zendeskgarden/react-modals';
import { Tag } from '@zendeskgarden/react-tags';
import { Code, MD, SM } from '@zendeskgarden/react-typography';
import type { I18nInstance } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import type { ClarificationThread, ClassifiedAuditEvent } from '../types/zendesk';
import { actionTagHue } from './ActivityTab';

interface EventDetailDrawerProps {
  event: ClassifiedAuditEvent | null;
  linkedThreads: ClarificationThread[];
  onClose: () => void;
  onAskClarification: (event: ClassifiedAuditEvent) => void;
  onOpenThread: (thread: ClarificationThread) => void;
  i18n: I18nInstance;
}

const MetaGrid = styled.dl`
  display: grid;
  grid-template-columns: 140px 1fr;
  row-gap: ${(p) => p.theme.space.sm};
  column-gap: ${(p) => p.theme.space.md};
  margin: 0 0 ${(p) => p.theme.space.md};
`;

const MetaTerm = styled.dt`
  color: ${(p) => p.theme.palette.grey[600]};
  font-size: ${(p) => p.theme.fontSizes.sm};
  font-weight: ${(p) => p.theme.fontWeights.semibold};
`;

const MetaValue = styled.dd`
  margin: 0;
  font-size: ${(p) => p.theme.fontSizes.sm};
  word-break: break-word;
`;

const DescriptionBox = styled.pre`
  margin: ${(p) => p.theme.space.xs} 0 ${(p) => p.theme.space.md};
  padding: ${(p) => p.theme.space.sm};
  background: ${(p) => p.theme.palette.grey[100]};
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: ${(p) => p.theme.fontSizes.sm};
`;

const ThreadCard = styled.div`
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  padding: ${(p) => p.theme.space.sm};
  margin-top: ${(p) => p.theme.space.xs};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${(p) => p.theme.space.sm};
`;

export const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({
  event,
  linkedThreads,
  onClose,
  onAskClarification,
  onOpenThread,
  i18n
}) => {
  return (
    <Drawer isOpen={Boolean(event)} onClose={onClose} style={{ width: 520, maxWidth: '95vw' }}>
      <Drawer.Header tag="h2">{i18n.t('detail.title')}</Drawer.Header>
      <Drawer.Body>
        {event && (
          <>
            <MetaGrid>
              <MetaTerm>{i18n.t('detail.eventId')}</MetaTerm>
              <MetaValue>
                <Code>{event.id}</Code>
              </MetaValue>

              <MetaTerm>{i18n.t('detail.module')}</MetaTerm>
              <MetaValue>
                <Tag size="small" hue="kale">
                  <span>{i18n.t(`modules.${event.moduleKey}` as MessageKey)}</span>
                </Tag>
              </MetaValue>

              <MetaTerm>{i18n.t('detail.sourceType')}</MetaTerm>
              <MetaValue>
                <Code>{event.sourceType}</Code>
              </MetaValue>

              {event.ruleSubtype && (
                <>
                  <MetaTerm>{i18n.t('detail.ruleClassification')}</MetaTerm>
                  <MetaValue>
                    {i18n.t(`ruleSubtypes.${event.ruleSubtype}` as MessageKey)} (
                    {event.ruleClassificationSource})
                  </MetaValue>
                </>
              )}

              <MetaTerm>{i18n.t('detail.action')}</MetaTerm>
              <MetaValue>
                <Tag size="small" hue={actionTagHue(event.actionKey)}>
                  <span>{i18n.t(`actions.${event.actionKey}` as MessageKey)}</span>
                </Tag>
                {event.raw.action_label ? ` (${event.raw.action_label})` : ''}
              </MetaValue>

              <MetaTerm>{i18n.t('detail.target')}</MetaTerm>
              <MetaValue>
                {event.sourceLabel}
                {event.sourceId ? ` (#${event.sourceId})` : ''}
              </MetaValue>

              <MetaTerm>{i18n.t('detail.actor')}</MetaTerm>
              <MetaValue>
                {event.isSystemEvent
                  ? i18n.t('activity.systemActor')
                  : `${event.actorName}${event.actorId ? ` (#${event.actorId})` : ''}`}
              </MetaValue>

              <MetaTerm>{i18n.t('detail.when')}</MetaTerm>
              <MetaValue>{i18n.formatDateTime(event.createdAt, 'full')}</MetaValue>

              {event.ipAddress && (
                <>
                  <MetaTerm>{i18n.t('detail.ipAddress')}</MetaTerm>
                  <MetaValue>
                    <Code>{event.ipAddress}</Code>
                  </MetaValue>
                </>
              )}
            </MetaGrid>

            <MD isBold>{i18n.t('detail.changeDescription')}</MD>
            <DescriptionBox>
              {event.changeDescription || i18n.t('detail.noDescription')}
            </DescriptionBox>

            {linkedThreads.length > 0 && (
              <div>
                <MD isBold>
                  {i18n.t('detail.linkedThreads', { count: linkedThreads.length })}
                </MD>
                {linkedThreads.map((thread) => (
                  <ThreadCard key={thread.recordId}>
                    <div>
                      <Tag
                        size="small"
                        hue={thread.status === 'resolved' ? 'green' : 'yellow'}
                      >
                        <span>
                          {thread.status === 'resolved'
                            ? i18n.t('clarifications.statusResolved')
                            : i18n.t('clarifications.statusOpen')}
                        </span>
                      </Tag>{' '}
                      <SM tag="span">{thread.question}</SM>
                    </div>
                    <Button size="small" isBasic onClick={() => onOpenThread(thread)}>
                      {i18n.t('detail.openThread')}
                    </Button>
                  </ThreadCard>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer.Body>
      <Drawer.Footer>
        <Drawer.FooterItem>
          <Button isBasic onClick={onClose}>
            {i18n.t('detail.close')}
          </Button>
        </Drawer.FooterItem>
        {event && (
          <Drawer.FooterItem>
            <Button isPrimary onClick={() => onAskClarification(event)}>
              {i18n.t('activity.askClarification')}
            </Button>
          </Drawer.FooterItem>
        )}
      </Drawer.Footer>
      <Drawer.Close aria-label={i18n.t('detail.close')} />
    </Drawer>
  );
};
