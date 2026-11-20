import React from 'react';
import { Alert, Title } from '@zendeskgarden/react-notifications';
import type { I18nInstance } from '../i18n';
import type { ApiErrorInfo } from '../types/zendesk';

interface ErrorBannerProps {
  error: ApiErrorInfo;
  context: 'audit_logs' | 'custom_objects' | 'generic';
  i18n: I18nInstance;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, context, i18n }) => {
  if (error.isPermissionDenied) {
    const body =
      context === 'audit_logs'
        ? i18n.t('errors.auditLogsDenied')
        : context === 'custom_objects'
          ? i18n.t('errors.customObjectsDenied')
          : i18n.t('errors.generic', { detail: error.message });

    return (
      <Alert type="warning" role="alert">
        <Title>{i18n.t('errors.permissionDeniedTitle')}</Title>
        {body}
      </Alert>
    );
  }

  if (error.isNotFound && context === 'custom_objects') {
    return (
      <Alert type="info" role="status">
        <Title>{i18n.t('errors.schemaBannerTitle')}</Title>
        {i18n.t('errors.customObjectsMissing')}
      </Alert>
    );
  }

  return (
    <Alert type="error" role="alert">
      {i18n.t('errors.generic', { detail: error.message })}
    </Alert>
  );
};
