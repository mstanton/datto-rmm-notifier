import apiClient from './client';
import { Contact, PaginatedResponse, ApiResponse } from '../types';

export const contactsAPI = {
  getContacts: async (filters: {
    siteUid?: string;
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Contact>> => {
    const { data } = await apiClient.get('/contacts', { params: filters });
    return data;
  },

  getContact: async (id: string): Promise<ApiResponse<Contact>> => {
    const { data } = await apiClient.get(`/contacts/${id}`);
    return data;
  },

  getContactsBySite: async (siteUid: string, activeOnly = true): Promise<ApiResponse<Contact[]>> => {
    const { data } = await apiClient.get(`/contacts/site/${siteUid}`, {
      params: { activeOnly },
    });
    return data;
  },

  createContact: async (contact: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    const { data } = await apiClient.post('/contacts', contact);
    return data;
  },

  updateContact: async (id: string, updates: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    const { data } = await apiClient.put(`/contacts/${id}`, updates);
    return data;
  },

  deleteContact: async (id: string): Promise<ApiResponse<void>> => {
    const { data } = await apiClient.delete(`/contacts/${id}`);
    return data;
  },
};
