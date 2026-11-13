import axios from "axios";
export const api = axios.create({ baseURL: "/api" });
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
  e.response?.data?.error || e.message || "Something went wrong";
