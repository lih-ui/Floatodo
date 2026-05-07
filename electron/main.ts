import { app, BrowserWindow, ipcMain, shell } from "electron";
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
  quickTasks: [
    { id: "break-5", title: "休息", estimateMinutes: 5, categoryId: "leisure" }
  ]
};

const defaultCategoryMap = new Map(defaultData.categories.map((category) => [category.id, category]));

let mainWindow: BrowserWindow | null = null;
let dogWindow: BrowserWindow | null = null;
let lastDogState: unknown = { idle: "toy" };

function dataPath() {
  return path.join(app.getPath("userData"), "floatodo-data.json");
}

async function readData(): Promise<AppData> {
  try {
    const raw = await fs.readFile(dataPath(), "utf8");
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
      tasks: parsed.tasks ?? [],
      completedTasks: parsed.completedTasks ?? []
    };
  } catch {
    await writeData(defaultData);
    return defaultData;
  }
}

async function writeData(data: AppData) {
  await fs.mkdir(path.dirname(dataPath()), { recursive: true });
  await fs.writeFile(dataPath(), JSON.stringify(data, null, 2), "utf8");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 340,
    minHeight: 500,
    frame: false,
    backgroundColor: "#f5f7fb",
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "Floatodo",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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
  if (dogWindow && !dogWindow.isDestroyed()) return;

  dogWindow = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 260,
    minHeight: 260,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Floatodo Corgi",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
  if (!app.isPackaged) {
    void dogWindow.loadURL(`${devUrl}?dogWindow=1`);
  } else {
    void dogWindow.loadFile(path.join(__dirname, "../dist/index.html"), { query: { dogWindow: "1" } });
  }

  dogWindow.webContents.once("did-finish-load", () => {
    dogWindow?.webContents.send("dog:state", lastDogState);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("data:load", readData);

ipcMain.handle("data:save", async (_event, data: AppData) => {
  await writeData(data);
  return data;
});

ipcMain.handle("window:compact", () => {
  mainWindow?.setMinimumSize(340, 500);
  mainWindow?.setSize(360, 520, true);
});

ipcMain.handle("window:expanded", () => {
  mainWindow?.setMinimumSize(900, 680);
  mainWindow?.setSize(1060, 760, true);
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  mainWindow?.setAlwaysOnTop(value);
  dogWindow?.setAlwaysOnTop(value);
  return mainWindow?.isAlwaysOnTop() ?? value;
});

ipcMain.handle("window:isAlwaysOnTop", () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

ipcMain.handle("dog:show", () => {
  createDogWindow();
  dogWindow?.show();
});

ipcMain.handle("dog:setAlwaysOnTop", (_event, value: boolean) => {
  dogWindow?.setAlwaysOnTop(value);
  return dogWindow?.isAlwaysOnTop() ?? value;
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
          content: "你是一位务实的个人效率教练，请基于真实任务记录给出简洁、具体、可执行的复盘。"
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
