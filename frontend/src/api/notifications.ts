import apiClient from './client';
import { Notification, PaginatedResponse, ApiResponse } from '../types';

export const notificationsAPI = {
  getNotifications: async (filters: {
    alertId?: string;
    contactId?: string;
    type?: string;
    status?: string[];
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Notification>> => {
    const { data } = await apiClient.get('/notifications', { params: filters });
    return data;
  },

  sendNotification: async (
    alertId: string,
    payload: {
      contactIds: string[];
      type: 'email' | 'sms' | 'both';
      templateName?: string;
      customMessage?: string;
    }
  ): Promise<ApiResponse<Notification[]>> => {
    const { data } = await apiClient.post(`/notifications/alert/${alertId}`, payload);
    return data;
  },

  getStatistics: async (startDate?: string, endDate?: string): Promise<ApiResponse<any>> => {
    const { data } = await apiClient.get('/notifications/statistics', {
      params: { startDate, endDate },
    });
    return data;
  },

  getQueueStats: async (): Promise<ApiResponse<any>> => {
    const { data } = await apiClient.get('/notifications/queue-stats');
    return data;
  },
};
