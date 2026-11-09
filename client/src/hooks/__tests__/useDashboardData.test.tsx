import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
const getDashboard = vi.fn();
vi.mock('../../services/api', () => ({ hostAPI: { getDashboard: (...args: unknown[]) => getDashboard(...args) } }));
import { useDashboardData } from '../useDashboardData';
let client: QueryClient;
const pending = () => ({data:{upcoming_reservations:[{whatsapp_confirmation:{status:'accepted',requested_at:new Date().toISOString(),status_updated_at:new Date().toISOString()}}]}});
function mount() {return renderHook(useDashboardData,{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));focusManager.setFocused(true);getDashboard.mockReset();client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});});
afterEach(()=>{client.clear();focusManager.setFocused(undefined);vi.useRealTimers();});
it('finds a new reservation within a minute without realtime events or reload',async()=>{
 getDashboard.mockResolvedValueOnce({data:{upcoming_reservations:[]}}).mockResolvedValue(pending());
 const {result}=mount();await act(async()=>{await vi.advanceTimersByTimeAsync(1)});
 await act(async()=>{await vi.advanceTimersByTimeAsync(60_000)});
 expect(getDashboard).toHaveBeenCalledTimes(2);expect(result.current.data?.data.upcoming_reservations).toHaveLength(1);
});
it('refreshes a recent pending confirmation quickly and slows after a final receipt',async()=>{
 getDashboard.mockResolvedValueOnce(pending()).mockResolvedValue({data:{upcoming_reservations:[{whatsapp_confirmation:{status:'delivered',status_updated_at:new Date().toISOString()}}]}});
 const {result}=mount();await act(async()=>{await vi.advanceTimersByTimeAsync(1)});
 await act(async()=>{await vi.advanceTimersByTimeAsync(15_000)});expect(getDashboard).toHaveBeenCalledTimes(2);
 expect(result.current.data?.data.upcoming_reservations[0].whatsapp_confirmation.status).toBe('delivered');
 await act(async()=>{await vi.advanceTimersByTimeAsync(15_000)});expect(getDashboard).toHaveBeenCalledTimes(2);
});
it('does not poll in the background',async()=>{
 getDashboard.mockResolvedValue(pending());mount();await act(async()=>{await vi.advanceTimersByTimeAsync(1)});focusManager.setFocused(false);
 await act(async()=>{await vi.advanceTimersByTimeAsync(120_000)});expect(getDashboard).toHaveBeenCalledTimes(1);
});
it('bounds fast polling for old unresolved sends',async()=>{
 const old=pending();old.data.upcoming_reservations[0].whatsapp_confirmation.requested_at='2026-11-09T11:50:00Z';getDashboard.mockResolvedValue(old);
 mount();await act(async()=>{await vi.advanceTimersByTimeAsync(1)});await act(async()=>{await vi.advanceTimersByTimeAsync(15_000)});expect(getDashboard).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(45_000)});expect(getDashboard).toHaveBeenCalledTimes(2);
});
it('does not restart the fast window when an accepted send advances to sent',async()=>{
 const first=pending();
 getDashboard.mockImplementation(async()=>({data:{upcoming_reservations:[{whatsapp_confirmation:{...first.data.upcoming_reservations[0].whatsapp_confirmation,status:'sent',status_updated_at:new Date().toISOString()}}]}}));
 mount();await act(async()=>{await vi.advanceTimersByTimeAsync(300_001)});const callsAtFiveMinutes=getDashboard.mock.calls.length;
 await act(async()=>{await vi.advanceTimersByTimeAsync(30_000)});expect(getDashboard).toHaveBeenCalledTimes(callsAtFiveMinutes);
});
