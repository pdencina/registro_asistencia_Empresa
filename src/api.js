const API_BASE = '/api';

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  } catch (err) {
    throw new Error('Sin conexión a internet. Verifica tu red.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `Error ${response.status}` }));
    throw new Error(error.error || `Error ${response.status}`);
  }

  return response.json();
}

// Employees API
export const employeesApi = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/employees${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/employees/${id}`),
  create: (data) => request('/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id, data) => request(`/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  permanentDelete: (id) => request(`/employees/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ permanent: true }),
  }),
};

// Attendance API
export const attendanceApi = {
  register: (data) => request('/attendance/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getToday: () => request('/attendance/today'),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/history${query ? `?${query}` : ''}`);
  },
  getSummary: (date) => {
    const query = date ? `?date=${date}` : '';
    return request(`/attendance/summary${query}`);
  },
  getEmployeeStatus: (id) => request(`/attendance/status/${id}`),
  delete: (id) => request(`/attendance/${id}`, { method: 'DELETE' }),
};

// Devices API
export const devicesApi = {
  check: (deviceId) => request(`/devices?device_id=${deviceId}`),
  authorize: (deviceId, pin, name, lat, lng) => request('/devices', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, pin, name, lat, lng }),
  }),
};

// Schedules API
export const schedulesApi = {
  getAll: () => request('/schedules'),
  create: (data) => request('/schedules', { method: 'POST', body: JSON.stringify(data) }),
  update: (data) => request('/schedules', { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request('/schedules', { method: 'DELETE', body: JSON.stringify({ id }) }),
  getEmployeeSchedule: (employeeId) => request(`/schedules/assign?employee_id=${employeeId}`),
  assignSchedule: (data) => request('/schedules/assign', { method: 'POST', body: JSON.stringify(data) }),
};

// Authorizers API
export const authorizersApi = {
  getAll: () => request('/authorizers'),
  create: (data) => request('/authorizers', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request('/authorizers', { method: 'DELETE', body: JSON.stringify({ id }) }),
};

// Tardiness API
export const tardinessApi = {
  get: (employeeId, period = 'week') => request(`/attendance/tardiness?employee_id=${employeeId}&period=${period}`),
};

// Early Exit API
export const earlyExitApi = {
  create: (data) => request('/attendance/early-exit', { method: 'POST', body: JSON.stringify(data) }),
  getByEmployee: (employeeId) => request(`/attendance/early-exit?employee_id=${employeeId}`),
};
