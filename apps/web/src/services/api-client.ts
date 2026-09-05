export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

export class ApiClient {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  private static token: string | null = null;

  public static setAuthToken(token: string | null): void {
    this.token = token;
  }

  public static getAuthToken(): string | null {
    return this.token;
  }

  public static async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const status = response.status;
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          status,
          error: data?.message || data?.error || `HTTP Error ${status}`,
        };
      }

      return { status, data };
    } catch (err: any) {
      return {
        status: 0,
        error: err.message || 'Network request failed. Operating offline.',
      };
    }
  }
}
