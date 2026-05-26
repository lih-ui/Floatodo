import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { randomUUID } from "node:crypto";
import * as http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";

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
  error?: string;
};

const defaultData: AppData = {
  tasks: [],
  completedTasks: [],
  categories: [
    { id: "research", name: "研究工作", color: "#3b82f6" },
    { id: "writing", name: "文书工作", color: "#14b8a6" },
    { id: "development", name: "开发工作", color: "#8b5cf6" },
    { id: "meeting", name: "沟通会议", color: "#f59e0b" },
    { id: "leisure", name: "休闲娱乐", color: "#ef4444" },
    { id: "misc", name: "杂务", color: "#64748b" }
  ],
  settings: {
    deepseekApiKey: "",
    deepseekModel: "deepseek-chat",
    alwaysOnTop: true,
    dogRewardPreferences: {
      research: "freezeDried",
      writing: "food",
      development: "skill",
      meeting: "walk",
      leisure: "toy",
      misc: "care"
    }
  },
  dog: {
    name: "Todo",
    gender: "未设定",
    birthday: new Date().toISOString(),
    enabled: true,
    fullness: 40,
    happiness: 50,
    bond: 20,
    skillPoints: 0,
    social: 10,
    care: 50
  },
  activeSessions: [],
  dailyReviews: {},
  quickTasks: [
    { id: "break-5", title: "休息", estimateMinutes: 5, categoryId: "leisure" }
  ]
};

const defaultCategoryMap = new Map(defaultData.categories.map((category) => [category.id, category]));

let mainWindow: BrowserWindow | null = null;
let dogWindow: BrowserWindow | null = null;
let tuckWindow: BrowserWindow | null = null;
let lastDogState: unknown = { idle: "toy" };
let untuckedMainBounds: Electron.Rectangle | null = null;
let mainWindowTucked = false;
let lastTuckState: unknown = { title: "Floatodo", time: "00:00", overtime: false };
let mainAlwaysOnTop = true;
let dogAlwaysOnTop = true;
let mainWindowMode: "compact" | "expanded" = "compact";
let agentStatusSnapshot: unknown = {
  app: "Floatodo",
  generatedAt: new Date().toISOString(),
  ready: false,
  message: "Floatodo is starting"
};
let statusServer: http.Server | null = null;
const pendingAgentActions = new Map<string, (result: AgentActionResult) => void>();
const COMPACT_WINDOW_WIDTH = 560;
const COMPACT_WINDOW_HEIGHT = 820;
const COMPACT_WINDOW_MIN_WIDTH = 520;
const COMPACT_WINDOW_MIN_HEIGHT = 760;

function safeSetAlwaysOnTop(win: BrowserWindow | null, value: boolean, name: string) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(value, "floating");
  } catch (error) {
    console.error(`[Floatodo] failed to set ${name} alwaysOnTop`, error);
  }
}

function applyMainAlwaysOnTop(value = mainAlwaysOnTop) {
  mainAlwaysOnTop = value;
  safeSetAlwaysOnTop(mainWindow, value, "mainWindow");
  safeSetAlwaysOnTop(tuckWindow, value, "tuckWindow");
}

function applyDogAlwaysOnTop(value = dogAlwaysOnTop) {
  dogAlwaysOnTop = value;
  safeSetAlwaysOnTop(dogWindow, value, "dogWindow");
}

function clampWindowToWorkArea(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const maxX = area.x + Math.max(0, area.width - bounds.width);
  const maxY = area.y + Math.max(0, area.height - bounds.height);
  const x = Math.max(area.x, Math.min(bounds.x, maxX));
  const y = Math.max(area.y, Math.min(bounds.y, maxY));
  if (x === bounds.x && y === bounds.y) return;
  win.setBounds({ ...bounds, x, y });
}

function restoreMainWindow() {
  if (!mainWindow) return false;
  if (!untuckedMainBounds) {
    mainWindow.setMinimumSize(COMPACT_WINDOW_MIN_WIDTH, COMPACT_WINDOW_MIN_HEIGHT);
    mainWindow.setSize(COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT, true);
  } else {
    mainWindow.setMinimumSize(COMPACT_WINDOW_MIN_WIDTH, COMPACT_WINDOW_MIN_HEIGHT);
    mainWindow.setBounds(untuckedMainBounds, true);
    untuckedMainBounds = null;
  }
  mainWindowTucked = false;
  if (tuckWindow && !tuckWindow.isDestroyed()) tuckWindow.destroy();
  mainWindow.show();
  mainWindow.focus();
  applyMainAlwaysOnTop();
  clampWindowToWorkArea(mainWindow);
  mainWindow.webContents.send("window:untucked");
  return true;
}

function dockEdge(bounds: Electron.Rectangle, gap = 18): "left" | "right" | "top" | "bottom" | null {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const distances = [
    { edge: "left" as const, value: Math.abs(bounds.x - area.x) },
    { edge: "right" as const, value: Math.abs(area.x + area.width - (bounds.x + bounds.width)) },
    { edge: "top" as const, value: Math.abs(bounds.y - area.y) },
    { edge: "bottom" as const, value: Math.abs(area.y + area.height - (bounds.y + bounds.height)) }
  ].sort((a, b) => a.value - b.value);
  return distances[0]?.value <= gap ? distances[0].edge : null;
}

function pointInBounds(point: Electron.Point, bounds: Electron.Rectangle) {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function tuckMainWindow(edge: "left" | "right" | "top" | "bottom") {
  if (!mainWindow || mainWindowTucked) return false;
  const bounds = mainWindow.getBounds();
  if (bounds.width < COMPACT_WINDOW_MIN_WIDTH || bounds.height < COMPACT_WINDOW_MIN_HEIGHT) {
    mainWindow.setMinimumSize(COMPACT_WINDOW_MIN_WIDTH, COMPACT_WINDOW_MIN_HEIGHT);
    mainWindow.setSize(COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT, true);
    return false;
  }
  untuckedMainBounds = bounds;
  mainWindow.hide();
  mainWindowTucked = true;
  createTuckWindow(edge, lastTuckState);
  return true;
}

function startEdgeWatcher() {
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindowTucked || mainWindowMode !== "compact" || !mainWindow.isVisible()) return;
    const bounds = mainWindow.getBounds();
    const edge = dockEdge(bounds);
    if (!edge) return;
    const cursor = screen.getCursorScreenPoint();
    if (!pointInBounds(cursor, bounds)) tuckMainWindow(edge);
  }, 260);
}

function dataPath() {
  return path.join(app.getPath("userData"), "floatodo-data.json");
}

async function readData(): Promise<AppData> {
  const file = dataPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...defaultData,
      ...parsed,
      categories: parsed.categories?.length
        ? parsed.categories.map((category) => defaultCategoryMap.get(category.id) ?? category)
        : defaultData.categories,
      settings: { ...defaultData.settings, ...parsed.settings },
      dog: { ...defaultData.dog, ...parsed.dog },
      quickTasks: parsed.quickTasks?.length ? parsed.quickTasks : defaultData.quickTasks,
      activeSessions: parsed.activeSessions ?? [],
      dailyReviews: parsed.dailyReviews ?? {},
      tasks: parsed.tasks ?? [],
      completedTasks: parsed.completedTasks ?? []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeData(defaultData);
      return defaultData;
    }
    try {
      await fs.rename(file, `${file}.broken-${Date.now()}.bak`);
    } catch (backupError) {
      console.warn("[Floatodo] failed to back up broken data file", backupError);
    }
    return defaultData;
  }
}

async function writeData(data: AppData) {
  await fs.mkdir(path.dirname(dataPath()), { recursive: true });
  await fs.writeFile(dataPath(), JSON.stringify(data, null, 2), "utf8");
}

function writeJson(response: http.ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1:39876"
  });
  response.end(JSON.stringify(body, null, 2));
}

function readJsonBody(request: http.IncomingMessage, maxBytes = 8192): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        reject(new Error("REQUEST_BODY_TOO_LARGE"));
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeAgentSource(value: unknown) {
  const source = typeof value === "string" && value.trim() ? value.trim() : "external-agent";
  return source.slice(0, 80);
}

function dispatchAgentAction(action: AgentAddMusingAction): Promise<AgentActionResult> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve({ requestId: action.requestId, ok: false, error: "APP_NOT_READY" });
  }
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pendingAgentActions.delete(action.requestId);
      resolve({ requestId: action.requestId, ok: false, error: "ACTION_TIMEOUT" });
    }, 5000);
    pendingAgentActions.set(action.requestId, result => {
      clearTimeout(timeout);
      resolve(result);
    });
    mainWindow?.webContents.send("agent:action", action);
  });
}

async function handleAddMusingAction(request: http.IncomingMessage, response: http.ServerResponse) {
  if (request.method !== "POST") {
    writeJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    writeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "INVALID_REQUEST" });
    return;
  }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content) {
    writeJson(response, 400, { ok: false, error: "INVALID_CONTENT" });
    return;
  }
  if (content.length > 500) {
    writeJson(response, 400, { ok: false, error: "CONTENT_TOO_LONG" });
    return;
  }
  const result = await dispatchAgentAction({
    type: "add-musing",
    requestId: randomUUID(),
    content,
    source: normalizeAgentSource(payload.source)
  });
  writeJson(response, result.ok ? 200 : 409, result.requestId
    ? { ok: result.ok, action: result.action, taskId: result.taskId, createdAt: result.createdAt, error: result.error }
    : result);
}

function startAgentStatusServer() {
  if (statusServer) return;
  statusServer = http.createServer((request, response) => {
    if (request.socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) {
      writeJson(response, 403, { error: "forbidden" });
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1:39876");
    if (url.pathname === "/api/status") {
      if (request.method !== "GET") {
        writeJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      writeJson(response, 200, typeof agentStatusSnapshot === "object" && agentStatusSnapshot
        ? { ...agentStatusSnapshot, currentTime: new Date().toISOString() }
        : agentStatusSnapshot);
      return;
    }
    if (url.pathname === "/api/actions/add-musing") {
      void handleAddMusingAction(request, response).catch(error => {
        console.error("[Floatodo] agent action failed", error);
        writeJson(response, 500, { ok: false, error: "INTERNAL_ERROR" });
      });
      return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
      writeJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    writeJson(response, 404, { error: "not_found" });
  });
  statusServer.on("error", error => {
    console.error("[Floatodo] agent status server failed", error);
    statusServer = null;
  });
  statusServer.listen(39876, "127.0.0.1", () => {
    console.log("[Floatodo] agent status server listening on http://127.0.0.1:39876/api/status");
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: COMPACT_WINDOW_WIDTH,
    height: COMPACT_WINDOW_HEIGHT,
    minWidth: COMPACT_WINDOW_MIN_WIDTH,
    minHeight: COMPACT_WINDOW_MIN_HEIGHT,
    frame: false,
    backgroundColor: "#f5f7fb",
    transparent: false,
    resizable: false,
    alwaysOnTop: mainAlwaysOnTop,
    skipTaskbar: false,
    title: "Floatodo",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const createdMainWindow = mainWindow;
  mainWindow.once("closed", () => {
    if (mainWindow === createdMainWindow) mainWindow = null;
  });
  mainWindow.on("moved", () => clampWindowToWorkArea(mainWindow));
  mainWindow.on("resized", () => clampWindowToWorkArea(mainWindow));
  applyMainAlwaysOnTop();
  clampWindowToWorkArea(mainWindow);

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Floatodo] load failed ${errorCode}: ${errorDescription} (${validatedURL})`);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Floatodo renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[Floatodo] renderer gone: ${details.reason}`);
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function createDogWindow() {
  if (dogWindow && !dogWindow.isDestroyed()) return false;
  let dogWindowShown = false;
  const showDogWindowWhenReady = () => {
    if (!dogWindow || dogWindow.isDestroyed() || dogWindowShown) return;
    dogWindowShown = true;
    applyDogAlwaysOnTop();
    dogWindow.showInactive();
  };

  dogWindow = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 260,
    minHeight: 260,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: dogAlwaysOnTop,
    skipTaskbar: true,
    title: "Floatodo Corgi",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  const createdDogWindow = dogWindow;
  dogWindow.once("closed", () => {
    if (dogWindow === createdDogWindow) dogWindow = null;
  });
  applyDogAlwaysOnTop();

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  dogWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Floatodo dog renderer] load failed ${errorCode}: ${errorDescription} (${validatedURL})`);
  });
  dogWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Floatodo dog renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  dogWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[Floatodo dog renderer] gone: ${details.reason}`);
  });
  dogWindow.once("ready-to-show", showDogWindowWhenReady);

  if (!app.isPackaged) {
    void dogWindow.loadURL(`${devUrl}?dogWindow=1`);
  } else {
    void dogWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { dogWindow: "1" } });
  }

  dogWindow.webContents.once("did-finish-load", () => {
    dogWindow?.webContents.send("dog:state", lastDogState);
    showDogWindowWhenReady();
  });
  return true;
}

function createTuckWindow(edge: "left" | "right" | "top" | "bottom", state: unknown) {
  if (tuckWindow && !tuckWindow.isDestroyed()) tuckWindow.destroy();

  lastTuckState = state;
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  const area = display.workArea;
  const vertical = edge === "left" || edge === "right";
  const width = vertical ? 118 : 176;
  const height = vertical ? 128 : 78;
  const source = untuckedMainBounds ?? mainWindow?.getBounds() ?? {
    x: area.x + area.width - COMPACT_WINDOW_WIDTH - 20,
    y: area.y + 80,
    width: COMPACT_WINDOW_WIDTH,
    height: COMPACT_WINDOW_HEIGHT
  };
  const x = edge === "left"
    ? area.x
    : edge === "right"
      ? area.x + area.width - width
      : Math.max(area.x, Math.min(source.x + 40, area.x + area.width - width));
  const y = edge === "top"
    ? area.y
    : edge === "bottom"
      ? area.y + area.height - height
      : Math.max(area.y, Math.min(source.y + 40, area.y + area.height - height));

  tuckWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: mainAlwaysOnTop,
    skipTaskbar: true,
    title: "Floatodo Timer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const createdTuckWindow = tuckWindow;
  tuckWindow.once("closed", () => {
    if (tuckWindow === createdTuckWindow) tuckWindow = null;
  });
  applyMainAlwaysOnTop();

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  if (!app.isPackaged) {
    void tuckWindow.loadURL(`${devUrl}?tuckWindow=1&edge=${edge}`);
  } else {
    void tuckWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { tuckWindow: "1", edge } });
  }

  tuckWindow.webContents.once("did-finish-load", () => {
    tuckWindow?.webContents.send("window:tuckState", lastTuckState);
    tuckWindow?.showInactive();
  });
}

app.whenReady().then(() => {
  startAgentStatusServer();
  createWindow();
  startEdgeWatcher();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  statusServer?.close();
  statusServer = null;
});

ipcMain.handle("data:load", async () => {
  const data = await readData();
  applyMainAlwaysOnTop(data.settings.alwaysOnTop ?? mainAlwaysOnTop);
  return data;
});

ipcMain.handle("data:save", async (_event, data: AppData) => {
  await writeData(data);
  return data;
});

ipcMain.handle("agent:status", (_event, snapshot: unknown) => {
  agentStatusSnapshot = snapshot;
});

ipcMain.handle("agent:actionResult", (_event, result: AgentActionResult) => {
  const resolve = pendingAgentActions.get(result.requestId);
  if (!resolve) return;
  pendingAgentActions.delete(result.requestId);
  resolve(result);
});

ipcMain.handle("window:compact", () => {
  untuckedMainBounds = null;
  mainWindowTucked = false;
  mainWindowMode = "compact";
  if (tuckWindow && !tuckWindow.isDestroyed()) tuckWindow.destroy();
  mainWindow?.show();
  mainWindow?.setMinimumSize(COMPACT_WINDOW_MIN_WIDTH, COMPACT_WINDOW_MIN_HEIGHT);
  mainWindow?.setSize(COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT, true);
  clampWindowToWorkArea(mainWindow);
  applyMainAlwaysOnTop();
});

ipcMain.handle("window:expanded", () => {
  untuckedMainBounds = null;
  mainWindowTucked = false;
  mainWindowMode = "expanded";
  if (tuckWindow && !tuckWindow.isDestroyed()) tuckWindow.destroy();
  mainWindow?.show();
  mainWindow?.setMinimumSize(900, 680);
  mainWindow?.setSize(1060, 760, true);
  clampWindowToWorkArea(mainWindow);
  applyMainAlwaysOnTop();
});

ipcMain.handle("window:tuck", (_event, state: unknown) => {
  lastTuckState = state;
  if (!mainWindow) return { tucked: false };
  clampWindowToWorkArea(mainWindow);
  const edge = dockEdge(mainWindow.getBounds(), 24);
  return { tucked: Boolean(edge && tuckMainWindow(edge)), edge: edge ?? undefined };
});

ipcMain.handle("window:untuck", () => {
  return restoreMainWindow();
});

ipcMain.handle("window:tuckUpdate", (_event, state: unknown) => {
  lastTuckState = state;
  if (tuckWindow && !tuckWindow.isDestroyed()) tuckWindow.webContents.send("window:tuckState", state);
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  try {
    applyMainAlwaysOnTop(value);
  } catch (error) {
    console.error("[Floatodo] window:setAlwaysOnTop failed", error);
  }
  return mainAlwaysOnTop;
});

ipcMain.handle("window:isAlwaysOnTop", () => {
  return mainAlwaysOnTop;
});

ipcMain.handle("dog:show", () => {
  const created = createDogWindow();
  applyDogAlwaysOnTop();
  if (!created && dogWindow && !dogWindow.isDestroyed()) dogWindow.showInactive();
});

ipcMain.handle("dog:setAlwaysOnTop", (_event, value: boolean) => {
  try {
    applyDogAlwaysOnTop(value);
  } catch (error) {
    console.error("[Floatodo] dog:setAlwaysOnTop failed", error);
  }
  return dogAlwaysOnTop;
});

ipcMain.handle("dog:isAlwaysOnTop", () => {
  return dogAlwaysOnTop;
});

ipcMain.handle("dog:reward", (_event, reward: unknown) => {
  if (!dogWindow || dogWindow.isDestroyed()) return;
  dogWindow?.showInactive();
  dogWindow?.webContents.send("dog:reward", reward);
});

ipcMain.handle("dog:state", (_event, state: unknown) => {
  lastDogState = state;
  if (!dogWindow || dogWindow.isDestroyed()) return;
  dogWindow.webContents.send("dog:state", state);
});

ipcMain.handle("deepseek:review", async (_event, payload: { apiKey: string; model: string; prompt: string }) => {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.apiKey}`
    },
    body: JSON.stringify({
      model: payload.model || "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是一位温和、务实、支持型的个人复盘教练，请基于真实任务记录给出简洁、具体、可执行且不增加压力的复盘。"
        },
        {
          role: "user",
          content: payload.prompt
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `DeepSeek request failed: ${response.status}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "DeepSeek 没有返回内容。";
});

ipcMain.handle("app:openDataFolder", async () => {
  await shell.openPath(app.getPath("userData"));
});
