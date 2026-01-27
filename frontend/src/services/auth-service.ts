import apiClient from './api-client';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  username: string;
  is_admin: boolean;
}

interface LoginPartialResponse {
  requires_2fa: boolean;
  partial_token: string;
}

type LoginResult = LoginResponse | LoginPartialResponse;

function isPartialResponse(data: LoginResult): data is LoginPartialResponse {
  return 'requires_2fa' in data && data.requires_2fa === true;
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResult> {
    const response = await apiClient.post<LoginResult>('/auth/login', { username, password });
    const data = response.data;

    if (!isPartialResponse(data)) {
      const fullData = data as LoginResponse;
      localStorage.setItem('token', fullData.access_token);
      localStorage.setItem('refresh_token', fullData.refresh_token);
    }

    return data;
  },

  async login2FA(partial_token: string, totp_code: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login/2fa', {
      partial_token,
      totp_code,
    });
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return response.data;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken });
      } catch {
        // Ignore errors on logout
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  },

  async refreshToken(): Promise<LoginResponse | null> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await apiClient.post<LoginResponse>('/auth/refresh', {
        refresh_token: refreshToken,
      });
      const { access_token, refresh_token: newRefreshToken } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('refresh_token', newRefreshToken);
      return response.data;
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      return null;
    }
  },

  // 2FA management
  async setup2FA(): Promise<{ secret: string; qr_code_base64: string }> {
    const response = await apiClient.get('/auth/2fa/setup');
    return response.data;
  },

  async enable2FA(secret: string, totp_code: string): Promise<void> {
    await apiClient.post('/auth/2fa/enable', { secret, totp_code });
  },

  async disable2FA(totp_code: string): Promise<void> {
    await apiClient.post('/auth/2fa/disable', { totp_code });
  },
};

export type { LoginResponse, LoginPartialResponse, LoginResult };
export { isPartialResponse };
