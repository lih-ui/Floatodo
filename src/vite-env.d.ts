/// <reference types="vite/client" />

type TaskCategory = {
  id: string;
  name: string;
  color: string;
};

type Task = {
  id: string;
  title: string;
  categoryId: string;
  estimateMinutes: number;
  note?: string;
  createdAt: string;
};

type CompletedTask = Task & {
  startedAt: string;
  completedAt: string;
  actualSeconds: number;
  overtimeSeconds: number;
  status?: "completed" | "interrupted";
  remainingEstimateMinutes?: number;
  musings?: TaskMusing[];
  musing?: string;
  reflection?: string;
};

type TaskMusing = {
  id: string;
  text: string;
  createdAt: string;
};

type AppSettings = {
  deepseekApiKey: string;
  deepseekModel: string;
  alwaysOnTop: boolean;
  dogRewardPreferences?: Record<string, "food" | "freezeDried" | "snack" | "toy" | "skill" | "walk" | "care">;
};

type DogProfile = {
  name: string;
  gender: string;
  birthday: string;
  enabled: boolean;
  fullness: number;
  happiness: number;
  bond: number;
  skillPoints: number;
  social: number;
  care: number;
};

type QuickTask = {
  id: string;
  title: string;
  estimateMinutes: number;
  categoryId: string;
};

type AppData = {
  tasks: Task[];
  completedTasks: CompletedTask[];
  categories: TaskCategory[];
  settings: AppSettings;
  dog: DogProfile;
  quickTasks: QuickTask[];
};

interface Window {
  floatodo: {
    loadData: () => Promise<AppData>;
    saveData: (data: AppData) => Promise<AppData>;
    compactWindow: () => Promise<void>;
    expandWindow: () => Promise<void>;
    tuckWindow: (payload: { title: string; time: string; overtime: boolean }) => Promise<{ tucked: boolean; edge?: "left" | "right" | "top" | "bottom" }>;
    untuckWindow: () => Promise<boolean>;
    updateTuckWindow: (payload: { title: string; time: string; overtime: boolean }) => Promise<void>;
    onTuckState: (callback: (payload: unknown) => void) => () => void;
    onWindowUntucked: (callback: () => void) => () => void;
    minimizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    setAlwaysOnTop: (value: boolean) => Promise<boolean>;
    isAlwaysOnTop: () => Promise<boolean>;
    showDogWindow: () => Promise<void>;
    setDogAlwaysOnTop: (value: boolean) => Promise<boolean>;
    sendDogReward: (payload: unknown) => Promise<void>;
    onDogReward: (callback: (payload: unknown) => void) => () => void;
    sendDogState: (payload: unknown) => Promise<void>;
    onDogState: (callback: (payload: unknown) => void) => () => void;
    requestDeepSeekReview: (payload: { apiKey: string; model: string; prompt: string }) => Promise<string>;
    openDataFolder: () => Promise<void>;
  };
}
