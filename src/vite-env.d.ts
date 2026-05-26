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
  status?: "completed" | "overtime" | "interrupted";
  remainingEstimateMinutes?: number;
  musings?: TaskMusing[];
  musing?: string;
  reflection?: string;
  interruptedAt?: string;
  interruptionReason?: "app_closed" | "reload" | "unexpected_exit";
};

type TaskMusing = {
  id: string;
  text: string;
  createdAt: string;
};

type ActiveTaskSession = {
  taskId: string;
  title: string;
  categoryId: string;
  plannedMinutes: number;
  task: Task;
  startedAt: string;
  lastHeartbeatAt: string;
  elapsedMs: number;
  status: "running" | "paused";
  musings: TaskMusing[];
  musingDraft: string;
  pausedSeconds: number;
  pausedAt?: string;
  resumedAt?: string;
  lastTickAt?: string;
  estimatedRemainingMs?: number;
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

type DailyReview = {
  date: string;
  content: string;
  generatedAt: string;
  model: string;
  feedback?: {
    type: "positive" | "negative";
    comment?: string;
    updatedAt: string;
  };
};

type AppData = {
  tasks: Task[];
  completedTasks: CompletedTask[];
  categories: TaskCategory[];
  settings: AppSettings;
  dog: DogProfile;
  quickTasks: QuickTask[];
  activeSessions?: ActiveTaskSession[];
  dailyReviews?: Record<string, DailyReview>;
};

type AgentRunningTaskSnapshot = {
  id: string;
  title?: string;
  category?: string;
  categoryId?: string;
  status: "running" | "paused";
  startedAt: string;
  elapsedSeconds: number;
  estimateMinutes: number;
  note?: string;
};

type AgentTaskHistorySnapshot = {
  id: string;
  title?: string;
  category?: string;
  categoryId?: string;
  status: "completed" | "overtime" | "interrupted";
  startedAt: string;
  completedAt: string;
  actualSeconds: number;
  estimateMinutes: number;
  overtimeSeconds?: number;
  remainingEstimateMinutes?: number;
  note?: string;
  reflection?: string;
};

type AgentMusingSnapshot = {
  id: string;
  taskId: string;
  text?: string;
  createdAt: string;
};

type AgentTimelineItemSnapshot = {
  id: string;
  time: string;
  status: "completed" | "overtime" | "interrupted";
  actualSeconds: number;
  title?: string;
  category?: string;
};

type AgentStatusSnapshot = {
  app: "Floatodo";
  currentTime: string;
  mode: "compact" | "expanded";
  taskTitleHidden: boolean;
  privacy: {
    hideTaskTitles: boolean;
    sensitiveFieldsOmitted: boolean;
  };
  runningTasks: AgentRunningTaskSnapshot[];
  todayStats: {
    completedTaskCount: number;
    runningTaskCount: number;
    interruptedTaskCount: number;
    totalFocusSeconds: number;
  };
  todayTimelineSummary: AgentTimelineItemSnapshot[];
  recentMusings: AgentMusingSnapshot[];
  recentCompletedTasks: AgentTaskHistorySnapshot[];
  recentInterruptedTasks: AgentTaskHistorySnapshot[];
};

type AgentAddMusingAction = {
  type: "add-musing";
  requestId: string;
  content: string;
  source: string;
};

type AgentActionResult = {
  requestId: string;
  ok: boolean;
  action?: "add-musing";
  taskId?: string;
  createdAt?: string;
  error?: "NO_RUNNING_TASK" | "INVALID_ACTION" | "INVALID_CONTENT" | string;
};

interface Window {
  floatodo: {
    loadData: () => Promise<AppData>;
    saveData: (data: AppData) => Promise<AppData>;
    compactWindow: () => Promise<void>;
    expandWindow: () => Promise<void>;
    tuckWindow: (payload: unknown) => Promise<{ tucked: boolean; edge?: "left" | "right" | "top" | "bottom" }>;
    untuckWindow: () => Promise<boolean>;
    updateTuckWindow: (payload: unknown) => Promise<void>;
    onTuckState: (callback: (payload: unknown) => void) => () => void;
    onWindowUntucked: (callback: () => void) => () => void;
    minimizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    setAlwaysOnTop: (value: boolean) => Promise<boolean>;
    isAlwaysOnTop: () => Promise<boolean>;
    showDogWindow: () => Promise<void>;
    setDogAlwaysOnTop: (value: boolean) => Promise<boolean>;
    isDogAlwaysOnTop: () => Promise<boolean>;
    sendDogReward: (payload: unknown) => Promise<void>;
    onDogReward: (callback: (payload: unknown) => void) => () => void;
    sendDogState: (payload: unknown) => Promise<void>;
    onDogState: (callback: (payload: unknown) => void) => () => void;
    requestDeepSeekReview: (payload: { apiKey: string; model: string; prompt: string }) => Promise<string>;
    updateAgentStatus: (payload: AgentStatusSnapshot) => Promise<void>;
    onAgentAction: (callback: (payload: AgentAddMusingAction) => void) => () => void;
    resolveAgentAction: (payload: AgentActionResult) => Promise<void>;
    openDataFolder: () => Promise<void>;
  };
}
