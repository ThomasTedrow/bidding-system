import { fetchJsonSuccess } from './api';

export async function getUsers(token) {
  return fetchJsonSuccess('/users', { token });
}

export async function createUser(token, body) {
  return fetchJsonSuccess('/users', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateUser(token, userId, body) {
  return fetchJsonSuccess(`/users/${userId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
  });
}

export async function toggleUserActive(token, userId, isActive) {
  return fetchJsonSuccess(`/users/${userId}/toggle-active`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ isActive }),
  });
}
