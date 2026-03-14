import axios from 'axios';
import { URLS } from '../../config/constants';

function createInstance(baseURL, headers = {}) {
  const instance = axios.create({ baseURL, headers });

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      const msg = err.response?.data?.error?.message || err.message || 'Network error';
      return Promise.reject(new Error(msg));
    }
  );

  return instance;
}

export const motApi = createInstance('/proxy/mot');
export const railApi = createInstance(URLS.rail);
