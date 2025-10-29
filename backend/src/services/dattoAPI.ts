import axios, { AxiosInstance, AxiosError } from 'axios';
import logger from '../config/logger';
import redisClient from '../config/redis';
import { DattoAuthResponse, DattoAlert, DattoDevice, DattoSite } from '../types/datto';

class DattoAPIService {
  private apiUrl: string;
  private apiKey: string;
  private apiSecretKey: string;
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private requestCounter: number = 0;
  private requestWindowStart: number = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 600;
  private readonly RATE_LIMIT_THRESHOLD = 540; // 90% of max

  constructor() {
    this.apiUrl = process.env.DATTO_API_URL || '';
    this.apiKey = process.env.DATTO_API_KEY || '';
    this.apiSecretKey = process.env.DATTO_API_SECRET_KEY || '';

    if (!this.apiUrl || !this.apiKey || !this.apiSecretKey) {
      logger.error('Datto API credentials not configured');
      throw new Error('Datto API credentials missing');
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for rate limiting and authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        await this.ensureAuthenticated();

        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          logger.warn('Access token expired, refreshing...');
          await this.authenticate(true);

          // Retry the original request
          if (error.config) {
            return this.client.request(error.config);
          }
        }

        if (error.response?.status === 429) {
          logger.warn('Rate limit exceeded, waiting 60 seconds...');
          await this.sleep(60000);

          // Retry the original request
          if (error.config) {
            return this.client.request(error.config);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with Datto RMM API using OAuth 2.0
   */
  private async authenticate(force = false): Promise<void> {
    const cacheKey = 'datto:access_token';

    // Try to get cached token first
    if (!force) {
      const cachedToken = await redisClient.get(cacheKey);
      if (cachedToken) {
        const tokenData = JSON.parse(cachedToken);
        this.accessToken = tokenData.access_token;
        this.tokenExpiresAt = tokenData.expires_at;
        logger.info('Using cached Datto API access token');
        return;
      }
    }

    try {
      logger.info('Authenticating with Datto RMM API...');

      const response = await axios.post<DattoAuthResponse>(
        `${this.apiUrl}/auth/oauth/token`,
        {
          grant_type: 'client_credentials',
        },
        {
          auth: {
            username: this.apiKey,
            password: this.apiSecretKey,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      this.accessToken = response.data.access_token;

      // Token expires in 100 hours, but we'll cache for 90 hours to be safe
      const expiresIn = 90 * 60 * 60; // 90 hours in seconds
      this.tokenExpiresAt = Date.now() + (expiresIn * 1000);

      // Cache the token
      await redisClient.setex(
        cacheKey,
        expiresIn,
        JSON.stringify({
          access_token: this.accessToken,
          expires_at: this.tokenExpiresAt,
        })
      );

      logger.info('Successfully authenticated with Datto RMM API');
    } catch (error) {
      logger.error('Failed to authenticate with Datto API:', error);
      throw new Error('Datto API authentication failed');
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiresAt) {
      await this.authenticate();
      return;
    }

    // Refresh if token expires in less than 10 hours
    const tenHours = 10 * 60 * 60 * 1000;
    if (Date.now() > this.tokenExpiresAt - tenHours) {
      logger.info('Access token expiring soon, refreshing...');
      await this.authenticate(true);
    }
  }

  /**
   * Rate limit check with circuit breaker
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowDuration = 60000; // 60 seconds

    // Reset counter if window has passed
    if (now - this.requestWindowStart >= windowDuration) {
      this.requestCounter = 0;
      this.requestWindowStart = now;
    }

    // Check if we're approaching the rate limit
    if (this.requestCounter >= this.RATE_LIMIT_THRESHOLD) {
      const timeToWait = windowDuration - (now - this.requestWindowStart);
      logger.warn(`Rate limit threshold reached, waiting ${timeToWait}ms`);
      await this.sleep(timeToWait);
      this.requestCounter = 0;
      this.requestWindowStart = Date.now();
    }

    this.requestCounter++;
  }

  /**
   * Get all open alerts for the account
   */
  async getAccountAlerts(): Promise<DattoAlert[]> {
    try {
      const response = await this.client.get<{ alerts: DattoAlert[] }>('/v2/account/alerts/open');
      logger.info(`Retrieved ${response.data.alerts?.length || 0} open alerts from account`);
      return response.data.alerts || [];
    } catch (error) {
      logger.error('Failed to get account alerts:', error);
      throw error;
    }
  }

  /**
   * Get open alerts for a specific site
   */
  async getSiteAlerts(siteUid: string): Promise<DattoAlert[]> {
    try {
      const response = await this.client.get<{ alerts: DattoAlert[] }>(`/v2/site/${siteUid}/alerts/open`);
      return response.data.alerts || [];
    } catch (error) {
      logger.error(`Failed to get alerts for site ${siteUid}:`, error);
      throw error;
    }
  }

  /**
   * Get open alerts for a specific device
   */
  async getDeviceAlerts(deviceUid: string): Promise<DattoAlert[]> {
    try {
      const response = await this.client.get<{ alerts: DattoAlert[] }>(`/v2/device/${deviceUid}/alerts/open`);
      return response.data.alerts || [];
    } catch (error) {
      logger.error(`Failed to get alerts for device ${deviceUid}:`, error);
      throw error;
    }
  }

  /**
   * Get device details
   */
  async getDevice(deviceUid: string): Promise<DattoDevice | null> {
    try {
      const cacheKey = `datto:device:${deviceUid}`;

      // Check cache first (5 minute TTL)
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await this.client.get<{ device: DattoDevice }>(`/v2/device/${deviceUid}`);
      const device = response.data.device;

      // Cache for 5 minutes
      await redisClient.setex(cacheKey, 300, JSON.stringify(device));

      return device;
    } catch (error) {
      logger.error(`Failed to get device ${deviceUid}:`, error);
      return null;
    }
  }

  /**
   * Get all sites
   */
  async getSites(): Promise<DattoSite[]> {
    try {
      const cacheKey = 'datto:sites';

      // Check cache first (5 minute TTL)
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await this.client.get<{ sites: DattoSite[] }>('/v2/account/sites');
      const sites = response.data.sites || [];

      // Cache for 5 minutes
      await redisClient.setex(cacheKey, 300, JSON.stringify(sites));

      logger.info(`Retrieved ${sites.length} sites`);
      return sites;
    } catch (error) {
      logger.error('Failed to get sites:', error);
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertUid: string): Promise<boolean> {
    try {
      await this.client.post(`/v2/alert/${alertUid}/resolve`);
      logger.info(`Successfully resolved alert ${alertUid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to resolve alert ${alertUid}:`, error);
      return false;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getSites();
      return true;
    } catch (error) {
      logger.error('API connection test failed:', error);
      return false;
    }
  }
}

export default new DattoAPIService();
