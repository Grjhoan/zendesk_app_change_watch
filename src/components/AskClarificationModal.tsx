import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Hint, Label, Select, Textarea } from '@zendeskgarden/react-forms';
import { Body, Close, Footer, FooterItem, Header, Modal } from '@zendeskgarden/react-modals';
import { Alert } from '@zendeskgarden/react-notifications';
import { Tag } from '@zendeskgarden/react-tags';
import { SM, Span } from '@zendeskgarden/react-typography';
import type { I18nInstance } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import type {
  ClassifiedAuditEvent,
  ZafUser,
  ZendeskStaffUser
} from '../types/zendesk';

interface AskClarificationModalProps {
  event: ClassifiedAuditEvent | null;
  currentUser: ZafUser;
  staffUsers: ZendeskStaffUser[];
  onResolveActorAccess: (actorId: string) => Promise<ZendeskStaffUser | null>;
  onSubmit: (payload: {
    event: ClassifiedAuditEvent;
    recipientUserId: string;
    recipientName: string;
    isSystemEvent: boolean;
    question: string;
  }) => Promise<void>;
  onClose: () => void;
  i18n: I18nInstance;
}

const ContextBox = styled.div`
  padding: ${(p) => p.theme.space.sm};
  background: ${(p) => p.theme.palette.grey[100]};
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.md};
  margin-bottom: ${(p) => p.theme.space.md};
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.theme.space.md};
`;

export const AskClarificationModal: React.FC<AskClarificationModalProps> = ({
  event,
  currentUser,
  staffUsers,
  onResolveActorAccess,
  onSubmit,
  onClose,
  i18n
}) => {
  const [question, setQuestion] = useState('');
  const [autoRecipient, setAutoRecipient] = useState<ZendeskStaffUser | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [needsPicker, setNeedsPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectableStaff = staffUsers.filter((u) => u.active && !u.suspended);

  useEffect(() => {
    let active = true;
    setQuestion('');
    setSubmitError(null);
    setAutoRecipient(null);
    setSelectedRecipientId('');
    setNeedsPicker(false);

    if (!event) {
      return;
    }

    async function determineRecipient() {
      if (!event) return;
      if (event.isSystemEvent || !event.actorId) {
        if (active) setNeedsPicker(true);
        return;
      }

      // Check local staff cache first, then fall back to user lookup
      const cached = staffUsers.find((u) => String(u.id) === event.actorId);
      const actor = cached ?? (await onResolveActorAccess(event.actorId));

      const canAccessApp =
        Boolean(actor) &&
        actor!.active &&
        !actor!.suspended &&
        (actor!.role === 'admin' || actor!.role === 'agent');

      if (!active) return;

      if (canAccessApp && actor) {
        setAutoRecipient(actor);
        setSelectedRecipientId(String(actor.id));
        setNeedsPicker(false);
      } else {
        setNeedsPicker(true);
      }
    }

    void determineRecipient();
    return () => {
      active = false;
    };
  }, [event, staffUsers, onResolveActorAccess]);

  if (!event) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !question.trim()) return;

    let recipientUserId = '';
    let recipientName = '';

    if (!needsPicker && autoRecipient) {
      recipientUserId = String(autoRecipient.id);
      recipientName = autoRecipient.name;
    } else {
      const picked = selectableStaff.find((u) => String(u.id) === selectedRecipientId);
      if (!picked) return;
      recipientUserId = String(picked.id);
      recipientName = picked.name;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        event,
        recipientUserId,
        recipientName,
        isSystemEvent: event.isSystemEvent || needsPicker,
        question: question.trim()
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    Boolean(question.trim()) && (Boolean(autoRecipient) || Boolean(selectedRecipientId));

  return (
    <Modal onClose={onClose}>
      <Header tag="h2">{i18n.t('clarifications.askTitle')}</Header>
      <form onSubmit={handleSubmit}>
        <Body>
          <ContextBox>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <Tag size="small" hue="kale">
                <span>{i18n.t(`modules.${event.moduleKey}` as MessageKey)}</span>
              </Tag>
              <Span isBold>{event.sourceLabel}</Span>
              <SM tag="span">({i18n.t('clarifications.eventRef', { id: event.id })})</SM>
            </div>
            {event.changeDescription && <SM>{event.changeDescription}</SM>}
          </ContextBox>

          <Stack>
            {submitError && <Alert type="error">{submitError}</Alert>}

            {!needsPicker && autoRecipient ? (
              <Field>
                <Label>{i18n.t('clarifications.recipientLabel')}</Label>
                <SM>
                  {i18n.t('clarifications.recipientAuto', {
                    name:
                      autoRecipient.id === currentUser.id
                        ? `${autoRecipient.name} (${autoRecipient.email})`
                        : autoRecipient.name
                  })}
                </SM>
              </Field>
            ) : (
              <Field>
                <Label>{i18n.t('clarifications.recipientLabel')}</Label>
                <Hint>{i18n.t('clarifications.recipientSelectHint')}</Hint>
                <Select
                  required
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                >
                  <option value="">{i18n.t('clarifications.recipientPlaceholder')}</option>
                  {selectableStaff.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field>
              <Label>{i18n.t('clarifications.questionLabel')}</Label>
              <Textarea
                required
                minRows={3}
                placeholder={i18n.t('clarifications.questionPlaceholder')}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </Field>
          </Stack>
        </Body>
        <Footer>
          <FooterItem>
            <Button isBasic type="button" onClick={onClose}>
              {i18n.t('clarifications.cancel')}
            </Button>
          </FooterItem>
          <FooterItem>
            <Button isPrimary type="submit" disabled={!canSubmit || submitting}>
              {i18n.t('clarifications.submitQuestion')}
            </Button>
          </FooterItem>
        </Footer>
      </form>
      <Close aria-label={i18n.t('clarifications.cancel')} />
    </Modal>
  );
};
