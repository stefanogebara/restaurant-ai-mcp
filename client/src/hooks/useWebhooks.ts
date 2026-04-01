import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  failure_count: number;
  created_at: string;
}

export interface CreateWebhookParams {
  url: string;
  events?: string[];
}

export interface CreateWebhookResult {
  webhook: Webhook & { secret: string };
}

export interface TestWebhookResult {
  success: boolean;
  status_code?: number;
  message: string;
}

async function fetchWebhooks(): Promise<{ webhooks: Webhook[]; available_events: string[] }> {
  const res = await authFetch('/api/webhooks-config?action=list');
  if (!res.ok) throw new Error('Failed to load webhooks');
  return res.json();
}

async function createWebhook(params: CreateWebhookParams): Promise<CreateWebhookResult> {
  const res = await authFetch('/api/webhooks-config?action=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create webhook' }));
    throw new Error(err.error || 'Failed to create webhook');
  }
  return res.json();
}

async function deleteWebhook(webhookId: string): Promise<void> {
  const res = await authFetch('/api/webhooks-config?action=delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_id: webhookId }),
  });
  if (!res.ok) throw new Error('Failed to delete webhook');
}

async function testWebhook(webhookId: string): Promise<TestWebhookResult> {
  const res = await authFetch('/api/webhooks-config?action=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_id: webhookId }),
  });
  if (!res.ok) throw new Error('Failed to test webhook');
  return res.json();
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: fetchWebhooks,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: testWebhook,
  });
}
