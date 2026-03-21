import * as Sentry from "@sentry/react-native";
import axios from "axios";

import { logout } from "#/state/auth";
import { getBaseUrl } from "#/utils/getBaseUrl";

import { authClient } from "./authClient";

const baseURL = `${getBaseUrl()}/api`;

const publicAxiosInstance = axios.create({
  baseURL,
});

const protectedAxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});

protectedAxiosInstance.interceptors.request.use(
  (config) => {
    const cookies = authClient.getCookie();
    config.withCredentials = true;
    if (cookies) {
      config.headers.Cookie = cookies;
    }
    return config;
  },
  (error) =>
    Promise.reject({
      ...error,
      message: "Session expired. Please login again.",
    })
);

protectedAxiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Clear auth state
      Sentry.captureMessage("Session expired", {
        extra: {
          url: originalRequest.url,
          method: originalRequest.method,
        },
      });
      logout();

      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export { protectedAxiosInstance, publicAxiosInstance };
