import React, { useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Drawer } from '@zendeskgarden/react-modals';
import { Alert } from '@zendeskgarden/react-notifications';
import { Tag } from '@zendeskgarden/react-tags';
import { Code, MD, SM } from '@zendeskgarden/react-typography';
import type { I18nInstance } from '../i18n';
import type {
  ApiErrorInfo,
  LiveDiagnosticReport,
  SchemaInspectionResult
} from '../types/zendesk';
import { ErrorBanner } from './ErrorBanner';

interface DiagnosticsDrawerProps {
  isOpen: boolean;
  schemaStatus: SchemaInspectionResult | null;
  diagnosticReport: LiveDiagnosticReport | null;
  setupBusy: boolean;
  verifyBusy: boolean;
  setupSuccess: boolean;
  error: ApiErrorInfo | null;
  onClose: () => void;
  onRunSchemaSetup: () => Promise<void>;
  onRunVerification: () => Promise<void>;
  i18n: I18nInstance;
}

const Section = styled.section`
  margin-bottom: ${(p) => p.theme.space.lg};
`;

const StatusList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${(p) => p.theme.space.xs};
  margin: ${(p) => p.theme.space.sm} 0;
`;

const StatusRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${(p) => p.theme.space.sm};
  padding: ${(p) => p.theme.space.xs} ${(p) => p.theme.space.sm};
  border: 1px solid ${(p) => p.theme.palette.grey[200]};
  border-radius: ${(p) => p.theme.borderRadii.sm};
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${(p) => p.theme.space.xs};
  flex-wrap: wrap;
  margin-top: ${(p) => p.theme.space.sm};
`;

const JsonPreview = styled.pre`
  max-height: 220px;
  overflow: auto;
  padding: ${(p) => p.theme.space.sm};
  background: ${(p) => p.theme.palette.grey[100]};
  border: 1px solid ${(p) => p.theme.palette.grey[300]};
  border-radius: ${(p) => p.theme.borderRadii.sm};
  font-size: 11px;
`;

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({
  isOpen,
  schemaStatus,
  diagnosticReport,
  setupBusy,
  verifyBusy,
  setupSuccess,
  error,
  onClose,
  onRunSchemaSetup,
  onRunVerification,
  i18n
}) => {
  const [copied, setCopied] = useState(false);

  async function handleCopyJson() {
    if (!diagnosticReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticReport, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be restricted in iframe
    }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} style={{ width: 580, maxWidth: '95vw' }}>
      <Drawer.Header tag="h2">{i18n.t('diagnostics.title')}</Drawer.Header>
      <Drawer.Body>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorBanner error={error} context="custom_objects" i18n={i18n} />
          </div>
        )}

        {setupSuccess && (
          <div style={{ marginBottom: 12 }}>
            <Alert type="success">{i18n.t('diagnostics.setupSuccess')}</Alert>
          </div>
        )}

        <Section>
          <MD isBold>{i18n.t('diagnostics.schemaSection')}</MD>
          {schemaStatus && (
            <>
              <SM style={{ marginTop: 4 }}>
                {schemaStatus.ready
                  ? i18n.t('diagnostics.schemaReady')
                  : i18n.t('diagnostics.schemaMissing')}
              </SM>
              <StatusList>
                {schemaStatus.objects.map((obj) => (
                  <StatusRow key={obj.key}>
                    <Code>{obj.key}</Code>
                    <Tag
                      size="small"
                      hue={
                        obj.exists && obj.missingFields.length === 0
                          ? 'green'
                          : obj.exists
                            ? 'yellow'
                            : 'red'
                      }
                    >
                      <span>
                        {!obj.exists
                          ? i18n.t('diagnostics.objectMissing')
                          : obj.missingFields.length === 0
                            ? i18n.t('diagnostics.objectExists', {
                                existing: obj.existingFieldCount,
                                required: obj.requiredFieldCount
                              })
                            : i18n.t('diagnostics.objectIncomplete', {
                                fields: obj.missingFields.join(', ')
                              })}
                      </span>
                    </Tag>
                  </StatusRow>
                ))}
              </StatusList>
            </>
          )}
          <ActionRow>
            <Button
              size="small"
              isPrimary={!schemaStatus?.ready}
              disabled={setupBusy}
              onClick={() => void onRunSchemaSetup()}
            >
              {setupBusy ? i18n.t('diagnostics.runningSetup') : i18n.t('diagnostics.runSetup')}
            </Button>
          </ActionRow>
        </Section>

        <Section>
          <MD isBold>{i18n.t('diagnostics.verifySection')}</MD>
          <ActionRow>
            <Button
              size="small"
              isPrimary
              disabled={verifyBusy}
              onClick={() => void onRunVerification()}
            >
              {verifyBusy ? i18n.t('diagnostics.runningVerify') : i18n.t('diagnostics.runVerify')}
            </Button>
            {diagnosticReport && (
              <Button size="small" onClick={() => void handleCopyJson()}>
                {copied ? i18n.t('diagnostics.copied') : i18n.t('diagnostics.copyReport')}
              </Button>
            )}
          </ActionRow>

          {diagnosticReport && (
            <StatusList style={{ marginTop: 12 }}>
              <StatusRow>
                <SM>{i18n.t('diagnostics.currentLocale')}</SM>
                <Code>{diagnosticReport.currentUserLocale}</Code>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.accountLocales')}</SM>
                <SM>{diagnosticReport.accountLocales.join(', ') || '-'}</SM>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.agentLocales')}</SM>
                <SM>
                  {diagnosticReport.agentLocales
                    .map((item) => `${item.locale} (${item.count})`)
                    .join(', ') || '-'}
                </SM>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.auditLogsAccess')}</SM>
                <Tag
                  size="small"
                  hue={diagnosticReport.auditLogsAccessible ? 'green' : 'red'}
                >
                  <span>
                    {diagnosticReport.auditLogsAccessible
                      ? `${i18n.t('diagnostics.accessible')} (${diagnosticReport.sampledAuditLogCount})`
                      : i18n.t('diagnostics.denied')}
                  </span>
                </Tag>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.ruleCatalogs')}</SM>
                <SM>{diagnosticReport.ruleCatalogLoaded.join(', ') || '-'}</SM>
              </StatusRow>

              <MD isBold style={{ marginTop: 8 }}>
                {i18n.t('diagnostics.payloadValidation')}
              </MD>

              <StatusRow>
                <SM>{i18n.t('diagnostics.capTriggerEdits')}</SM>
                <Tag
                  size="small"
                  hue={diagnosticReport.payloadValidation.capabilities.triggerEdits ? 'green' : 'grey'}
                >
                  <span>
                    {diagnosticReport.payloadValidation.capabilities.triggerEdits
                      ? i18n.t('diagnostics.verified')
                      : i18n.t('diagnostics.notObserved')}
                  </span>
                </Tag>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.capUserDeletions')}</SM>
                <Tag
                  size="small"
                  hue={diagnosticReport.payloadValidation.capabilities.userDeletions ? 'green' : 'grey'}
                >
                  <span>
                    {diagnosticReport.payloadValidation.capabilities.userDeletions
                      ? i18n.t('diagnostics.verified')
                      : i18n.t('diagnostics.notObserved')}
                  </span>
                </Tag>
              </StatusRow>

              <StatusRow>
                <SM>{i18n.t('diagnostics.capRoleChanges')}</SM>
                <Tag
                  size="small"
                  hue={diagnosticReport.payloadValidation.capabilities.roleChanges ? 'green' : 'grey'}
                >
                  <span>
                    {diagnosticReport.payloadValidation.capabilities.roleChanges
                      ? i18n.t('diagnostics.verified')
                      : i18n.t('diagnostics.notObserved')}
                  </span>
                </Tag>
              </StatusRow>

              <JsonPreview>{JSON.stringify(diagnosticReport, null, 2)}</JsonPreview>
            </StatusList>
          )}
        </Section>
      </Drawer.Body>
      <Drawer.Footer>
        <Drawer.FooterItem>
          <Button isBasic onClick={onClose}>
            {i18n.t('detail.close')}
          </Button>
        </Drawer.FooterItem>
      </Drawer.Footer>
      <Drawer.Close aria-label={i18n.t('detail.close')} />
    </Drawer>
  );
};
