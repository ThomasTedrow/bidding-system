import { fetchJson } from './api';

export async function login({ email, password }) {
  return fetchJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchCurrentUser(token) {
  return fetchJson('/auth/me', { token });
}
