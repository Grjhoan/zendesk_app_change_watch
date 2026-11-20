import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Input, Label, Select } from '@zendeskgarden/react-forms';
import { Spinner } from '@zendeskgarden/react-loaders';
import { Body, Cell, Head, HeaderCell, HeaderRow, Row, Table } from '@zendeskgarden/react-tables';
import { Tag } from '@zendeskgarden/react-tags';
import { SM, Span } from '@zendeskgarden/react-typography';
import type { I18nInstance } from '../i18n';
import type { MessageKey } from '../i18n/messages/en';
import type {
  ApiErrorInfo,
  ClassifiedAuditEvent,
  ConfigModuleKey,
  ZendeskStaffUser
} from '../types/zendesk';
import { ErrorBanner } from './ErrorBanner';

export interface ActivityFilters {
  moduleKey: string;
  actionKey: string;
  actorId: string;
  dateFrom: string;
  dateTo: string;
}

interface ActivityTabProps {
  events: ClassifiedAuditEvent[];
  staffUsers: ZendeskStaffUser[];
  filters: ActivityFilters;
  onFiltersChange: (next: ActivityFilters) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: ApiErrorInfo | null;
  onSelectEvent: (event: ClassifiedAuditEvent) => void;
  onAskClarification: (event: ClassifiedAuditEvent) => void;
  i18n: I18nInstance;
}

const FilterBar = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${(p) => p.theme.space.sm};
  align-items: end;
  margin-bottom: ${(p) => p.theme.space.md};
`;

const ScopeRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${(p) => p.theme.space.sm};
  gap: ${(p) => p.theme.space.sm};
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const ChangeTitle = styled.div`
  display: flex;
  align-items: center;
  gap: ${(p) => p.theme.space.xs};
  flex-wrap: wrap;
  margin-bottom: 2px;
`;

const TruncatedDesc = styled.div`
  color: ${(p) => p.theme.palette.grey[600]};
  font-size: ${(p) => p.theme.fontSizes.sm};
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ActionCellControls = styled.div`
  display: flex;
  gap: ${(p) => p.theme.space.xs};
  white-space: nowrap;
`;

const EmptyBox = styled.div`
  padding: ${(p) => p.theme.space.xl};
  text-align: center;
  color: ${(p) => p.theme.palette.grey[600]};
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${(p) => p.theme.space.sm};
  margin-top: ${(p) => p.theme.space.md};
`;

const PaginationControls = styled.nav`
  display: flex;
  align-items: center;
  gap: ${(p) => p.theme.space.xxs};
  flex-wrap: wrap;
`;

const FooterLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${(p) => p.theme.space.sm};
  flex-wrap: wrap;
`;

const Ellipsis = styled.span`
  padding: 0 4px;
  color: ${(p) => p.theme.palette.grey[600]};
  font-size: ${(p) => p.theme.fontSizes.sm};
`;

const PAGE_SIZE = 10;

function getPageNumbers(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

const MODULE_OPTIONS: Array<Exclude<ConfigModuleKey, 'all_config'>> = [
  'triggers',
  'rules',
  'users',
  'roles',
  'groups',
  'fields',
  'forms',
  'brands',
  'apps',
  'webhooks',
  'settings',
  'security',
  'schedules',
  'sla',
  'custom_objects',
  'other_config'
];

export function actionTagHue(actionKey: string): string {
  switch (actionKey) {
    case 'create':
      return 'green';
    case 'destroy':
      return 'red';
    case 'role_change':
      return 'yellow';
    case 'update':
      return 'blue';
    default:
      return 'grey';
  }
}

export const ActivityTab: React.FC<ActivityTabProps> = ({
  events,
  staffUsers,
  filters,
  onFiltersChange,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  error,
  onSelectEvent,
  onAskClarification,
  i18n
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of staffUsers) {
      map.set(String(u.id), u.name);
    }
    for (const ev of events) {
      if (!ev.isSystemEvent && ev.actorId && ev.actorName && !map.has(ev.actorId)) {
        map.set(ev.actorId, ev.actorName);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [events, staffUsers]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (!ev.isConfiguration) return false;
      if (filters.moduleKey !== 'all') {
        if (filters.moduleKey === 'rules') {
          if (ev.moduleKey !== 'rules' && ev.moduleKey !== 'triggers') return false;
        } else if (ev.moduleKey !== filters.moduleKey) {
          return false;
        }
      }
      if (filters.actionKey !== 'all') {
        if (filters.actionKey === 'update') {
          if (ev.actionKey !== 'update' && !ev.isRoleChange) return false;
        } else if (ev.actionKey !== filters.actionKey) {
          return false;
        }
      }
      if (filters.actorId !== 'all') {
        if (filters.actorId === 'system') {
          if (!ev.isSystemEvent) return false;
        } else if (ev.actorId !== filters.actorId) {
          return false;
        }
      }
      if (filters.dateFrom) {
        const fromTs = new Date(`${filters.dateFrom}T00:00:00Z`).getTime();
        if (new Date(ev.createdAt).getTime() < fromTs) return false;
      }
      if (filters.dateTo) {
        const toTs = new Date(`${filters.dateTo}T23:59:59.999Z`).getTime();
        if (new Date(ev.createdAt).getTime() > toTs) return false;
      }
      return true;
    });
  }, [events, filters]);

  const totalItems = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);
  const paginatedEvents = useMemo(
    () => filteredEvents.slice(startIndex, endIndex),
    [filteredEvents, startIndex, endIndex]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.moduleKey, filters.actionKey, filters.actorId, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(
    () => getPageNumbers(safePage, totalPages),
    [safePage, totalPages]
  );

  const hasActiveFilters =
    filters.moduleKey !== 'all' ||
    filters.actionKey !== 'all' ||
    filters.actorId !== 'all' ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBanner error={error} context="audit_logs" i18n={i18n} />
        </div>
      )}

      <ScopeRow>
        <SM>{i18n.t('activity.scopeHint')}</SM>
        {hasActiveFilters && (
          <Button
            size="small"
            isBasic
            onClick={() =>
              onFiltersChange({
                moduleKey: 'all',
                actionKey: 'all',
                actorId: 'all',
                dateFrom: '',
                dateTo: ''
              })
            }
          >
            {i18n.t('activity.clearFilters')}
          </Button>
        )}
      </ScopeRow>

      <FilterBar>
        <Field>
          <Label>{i18n.t('activity.filterModule')}</Label>
          <Select
            isCompact
            value={filters.moduleKey}
            onChange={(e) => onFiltersChange({ ...filters, moduleKey: e.target.value })}
          >
            <option value="all">{i18n.t('activity.allModules')}</option>
            {MODULE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {i18n.t(`modules.${key}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label>{i18n.t('activity.filterAction')}</Label>
          <Select
            isCompact
            value={filters.actionKey}
            onChange={(e) => onFiltersChange({ ...filters, actionKey: e.target.value })}
          >
            <option value="all">{i18n.t('activity.allActions')}</option>
            <option value="create">{i18n.t('actions.create')}</option>
            <option value="update">{i18n.t('actions.update')}</option>
            <option value="destroy">{i18n.t('actions.destroy')}</option>
            <option value="role_change">{i18n.t('actions.role_change')}</option>
          </Select>
        </Field>

        <Field>
          <Label>{i18n.t('activity.filterActor')}</Label>
          <Select
            isCompact
            value={filters.actorId}
            onChange={(e) => onFiltersChange({ ...filters, actorId: e.target.value })}
          >
            <option value="all">{i18n.t('activity.allActors')}</option>
            <option value="system">{i18n.t('activity.systemActor')}</option>
            {actorOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label>{i18n.t('activity.filterDateFrom')}</Label>
          <Input
            isCompact
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
          />
        </Field>

        <Field>
          <Label>{i18n.t('activity.filterDateTo')}</Label>
          <Input
            isCompact
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
          />
        </Field>
      </FilterBar>

      {loading ? (
        <EmptyBox>
          <Spinner size="32" />
        </EmptyBox>
      ) : filteredEvents.length === 0 ? (
        <EmptyBox>{i18n.t('activity.empty')}</EmptyBox>
      ) : (
        <TableWrapper>
          <Table size="small">
            <Head>
              <HeaderRow>
                <HeaderCell>{i18n.t('activity.colChange')}</HeaderCell>
                <HeaderCell width="120px">{i18n.t('activity.colAction')}</HeaderCell>
                <HeaderCell width="160px">{i18n.t('activity.colActor')}</HeaderCell>
                <HeaderCell width="170px">{i18n.t('activity.colWhen')}</HeaderCell>
                <HeaderCell width="220px">{i18n.t('activity.colControls')}</HeaderCell>
              </HeaderRow>
            </Head>
            <Body>
              {paginatedEvents.map((ev) => (
                <Row key={ev.id}>
                  <Cell>
                    <ChangeTitle>
                      <Tag size="small" hue="kale">
                        <span>{i18n.t(`modules.${ev.moduleKey}` as MessageKey)}</span>
                      </Tag>
                      {ev.ruleSubtype && ev.ruleSubtype !== 'unknown' && ev.moduleKey === 'rules' && (
                        <Tag size="small">
                          <span>{i18n.t(`ruleSubtypes.${ev.ruleSubtype}` as MessageKey)}</span>
                        </Tag>
                      )}
                      <Span isBold>{ev.sourceLabel}</Span>
                    </ChangeTitle>
                    {ev.changeDescription && (
                      <TruncatedDesc title={ev.changeDescription}>
                        {ev.changeDescription}
                      </TruncatedDesc>
                    )}
                  </Cell>
                  <Cell>
                    <Tag size="small" hue={actionTagHue(ev.actionKey)}>
                      <span>{i18n.t(`actions.${ev.actionKey}` as MessageKey)}</span>
                    </Tag>
                  </Cell>
                  <Cell>
                    {ev.isSystemEvent ? i18n.t('activity.systemActor') : ev.actorName || ev.actorId}
                  </Cell>
                  <Cell>{i18n.formatDateTime(ev.createdAt, 'short')}</Cell>
                  <Cell>
                    <ActionCellControls>
                      <Button size="small" isBasic onClick={() => onSelectEvent(ev)}>
                        {i18n.t('activity.details')}
                      </Button>
                      <Button size="small" onClick={() => onAskClarification(ev)}>
                        {i18n.t('activity.askClarification')}
                      </Button>
                    </ActionCellControls>
                  </Cell>
                </Row>
              ))}
            </Body>
          </Table>
        </TableWrapper>
      )}

      {!loading && totalItems > 0 && (
        <FooterRow>
          <FooterLeft>
            <SM>
              {i18n.t('activity.paginationShowing', {
                start: startIndex + 1,
                end: endIndex,
                total: totalItems
              })}
            </SM>
            {hasMore && (
              <Button size="small" isBasic disabled={loadingMore} onClick={onLoadMore}>
                {loadingMore ? i18n.t('activity.loadingMore') : i18n.t('activity.loadMore')}
              </Button>
            )}
          </FooterLeft>

          {totalPages > 1 && (
            <PaginationControls aria-label="Pagination">
              <Button
                size="small"
                isBasic
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                {i18n.t('activity.paginationPrev')}
              </Button>
              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <Ellipsis key={`ellipsis-${idx}`}>…</Ellipsis>
                ) : (
                  <Button
                    key={item}
                    size="small"
                    isPrimary={item === safePage}
                    isBasic={item !== safePage}
                    aria-label={i18n.t('activity.paginationPage', { page: item })}
                    aria-current={item === safePage ? 'page' : undefined}
                    onClick={() => setCurrentPage(item)}
                  >
                    {item}
                  </Button>
                )
              )}
              <Button
                size="small"
                isBasic
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                {i18n.t('activity.paginationNext')}
              </Button>
            </PaginationControls>
          )}
        </FooterRow>
      )}
    </div>
  );
};
