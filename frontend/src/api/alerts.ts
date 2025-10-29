import apiClient from './client';
import { Alert, AlertFilters, PaginatedResponse, ApiResponse, Statistics } from '../types';

export const alertsAPI = {
  getAlerts: async (filters: AlertFilters): Promise<PaginatedResponse<Alert>> => {
    const { data } = await apiClient.get('/alerts', { params: filters });
    return data;
  },

  getAlert: async (id: string): Promise<ApiResponse<Alert>> => {
    const { data } = await apiClient.get(`/alerts/${id}`);
    return data;
  },

  getCriticalAlerts: async (): Promise<ApiResponse<Alert[]>> => {
    const { data } = await apiClient.get('/alerts/critical');
    return data;
  },

  resolveAlert: async (id: string, resolutionNotes?: string): Promise<ApiResponse<Alert>> => {
    const { data } = await apiClient.post(`/alerts/${id}/resolve`, { resolutionNotes });
    return data;
  },

  getStatistics: async (siteUid?: string): Promise<ApiResponse<Statistics>> => {
    const { data } = await apiClient.get('/alerts/statistics', {
      params: { siteUid },
    });
    return data;
  },

  manualPoll: async (): Promise<ApiResponse<{ newAlerts: number; criticalAlerts: number }>> => {
    const { data } = await apiClient.post('/alerts/poll');
    return data;
  },
};
