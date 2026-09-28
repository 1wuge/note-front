import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

export default {
  getDocs(keyword) {
    return api.get("/docs", { params: keyword ? { keyword } : {} });
  },
  getDoc(id) {
    return api.get(`/docs/${id}`);
  },
  createDoc(payload) {
    return api.post("/docs", payload);
  },
  updateDoc(id, payload) {
    return api.put(`/docs/${id}`, payload);
  },
  moveDoc(id, payload) {
    return api.put(`/docs/${id}/move`, payload);
  },
  deleteDoc(id) {
    return api.delete(`/docs/${id}`);
  },
  uploadImage(file) {
    const form = new FormData();
    form.append("file", file);
    return api.post("/files", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};