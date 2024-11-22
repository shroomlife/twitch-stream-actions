import {
  AppStoreState,
  Stream,
} from "../types/global";
import { defineStore } from "pinia";

export const useAppStore = defineStore("appStore", {
  state: (): AppStoreState => ({
    apiUrl: import.meta.env.VITE_API_URL,
    currentStream: null,
  }),
  getters: {
    getApiUrl(): string {
      return this.apiUrl;
    },
    getCurrentStream(): Stream | null {
      return this.currentStream;
    },
    getHasCurrentStream(): boolean {
      return this.currentStream !== null;
    },
  },
  actions: {
    setCurrentStream(stream: Stream | null) {
      this.currentStream = stream;
    },
    renderApiUrl(path: string): string {
      return [
        this.apiUrl,
        path
      ].join("");
    },
  },
});
