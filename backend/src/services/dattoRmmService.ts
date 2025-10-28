import axios, { AxiosInstance, AxiosError } from 'axios';
import config from '../config';
import logger from '../utils/logger';
import { DattoAuthResponse, DattoAlert, DattoDevice, DattoSite } from '../../../shared/types';

class DattoRmmService {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private requestCount = 0;
  private requestWindowStart = Date.now();
  private readonly RATE_LIMIT_WINDOW = 60000; // 60 seconds
  private readonly MAX_REQUESTS_PER_WINDOW = 600;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.dattoRmm.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        await this.ensureValidToken();
        await this.checkRateLimit();

        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, refresh and retry
          logger.warn('Received 401, refreshing token and retrying');
          this.accessToken = null;
          this.tokenExpiresAt = null;

          const originalRequest = error.config;
          if (originalRequest) {
            await this.ensureValidToken();
            if (this.accessToken) {
              originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
            }
            return this.axiosInstance.request(originalRequest);
          }
        }

        if (error.response?.status === 429) {
          // Rate limited
          logger.warn('Rate limit exceeded, waiting 60 seconds');
          await this.sleep(60000);
          return this.axiosInstance.request(error.config!);
        }

        return Promise.reject(error);
      }
    );
  }

  private async authenticate(): Promise<void> {
    try {
      logger.info('Authenticating with Datto RMM API');

      const response = await axios.post<DattoAuthResponse>(
        `${config.dattoRmm.apiUrl}/auth/oauth/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: config.dattoRmm.apiKey,
            password: config.dattoRmm.apiSecret,
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Token expires in 100 hours, refresh 10 hours before expiration
      const expiresInMs = (response.data.expires_in - 36000) * 1000; // Subtract 10 hours
      this.tokenExpiresAt = new Date(Date.now() + expiresInMs);

      logger.info('Successfully authenticated with Datto RMM API', {
        expiresAt: this.tokenExpiresAt,
      });
    } catch (error) {
      logger.error('Failed to authenticate with Datto RMM API', error);
      throw new Error('Datto RMM authentication failed');
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt || new Date() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset counter if window has passed
    if (now - this.requestWindowStart > this.RATE_LIMIT_WINDOW) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }

    this.requestCount++;

    // If approaching rate limit (90%), apply exponential backoff
    if (this.requestCount >= config.dattoRmm.rateLimitThreshold) {
      const waitTime = 1000 * Math.pow(2, this.requestCount - config.dattoRmm.rateLimitThreshold);
      logger.warn(`Approaching rate limit (${this.requestCount}/${this.MAX_REQUESTS_PER_WINDOW}), waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // API Methods

  public async getAccountAlerts(): Promise<DattoAlert[]> {
    try {
      logger.debug('Fetching account alerts from Datto RMM');
      const response = await this.axiosInstance.get<{ alerts: DattoAlert[] }>('/v2/account/alerts/open');
      return response.data.alerts || [];
    } catch (error) {
      logger.error('Failed to fetch account alerts', error);
      throw error;
    }
  }

  public async getSiteAlerts(siteUid: string): Promise<DattoAlert[]> {
    try {
      logger.debug(`Fetching alerts for site ${siteUid}`);
      const response = await this.axiosInstance.get<{ alerts: DattoAlert[] }>(`/v2/site/${siteUid}/alerts/open`);
      return response.data.alerts || [];
    } catch (error) {
      logger.error(`Failed to fetch alerts for site ${siteUid}`, error);
      throw error;
    }
  }

  public async getDeviceAlerts(deviceUid: string): Promise<DattoAlert[]> {
    try {
      logger.debug(`Fetching alerts for device ${deviceUid}`);
      const response = await this.axiosInstance.get<{ alerts: DattoAlert[] }>(`/v2/device/${deviceUid}/alerts/open`);
      return response.data.alerts || [];
    } catch (error) {
      logger.error(`Failed to fetch alerts for device ${deviceUid}`, error);
      throw error;
    }
  }

  public async getDevice(deviceUid: string): Promise<DattoDevice> {
    try {
      logger.debug(`Fetching device details for ${deviceUid}`);
      const response = await this.axiosInstance.get<DattoDevice>(`/v2/device/${deviceUid}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch device ${deviceUid}`, error);
      throw error;
    }
  }

  public async getSites(): Promise<DattoSite[]> {
    try {
      logger.debug('Fetching all sites');
      const response = await this.axiosInstance.get<{ sites: DattoSite[] }>('/v2/account/sites');
      return response.data.sites || [];
    } catch (error) {
      logger.error('Failed to fetch sites', error);
      throw error;
    }
  }

  public async resolveAlert(alertUid: string): Promise<void> {
    try {
      logger.info(`Resolving alert ${alertUid} in Datto RMM`);
      await this.axiosInstance.post(`/v2/alert/${alertUid}/resolve`);
      logger.info(`Alert ${alertUid} resolved successfully`);
    } catch (error) {
      logger.error(`Failed to resolve alert ${alertUid}`, error);
      throw error;
    }
  }

  public getRequestCount(): number {
    return this.requestCount;
  }
}

export default new DattoRmmService();
