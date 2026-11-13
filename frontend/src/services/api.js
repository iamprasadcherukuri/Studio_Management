import axios from "axios";
import { resolveApiBase } from "./api-base";
export const api = axios.create({
  baseURL: resolveApiBase(import.meta.env.VITE_API_URL),
  timeout: 60000,
});
api.interceptors.request.use((c) => {
  const token = sessionStorage.getItem("studio-token");
  if (token) c.headers.Authorization = `Bearer ${token}`;
  return c;
});
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (
      error.response?.status === 401 &&
      sessionStorage.getItem("studio-token")
    ) {
      sessionStorage.removeItem("studio-token");
      window.location.assign("/");
    }
    return Promise.reject(error);
  },
);
export const message = (e) =>
  e.response?.data?.error ||
  (e.code === "ECONNABORTED"
    ? "The API took too long to respond. Please try again."
    : e.code === "ERR_NETWORK" || (!e.response && e.request)
      ? "Cannot reach the API. Check your connection and API URL."
      : e.message) ||
  "Something went wrong";
