import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Hint, Input, Label, Select, Textarea, Toggle } from '@zendeskgarden/react-forms';
import { Body, Close, Footer, FooterItem, Header, Modal } from '@zendeskgarden/react-modals';
import { Alert } from '@zendeskgarden/react-notifications';
import {
  Body as TableBody,
  Cell,
  Head,
  HeaderCell,
  HeaderRow,
  Row,
  Table
} from '@zendeskgarden/react-tables';
import { Tag } from '@zendeskgarden/react-tags';
import { MD, SM, Span } from '@zendeskgarden/react-typography';
import { getAvailableAlertActions, getAvailableAlertModules } from '../domain/classifier';
import type { I18nInstance } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import type {
  AlertRule,
  AlertRuleInput,
  ApiErrorInfo,
  AuditActionKey,
  ClassifiedAuditEvent,
  ConfigModuleKey,
  DeduplicatedAlertItem,
  VerifiedPayloadCapabilities
} from '../types/zendesk';
import { actionTagHue } from './ActivityTab';
import { ErrorBanner } from './ErrorBanner';

interface AlertsTabProps {
  rules: AlertRule[];
  matchedAlerts: DeduplicatedAlertItem[];
  unreadCount: number;
  capabilities: VerifiedPayloadCapabilities;
  error: ApiErrorInfo | null;
  busy: boolean;
  onCreateRule: (input: AlertRuleInput) => Promise<void>;
  onUpdateRule: (recordId: string, input: Partial<AlertRuleInput>) => Promise<void>;
  onDeleteRule: (recordId: string) => Promise<void>;
  onMarkRead: (eventId: string) => Promise<void>;
  onMarkUnread: (readRecordId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onSelectEvent: (event: ClassifiedAuditEvent) => void;
  onAskClarification: (event: ClassifiedAuditEvent) => void;
  i18n: I18nInstance;
}

const Section = styled.section`
  margin-bottom: ${(p) => p.theme.space.lg};
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${(p) => p.theme.space.sm};
  margin-bottom: ${(p) => p.theme.space.sm};
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${(p) => p.theme.space.xs};
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const InlineActions = styled.div`
  display: flex;
  gap: ${(p) => p.theme.space.xs};
  white-space: nowrap;
`;

const EmptyBox = styled.div`
  padding: ${(p) => p.theme.space.md};
  border: 1px dashed ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  color: ${(p) => p.theme.palette.grey[600]};
`;

const FormStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.theme.space.md};
`;

const UnreadRow = styled(Row)<{ $unread?: boolean }>`
  background-color: ${(p) => (p.$unread ? p.theme.palette.blue[100] : 'transparent')};
`;

export const AlertsTab: React.FC<AlertsTabProps> = ({
  rules,
  matchedAlerts,
  unreadCount,
  capabilities,
  error,
  busy,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onSelectEvent,
  onAskClarification,
  i18n
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [name, setName] = useState('');
  const [moduleKey, setModuleKey] = useState<ConfigModuleKey>('all_config');
  const [actionKey, setActionKey] = useState<AuditActionKey>('any');
  const [notes, setNotes] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const availableModules = getAvailableAlertModules(capabilities);
  const availableActions = getAvailableAlertActions(moduleKey, capabilities);

  const anyUnverified =
    !capabilities.triggerEdits || !capabilities.userDeletions || !capabilities.roleChanges;

  useEffect(() => {
    if (!availableActions.includes(actionKey)) {
      setActionKey('any');
    }
  }, [availableActions, actionKey]);

  function openCreateModal() {
    setEditingRule(null);
    setName('');
    setModuleKey('all_config');
    setActionKey('any');
    setNotes('');
    setEnabled(true);
    setModalOpen(true);
  }

  function openEditModal(rule: AlertRule) {
    setEditingRule(rule);
    setName(rule.name);
    setModuleKey(availableModules.includes(rule.moduleKey) ? rule.moduleKey : 'all_config');
    setActionKey(rule.actionKey);
    setNotes(rule.notes);
    setEnabled(rule.enabled);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: AlertRuleInput = {
        name: name.trim(),
        moduleKey,
        actionKey,
        enabled,
        notes: notes.trim()
      };
      if (editingRule) {
        await onUpdateRule(editingRule.recordId, payload);
      } else {
        await onCreateRule(payload);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBanner error={error} context="custom_objects" i18n={i18n} />
        </div>
      )}

      <Section>
        <SectionHeader>
          <HeaderLeft>
            <MD isBold>{i18n.t('alerts.matchingTitle')}</MD>
            <Tag size="small" hue={unreadCount > 0 ? 'red' : 'green'}>
              <span>
                {unreadCount > 0
                  ? i18n.t('alerts.unreadCount', { count: unreadCount })
                  : i18n.t('alerts.allRead')}
              </span>
            </Tag>
          </HeaderLeft>
          {unreadCount > 0 && (
            <Button size="small" disabled={busy} onClick={() => void onMarkAllRead()}>
              {i18n.t('alerts.markAllRead')}
            </Button>
          )}
        </SectionHeader>

        {matchedAlerts.length === 0 ? (
          <EmptyBox>{i18n.t('alerts.noMatches')}</EmptyBox>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table size="small">
              <Head>
                <HeaderRow>
                  <HeaderCell width="90px">{i18n.t('alerts.colStatus')}</HeaderCell>
                  <HeaderCell>{i18n.t('activity.colChange')}</HeaderCell>
                  <HeaderCell width="180px">{i18n.t('alerts.matchedRules')}</HeaderCell>
                  <HeaderCell width="150px">{i18n.t('activity.colWhen')}</HeaderCell>
                  <HeaderCell width="260px">{i18n.t('activity.colControls')}</HeaderCell>
                </HeaderRow>
              </Head>
              <TableBody>
                {matchedAlerts.map((item) => (
                  <UnreadRow key={item.event.id} $unread={!item.isRead}>
                    <Cell>
                      <Tag size="small" hue={item.isRead ? 'grey' : 'blue'}>
                        <span>
                          {item.isRead
                            ? i18n.t('alerts.readBadge')
                            : i18n.t('alerts.unreadBadge')}
                        </span>
                      </Tag>
                    </Cell>
                    <Cell>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag size="small" hue="kale">
                          <span>{i18n.t(`modules.${item.event.moduleKey}` as MessageKey)}</span>
                        </Tag>
                        <Tag size="small" hue={actionTagHue(item.event.actionKey)}>
                          <span>{i18n.t(`actions.${item.event.actionKey}` as MessageKey)}</span>
                        </Tag>
                        <Span isBold>{item.event.sourceLabel}</Span>
                      </div>
                      {item.event.changeDescription && (
                        <SM>{item.event.changeDescription.slice(0, 140)}</SM>
                      )}
                    </Cell>
                    <Cell>
                      <TagList>
                        {item.matchedRules.map((rule) => (
                          <Tag key={rule.recordId} size="small">
                            <span>{rule.name}</span>
                          </Tag>
                        ))}
                      </TagList>
                    </Cell>
                    <Cell>{i18n.formatDateTime(item.event.createdAt, 'short')}</Cell>
                    <Cell>
                      <InlineActions>
                        {item.isRead && item.readRecordId ? (
                          <Button
                            size="small"
                            isBasic
                            disabled={busy}
                            onClick={() => void onMarkUnread(item.readRecordId!)}
                          >
                            {i18n.t('alerts.markUnread')}
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            isBasic
                            disabled={busy}
                            onClick={() => void onMarkRead(item.event.id)}
                          >
                            {i18n.t('alerts.markRead')}
                          </Button>
                        )}
                        <Button size="small" isBasic onClick={() => onSelectEvent(item.event)}>
                          {i18n.t('activity.details')}
                        </Button>
                        <Button size="small" onClick={() => onAskClarification(item.event)}>
                          {i18n.t('activity.askClarification')}
                        </Button>
                      </InlineActions>
                    </Cell>
                  </UnreadRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section>
        <SectionHeader>
          <MD isBold>{i18n.t('alerts.rulesTitle')}</MD>
          <Button size="small" isPrimary onClick={openCreateModal}>
            {i18n.t('alerts.newRule')}
          </Button>
        </SectionHeader>

        {rules.length === 0 ? (
          <EmptyBox>{i18n.t('alerts.noRules')}</EmptyBox>
        ) : (
          <Table size="small">
            <Head>
              <HeaderRow>
                <HeaderCell>{i18n.t('alerts.fieldName')}</HeaderCell>
                <HeaderCell width="170px">{i18n.t('alerts.fieldModule')}</HeaderCell>
                <HeaderCell width="140px">{i18n.t('alerts.fieldAction')}</HeaderCell>
                <HeaderCell width="130px">{i18n.t('alerts.ruleEnabled')}</HeaderCell>
                <HeaderCell width="150px">{i18n.t('activity.colControls')}</HeaderCell>
              </HeaderRow>
            </Head>
            <TableBody>
              {rules.map((rule) => (
                <Row key={rule.recordId}>
                  <Cell>
                    <Span isBold>{rule.name}</Span>
                    {rule.notes && <SM>{rule.notes}</SM>}
                  </Cell>
                  <Cell>
                    <Tag size="small" hue="kale">
                      <span>{i18n.t(`modules.${rule.moduleKey}` as MessageKey)}</span>
                    </Tag>
                  </Cell>
                  <Cell>
                    <Tag size="small">
                      <span>{i18n.t(`actions.${rule.actionKey}` as MessageKey)}</span>
                    </Tag>
                  </Cell>
                  <Cell>
                    <Field>
                      <Toggle
                        checked={rule.enabled}
                        disabled={busy}
                        onChange={(e) =>
                          void onUpdateRule(rule.recordId, { enabled: e.target.checked })
                        }
                      >
                        <Label hidden>
                          {rule.enabled
                            ? i18n.t('alerts.ruleEnabled')
                            : i18n.t('alerts.ruleDisabled')}
                        </Label>
                      </Toggle>
                    </Field>
                  </Cell>
                  <Cell>
                    <InlineActions>
                      <Button size="small" isBasic onClick={() => openEditModal(rule)}>
                        {i18n.t('alerts.editRule')}
                      </Button>
                      <Button
                        size="small"
                        isDanger
                        isBasic
                        disabled={busy}
                        onClick={() => void onDeleteRule(rule.recordId)}
                      >
                        {i18n.t('alerts.deleteRule')}
                      </Button>
                    </InlineActions>
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <Header tag="h2">
            {editingRule
              ? i18n.t('alerts.modalEditTitle')
              : i18n.t('alerts.modalCreateTitle')}
          </Header>
          <form onSubmit={handleSave}>
            <Body>
              <FormStack>
                <Field>
                  <Label>{i18n.t('alerts.fieldName')}</Label>
                  <Input
                    required
                    placeholder={i18n.t('alerts.fieldNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{i18n.t('alerts.fieldModule')}</Label>
                  <Select
                    value={moduleKey}
                    onChange={(e) => setModuleKey(e.target.value as ConfigModuleKey)}
                  >
                    {availableModules.map((key) => (
                      <option key={key} value={key}>
                        {i18n.t(`modules.${key}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field>
                  <Label>{i18n.t('alerts.fieldAction')}</Label>
                  <Select
                    value={actionKey}
                    onChange={(e) => setActionKey(e.target.value as AuditActionKey)}
                  >
                    {availableActions.map((key) => (
                      <option key={key} value={key}>
                        {i18n.t(`actions.${key}` as MessageKey)}
                      </option>
                    ))}
                  </Select>
                </Field>

                {anyUnverified && (
                  <Alert type="info">
                    <Hint style={{ margin: 0 }}>{i18n.t('alerts.unverifiedHint')}</Hint>
                  </Alert>
                )}

                <Field>
                  <Label>{i18n.t('alerts.fieldNotes')}</Label>
                  <Textarea
                    minRows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>

                <Field>
                  <Toggle
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  >
                    <Label>{i18n.t('alerts.fieldEnabled')}</Label>
                  </Toggle>
                </Field>
              </FormStack>
            </Body>
            <Footer>
              <FooterItem>
                <Button isBasic type="button" onClick={() => setModalOpen(false)}>
                  {i18n.t('alerts.cancel')}
                </Button>
              </FooterItem>
              <FooterItem>
                <Button isPrimary type="submit" disabled={saving || !name.trim()}>
                  {i18n.t('alerts.save')}
                </Button>
              </FooterItem>
            </Footer>
          </form>
          <Close aria-label={i18n.t('alerts.cancel')} />
        </Modal>
      )}
    </div>
  );
};
