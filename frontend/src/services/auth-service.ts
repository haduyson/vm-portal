import apiClient from './api-client';

interface LoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  is_admin: boolean;
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', { username, password });
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    return response.data;
  },

  logout(): void {
    localStorage.removeItem('token');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },
};
