import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'auth_token';

type ApiError = Error & { status?: number };

function responseError(message: string, status: number): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  return error;
}

async function readJsonResponse(response: Response) {
  const raw = await response.text();
  let data: any = null;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const message = response.ok
      ? 'The server returned an invalid response. Please try again.'
      : `The API is unavailable (${response.status}). Check that the backend and tunnel are running.`;
    throw responseError(message, response.status);
  }

  if (!response.ok) {
    throw responseError(data?.error || `Request failed (${response.status})`, response.status);
  }

  return data;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error reading auth token:', error);
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
}

export async function removeAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
};

export async function apiRequest(endpoint: string, options: RequestOptions = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return readJsonResponse(response);
}

export async function apiUpload(endpoint: string, body: FormData) {
  const token = await getAuthToken();
  const response = await expoFetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  return readJsonResponse(response);
}
