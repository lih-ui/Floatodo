import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Bookmark, Check, ChevronRight, Clock3, Eye, EyeOff, FolderOpen, Maximize2, Minimize2, Pause, Pencil, Pin, PinOff, Play, Plus, Settings, Sparkles, Trash2, X } from "lucide-react";
import "./styles.css";
import corgiEat1 from "./assets/corgi-eat-1.png";
import corgiEat2 from "./assets/corgi-eat-2.png";
import corgiEat3 from "./assets/corgi-eat-3.png";
import corgiEat4 from "./assets/corgi-eat-4.png";
import corgiPlay1 from "./assets/corgi-play-1.png";
import corgiPlay2 from "./assets/corgi-play-2.png";
import corgiPlay3 from "./assets/corgi-play-3.png";
import corgiPlay4 from "./assets/corgi-play-4.png";
import corgiSleep1 from "./assets/corgi-sleep-1.png";
import corgiSleep2 from "./assets/corgi-sleep-2.png";
import corgiSleep3 from "./assets/corgi-sleep-3.png";
import corgiSleep4 from "./assets/corgi-sleep-4.png";

type ActiveTimer = { task: Task; startedAt: string; pausedSeconds: number; pausedAt?: string };
type RunningTimer = ActiveTimer & { musings: TaskMusing[] };
type TuckTimerState = { title: string; overtime: boolean; startedAt?: string; estimateSeconds?: number; pausedSeconds?: number; pausedAt?: string; idleTime?: string; taskTitleHidden?: boolean };
type CompactPanel = "focus" | "tasks";
type ManualCompletionTarget = { task: Task; keepTask: boolean };
type EditingTaskSource = "todo" | "fixed" | "running";
type EditingTaskTarget = { source: EditingTaskSource; id: string; task: Task | QuickTask };
type EditingTaskForm = { title: string; categoryId: string; estimateMinutes: string; note: string };
type DogRewardKind = "food" | "freezeDried" | "snack" | "toy" | "skill" | "walk" | "care";
type DogReward = { categoryId: string; item: string; action: string; message: string; animation: "sniff" | "eat" | "learn" | "walk" | "play" | "care"; stat: "fullness" | "happiness" | "bond" | "skillPoints" | "social" | "care"; amount: number };
type DayMetric = { date: string; tasks: CompletedTask[]; totalSeconds: number; overtimeSeconds: number; score: number };
type AiTaskSuggestion = { id: string; title: string; estimateMinutes: number; categoryName?: string; categoryId: string; reason?: string; source?: string; accepted?: boolean };
type ReviewToken = { text: string; bold: boolean };
const MAX_RUNNING_TASKS = 3;
const ACTIVE_SESSION_HEARTBEAT_MS = 3000;
const ACTIVE_SESSION_STALE_MS = 8000;
const TASK_TITLE_HIDDEN_STORAGE_KEY = "floatodo.taskTitleHidden";
const DEFAULT_DONE_REASONS = ["按计划完成", "比预期顺利", "比预期复杂", "基本完成", "需要复盘", "下次拆小"];
const DEFAULT_INTERRUPT_REASONS = ["临时打断", "等待反馈", "方向不清", "任务太大", "状态不佳", "稍后继续"];
const COMPACT_MUSING_EMOJIS = ["😀", "😄", "😊", "😌", "😭", "😤", "😮‍💨", "👍", "👏", "🎉", "✨", "💪", "🐶", "☕", "🍀"];
const defaultPrefs: Record<string, DogRewardKind> = { research: "freezeDried", writing: "food", development: "skill", meeting: "walk", leisure: "toy", misc: "care" };
const rewardOptions: Record<DogRewardKind, Omit<DogReward, "categoryId">> = {
  food: { item: "狗粮", action: "埋头吃饭，饱腹感上升", message: "任务完成，小狗吃到一碗狗粮。", animation: "eat", stat: "fullness", amount: 10 },
  freezeDried: { item: "冻干", action: "认真嗅嗅然后开心吃掉", message: "任务完成，小狗获得一块冻干。", animation: "sniff", stat: "happiness", amount: 6 },
  snack: { item: "零食", action: "开心摇尾巴，亲密感上升", message: "任务完成，小狗获得一份零食。", animation: "eat", stat: "bond", amount: 6 },
  toy: { item: "玩具", action: "追着球玩了一会儿", message: "任务完成，小狗获得一个玩具。", animation: "play", stat: "happiness", amount: 10 },
  skill: { item: "技能训练", action: "练习新动作，技能进度 +1", message: "任务完成，小狗学到一点新技能。", animation: "learn", stat: "skillPoints", amount: 1 },
  walk: { item: "散步机会", action: "出门转一圈，社交值上升", message: "任务完成，小狗获得一次散步。", animation: "walk", stat: "social", amount: 8 },
  care: { item: "护理", action: "毛毛变蓬松，舒服值上升", message: "任务完成，小狗获得一次清洁护理。", animation: "care", stat: "care", amount: 10 }
};
const uid = () => crypto.randomUUID();
const todayKey = () => new Date().toISOString().slice(0, 10);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const fmt = (sec: number) => { const v = Math.abs(sec), h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = v % 60; return `${sec < 0 ? "-" : ""}${h ? `${String(h).padStart(2, "0")}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
const mins = (sec: number) => `${Math.round(sec / 60)} 分钟`;
const time = (iso: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const rewardKind = (prefs: AppSettings["dogRewardPreferences"] | undefined, id: string): DogRewardKind => prefs?.[id] ?? defaultPrefs[id] ?? "snack";
const rewardFor = (id: string, prefs?: AppSettings["dogRewardPreferences"]): DogReward => ({ categoryId: id, ...rewardOptions[rewardKind(prefs, id)] });
const cleanReview = (s: string) => s.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
const cleanJson = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
const normalizeCategory = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const clampSuggestionMinutes = (n: number) => Math.max(5, Math.min(180, Math.round(Number.isFinite(n) ? n : 25)));
const suggestionText = (v: unknown) => typeof v === "string" ? v.trim() : "";
function suggestionCategoryId(name: string, categories: TaskCategory[]) {
  const fallback = categories.find(c => c.id === "misc")?.id ?? categories[0]?.id ?? "misc", exact = categories.find(c => c.name === name);
  if (exact) return exact.id;
  const n = normalizeCategory(name), loose = categories.find(c => normalizeCategory(c.name) === n);
  if (loose) return loose.id;
  return categories.find(c => n.includes(normalizeCategory(c.name)) || normalizeCategory(c.name).includes(n))?.id ?? fallback;
}
function parseTaskSuggestions(text: string, categories: TaskCategory[]): AiTaskSuggestion[] {
  const raw = JSON.parse(cleanJson(text)) as unknown;
  if (!Array.isArray(raw)) throw new Error("AI 返回的建议格式不是数组。");
  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>, title = suggestionText(r.title), categoryName = suggestionText(r.category);
    if (!title) return [];
    return [{ id: uid(), title, estimateMinutes: clampSuggestionMinutes(Number(r.estimateMinutes)), categoryName: categoryName || categories.find(c => c.id === suggestionCategoryId(categoryName, categories))?.name, categoryId: suggestionCategoryId(categoryName, categories), reason: suggestionText(r.reason) || undefined, source: suggestionText(r.source) || undefined }];
  }).slice(0, 5);
}
const timerSeconds = (timer: ActiveTimer, nowMs = Date.now()) => Math.max(0, Math.floor(((timer.pausedAt ? new Date(timer.pausedAt).getTime() : nowMs) - new Date(timer.startedAt).getTime()) / 1000) - timer.pausedSeconds);
const timerDisplay = (timer: ActiveTimer, nowMs = Date.now()) => {
  const elapsed = timerSeconds(timer, nowMs), estimateSeconds = timer.task.estimateMinutes * 60, remaining = estimateSeconds - elapsed, overtime = remaining < 0;
  return { elapsed, remaining, overtime, time: fmt(overtime ? elapsed - estimateSeconds : remaining) };
};
function activeSessionsFromTimers(timers: RunningTimer[], drafts: Record<string, string>, nowMs = Date.now()): ActiveTaskSession[] {
  const heartbeatAt = new Date(nowMs).toISOString();
  return timers.map(timer => {
    const elapsedMs = timerSeconds(timer, nowMs) * 1000;
    return {
      taskId: timer.task.id,
      title: timer.task.title,
      categoryId: timer.task.categoryId,
      plannedMinutes: timer.task.estimateMinutes,
      task: timer.task,
      startedAt: timer.startedAt,
      lastHeartbeatAt: heartbeatAt,
      elapsedMs,
      status: timer.pausedAt ? "paused" : "running",
      musings: timer.musings,
      musingDraft: drafts[timer.task.id] ?? "",
      pausedSeconds: timer.pausedSeconds,
      pausedAt: timer.pausedAt,
      lastTickAt: heartbeatAt,
      estimatedRemainingMs: Math.max(0, timer.task.estimateMinutes * 60000 - elapsedMs)
    };
  });
}
function timerFromActiveSession(session: ActiveTaskSession): RunningTimer {
  return {
    task: session.task ?? { id: session.taskId, title: session.title, categoryId: session.categoryId, estimateMinutes: session.plannedMinutes, createdAt: session.startedAt },
    startedAt: session.startedAt,
    pausedSeconds: session.pausedSeconds ?? 0,
    pausedAt: session.status === "paused" ? session.pausedAt ?? session.lastHeartbeatAt : undefined,
    musings: session.musings ?? []
  };
}
function interruptedTaskFromSession(session: ActiveTaskSession, interruptedAt: string): CompletedTask {
  const task = session.task ?? { id: session.taskId, title: session.title, categoryId: session.categoryId, estimateMinutes: session.plannedMinutes, createdAt: session.startedAt };
  const actualSeconds = Math.max(1, Math.floor((session.elapsedMs ?? 0) / 1000));
  const spentMinutes = Math.max(1, Math.ceil(actualSeconds / 60));
  const remainingEstimateMinutes = Math.max(1, Math.ceil((session.estimatedRemainingMs ?? Math.max(0, task.estimateMinutes * 60000 - actualSeconds * 1000)) / 60000), task.estimateMinutes - spentMinutes);
  const draft = session.musingDraft?.trim();
  return {
    ...task,
    startedAt: session.startedAt,
    completedAt: interruptedAt,
    interruptedAt,
    actualSeconds,
    overtimeSeconds: 0,
    status: "interrupted",
    remainingEstimateMinutes,
    musings: session.musings?.length ? session.musings : undefined,
    musing: draft || undefined,
    reflection: draft ? `应用异常退出，已自动记录为中断。未发送草稿：${draft}` : "应用异常退出，已自动记录为中断。",
    interruptionReason: "unexpected_exit"
  };
}
function reconcileInterruptedSessions(d: AppData, nowMs = Date.now()) {
  const sessions = d.activeSessions ?? [];
  if (!sessions.length) return { data: d, restoredTimers: [] as RunningTimer[], restoredDrafts: {} as Record<string, string>, archivedCount: 0, changed: false };
  const interruptedAt = new Date(nowMs).toISOString();
  const existingKeys = new Set(d.completedTasks.map(t => `${t.id}:${t.startedAt}:interrupted`));
  const stale = sessions.filter(session => nowMs - new Date(session.lastHeartbeatAt).getTime() > ACTIVE_SESSION_STALE_MS);
  const fresh = sessions.filter(session => !stale.includes(session));
  const archived = stale
    .filter(session => !existingKeys.has(`${session.taskId}:${session.startedAt}:interrupted`))
    .map(session => interruptedTaskFromSession(session, interruptedAt));
  const restoredTimers = fresh.map(timerFromActiveSession);
  const restoredDrafts = Object.fromEntries(fresh.filter(session => session.musingDraft).map(session => [session.taskId, session.musingDraft])) as Record<string, string>;
  const data = stale.length
    ? { ...d, completedTasks: [...archived, ...d.completedTasks], activeSessions: fresh }
    : d;
  return { data, restoredTimers, restoredDrafts, archivedCount: archived.length, changed: stale.length > 0 };
}
const tuckStateFromTimer = (timer: ActiveTimer | null, idleTime = "00:00", taskTitleHidden = false): TuckTimerState => timer ? { title: taskTitleHidden ? "" : timer.task.title, overtime: timerDisplay(timer).overtime, startedAt: timer.startedAt, estimateSeconds: timer.task.estimateMinutes * 60, pausedSeconds: timer.pausedSeconds, pausedAt: timer.pausedAt, taskTitleHidden } : { title: "Floatodo", overtime: false, idleTime, taskTitleHidden };
function normalize(d: AppData): AppData { return { ...d, settings: { ...d.settings, alwaysOnTop: d.settings.alwaysOnTop ?? true, dogRewardPreferences: { ...defaultPrefs, ...(d.settings.dogRewardPreferences ?? {}) } }, dog: { name: d.dog?.name ?? "Todo", gender: d.dog?.gender ?? "未设定", birthday: d.dog?.birthday ?? new Date().toISOString(), enabled: d.dog?.enabled ?? true, fullness: d.dog?.fullness ?? 40, happiness: d.dog?.happiness ?? 50, bond: d.dog?.bond ?? 20, skillPoints: d.dog?.skillPoints ?? 0, social: d.dog?.social ?? 10, care: d.dog?.care ?? 50 }, quickTasks: d.quickTasks?.length ? d.quickTasks : [{ id: "break-5", title: "休息", estimateMinutes: 5, categoryId: "leisure" }], activeSessions: d.activeSessions ?? [], dailyReviews: d.dailyReviews ?? {} }; }
function dayMetrics(tasks: CompletedTask[]) { const g: Record<string, CompletedTask[]> = {}; tasks.forEach(t => { const k = t.completedAt.slice(0, 10); g[k] = [...(g[k] ?? []), t]; }); return Object.fromEntries(Object.entries(g).map(([date, ts]) => { const totalSeconds = ts.reduce((s, t) => s + t.actualSeconds, 0), overtimeSeconds = ts.reduce((s, t) => s + t.overtimeSeconds, 0); return [date, { date, tasks: ts, totalSeconds, overtimeSeconds, score: Math.max(0, Math.round(Math.min(64, totalSeconds / 225) + Math.min(24, ts.length * 6) - (totalSeconds ? Math.min(28, overtimeSeconds / totalSeconds * 36) : 0))) }]; })) as Record<string, DayMetric>; }
function normalizeReasonChip(text: string, type: "done" | "interrupt") {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  const rules: Array<[RegExp, string]> = [
    [/(bug|报错|错误|修复)/i, "修 bug"],
    [/(调试|测试)/, "调试中"],
    [/(太大|拆分|复杂)/, "需要拆分"],
    [/(别的任务|临时|开会)/, "临时打断"],
    [/(反馈|等别人|等待)/, "等待反馈"],
    [/(方向|不清楚|卡住)/, "方向不清"],
    [/(学习|看看|参考|小红书|设计)/, "学习参考"],
    [/(休息|吃饭|吃|累|困|状态)/, "需要休息"],
    [/(明天|后面|之后|回来)/, "稍后继续"],
    [/(完成|改完|搞定|做完)/, "基本完成"]
  ];
  const matched = rules.find(([pattern]) => pattern.test(raw))?.[1];
  if (matched) return matched;
  const compact = text
    .replace(/[，。！？、,.!?；;：:\s"'“”‘’（）()【】[\]…~-]/g, "")
    .replace(/^(先|再|然后|就是|感觉|觉得|有点|已经|基本|这个|那个)+/, "")
    .replace(/(了|啦|呀|啊|呢|吧|哦|哈)+$/g, "");
  const chinese = compact.match(/[\u4e00-\u9fa5]/g)?.join("") ?? "";
  if (chinese.length < 2) return null;
  if (chinese.length > 10 && text.trim().length > 16) return null;
  const chip = chinese.slice(0, type === "done" ? 8 : 10);
  return chip.length >= 2 ? chip : null;
}
function reasonSuggestions(tasks: CompletedTask[], interrupted: boolean, fallback: string[]) {
  const seen = new Map<string, { text: string; count: number; firstIndex: number }>();
  tasks.forEach((task, index) => {
    if ((task.status === "interrupted") !== interrupted) return;
    const text = task.reflection?.trim(), chip = text ? normalizeReasonChip(text, interrupted ? "interrupt" : "done") : null;
    if (!chip) return;
    const item = seen.get(chip);
    if (item) item.count += 1;
    else seen.set(chip, { text: chip, count: 1, firstIndex: index });
  });
  const suggestions = Array.from(seen.values())
    .sort((a, b) => (a.firstIndex - Math.min(a.count - 1, 3)) - (b.firstIndex - Math.min(b.count - 1, 3)))
    .map(item => item.text)
    .slice(0, 8);
  return suggestions.length ? suggestions : fallback;
}

const shortText = (text: string | undefined, max = 42) => {
  const value = text?.replace(/\s+/g, " ").trim() ?? "";
  return value.length > max ? `${value.slice(0, max)}...` : value || "无";
};
const categoryName = (cats: Map<string, TaskCategory>, id: string) => cats.get(id)?.name ?? "未分类";
const completedStatus = (task: CompletedTask): "completed" | "overtime" | "interrupted" => task.status === "interrupted" ? "interrupted" : task.status === "overtime" || task.overtimeSeconds > 0 ? "overtime" : "completed";
function buildAgentStatusSnapshot(input: { data: AppData; mode: "compact" | "expanded"; taskTitleHidden: boolean; activeTimers: RunningTimer[]; today: CompletedTask[]; cats: Map<string, TaskCategory>; nowMs?: number }): AgentStatusSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const privateMode = input.taskTitleHidden;
  const publicTaskFields = (task: Task) => privateMode ? {} : {
    title: task.title,
    category: categoryName(input.cats, task.categoryId),
    categoryId: task.categoryId,
    note: task.note
  };
  const publicHistoryFields = (task: CompletedTask) => privateMode ? {} : {
    title: task.title,
    category: categoryName(input.cats, task.categoryId),
    categoryId: task.categoryId,
    note: task.note,
    reflection: task.reflection
  };
  const completedToday = input.today.filter(task => completedStatus(task) !== "interrupted");
  const interruptedToday = input.today.filter(task => completedStatus(task) === "interrupted");
  const toHistory = (task: CompletedTask): AgentTaskHistorySnapshot => ({
    id: task.id,
    ...publicHistoryFields(task),
    status: completedStatus(task),
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    actualSeconds: task.actualSeconds,
    estimateMinutes: task.estimateMinutes,
    overtimeSeconds: task.overtimeSeconds,
    remainingEstimateMinutes: task.remainingEstimateMinutes
  });
  const recentMusings = privateMode ? [] : input.activeTimers
    .flatMap(timer => timer.musings.map(musing => ({ id: musing.id, taskId: timer.task.id, text: musing.text, createdAt: musing.createdAt })))
    .concat(input.today.flatMap(task => (task.musings ?? []).map(musing => ({ id: musing.id, taskId: task.id, text: musing.text, createdAt: musing.createdAt }))))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);
  return {
    app: "Floatodo",
    currentTime: new Date(nowMs).toISOString(),
    mode: input.mode,
    taskTitleHidden: privateMode,
    privacy: {
      hideTaskTitles: privateMode,
      sensitiveFieldsOmitted: privateMode
    },
    runningTasks: input.activeTimers.map(timer => ({
      id: timer.task.id,
      ...publicTaskFields(timer.task),
      status: timer.pausedAt ? "paused" : "running",
      startedAt: timer.startedAt,
      elapsedSeconds: timerSeconds(timer, nowMs),
      estimateMinutes: timer.task.estimateMinutes
    })),
    todayStats: {
      completedTaskCount: completedToday.length,
      runningTaskCount: input.activeTimers.length,
      interruptedTaskCount: interruptedToday.length,
      totalFocusSeconds: input.today.reduce((sum, task) => sum + task.actualSeconds, 0)
    },
    todayTimelineSummary: input.today.slice(0, 12).map(task => ({
      id: task.id,
      time: task.completedAt,
      status: completedStatus(task),
      actualSeconds: task.actualSeconds,
      ...(privateMode ? {} : { title: task.title, category: categoryName(input.cats, task.categoryId) })
    })),
    recentMusings,
    recentCompletedTasks: input.data.completedTasks.filter(task => completedStatus(task) !== "interrupted").slice(0, 5).map(toHistory),
    recentInterruptedTasks: input.data.completedTasks.filter(task => completedStatus(task) === "interrupted").slice(0, 5).map(toHistory)
  };
}
const statusName = (task: CompletedTask) => task.status === "interrupted" ? "中断" : task.overtimeSeconds > 0 || task.status === "overtime" ? "超时完成" : "完成";
const dayKeyFromOffset = (offset: number) => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
const topCategoryNames = (tasks: CompletedTask[], cats: Map<string, TaskCategory>, limit = 3) => {
  const counts = new Map<string, number>();
  tasks.forEach(task => counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1));
  const names = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, count]) => `${categoryName(cats, id)} ${count}项`);
  return names.length ? names.join("、") : "无";
};
const keywordSet = (title: string) => new Set((title.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) ?? []).map(x => x.trim()).filter(Boolean));
function buildHistorySummary(allTasks: CompletedTask[], todayTasks: CompletedTask[], cats: Map<string, TaskCategory>) {
  const today = todayKey();
  const last7Keys = Array.from({ length: 7 }, (_, i) => dayKeyFromOffset(i)).reverse();
  const last7Tasks = allTasks.filter(t => last7Keys.includes(t.completedAt.slice(0, 10)));
  const last30Keys = new Set(Array.from({ length: 30 }, (_, i) => dayKeyFromOffset(i)));
  const last30Tasks = allTasks.filter(t => last30Keys.has(t.completedAt.slice(0, 10)));
  const completed = (tasks: CompletedTask[]) => tasks.filter(t => t.status !== "interrupted");
  const interrupted = (tasks: CompletedTask[]) => tasks.filter(t => t.status === "interrupted");
  const totalSeconds = (tasks: CompletedTask[]) => tasks.reduce((sum, task) => sum + task.actualSeconds, 0);
  const avg7Focus = last7Keys.length ? totalSeconds(last7Tasks) / last7Keys.length : 0;
  const avg7Done = last7Keys.length ? completed(last7Tasks).length / last7Keys.length : 0;
  const todayFocus = totalSeconds(todayTasks);
  const todayInterrupted = interrupted(todayTasks).length;
  const dailyLines = last7Keys.map(key => {
    const tasks = allTasks.filter(t => t.completedAt.slice(0, 10) === key);
    return `${key}${key === today ? "（今天）" : ""}：完成${completed(tasks).length}项，中断${interrupted(tasks).length}项，专注${mins(totalSeconds(tasks))}，主要类别：${topCategoryNames(tasks, cats, 2)}`;
  });
  const categoryTotals = (tasks: CompletedTask[]) => {
    const counts = new Map<string, number>();
    tasks.forEach(t => counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  };
  const interruptedCategoryTotals = categoryTotals(interrupted(last30Tasks));
  const todayKeywords = new Set(todayTasks.flatMap(t => Array.from(keywordSet(t.title))));
  const historicalTasks = allTasks.filter(t => t.completedAt.slice(0, 10) !== today);
  const similar = historicalTasks
    .map(task => {
      const sharedKeywords = Array.from(keywordSet(task.title)).filter(k => todayKeywords.has(k)).length;
      const sameCategory = todayTasks.some(t => t.categoryId === task.categoryId) ? 1 : 0;
      return { task, score: sharedKeywords * 2 + sameCategory };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.task.completedAt).getTime() - new Date(a.task.completedAt).getTime())
    .slice(0, 5)
    .map(({ task }) => `- ${task.title}｜${task.completedAt.slice(0, 10)}｜${categoryName(cats, task.categoryId)}｜预估${task.estimateMinutes}分钟｜实际${mins(task.actualSeconds)}｜${statusName(task)}｜备注摘要：${shortText(task.reflection || task.musing || task.note)}`);
  const shortTasks = todayTasks.filter(t => t.actualSeconds <= 10 * 60).length;
  const categorySpread = new Set(todayTasks.map(t => t.categoryId)).size;
  const historicalEnough = historicalTasks.length >= 3 || new Set(historicalTasks.map(t => t.completedAt.slice(0, 10))).size >= 2;
  return [
    `历史数据情况：${historicalEnough ? "已有一些历史记录，可以轻量对比。" : "历史记录还不多，请主要根据今天分析，不要硬凑趋势。"}`,
    "",
    "最近7天整体摘要：",
    ...dailyLines,
    `最近7天平均：每天完成${avg7Done.toFixed(1)}项，平均专注${mins(avg7Focus)}，中断率${last7Tasks.length ? Math.round(interrupted(last7Tasks).length / last7Tasks.length * 100) : 0}%。`,
    "",
    "最近30天整体趋势：",
    `总完成${completed(last30Tasks).length}项，总专注${mins(totalSeconds(last30Tasks))}，平均每天完成${(completed(last30Tasks).length / 30).toFixed(1)}项，平均每天专注${mins(totalSeconds(last30Tasks) / 30)}。`,
    `最常见任务类别：${topCategoryNames(last30Tasks, cats, 3)}。中断最多类别：${interruptedCategoryTotals.length ? interruptedCategoryTotals.slice(0, 2).map(([id, count]) => `${categoryName(cats, id)} ${count}项`).join("、") : "暂无明显类别"}。`,
    "",
    "与今天相似的历史任务（最多5条）：",
    similar.length ? similar.join("\n") : "暂无足够相似的历史任务。",
    "",
    "今日相对历史的变化：",
    `今天专注${mins(todayFocus)}，比最近7天平均${todayFocus >= avg7Focus ? "更高或持平" : "更低"}；今天完成${completed(todayTasks).length}项，比最近7天平均${completed(todayTasks).length >= avg7Done ? "更高或持平" : "更低"}。`,
    `今天中断${todayInterrupted}项，中断${todayInterrupted > interrupted(last7Tasks).length / 7 ? "偏多" : "不算偏多"}；今天主要类别：${topCategoryNames(todayTasks, cats, 3)}；碎片化观察：${todayTasks.length >= 3 && shortTasks / todayTasks.length >= 0.5 ? "短任务占比较高，节奏可能较碎" : categorySpread >= 4 ? "类别跨度较大，切换成本可能较高" : "暂未看到特别明显的碎片化"}。`
  ].join("\n");
}
function parseReviewTokens(text: string): ReviewToken[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => part.startsWith("**") && part.endsWith("**") ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false });
}
function buildReviewFeedbackSummary(reviews: Record<string, DailyReview> | undefined) {
  const feedbacks = Object.values(reviews ?? {})
    .filter(review => review.feedback)
    .sort((a, b) => new Date(b.feedback!.updatedAt).getTime() - new Date(a.feedback!.updatedAt).getTime())
    .slice(0, 10);
  if (!feedbacks.length) return "";
  const negative = feedbacks.filter(review => review.feedback?.type === "negative").slice(0, 7);
  const positiveCount = feedbacks.filter(review => review.feedback?.type === "positive").length;
  const lines = negative.map(review => `- 用户不喜欢：${review.feedback?.comment ? shortText(review.feedback.comment, 48) : "未填写具体原因。"}`);
  if (positiveCount) lines.push(`- 用户喜欢：最近 ${positiveCount} 次认为复盘有帮助，保留能点名分析任务、给出明确明天建议的优点。`);
  return [
    "用户最近对 AI 复盘的反馈：",
    ...lines,
    "请本次生成时避免重复用户不喜欢的问题。"
  ].join("\n");
}

function App() {
  const [data, setData] = useState<AppData | null>(null), [mode, setMode] = useState<"compact" | "expanded">("compact"), [activeTimers, setActiveTimers] = useState<RunningTimer[]>([]), [focusedTaskId, setFocusedTaskId] = useState<string | null>(null), [now, setNow] = useState(Date.now());
  const [title, setTitle] = useState(""), [minutes, setMinutes] = useState(45), [cat, setCat] = useState("research"), [note, setNote] = useState(""), [newCat, setNewCat] = useState("");
  const [musingDrafts, setMusingDrafts] = useState<Record<string, string>>({}), [doneNote, setDoneNote] = useState(""), [doneOpen, setDoneOpen] = useState(false), [interruptNote, setInterruptNote] = useState(""), [interruptOpen, setInterruptOpen] = useState(false), [dialogTaskId, setDialogTaskId] = useState<string | null>(null), [startError, setStartError] = useState("");
  const [manualCompletionTarget, setManualCompletionTarget] = useState<ManualCompletionTarget | null>(null), [manualActualMinutes, setManualActualMinutes] = useState(""), [manualCompletionNote, setManualCompletionNote] = useState(""), [manualCompletionError, setManualCompletionError] = useState("");
  const [editingTask, setEditingTask] = useState<EditingTaskTarget | null>(null), [editTaskForm, setEditTaskForm] = useState<EditingTaskForm>({ title: "", categoryId: "", estimateMinutes: "1", note: "" }), [editTaskError, setEditTaskError] = useState("");
  const [quickTitle, setQuickTitle] = useState(""), [quickMinutes, setQuickMinutes] = useState(5), [reviewError, setReviewError] = useState(""), [reviewLoading, setReviewLoading] = useState(false), [selectedDate, setSelectedDate] = useState(todayKey()), [pinned, setPinned] = useState(true), [dogReward, setDogReward] = useState<DogReward | null>(null);
  const [suggestions, setSuggestions] = useState<AiTaskSuggestion[]>([]), [suggestionError, setSuggestionError] = useState(""), [suggestionLoading, setSuggestionLoading] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [recoveryNotice, setRecoveryNotice] = useState("");
  const [taskTitleHidden, setTaskTitleHidden] = useState(() => window.localStorage.getItem(TASK_TITLE_HIDDEN_STORAGE_KEY) === "1");
  const compactWheelAtRef = useRef(0);
  useEffect(() => { void window.floatodo.loadData().then(async x => { const n = normalize(x); const reconciled = reconcileInterruptedSessions(n); setData(reconciled.data); if (reconciled.changed) void window.floatodo.saveData(reconciled.data); if (reconciled.restoredTimers.length) { setActiveTimers(reconciled.restoredTimers); setFocusedTaskId(reconciled.restoredTimers[0]?.task.id ?? null); } if (Object.keys(reconciled.restoredDrafts).length) setMusingDrafts(reconciled.restoredDrafts); if (reconciled.archivedCount) { setRecoveryNotice(reconciled.archivedCount > 1 ? `已将上次 ${reconciled.archivedCount} 个未完成任务记录为中断` : "已将上次未完成任务记录为中断"); window.setTimeout(() => setRecoveryNotice(""), 5200); } setCat(reconciled.data.categories[0]?.id ?? "research"); setPinned(await window.floatodo.isAlwaysOnTop()); }); }, []);
  useEffect(() => {
    if (!activeTimers.some(t => !t.pausedAt)) return;
    let stopped = false;
    let t = 0;
    const tick = () => {
      if (stopped) return;
      setNow(Date.now());
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    t = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => { stopped = true; window.clearTimeout(t); };
  }, [activeTimers]);
  useEffect(() => window.floatodo.onWindowUntucked(() => setNow(Date.now())), []);
  const save = (fn: (d: AppData) => AppData) => setData(d => { if (!d) return d; const n = fn(d); void window.floatodo.saveData(n); return n; });
  const persistActiveSessions = (timers = activeTimers, drafts = musingDrafts) => setData(d => {
    if (!d) return d;
    const n = { ...d, activeSessions: activeSessionsFromTimers(timers, drafts) };
    void window.floatodo.saveData(n);
    return n;
  });
  useEffect(() => {
    if (!data || !activeTimers.length) return;
    persistActiveSessions();
  }, [activeTimers]);
  useEffect(() => {
    if (!data || !activeTimers.length) return;
    const timer = window.setInterval(() => persistActiveSessions(), ACTIVE_SESSION_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [data, activeTimers, musingDrafts]);
  useEffect(() => {
    if (!data || !activeTimers.length) return;
    const timer = window.setTimeout(() => persistActiveSessions(), 600);
    return () => window.clearTimeout(timer);
  }, [musingDrafts]);
  useEffect(() => {
    const flush = () => {
      if (!data || !activeTimers.length) return;
      void window.floatodo.saveData({ ...data, activeSessions: activeSessionsFromTimers(activeTimers, musingDrafts) });
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [data, activeTimers, musingDrafts]);
  const cats = useMemo(() => new Map(data?.categories.map(c => [c.id, c]) ?? []), [data]);
  const focusedTimer = activeTimers.find(t => t.task.id === focusedTaskId) ?? activeTimers[0] ?? null, active = focusedTimer;
  const display = focusedTimer ? timerDisplay(focusedTimer, now) : null, elapsed = display?.elapsed ?? 0;
  const remaining = display?.remaining ?? 0, overtime = display?.overtime ?? false;
  useEffect(() => { if (focusedTaskId && activeTimers.some(t => t.task.id === focusedTaskId)) return; setFocusedTaskId(activeTimers[0]?.task.id ?? null); }, [activeTimers, focusedTaskId]);
  useEffect(() => { void window.floatodo.sendDogState({ idle: !focusedTimer || focusedTimer.task.categoryId === "leisure" ? "toy" : "sleep" }); }, [focusedTimer?.task.categoryId]);
  const today = useMemo(() => data?.completedTasks.filter(t => t.completedAt.slice(0, 10) === todayKey()) ?? [], [data]);
  const todayReview = data?.dailyReviews?.[todayKey()] ?? null;
  useEffect(() => {
    if (!data) return;
    void window.floatodo.updateAgentStatus(buildAgentStatusSnapshot({ data, mode, taskTitleHidden, activeTimers, today, cats, nowMs: now }));
  }, [data, mode, taskTitleHidden, activeTimers, today, cats, now]);
  const doneSuggestions = useMemo(() => reasonSuggestions(data?.completedTasks ?? [], false, DEFAULT_DONE_REASONS), [data]);
  const interruptSuggestions = useMemo(() => reasonSuggestions(data?.completedTasks ?? [], true, DEFAULT_INTERRUPT_REASONS), [data]);
  const metrics = useMemo(() => dayMetrics(data?.completedTasks ?? []), [data]);
  const dates = useMemo(() => Array.from(new Set(data?.completedTasks.map(t => t.completedAt.slice(0, 10)))).sort().reverse(), [data]);
  const selected = useMemo(() => data?.completedTasks.filter(t => t.completedAt.slice(0, 10) === selectedDate) ?? [], [data, selectedDate]);
  useEffect(() => { void window.floatodo.updateTuckWindow(tuckStateFromTimer(focusedTimer, "00:00", taskTitleHidden)); }, [focusedTimer?.task.id, focusedTimer?.task.title, focusedTimer?.task.estimateMinutes, focusedTimer?.startedAt, focusedTimer?.pausedAt, focusedTimer?.pausedSeconds, taskTitleHidden]);
  const switchMode = async (m: "compact" | "expanded") => { setMode(m); m === "compact" ? await window.floatodo.compactWindow() : await window.floatodo.expandWindow(); };
  const toggleTaskTitleHidden = () => setTaskTitleHidden(hidden => { const next = !hidden; window.localStorage.setItem(TASK_TITLE_HIDDEN_STORAGE_KEY, next ? "1" : "0"); return next; });
  const togglePin = async () => { if (!data) return; try { const current = await window.floatodo.isAlwaysOnTop(); const ok = await window.floatodo.setAlwaysOnTop(!current); setPinned(ok); save(d => ({ ...d, settings: { ...d.settings, alwaysOnTop: ok } })); } catch (error) { console.error("[Floatodo] failed to toggle main pin", error); } };
  const addTask = () => { if (!data || !title.trim()) return; const task: Task = { id: uid(), title: title.trim(), categoryId: cat, estimateMinutes: Math.max(1, minutes), note: note.trim() || undefined, createdAt: new Date().toISOString() }; save(d => ({ ...d, tasks: [task, ...d.tasks] })); setTitle(""); setNote(""); };
  const addCategory = () => { if (!data || !newCat.trim()) return; const colors = ["#2563eb", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444", "#64748b"], c = { id: uid(), name: newCat.trim(), color: colors[data.categories.length % colors.length] }; save(d => ({ ...d, categories: [...d.categories, c], settings: { ...d.settings, dogRewardPreferences: { ...(d.settings.dogRewardPreferences ?? {}), [c.id]: "snack" } } })); setCat(c.id); setNewCat(""); };
  const start = (task: Task) => { setStartError(""); if (activeTimers.some(t => t.task.id === task.id)) return setStartError("这个任务已经在进行中了。"); if (activeTimers.length >= MAX_RUNNING_TASKS) return setStartError("最多同时进行 3 项任务，请先完成或中断一项。"); const next: RunningTimer[] = [...activeTimers, { task, startedAt: new Date().toISOString(), pausedSeconds: 0, musings: [] }]; setActiveTimers(next); persistActiveSessions(next); setFocusedTaskId(task.id); };
  const startQuick = (q: QuickTask) => start({ id: uid(), title: q.title, estimateMinutes: q.estimateMinutes, categoryId: q.categoryId, createdAt: new Date().toISOString() });
  const addQuick = () => { if (!quickTitle.trim()) return; save(d => ({ ...d, quickTasks: [...d.quickTasks, { id: uid(), title: quickTitle.trim(), estimateMinutes: Math.max(1, quickMinutes), categoryId: "misc" }] })); setQuickTitle(""); setQuickMinutes(5); };
  const addCurrentToQuick = (name = title, estimate = minutes, categoryId = cat) => {
    const taskTitle = name.trim(), estimateMinutes = Math.max(1, estimate);
    if (!taskTitle) return;
    save(d => d.quickTasks.some(q => q.title.trim() === taskTitle && q.categoryId === categoryId && q.estimateMinutes === estimateMinutes) ? d : { ...d, quickTasks: [...d.quickTasks, { id: uid(), title: taskTitle, estimateMinutes, categoryId }] });
  };
  const deleteQuick = (id: string) => save(d => ({ ...d, quickTasks: d.quickTasks.filter(q => q.id !== id) }));
  const addCompletedTaskFromCurrent = (name = title, estimate = minutes, categoryId = cat, taskNote = note) => {
    const taskTitle = name.trim();
    if (!taskTitle) return;
    const estimateMinutes = Math.max(1, estimate), actualSeconds = estimateMinutes * 60, completedAt = new Date(), startedAt = new Date(completedAt.getTime() - actualSeconds * 1000), trimmedNote = taskNote.trim();
    const done: CompletedTask = { id: uid(), title: taskTitle, categoryId, estimateMinutes, note: trimmedNote || undefined, createdAt: startedAt.toISOString(), startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), actualSeconds, overtimeSeconds: 0, status: "completed", reflection: trimmedNote || undefined };
    save(d => ({ ...d, completedTasks: [done, ...d.completedTasks] }));
    setTitle("");
    setNote("");
  };
  const openManualCompletion = (task: Task, keepTask = false) => { setManualCompletionTarget({ task, keepTask }); setManualActualMinutes(String(Math.max(1, task.estimateMinutes))); setManualCompletionNote(""); setManualCompletionError(""); };
  const openQuickManualCompletion = (q: QuickTask) => openManualCompletion({ id: uid(), title: q.title, categoryId: q.categoryId, estimateMinutes: q.estimateMinutes, createdAt: new Date().toISOString() }, true);
  const closeManualCompletion = () => { setManualCompletionTarget(null); setManualActualMinutes(""); setManualCompletionNote(""); setManualCompletionError(""); };
  const openEditTask = (task: Task | QuickTask, source: EditingTaskSource) => { setEditingTask({ task, source, id: task.id }); setEditTaskForm({ title: task.title, categoryId: task.categoryId, estimateMinutes: String(Math.max(1, task.estimateMinutes)), note: "note" in task ? task.note ?? "" : "" }); setEditTaskError(""); };
  const closeEditTask = () => { setEditingTask(null); setEditTaskError(""); };
  const saveEditedTask = () => {
    if (!editingTask || !data) return;
    const title = editTaskForm.title.trim(), estimateMinutes = Number(editTaskForm.estimateMinutes), categoryId = editTaskForm.categoryId || data.categories[0]?.id || "misc", note = editTaskForm.note.trim();
    if (!title) return setEditTaskError("任务名称不能为空。");
    if (!Number.isInteger(estimateMinutes) || estimateMinutes <= 0) return setEditTaskError("预计用时必须是大于 0 的整数分钟。");
    if (editingTask.source === "fixed") {
      save(d => ({ ...d, quickTasks: d.quickTasks.map(q => q.id === editingTask.id ? { ...q, title, categoryId, estimateMinutes } : q) }));
    } else if (editingTask.source === "todo") {
      save(d => ({ ...d, tasks: d.tasks.map(t => t.id === editingTask.id ? { ...t, title, categoryId, estimateMinutes, note: note || undefined } : t) }));
    } else {
      const nextTimers = activeTimers.map(timer => timer.task.id === editingTask.id ? { ...timer, task: { ...timer.task, title, categoryId, estimateMinutes, note: note || undefined } } : timer);
      setActiveTimers(nextTimers);
      setData(d => {
        if (!d) return d;
        const next = { ...d, tasks: d.tasks.map(t => t.id === editingTask.id ? { ...t, title, categoryId, estimateMinutes, note: note || undefined } : t), activeSessions: activeSessionsFromTimers(nextTimers, musingDrafts) };
        void window.floatodo.saveData(next);
        return next;
      });
    }
    closeEditTask();
  };
  const confirmManualCompletion = () => {
    if (!manualCompletionTarget) return;
    const actualMinutes = Number(manualActualMinutes);
    if (!Number.isInteger(actualMinutes) || actualMinutes <= 0) return setManualCompletionError("请输入大于 0 的整数分钟。");
    const { task, keepTask } = manualCompletionTarget, completedAt = new Date(), startedAt = new Date(completedAt.getTime() - actualMinutes * 60000), actualSeconds = actualMinutes * 60, overtimeSeconds = Math.max(0, actualSeconds - task.estimateMinutes * 60), trimmedNote = manualCompletionNote.trim();
    if (!keepTask && activeTimers.some(t => t.task.id === task.id)) return setManualCompletionError("这个任务正在计时中，请使用运行中任务的完成入口。");
    const done: CompletedTask = { ...task, id: keepTask ? uid() : task.id, createdAt: keepTask ? startedAt.toISOString() : task.createdAt, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), actualSeconds, overtimeSeconds, status: overtimeSeconds > 0 ? "overtime" : "completed", reflection: trimmedNote || undefined };
    save(d => ({ ...d, tasks: keepTask ? d.tasks : d.tasks.filter(t => t.id !== task.id), completedTasks: [done, ...d.completedTasks] }));
    closeManualCompletion();
  };
  const pause = (taskId?: string | null) => { if (!taskId) return; setActiveTimers(ts => ts.map(t => t.task.id !== taskId ? t : t.pausedAt ? { ...t, pausedAt: undefined, pausedSeconds: t.pausedSeconds + Math.max(0, Math.floor((Date.now() - new Date(t.pausedAt).getTime()) / 1000)) } : { ...t, pausedAt: new Date().toISOString() })); };
  const setMusing = (taskId: string | null | undefined, value: string) => { if (!taskId) return; setMusingDrafts(d => ({ ...d, [taskId]: value })); };
  const addMusingToTimer = (taskId: string | null | undefined, text: string) => {
    const content = text.trim();
    if (!taskId || !content || !activeTimers.some(t => t.task.id === taskId)) return null;
    const musing = { id: uid(), text: content, createdAt: new Date().toISOString() };
    const nextTimers = activeTimers.map(t => t.task.id === taskId ? { ...t, musings: [...t.musings, musing] } : t);
    const nextDrafts = { ...musingDrafts, [taskId]: "" };
    setActiveTimers(nextTimers);
    setMusingDrafts(nextDrafts);
    persistActiveSessions(nextTimers, nextDrafts);
    return musing;
  };
  const sendMusing = (taskId?: string | null) => { const text = taskId ? musingDrafts[taskId] ?? "" : ""; addMusingToTimer(taskId, text); };
  useEffect(() => window.floatodo.onAgentAction(action => {
    if (action.type !== "add-musing") {
      void window.floatodo.resolveAgentAction({ requestId: action.requestId, ok: false, error: "INVALID_ACTION" });
      return;
    }
    if (!action.content.trim() || action.content.length > 500) {
      void window.floatodo.resolveAgentAction({ requestId: action.requestId, ok: false, error: "INVALID_CONTENT" });
      return;
    }
    const taskId = focusedTimer?.task.id ?? activeTimers[0]?.task.id;
    if (!taskId) {
      void window.floatodo.resolveAgentAction({ requestId: action.requestId, ok: false, error: "NO_RUNNING_TASK" });
      return;
    }
    const musing = addMusingToTimer(taskId, action.content);
    void window.floatodo.resolveAgentAction(musing
      ? { requestId: action.requestId, ok: true, action: "add-musing", taskId, createdAt: musing.createdAt }
      : { requestId: action.requestId, ok: false, error: "NO_RUNNING_TASK" });
  }), [activeTimers, focusedTimer?.task.id, musingDrafts]);
  const openDone = (taskId?: string | null) => { const target = activeTimers.find(t => t.task.id === taskId); if (!target) return; setDialogTaskId(target.task.id); setFocusedTaskId(target.task.id); setDoneOpen(true); if (!target.pausedAt) setActiveTimers(ts => ts.map(t => t.task.id === target.task.id ? { ...t, pausedAt: new Date().toISOString() } : t)); };
  const boostDog = (dog: DogProfile, r: DogReward) => { const d = { ...dog, bond: clamp(dog.bond + 4) }; if (r.stat === "skillPoints") d.skillPoints += r.amount; if (r.stat === "fullness") d.fullness = clamp(d.fullness + r.amount); if (r.stat === "happiness") d.happiness = clamp(d.happiness + r.amount); if (r.stat === "bond") d.bond = clamp(d.bond + r.amount); if (r.stat === "social") d.social = clamp(d.social + r.amount); if (r.stat === "care") d.care = clamp(d.care + r.amount); return d; };
  const complete = () => { if (!dialogTaskId || !data) return; const target = activeTimers.find(t => t.task.id === dialogTaskId); if (!target) return; const actualSeconds = Math.max(1, timerSeconds(target, now)); const overtimeSeconds = Math.max(0, actualSeconds - target.task.estimateMinutes * 60); const done: CompletedTask = { ...target.task, startedAt: target.startedAt, completedAt: new Date().toISOString(), actualSeconds, overtimeSeconds, status: overtimeSeconds > 0 ? "overtime" : "completed", musings: target.musings.length ? target.musings : undefined, reflection: doneNote.trim() || undefined }; const r = rewardFor(target.task.categoryId, data.settings.dogRewardPreferences); const rest = activeTimers.filter(t => t.task.id !== target.task.id); save(d => ({ ...d, dog: d.dog.enabled ? boostDog(d.dog, r) : d.dog, tasks: d.tasks.filter(t => t.id !== target.task.id), completedTasks: [done, ...d.completedTasks], activeSessions: activeSessionsFromTimers(rest, musingDrafts) })); if (data.dog.enabled) { setDogReward(r); void window.floatodo.sendDogReward(r); window.setTimeout(() => setDogReward(null), 4200); } setActiveTimers(rest); setFocusedTaskId(rest[0]?.task.id ?? null); setMusingDrafts(d => { const { [target.task.id]: _removed, ...next } = d; return next; }); setDoneNote(""); setDoneOpen(false); setDialogTaskId(null); setStartError(""); };
  const openInterrupt = (taskId?: string | null) => { const target = activeTimers.find(t => t.task.id === taskId); if (!target) return; setDialogTaskId(target.task.id); setFocusedTaskId(target.task.id); setInterruptOpen(true); if (!target.pausedAt) setActiveTimers(ts => ts.map(t => t.task.id === target.task.id ? { ...t, pausedAt: new Date().toISOString() } : t)); };
  const interrupt = () => { if (!dialogTaskId) return; const target = activeTimers.find(t => t.task.id === dialogTaskId); if (!target) return; const actualSeconds = Math.max(1, timerSeconds(target, now)), spentMinutes = Math.max(1, Math.ceil(actualSeconds / 60)), remainingEstimateMinutes = Math.max(1, target.task.estimateMinutes - spentMinutes); const reason = interruptNote.trim() || "任务中断", draft = musingDrafts[target.task.id]?.trim(); const interrupted: CompletedTask = { ...target.task, startedAt: target.startedAt, completedAt: new Date().toISOString(), actualSeconds, overtimeSeconds: 0, status: "interrupted", remainingEstimateMinutes, musings: target.musings.length ? target.musings : undefined, musing: draft || undefined, reflection: draft ? `${reason}；未发送草稿：${draft}` : reason }; const rest = activeTimers.filter(t => t.task.id !== target.task.id); save(d => ({ ...d, tasks: d.tasks.map(t => t.id === target.task.id ? { ...t, estimateMinutes: remainingEstimateMinutes } : t), completedTasks: [interrupted, ...d.completedTasks], activeSessions: activeSessionsFromTimers(rest, musingDrafts) })); setActiveTimers(rest); setFocusedTaskId(rest[0]?.task.id ?? null); setMusingDrafts(d => { const { [target.task.id]: _removed, ...next } = d; return next; }); setDoneNote(""); setDoneOpen(false); setInterruptNote(""); setInterruptOpen(false); setDialogTaskId(null); setStartError(""); };
  const genReview = async () => { if (!data) return; setReviewError(""); if (!data.settings.deepseekApiKey.trim()) return setReviewError("请先在设置里填写 DeepSeek API Key。"); if (!today.length) return setReviewError("今天还没有任务记录。"); setReviewLoading(true); try { const todayLines = today.map(t => `- ${t.title}｜${statusName(t)}｜分类 ${categoryName(cats, t.categoryId)}｜预估 ${t.estimateMinutes} 分钟｜实际 ${mins(t.actualSeconds)}${t.status === "interrupted" ? `｜剩余预估 ${t.remainingEstimateMinutes ?? t.estimateMinutes} 分钟` : `｜超时 ${mins(t.overtimeSeconds)}`}｜任务备注 ${t.note ?? "无"}｜完成/中断备注 ${t.reflection ?? "无"}｜碎碎念 ${t.musings?.map(m => `${time(m.createdAt)} ${m.text}`).join("；") || t.musing || "无"}`); const historySummary = buildHistorySummary(data.completedTasks, today, cats); const feedbackSummary = buildReviewFeedbackSummary(data.dailyReviews); const text = await window.floatodo.requestDeepSeekReview({ apiKey: data.settings.deepseekApiKey, model: data.settings.deepseekModel, prompt: `你是一位温柔、细心、但很具体的个人复盘陪伴者，像贴心的老师或母亲。请根据用户今天的真实任务记录，以及提供的历史完成摘要，写一段中文今日复盘。

写作重点：
- 必须结合具体任务说话，不要泛泛安慰。
- 看到做得好的地方，要指出是哪件事、为什么值得肯定。
- 看到卡住的地方，也要具体指出是哪类任务、哪个中断、哪段备注或碎碎念反映出了问题。
- 可以温柔提醒，但不要责备。
- 可以和最近 7 天或 30 天的平均情况做轻量对比，但不要写成数据报表。
- 如果历史数据不足，就明确说记录还不多，所以先主要看今天，不要硬凑趋势。
- 不要编造原因，只能说“可能”“看起来”“也许”。
- 不要输出任务清单，不要输出机械评分。
- 每一个判断都尽量给出依据，例如任务名、实际用时、中断、备注或碎碎念。
- 你还会收到“用户对过去 AI 复盘的反馈”。这些反馈代表用户的表达偏好。如果用户曾指出太抽象、太啰嗦、没有结合具体任务、太像工作报告、太鸡汤或语气不喜欢，本次生成时必须主动避免这些问题。不要在正文中说“根据你的反馈”，只需要自然改进表达。

输出要求：
- 3～4 个自然段，总长度 260～480 字。
- 可以使用少量 emoji 和 **重点词**。
- 语气温柔、具体、耐心。
- 像有人认真看完这一天，然后轻轻地帮用户复盘。
- 不要空泛模板，不要每次写得一模一样，不要说教，不要过度煽情。

结构参考：
🌤️ **今天整体状态**
根据今日完成数、专注时长、中断情况，具体说今天的节奏。

🌱 **我看到你做得好的地方**
点名 1～2 个具体任务，说明哪里推进得不错。

💛 **有些地方确实消耗了你**
结合中断、超时、备注或碎碎念，温和指出卡点。

🌙 **明天可以轻一点这样开始**
给一个具体、低压力、可执行的小建议。

今日任务记录：
${todayLines.join("\n")}

历史上下文摘要：
${historySummary}${feedbackSummary ? `\n\n${feedbackSummary}` : ""}` }); const review = { date: todayKey(), content: cleanReview(text), generatedAt: new Date().toISOString(), model: data.settings.deepseekModel || "deepseek-chat" }; save(d => ({ ...d, dailyReviews: { ...(d.dailyReviews ?? {}), [review.date]: review } })); } catch (e) { setReviewError(e instanceof Error ? e.message : "生成失败"); } finally { setReviewLoading(false); } };
  const saveReviewFeedback = (type: "positive" | "negative", comment?: string) => { const date = todayKey(); save(d => { const review = d.dailyReviews?.[date]; if (!review) return d; return { ...d, dailyReviews: { ...(d.dailyReviews ?? {}), [date]: { ...review, feedback: { type, comment: comment?.trim() || undefined, updatedAt: new Date().toISOString() } } } }; }); };
  const genTaskSuggestions = async () => { if (!data) return; setSuggestionError(""); if (!data.settings.deepseekApiKey.trim()) return setSuggestionError("请先在设置里填写 DeepSeek API Key。"); if (!today.length) return setSuggestionError("今天还没有任务记录，暂时无法生成明日建议。"); setSuggestionLoading(true); try { const categoryNames = data.categories.map(c => c.name).join("、"); const lines = today.map(t => `- ${t.title}｜${t.status === "interrupted" ? "中断" : "完成"}｜分类 ${cats.get(t.categoryId)?.name ?? "未分类"}｜预估 ${t.estimateMinutes} 分钟｜实际 ${mins(t.actualSeconds)}${t.status === "interrupted" ? `｜剩余预估 ${t.remainingEstimateMinutes ?? t.estimateMinutes} 分钟` : `｜超时 ${mins(t.overtimeSeconds)}`}｜备注 ${t.reflection ?? "无"}｜碎碎念 ${t.musings?.map(m => `${time(m.createdAt)} ${m.text}`).join("；") || "无"}`); const text = await window.floatodo.requestDeepSeekReview({ apiKey: data.settings.deepseekApiKey, model: data.settings.deepseekModel, prompt: `请基于用户今天的完成任务、中断任务、备注和碎碎念，生成 3-5 条适合明天放入待办栏的中文任务建议。

返回要求：
1. 只返回 JSON 数组，不要 Markdown，不要解释文字。
2. 每项必须包含 title、estimateMinutes、category、reason、source。
3. title 必须简短，建议 4-12 个中文字符，最多不超过 18 个中文字符。
4. title 只写“动作 + 对象”，像待办事项，不要写成长句。
5. title 不要包含“建议”“明天”“继续完成关于”“基于今天”，也不要包含解释性原因。
6. 好标题示例：优化计时页、整理复盘页、修复置顶、阅读材料、修改提示词。
7. 坏标题示例：根据今天未完成的任务继续推进计时页体验优化。
8. 详细背景、原因、来源全部放到 reason 和 source 字段里。
9. estimateMinutes 必须是 5 到 180 之间的数字。
10. category 优先从这些现有分类里选择：${categoryNames || "杂项"}。
11. reason 简短说明为什么建议明天做。
12. source 简短说明来源于今天哪条完成、中断、备注或碎碎念。

任务记录：
${lines.join("\n")}` }); const parsed = parseTaskSuggestions(text, data.categories); setSuggestions(parsed); if (!parsed.length) setSuggestionError("AI 没有返回可用的建议任务。"); } catch (e) { setSuggestionError(e instanceof Error ? e.message : "建议解析失败，请稍后再试。"); } finally { setSuggestionLoading(false); } };
  const addSuggestionToTasks = (s: AiTaskSuggestion) => { if (s.accepted) return; const task: Task = { id: uid(), title: s.title, categoryId: s.categoryId, estimateMinutes: s.estimateMinutes, note: s.reason || s.source, createdAt: new Date().toISOString() }; save(d => ({ ...d, tasks: [task, ...d.tasks] })); setSuggestions(xs => xs.map(x => x.id === s.id ? { ...x, accepted: true } : x)); };
  const focusedMusing = focusedTimer ? musingDrafts[focusedTimer.task.id] ?? "" : "";
  const switchCompactTask = (direction: 1 | -1) => setFocusedTaskId(currentId => {
    if (activeTimers.length < 2) return currentId;
    const currentIndex = activeTimers.findIndex(t => t.task.id === currentId), safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return activeTimers[(safeIndex + direction + activeTimers.length) % activeTimers.length].task.id;
  });
  const handleCompactWheel = (event: WheelEvent<HTMLElement>) => {
    if (activeTimers.length < 2) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 4) return;
    event.preventDefault();
    const nowMs = Date.now();
    if (nowMs - compactWheelAtRef.current < 220) return;
    compactWheelAtRef.current = nowMs;
    switchCompactTask(delta > 0 ? 1 : -1);
  };
  if (!data) return <main className="app-shell compact"><p className="empty">正在打开 Floatodo...</p></main>;
  return <main className={`app-shell ${mode}`}><header className="titlebar"><div><strong>Floatodo</strong><span>{mode === "compact" ? active ? "专注态" : "待命态" : "任务工作台"}</span></div><div className="window-actions"><button onClick={() => setSettingsOpen(true)} aria-label="设置"><Settings size={16} /></button><button onClick={togglePin}>{pinned ? <Pin size={16} /> : <PinOff size={16} />}</button><button onClick={() => void switchMode(mode === "compact" ? "expanded" : "compact")}>{mode === "compact" ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button><button onClick={() => void window.floatodo.minimizeWindow()}><Minimize2 size={16} /></button><button onClick={() => void window.floatodo.closeWindow()}><X size={16} /></button></div></header>{recoveryNotice && <div className="recovery-toast">{recoveryNotice}</div>}{mode === "compact" ? <Compact active={active} activeTimers={activeTimers} focusedTaskId={focusedTimer?.task.id ?? null} onWheel={handleCompactWheel} remaining={remaining} elapsed={elapsed} overtime={overtime} tasks={data.tasks} quick={data.quickTasks} cats={cats} now={now} focusTask={setFocusedTaskId} start={start} startQuick={startQuick} pause={() => pause(focusedTimer?.task.id)} interrupt={() => openInterrupt(focusedTimer?.task.id)} complete={() => openDone(focusedTimer?.task.id)} musings={focusedTimer?.musings ?? []} musing={focusedMusing} setMusing={v => setMusing(focusedTimer?.task.id, v)} sendMusing={() => sendMusing(focusedTimer?.task.id)} taskTitleHidden={taskTitleHidden} toggleTaskTitleHidden={toggleTaskTitleHidden} quickTitle={quickTitle} quickMinutes={quickMinutes} setQuickTitle={setQuickTitle} setQuickMinutes={setQuickMinutes} addQuick={addQuick} /> : <Expanded data={data} active={active} activeTimers={activeTimers} focusedTaskId={focusedTimer?.task.id ?? null} focusTask={setFocusedTaskId} startError={startError} remaining={remaining} elapsed={elapsed} overtime={overtime} cats={cats} now={now} title={title} setTitle={setTitle} minutes={minutes} setMinutes={setMinutes} cat={cat} setCat={setCat} note={note} setNote={setNote} newCat={newCat} setNewCat={setNewCat} addTask={addTask} addCompletedTaskFromCurrent={addCompletedTaskFromCurrent} addCurrentToQuick={addCurrentToQuick} deleteQuick={deleteQuick} addCategory={addCategory} deleteTask={id => save(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }))} start={start} complete={openDone} interrupt={openInterrupt} pause={pause} today={today} selected={selected} metrics={metrics} dates={dates} selectedDate={selectedDate} setSelectedDate={setSelectedDate} settings={data.settings} saveSettings={settings => save(d => ({ ...d, settings }))} genReview={genReview} review={todayReview} reviewError={reviewError} reviewLoading={reviewLoading} saveReviewFeedback={saveReviewFeedback} suggestions={suggestions} suggestionError={suggestionError} suggestionLoading={suggestionLoading} genTaskSuggestions={genTaskSuggestions} addSuggestionToTasks={addSuggestionToTasks} dogReward={dogReward} updateDog={dog => save(d => ({ ...d, dog }))} quick={data.quickTasks} startQuick={startQuick} quickTitle={quickTitle} quickMinutes={quickMinutes} setQuickTitle={setQuickTitle} setQuickMinutes={setQuickMinutes} addQuick={addQuick} musing={focusedMusing} setMusing={v => setMusing(focusedTimer?.task.id, v)} sendMusing={() => sendMusing(focusedTimer?.task.id)} openManualCompletion={openManualCompletion} openQuickManualCompletion={openQuickManualCompletion} openEditTask={openEditTask} />}{doneOpen && dialogTaskId && <Completion note={doneNote} setNote={setDoneNote} suggestions={doneSuggestions} cancel={() => { setDoneOpen(false); setDialogTaskId(null); }} confirm={complete} />}{interruptOpen && dialogTaskId && <InterruptDialog note={interruptNote} setNote={setInterruptNote} suggestions={interruptSuggestions} cancel={() => { setInterruptOpen(false); setDialogTaskId(null); }} confirm={interrupt} />}{manualCompletionTarget && <ManualCompletionDialog target={manualCompletionTarget.task} actualMinutes={manualActualMinutes} setActualMinutes={setManualActualMinutes} note={manualCompletionNote} setNote={setManualCompletionNote} error={manualCompletionError} cancel={closeManualCompletion} confirm={confirmManualCompletion} />}{editingTask && <TaskEditDialog target={editingTask} form={editTaskForm} setForm={setEditTaskForm} categories={data.categories} error={editTaskError} cancel={closeEditTask} confirm={saveEditedTask} />}{settingsOpen && <SettingsDialog settings={data.settings} saveSettings={settings => save(d => ({ ...d, settings }))} close={() => setSettingsOpen(false)} />}</main>;
}

function Compact(p: { active: ActiveTimer | null; activeTimers: RunningTimer[]; focusedTaskId: string | null; onWheel: (event: WheelEvent<HTMLElement>) => void; remaining: number; elapsed: number; overtime: boolean; tasks: Task[]; quick: QuickTask[]; cats: Map<string, TaskCategory>; now: number; focusTask: (id: string) => void; start: (task: Task) => void; startQuick: (q: QuickTask) => void; pause: () => void; interrupt: () => void; complete: () => void; musings: TaskMusing[]; musing: string; setMusing: (v: string) => void; sendMusing: () => void; taskTitleHidden: boolean; toggleTaskTitleHidden: () => void; quickTitle: string; quickMinutes: number; setQuickTitle: (v: string) => void; setQuickMinutes: (v: number) => void; addQuick: () => void }) {
  const [compactPanel, setCompactPanel] = useState<CompactPanel>("focus");
  const [emojiOpen, setEmojiOpen] = useState(false), inputRef = useRef<HTMLTextAreaElement | null>(null);
  const t = p.active?.task, c = t ? p.cats.get(t.categoryId) : undefined;
  const focusAfter = (fn: () => void) => { fn(); setCompactPanel("focus"); };
  const focusRunningTask = (taskId: string) => focusAfter(() => p.focusTask(taskId));
  const startTask = (task: Task) => focusAfter(() => p.start(task));
  const startQuickTask = (task: QuickTask) => focusAfter(() => p.startQuick(task));
  const renderPanelSwitch = () => <div className="compact-panel-switch" role="tablist" aria-label="compact 页面"><button className={`compact-panel-tab ${compactPanel === "focus" ? "active" : ""}`} onClick={() => setCompactPanel("focus")} role="tab" aria-selected={compactPanel === "focus"}><Clock3 size={14} />计时</button><button className={`compact-panel-tab ${compactPanel === "tasks" ? "active" : ""}`} onClick={() => setCompactPanel("tasks")} role="tab" aria-selected={compactPanel === "tasks"}><FolderOpen size={14} />任务</button></div>;
  const renderFocusEmpty = () => <section className="compact-focus-panel compact-focus-empty"><div><Clock3 size={28} /><h2>还没有正在计时的任务</h2><p>可以先去任务面板选择一个待办或固定任务。</p><button className="primary" onClick={() => setCompactPanel("tasks")}>去选择任务</button></div></section>;
  const estimateMinutes = t?.estimateMinutes ?? 1;
  const estimateSeconds = Math.max(1, estimateMinutes * 60), overtimeSeconds = Math.max(0, p.elapsed - estimateSeconds);
  const arcProgress = p.overtime ? (overtimeSeconds % estimateSeconds) / estimateSeconds : Math.min(1, Math.max(0, p.elapsed / estimateSeconds));
  const timeText = p.overtime ? `+${fmt(overtimeSeconds)}` : fmt(p.remaining);
  const statusText = p.overtime ? p.active?.pausedAt ? "已超时 · 暂停中" : `已超时 · +${fmt(overtimeSeconds)}` : p.active?.pausedAt ? `暂停中 · ${estimateMinutes} 分钟` : `专注中 · ${estimateMinutes} 分钟`;
  const recentMusings = p.musings.slice(-5);
  const activeIndex = Math.max(0, p.activeTimers.findIndex(timer => timer.task.id === p.focusedTaskId)), canSwitchTasks = p.activeTimers.length > 1;
  const submitMusing = () => { if (!p.musing.trim()) return; p.sendMusing(); setEmojiOpen(false); };
  const insertEmoji = (emoji: string) => {
    const input = inputRef.current, start = input?.selectionStart ?? p.musing.length, end = input?.selectionEnd ?? start;
    const next = `${p.musing.slice(0, start)}${emoji}${p.musing.slice(end)}`;
    p.setMusing(next);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };
  const renderFocusPanel = () => !t ? renderFocusEmpty() : <section className={`compact-focus-view compact-focus-panel ${p.taskTitleHidden ? "privacy-mode-active" : ""}`}><div className={`compact-focus-card ${p.taskTitleHidden ? "compact-focus-card--private" : ""}`} onWheel={p.onWheel}>{canSwitchTasks && <div className="compact-task-switcher" aria-label={`当前任务 ${activeIndex + 1} / ${p.activeTimers.length}`}><span>滚轮切换 · {activeIndex + 1} / {p.activeTimers.length}</span><div>{p.activeTimers.map((timer, index) => <i key={timer.task.id} className={index === activeIndex ? "active" : ""} />)}</div></div>}<button className={`compact-privacy-toggle ${p.taskTitleHidden ? "active" : ""}`} onClick={p.toggleTaskTitleHidden} aria-pressed={p.taskTitleHidden} aria-label={p.taskTitleHidden ? "显示任务名称" : "隐藏任务名称"} title={p.taskTitleHidden ? "显示任务名称" : "隐藏任务名称"}>{p.taskTitleHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>{!p.taskTitleHidden && <><h1 className="compact-focus-title">{t.title}</h1><div className="compact-focus-category"><FolderOpen size={16} />{c?.name ?? "未分类"}</div></>}<div className={`compact-focus-arc ${p.overtime ? "compact-focus-arc--overtime" : ""}`}><svg className="compact-focus-arc-svg" viewBox="0 0 520 260" preserveAspectRatio="none" aria-hidden="true"><path className="compact-focus-arc-track" d="M70 200 C60 -5 460 -5 440 200" pathLength={1} /><path className="compact-focus-arc-progress" d="M70 200 C60 -5 460 -5 440 200" pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: 1 - arcProgress }} /></svg><strong className={`compact-focus-time ${p.overtime ? "overtime" : ""}`}>{timeText}</strong></div><span className="compact-focus-status"><Clock3 size={16} />{statusText}</span><div className="compact-focus-actions"><button onClick={p.pause}>{p.active?.pausedAt ? <Play size={17} /> : <Pause size={17} />}{p.active?.pausedAt ? "继续" : "暂停"}</button><button className="primary" onClick={p.complete}><Check size={17} />完成</button><button className="danger" onClick={p.interrupt}>中断</button></div></div><div className="compact-focus-chat"><div className="compact-focus-chat-list">{recentMusings.length ? recentMusings.map(m => <div key={m.id} className="compact-focus-chat-bubble"><p>{m.text}</p><span>{time(m.createdAt)} ✓✓</span></div>) : <p className="empty">记录一下现在的想法...</p>}</div><div className="compact-focus-chat-input-row"><div className="compact-focus-chat-input-wrap">{emojiOpen && <div className="compact-focus-emoji-panel">{COMPACT_MUSING_EMOJIS.map(emoji => <button key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>}<button className="compact-focus-emoji-button" onClick={() => setEmojiOpen(v => !v)} aria-label="插入 emoji">🙂</button><textarea ref={inputRef} value={p.musing} onChange={e => p.setMusing(e.target.value)} onKeyDown={e => { if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return; e.preventDefault(); submitMusing(); }} placeholder="记录一下现在的想法..." rows={1} /></div><button className="primary" onClick={submitMusing}>发送</button></div></div></section>;
  const runningIds = new Set(p.activeTimers.map(timer => timer.task.id));
  const todoTasks = p.tasks.filter(task => !runningIds.has(task.id));
  const full = p.activeTimers.length >= MAX_RUNNING_TASKS;
  const renderMiniTask = (task: Task, action: "switch" | "start", fixed = false) => {
    const cat = p.cats.get(task.categoryId), timer = p.activeTimers.find(x => x.task.id === task.id), display = timer ? timerDisplay(timer, p.now) : null;
    const status = timer && display ? timer.pausedAt ? "暂停中" : display.overtime ? "已超时" : "进行中" : "";
    return <article key={task.id} className={`compact-mini-task ${p.focusedTaskId === task.id ? "active" : ""} ${fixed ? "fixed" : ""}`} onClick={() => action === "switch" && focusRunningTask(task.id)}><div className="compact-mini-task-main"><strong className="compact-mini-task-title">{task.title}</strong><span className="compact-mini-task-meta"><i style={{ background: cat?.color }} />{cat?.name ?? "未分类"} · {action === "switch" && display ? `${status} · 已计时 ${mins(display.elapsed)}` : `${task.estimateMinutes} 分钟`}</span></div>{fixed && <span className="compact-mini-badge">固定</span>}<button className="compact-mini-task-action" onClick={e => { e.stopPropagation(); action === "switch" ? focusRunningTask(task.id) : startTask(task); }} disabled={action === "start" && full}>{action === "switch" ? "查看" : "开始"}</button></article>;
  };
  const renderQuickTask = (task: QuickTask) => {
    const cat = p.cats.get(task.categoryId), disabled = full;
    return <article key={task.id} className="compact-mini-task fixed"><div className="compact-mini-task-main"><strong className="compact-mini-task-title">{task.title}</strong><span className="compact-mini-task-meta"><i style={{ background: cat?.color }} />{cat?.name ?? "未分类"} · {task.estimateMinutes} 分钟</span></div><span className="compact-mini-badge">固定</span><button className="compact-mini-task-action" onClick={() => startQuickTask(task)} disabled={disabled}>开始</button></article>;
  };
  const renderTasksPanel = () => <section className="compact-tasks-panel"><div className="compact-mini-scroll"><section className="compact-mini-section"><div className="compact-mini-section-header"><strong>正在进行</strong><span>{p.activeTimers.length}/{MAX_RUNNING_TASKS}</span></div><div className="compact-mini-list">{p.activeTimers.length ? p.activeTimers.map(timer => renderMiniTask(timer.task, "switch")) : <p className="compact-mini-empty">还没有正在计时的任务</p>}</div></section><section className="compact-mini-section"><div className="compact-mini-section-header"><strong>待办任务</strong><span>{todoTasks.length}</span></div><div className="compact-mini-list">{todoTasks.length ? todoTasks.map(task => renderMiniTask(task, "start")) : <p className="compact-mini-empty">暂无待办任务</p>}</div></section><section className="compact-mini-section"><div className="compact-mini-section-header"><strong>固定任务</strong><span>{p.quick.length}</span></div><div className="compact-mini-list">{p.quick.length ? p.quick.map(renderQuickTask) : <p className="compact-mini-empty">暂无固定任务</p>}</div></section>{!p.activeTimers.length && !todoTasks.length && !p.quick.length && <div className="compact-mini-empty compact-mini-empty-all"><strong>还没有可开始的任务</strong><span>可以展开后创建任务。</span></div>}</div></section>;
  return <div className="compact-shell">{renderPanelSwitch()}{compactPanel === "focus" ? renderFocusPanel() : renderTasksPanel()}</div>;
}
function FocusStartPanel(p: { variant: "compact" | "expanded"; quick: QuickTask[]; startQuick: (q: QuickTask) => void; quickTitle: string; quickMinutes: number; setQuickTitle: (v: string) => void; setQuickMinutes: (v: number) => void; addQuick: () => void }) {
  const visibleQuickTasks = p.quick.slice(0, 4), compact = p.variant === "compact", cx = (base: string, compactClass: string) => compact ? `${base} ${compactClass}` : base;
  return <section className={`focus-start-panel focus-start-panel--${p.variant} ${compact ? "compact-view compact-idle" : ""}`}>
    <div className={cx("focus-start-hero", "compact-idle-hero")}><div><h1>准备开始今天的专注了吗？</h1><p>选择一个常用任务，或创建新的专注计划吧！</p></div><div className={cx("focus-start-dog", "compact-idle-dog")} aria-hidden="true"><img src={corgiPlay1} alt="" draggable={false} /></div></div>
    <div className={cx("focus-start-section", "compact-quick-section")}><div className={cx("focus-start-section-title", "compact-section-title")}><div><Bookmark size={17} /><strong>常用任务</strong></div><span>管理 <ChevronRight size={15} /></span></div><div className={cx("focus-start-grid", "compact-quick-grid")}>{visibleQuickTasks.map((q, i) => <button className={cx("focus-start-card", "compact-quick-card")} key={q.id} onClick={() => p.startQuick(q)}><span className={cx(`focus-start-icon focus-start-icon-${i % 4}`, `compact-quick-icon compact-quick-icon-${i % 4}`)}><Bookmark size={24} /></span><span><strong>{q.title}</strong><small>{q.estimateMinutes} 分钟</small></span><ChevronRight size={18} /></button>)}</div></div>
    <div className={cx("focus-start-create", "compact-create-section")}><div className={cx("focus-start-section-title", "compact-section-title")}><div><Plus size={18} /><strong>快速新增</strong></div></div><div className={cx("focus-start-create-row", "compact-create-row")}><input value={p.quickTitle} onChange={e => p.setQuickTitle(e.target.value)} placeholder="输入任务名称..." /><label><Clock3 size={17} /><input type="number" min={1} value={p.quickMinutes} onChange={e => p.setQuickMinutes(Number(e.target.value))} aria-label="预计分钟" /><span>分钟</span></label><button className="primary" onClick={p.addQuick}>开始计划</button></div></div>
    <div className={cx("focus-start-brand", "compact-brand-line")}><span aria-hidden="true"><img src={corgiPlay1} alt="" draggable={false} /></span><b>专注 · 放松 · 完成</b></div>
  </section>;
}
function Musing(p: { musings: TaskMusing[]; value: string; setValue: (v: string) => void; send: () => void }) { return <div className="musing-box"><div className="section-label">任务进行中碎碎念</div><div className="musing-list">{p.musings.length ? p.musings.map(x => <div key={x.id} className="musing-message"><span>{time(x.createdAt)}</span><p>{x.text}</p></div>) : <p className="empty">像聊天一样记录过程想法。</p>}</div><div className="musing-input-row"><textarea value={p.value} onChange={e => p.setValue(e.target.value)} placeholder="比如：好有意思呀 / 有点难了" /><button className="primary" onClick={p.send}>发送</button></div></div>; }
function Expanded(p: { data: AppData; active: RunningTimer | null; activeTimers: RunningTimer[]; focusedTaskId: string | null; focusTask: (id: string) => void; startError: string; remaining: number; elapsed: number; overtime: boolean; cats: Map<string, TaskCategory>; now: number; title: string; setTitle: (v: string) => void; minutes: number; setMinutes: (v: number) => void; cat: string; setCat: (v: string) => void; note: string; setNote: (v: string) => void; newCat: string; setNewCat: (v: string) => void; addTask: () => void; addCompletedTaskFromCurrent: (name?: string, estimate?: number, categoryId?: string, taskNote?: string) => void; addCurrentToQuick: (name?: string, estimate?: number, categoryId?: string) => void; deleteQuick: (id: string) => void; addCategory: () => void; deleteTask: (id: string) => void; start: (t: Task) => void; complete: (id?: string | null) => void; interrupt: (id?: string | null) => void; pause: (id?: string | null) => void; today: CompletedTask[]; selected: CompletedTask[]; metrics: Record<string, DayMetric>; dates: string[]; selectedDate: string; setSelectedDate: (v: string) => void; settings: AppSettings; saveSettings: (s: AppSettings) => void; genReview: () => void; review: DailyReview | null; reviewError: string; reviewLoading: boolean; saveReviewFeedback: (type: "positive" | "negative", comment?: string) => void; suggestions: AiTaskSuggestion[]; suggestionError: string; suggestionLoading: boolean; genTaskSuggestions: () => void; addSuggestionToTasks: (s: AiTaskSuggestion) => void; dogReward: DogReward | null; updateDog: (d: DogProfile) => void; quick: QuickTask[]; startQuick: (q: QuickTask) => void; quickTitle: string; quickMinutes: number; setQuickTitle: (v: string) => void; setQuickMinutes: (v: number) => void; addQuick: () => void; musing: string; setMusing: (v: string) => void; sendMusing: () => void; openManualCompletion: (task: Task) => void; openQuickManualCompletion: (task: QuickTask) => void; openEditTask: (task: Task | QuickTask, source: EditingTaskSource) => void }) { const [page, setPage] = useState<"focus" | "tasks" | "today" | "history" | "dog">("focus"); const tabs = [["focus", "计时", <Clock3 size={16} />], ["tasks", "任务", <Plus size={16} />], ["today", "今日", <BarChart3 size={16} />], ["history", "历史", <FolderOpen size={16} />], ["dog", "小狗", <span className="dog-tab-icon">C</span>]] as const; return <div className="expanded-workspace"><nav className="module-tabs">{tabs.map(t => <button key={t[0]} className={page === t[0] ? "active" : ""} onClick={() => setPage(t[0])}>{t[2]}{t[1]}</button>)}</nav><div className="module-page">{page === "focus" && <Focus active={p.active} remaining={p.remaining} elapsed={p.elapsed} overtime={p.overtime} complete={() => p.complete(p.focusedTaskId)} interrupt={() => p.interrupt(p.focusedTaskId)} pause={() => p.pause(p.focusedTaskId)} quick={p.quick} startQuick={p.startQuick} quickTitle={p.quickTitle} quickMinutes={p.quickMinutes} setQuickTitle={p.setQuickTitle} setQuickMinutes={p.setQuickMinutes} addQuick={p.addQuick} cats={p.cats} musing={p.musing} setMusing={p.setMusing} sendMusing={p.sendMusing} />}{page === "tasks" && <Tasks {...p} />}{page === "today" && <Today completed={p.today} cats={p.cats} genReview={p.genReview} review={p.review} error={p.reviewError} loading={p.reviewLoading} saveReviewFeedback={p.saveReviewFeedback} suggestions={p.suggestions} suggestionError={p.suggestionError} suggestionLoading={p.suggestionLoading} genTaskSuggestions={p.genTaskSuggestions} addSuggestionToTasks={p.addSuggestionToTasks} />}{page === "history" && <History completed={p.selected} allCompleted={p.data.completedTasks} cats={p.cats} metrics={p.metrics} dates={p.dates} selectedDate={p.selectedDate} setSelectedDate={p.setSelectedDate} />}{page === "dog" && <DogPanel dog={p.data.dog} reward={p.dogReward} updateDog={p.updateDog} categories={p.data.categories} settings={p.settings} saveSettings={p.saveSettings} />}</div></div>; }
function Focus(p: { active: RunningTimer | null; remaining: number; elapsed: number; overtime: boolean; complete: () => void; interrupt: () => void; pause: () => void; quick: QuickTask[]; startQuick: (q: QuickTask) => void; quickTitle: string; quickMinutes: number; setQuickTitle: (v: string) => void; setQuickMinutes: (v: number) => void; addQuick: () => void; cats: Map<string, TaskCategory>; musing: string; setMusing: (v: string) => void; sendMusing: () => void }) {
  const active = p.active, t = active?.task;
  if (!active || !t) return <FocusStartPanel variant="expanded" quick={p.quick} startQuick={p.startQuick} quickTitle={p.quickTitle} quickMinutes={p.quickMinutes} setQuickTitle={p.setQuickTitle} setQuickMinutes={p.setQuickMinutes} addQuick={p.addQuick} />;
  const c = p.cats.get(t.categoryId), estimateSeconds = Math.max(1, t.estimateMinutes * 60), overtimeSeconds = Math.max(0, p.elapsed - estimateSeconds);
  const ringProgress = p.overtime ? (overtimeSeconds % estimateSeconds) / estimateSeconds : Math.min(1, Math.max(0, p.elapsed / estimateSeconds));
  const timeText = p.overtime ? `+${fmt(overtimeSeconds)}` : fmt(p.remaining);
  const statusText = p.overtime ? active.pausedAt ? "已超时 · 暂停中" : `已超时 · +${fmt(overtimeSeconds)}` : active.pausedAt ? `暂停中 · ${t.estimateMinutes} 分钟` : `专注中 · ${t.estimateMinutes} 分钟`;
  const recentMusings = active.musings.slice(-5);
  return <section className="expanded-focus-running"><div className="expanded-focus-card"><div className="expanded-focus-title"><h2>{t.title}</h2><div className="expanded-focus-category"><FolderOpen size={18} />{c?.name ?? "未分类"}</div></div><div className={`expanded-progress-ring ${p.overtime ? "expanded-progress-ring--overtime" : ""}`} style={{ "--ring-progress": `${Math.round(ringProgress * 100)}%` } as React.CSSProperties}><div className="expanded-progress-core"><strong className={`expanded-focus-time ${p.overtime ? "overtime" : ""}`}>{timeText}</strong><span className="expanded-focus-status"><Clock3 size={17} />{statusText}</span></div></div><div className="expanded-focus-actions"><button onClick={p.pause}>{active.pausedAt ? <Play size={18} /> : <Pause size={18} />}{active.pausedAt ? "继续" : "暂停"}</button><button className="primary" onClick={p.complete}><Check size={18} />完成</button><button className="danger" onClick={p.interrupt}>中断</button></div></div><div className="expanded-musing-panel"><div className="expanded-musing-list">{recentMusings.length ? recentMusings.map(m => <div key={m.id} className="expanded-musing-bubble"><p>{m.text}</p><span>{time(m.createdAt)} ✓✓</span></div>) : <p className="empty">记录一下现在的想法...</p>}</div><div className="expanded-musing-input-row"><textarea value={p.musing} onChange={e => p.setMusing(e.target.value)} placeholder="记录一下现在的想法..." /><button className="primary" onClick={p.sendMusing}>发送</button></div></div></section>;
}
function RunningTasks(p: { timers: RunningTimer[]; focusedTaskId: string | null; cats: Map<string, TaskCategory>; now: number; focusTask: (id: string) => void; pause: (id: string) => void; complete: (id: string) => void; interrupt: (id: string) => void; editTask: (task: Task) => void; error: string }) {
  const slots = Array.from({ length: MAX_RUNNING_TASKS }, (_, i) => p.timers[i]);
  return <div className="running-tasks-box"><div className="running-tasks-head"><strong>进行中的任务（{p.timers.length}/{MAX_RUNNING_TASKS}）</strong>{p.error && <span>{p.error}</span>}</div><div className="running-task-grid">{slots.map((timer, i) => timer ? <article key={timer.task.id} className={`running-task-card ${p.focusedTaskId === timer.task.id ? "focused" : ""}`} onClick={() => p.focusTask(timer.task.id)}><div className="running-task-card-head"><div className="running-task-title-block"><strong className="running-task-title">{timer.task.title}</strong><span>{p.cats.get(timer.task.categoryId)?.name ?? "未分类"}</span></div><button type="button" className="running-task-edit-link" onClick={e => { e.stopPropagation(); p.editTask(timer.task); }} title="编辑任务" aria-label="编辑运行中任务"><Pencil size={14} /><span>编辑</span></button></div><b className={`running-task-time ${timerDisplay(timer, p.now).overtime ? "overtime" : ""}`}>{timerDisplay(timer, p.now).time}</b><p>{timerDisplay(timer, p.now).overtime ? "已超时，正在正计时" : `剩余 ${fmt(timerDisplay(timer, p.now).remaining)}`} · 已计时 {mins(timerDisplay(timer, p.now).elapsed)}</p><div className="running-task-actions"><button onClick={e => { e.stopPropagation(); p.pause(timer.task.id); }}>{timer.pausedAt ? <Play size={15} /> : <Pause size={15} />}{timer.pausedAt ? "继续" : "暂停"}</button><button onClick={e => { e.stopPropagation(); p.interrupt(timer.task.id); }}>中断</button><button className="primary" onClick={e => { e.stopPropagation(); p.complete(timer.task.id); }}><Check size={15} />完成</button></div></article> : <div key={i} className="running-task-card empty-slot"><span>空位</span></div>)}</div></div>;
}
function Tasks(p: Parameters<typeof Expanded>[0]) {
  const fullMessage = p.activeTimers.length >= MAX_RUNNING_TASKS ? "最多同时进行 3 项任务，请先完成或中断一项。" : "";
  const [creating, setCreating] = useState(false), [addToFixed, setAddToFixed] = useState(false);
  const getTaskDraft = () => ({ title: p.title.trim(), estimateMinutes: Math.max(1, p.minutes), categoryId: p.cat, note: p.note });
  const pinTaskDraft = (draft: { title: string; estimateMinutes: number; categoryId: string }) => { if (addToFixed) p.addCurrentToQuick(draft.title, draft.estimateMinutes, draft.categoryId); };
  const submitTask = () => { const draft = getTaskDraft(); if (!draft.title) return; pinTaskDraft(draft); p.addTask(); setCreating(false); };
  const submitCompletedTask = () => { const draft = getTaskDraft(); if (!draft.title) return; pinTaskDraft(draft); p.addCompletedTaskFromCurrent(draft.title, draft.estimateMinutes, draft.categoryId, draft.note); setCreating(false); };

  return <section className="task-panel"><div className="task-page-head"><div><h2>今天的任务</h2><p>你可以同时追踪最多 3 项进行中的工作。</p></div><div className="task-create-anchor"><button className="primary task-new-button" onClick={() => setCreating(true)}><Plus size={17} />新建任务</button>{creating && <div className="task-create-popover"><div className="task-popover-head"><strong>新建任务</strong><button onClick={() => setCreating(false)} aria-label="关闭">×</button></div><div className="task-create-form"><input value={p.title} onChange={e => p.setTitle(e.target.value)} placeholder="任务名称" autoFocus /><label><Clock3 size={16} /><input type="number" min={1} value={p.minutes} onChange={e => p.setMinutes(Number(e.target.value))} aria-label="预计分钟" /><span>分钟</span></label><select value={p.cat} onChange={e => p.setCat(e.target.value)}>{p.data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={p.note} onChange={e => p.setNote(e.target.value)} placeholder="备注，可不填" /><label className="task-fixed-check"><input type="checkbox" checked={addToFixed} onChange={e => setAddToFixed(e.target.checked)} /><span>添加进固定任务</span></label><div className="task-popover-actions"><button className="primary" onClick={submitTask}><Plus size={17} />添加任务</button><button onClick={submitCompletedTask}><Check size={17} />已完成</button><button onClick={() => setCreating(false)}>取消</button></div></div></div>}</div></div><RunningTasks timers={p.activeTimers} focusedTaskId={p.focusedTaskId} cats={p.cats} now={p.now} focusTask={p.focusTask} pause={p.pause} complete={p.complete} interrupt={p.interrupt} editTask={task => p.openEditTask(task, "running")} error={p.startError || fullMessage} /><div className="task-workspace"><section className="task-list-panel"><div className="section-label"><FolderOpen size={17} />任务列表</div><div className="task-list">{p.data.tasks.map(t => { const c = p.cats.get(t.categoryId), activeTimer = p.activeTimers.find(a => a.task.id === t.id), running = Boolean(activeTimer), full = p.activeTimers.length >= MAX_RUNNING_TASKS; return <article key={t.id} className="task-item"><div><strong>{running ? activeTimer?.task.title ?? t.title : t.title}</strong><span><i style={{ background: c?.color }} />{c?.name ?? "未分类"} · {(running ? activeTimer?.task.estimateMinutes ?? t.estimateMinutes : t.estimateMinutes)} 分钟</span></div><div className="item-actions task-card-actions"><button className="task-edit-button" onClick={() => activeTimer ? p.openEditTask(activeTimer.task, "running") : p.openEditTask(t, "todo")} aria-label="编辑任务"><Pencil size={16} /></button>{!running && <button className="task-complete-button" onClick={() => p.openManualCompletion(t)} aria-label="补记完成"><Check size={16} /></button>}<button onClick={() => p.start(t)} disabled={running || full}><Play size={16} /></button><button onClick={() => p.deleteTask(t.id)} disabled={running}><Trash2 size={16} /></button></div></article>; })}{!p.data.tasks.length && <p className="empty">任务列表是空的。</p>}</div></section><aside className="task-side-rail"><section className="task-side-card"><div className="section-label"><FolderOpen size={17} />固定任务</div><div className="task-preset-list">{p.quick.map(q => <div className="task-preset-item" key={q.id}><button className="task-preset-main" onClick={() => p.startQuick(q)}><span>{q.title}</span><small>{q.estimateMinutes} 分钟</small></button><button className="task-edit-button" onClick={e => { e.stopPropagation(); p.openEditTask(q, "fixed"); }} aria-label="编辑固定任务"><Pencil size={14} /></button><button className="task-preset-complete" onClick={() => p.openQuickManualCompletion(q)} aria-label="补记完成固定任务"><Check size={14} /></button><button className="task-preset-delete" onClick={e => { e.stopPropagation(); p.deleteQuick(q.id); }} aria-label="删除固定任务"><Trash2 size={14} /></button></div>)}{!p.quick.length && <p className="empty">还没有固定任务。</p>}</div><div className="task-category-form"><input value={p.newCat} onChange={e => p.setNewCat(e.target.value)} placeholder="新增任务类型" /><button onClick={p.addCategory}>添加类型</button></div></section></aside></div></section>;
}
function FormattedReview(p: { content: string }) {
  const paragraphs = p.content.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  return <div className="review-output today-review-output">{paragraphs.map((paragraph, index) => <p key={index}>{parseReviewTokens(paragraph).map((token, tokenIndex) => token.bold ? <strong key={tokenIndex}>{token.text}</strong> : <span key={tokenIndex}>{token.text}</span>)}</p>)}</div>;
}
function ReviewFeedback(p: { review: DailyReview; saveFeedback: (type: "positive" | "negative", comment?: string) => void }) {
  const [editingNegative, setEditingNegative] = useState(false), [comment, setComment] = useState(p.review.feedback?.comment ?? "");
  useEffect(() => { setComment(p.review.feedback?.comment ?? ""); setEditingNegative(false); }, [p.review.generatedAt, p.review.feedback?.updatedAt]);
  const submitNegative = () => { p.saveFeedback("negative", comment); setEditingNegative(false); };
  return <div className="review-feedback"><div className="review-feedback-row"><span>这次复盘对你有帮助吗？</span><button className={p.review.feedback?.type === "positive" ? "selected" : ""} onClick={() => p.saveFeedback("positive")}>👍 有帮助</button><button className={p.review.feedback?.type === "negative" ? "selected" : ""} onClick={() => setEditingNegative(true)}>👎 不喜欢</button>{p.review.feedback && <small>已记录 · {time(p.review.feedback.updatedAt)}</small>}</div>{editingNegative && <div className="review-feedback-form"><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="哪里不喜欢？比如太抽象、太啰嗦、没有结合具体任务、语气不喜欢……" rows={3} /><div><button className="primary" onClick={submitNegative}>提交反馈</button><button onClick={() => { setEditingNegative(false); setComment(p.review.feedback?.comment ?? ""); }}>取消</button></div></div>}</div>;
}
function AiReviewExpandedDialog(p: { review: DailyReview; close: () => void; saveFeedback: (type: "positive" | "negative", comment?: string) => void }) {
  return <div className="dialog-backdrop" onClick={p.close}><section className="ai-review-dialog" onClick={e => e.stopPropagation()}><div className="today-detail-head"><div><strong>AI 今日复盘</strong><span>生成于 {time(p.review.generatedAt)}</span></div><button onClick={p.close} aria-label="关闭">×</button></div><div className="ai-review-dialog-body"><FormattedReview content={p.review.content} /></div><ReviewFeedback review={p.review} saveFeedback={p.saveFeedback} /></section></div>;
}
function Today(p: { completed: CompletedTask[]; cats: Map<string, TaskCategory>; genReview: () => void; review: DailyReview | null; error: string; loading: boolean; saveReviewFeedback: (type: "positive" | "negative", comment?: string) => void; suggestions: AiTaskSuggestion[]; suggestionError: string; suggestionLoading: boolean; genTaskSuggestions: () => void; addSuggestionToTasks: (s: AiTaskSuggestion) => void }) {
  const [expandedReview, setExpandedReview] = useState(false);
  const closeExpandedReview = () => setExpandedReview(false);
  useEffect(() => { if (!p.review) setExpandedReview(false); }, [p.review?.generatedAt]);
  return <section className="review-panel today-page"><div className="page-head today-page-head"><div><h2>今日回顾</h2><p>看看今天的时间花在了哪里，也给明天一点方向。</p></div></div><Stats completed={p.completed} variant="today" /><div className="today-columns"><div className="today-left-stack"><Charts completed={p.completed} cats={p.cats} /><section className="today-card today-timeline-card"><div className="today-card-head"><div><strong>今日时间线</strong><span>按完成时间整理今天的专注轨迹。</span></div></div><List completed={p.completed} cats={p.cats} variant="timeline" /></section></div><div className="today-right-stack"><section className="today-card today-ai-card"><div className="today-card-head"><div><strong>AI 今日复盘</strong><span>{p.review ? `已保存 · 生成于 ${time(p.review.generatedAt)}` : "基于真实任务记录生成，不会自动修改数据。"}</span></div>{p.review ? <button className="review-expand-button" onClick={() => setExpandedReview(true)} disabled={p.loading}><Maximize2 size={15} />展开</button> : <Sparkles size={28} />}</div>{p.error && <p className="error">{p.error}</p>}{p.review ? <><FormattedReview content={p.review.content} /><ReviewFeedback review={p.review} saveFeedback={p.saveReviewFeedback} /></> : <p className="today-empty">还没有生成复盘。完成几项任务后，可以让 AI 帮你整理今天的节奏。</p>}<button className="primary today-ai-button" onClick={p.genReview} disabled={p.loading}><Sparkles size={17} />{p.loading ? "生成中..." : p.review ? "重新生成今日复盘" : "生成今日复盘"}</button></section><section className="today-card today-suggestions-card"><div className="today-card-head"><div><strong>明日任务建议</strong><span>AI 只做建议，点击后才加入任务栏。</span></div><button onClick={p.genTaskSuggestions} disabled={p.suggestionLoading}><Sparkles size={16} />{p.suggestionLoading ? "生成中..." : "生成明日建议"}</button></div>{p.suggestionError && <p className="error">{p.suggestionError}</p>}{p.suggestions.length ? <div className="today-suggestion-list">{p.suggestions.map(s => <article key={s.id} className="today-suggestion"><div><strong>{s.title}</strong><span>{p.cats.get(s.categoryId)?.name ?? s.categoryName ?? "未分类"} · {s.estimateMinutes} 分钟</span>{s.reason && <p>理由：{s.reason}</p>}{s.source && <p>来源：{s.source}</p>}</div><button className={s.accepted ? "" : "primary"} onClick={() => p.addSuggestionToTasks(s)} disabled={s.accepted}>{s.accepted ? "已加入" : "加入任务栏"}</button></article>)}</div> : <p className="today-empty">还没有明日建议。生成后你可以挑选合适的任务加入任务栏。</p>}</section></div></div><div className="page-footer"><span>专注</span><i>·</i><span>放松</span><i>·</i><span>完成</span></div>{expandedReview && p.review && <AiReviewExpandedDialog review={p.review} close={closeExpandedReview} saveFeedback={p.saveReviewFeedback} />}</section>;
}
function History(p: { completed: CompletedTask[]; allCompleted: CompletedTask[]; cats: Map<string, TaskCategory>; metrics: Record<string, DayMetric>; dates: string[]; selectedDate: string; setSelectedDate: (v: string) => void }) { const consecutiveDays = useMemo(() => { const today = new Date(); let count = 0; for (let i = 0; i < 365; i++) { const d = new Date(today); d.setDate(today.getDate() - i); if (p.metrics[d.toISOString().slice(0, 10)]) count++; else break; } return count; }, [p.metrics]); const weekData = useMemo(() => { const today = new Date(), dayOfWeek = today.getDay(), mon = new Date(today); mon.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); mon.setHours(0, 0, 0, 0); const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]; let m = 0; const ds = labels.map((lb, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); const h = p.metrics[d.toISOString().slice(0, 10)]?.totalSeconds ? Math.round(p.metrics[d.toISOString().slice(0, 10)].totalSeconds / 360) / 10 : 0; if (h > m) m = h; return { label: lb, hours: h, today: d.toDateString() === today.toDateString() }; }); return { days: ds, max: m }; }, [p.metrics]); const daySummary = useMemo(() => { const x = p.metrics[p.selectedDate]; if (!x) return { done: 0, hours: 0, interrupted: 0 }; return { done: x.tasks.filter(t => t.status !== "interrupted").length, interrupted: x.tasks.filter(t => t.status === "interrupted").length, hours: Math.round(x.totalSeconds / 360) / 10 }; }, [p.metrics, p.selectedDate]); const streakDays = useMemo(() => { const today = new Date(); const labels = ["一", "二", "三", "四", "五", "六", "日"]; return Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (6 - i)); const key = d.toISOString().slice(0, 10); const dayOfWeek = d.getDay(); return { label: labels[dayOfWeek === 0 ? 6 : dayOfWeek - 1], has: !!p.metrics[key], date: key, isToday: i === 6 }; }); }, [p.metrics]); return <section className="history-panel"><div className="page-head"><div><h2>历史记录</h2><p>回看过去的专注轨迹，找到自己的节奏。</p></div></div><Stats completed={p.allCompleted} variant="history" consecutiveDays={consecutiveDays} /><div className="history-dashboard"><div className="history-left-stack"><div className="history-card"><Calendar metrics={p.metrics} selectedDate={p.selectedDate} setSelectedDate={p.setSelectedDate} /><div className="history-streak"><div className="history-streak-head"><strong>连续记录</strong><span>🔥 {consecutiveDays} 天</span></div><div className="history-streak-dots">{streakDays.map((d, i) => <div key={i} className={`history-streak-dot${d.has ? " filled" : ""}${d.isToday ? " today" : ""}`}><span>{d.label}</span><i /></div>)}</div></div></div><div className="history-card"><div className="history-card-header"><strong className="history-card-title">本周趋势</strong><span>专注时长 (小时)</span></div><div className="history-week-chart">{weekData.days.map(d => <div className="history-week-bar-group" key={d.label}><span className="history-week-bar-value">{d.hours > 0 ? d.hours : ""}</span><div className={`history-week-bar${d.today || (weekData.max > 0 && d.hours === weekData.max) ? " highlight" : ""}`} style={{ height: `${d.hours > 0 && weekData.max > 0 ? Math.max(12, d.hours / weekData.max * 110) : 4}px` }} /><span className="history-week-bar-label">{d.label}</span></div>)}</div></div></div><div className="history-right-stack"><div className="history-card"><div className="history-card-header"><strong className="history-card-title">当天概览</strong><span>{p.selectedDate}</span></div><div className="history-overview-stats"><div className="history-overview-item"><span>完成</span><strong>{daySummary.done}</strong></div><div className="history-overview-sep" /><div className="history-overview-item"><span>专注</span><strong>{daySummary.hours > 0 ? <>{daySummary.hours}<small>h</small></> : "-"}</strong></div><div className="history-overview-sep" /><div className="history-overview-item"><span>中断</span><strong>{daySummary.interrupted}</strong></div></div></div><div className="history-card"><div className="history-card-header"><strong className="history-card-title">任务记录</strong></div><List completed={p.completed} cats={p.cats} variant="history" /></div></div></div><div className="page-footer"><span>专注</span><i>·</i><span>放松</span><i>·</i><span>完成</span></div></section>; }
const shortDuration = (sec: number) => { const minutes = Math.round(sec / 60); if (minutes >= 60) return `${Math.round(minutes / 6) / 10}h`; return `${minutes}m`; };
function Stats(p: { completed: CompletedTask[]; variant?: "today" | "history"; consecutiveDays?: number }) { const total = p.completed.reduce((s, t) => s + t.actualSeconds, 0), over = p.completed.reduce((s, t) => s + t.overtimeSeconds, 0), interrupted = p.completed.filter(t => t.status === "interrupted").length, done = p.completed.length - interrupted; if (p.variant === "history") { const cards = [{ label: "累计完成", value: done, icon: <Check size={20} /> }, { label: "累计专注", value: shortDuration(total), icon: <Clock3 size={20} /> }, { label: "连续记录", value: `${p.consecutiveDays ?? 0} 天`, icon: <BarChart3 size={20} /> }]; return <div className="history-stats-row">{cards.map(c => <div className="history-stat-card" key={c.label}><div className="history-stat-icon">{c.icon}</div><div><span>{c.label}</span><strong>{c.value}</strong></div></div>)}</div>; } if (p.variant === "today") { const cards = [{ label: "完成任务", value: done, tone: "blue", icon: <Check size={22} /> }, { label: "总专注时长", value: shortDuration(total), tone: "green", icon: <Clock3 size={22} /> }, { label: "超时时长", value: shortDuration(over), tone: "orange", icon: <BarChart3 size={22} /> }, { label: "中断任务", value: interrupted, tone: "red", icon: <X size={22} /> }]; return <div className="today-stats-grid">{cards.map(card => <div className="today-stat-card" key={card.label}><i className={`today-stat-icon ${card.tone}`}>{card.icon}</i><div><span>{card.label}</span><strong>{card.value}</strong></div></div>)}</div>; } return <div className="stats-grid"><div><span>完成任务</span><strong>{done}</strong></div><div><span>总专注时长</span><strong>{mins(total)}</strong></div><div><span>超时时长</span><strong>{mins(over)}</strong></div><div><span>中断任务</span><strong>{interrupted}</strong></div></div>; }
function Charts(p: { completed: CompletedTask[]; cats: Map<string, TaskCategory> }) { const totals = p.completed.reduce<Record<string, number>>((a, t) => ({ ...a, [t.categoryId]: (a[t.categoryId] ?? 0) + t.actualSeconds }), {}), es = Object.entries(totals), total = es.reduce((s, x) => s + x[1], 0); let offset = 0; const slices = es.map(([id, sec]) => { const c = p.cats.get(id), value = total ? sec / total : 0, slice = { id, sec, value, offset, color: c?.color ?? "#64748b", name: c?.name ?? "未分类" }; offset += value; return slice; }); return <section className="today-card today-chart-card"><div className="today-card-head"><div><strong>时间分配</strong><span>按任务分类汇总实际专注时长。</span></div></div>{slices.length ? <div className="today-distribution"><svg className="today-pie-svg" viewBox="0 0 180 180" aria-label="今日时间分配饼图"><circle cx="90" cy="90" r="62" fill="none" stroke="#f2eee7" strokeWidth="34" />{slices.map(slice => <circle key={slice.id} cx="90" cy="90" r="62" fill="none" pathLength={1} stroke={slice.color} strokeWidth="34" strokeDasharray={`${slice.value} ${1 - slice.value}`} strokeDashoffset={-slice.offset} strokeLinecap="butt" transform="rotate(-90 90 90)" />)}<circle cx="90" cy="90" r="43" fill="#fffdfa" /><circle cx="90" cy="90" r="79" fill="none" stroke="rgba(255,255,255,.78)" strokeWidth="2" /></svg><div className="today-legend">{slices.map(slice => <div className="today-legend-row" key={slice.id}><i style={{ background: slice.color }} /><span>{slice.name}</span><b>{mins(slice.sec)}</b></div>)}</div></div> : <p className="today-empty">今天还没有数据。</p>}</section>; }
function Calendar(p: { metrics: Record<string, DayMetric>; selectedDate: string; setSelectedDate: (v: string) => void }) { const [viewDate, setViewDate] = useState(new Date()); const year = viewDate.getFullYear(), month = viewDate.getMonth(), start = new Date(year, month, 1), len = new Date(year, month + 1, 0).getDate(), blanks = Array.from({ length: start.getDay() }, (_, i) => i), prev = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)), next = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); return <div className="history-calendar"><div className="history-calendar-nav"><button onClick={prev} aria-label="上个月">&lt;</button><span>{year} 年 {month + 1} 月</span><button onClick={next} aria-label="下个月">&gt;</button></div><div className="history-calendar-header"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div className="history-calendar-grid">{blanks.map(i => <div key={`b-${i}`} className="history-calendar-day muted" />)}{Array.from({ length: len }, (_, i) => { const d = new Date(year, month, i + 1), k = d.toISOString().slice(0, 10), score = p.metrics[k]?.score ?? 0, active = k === p.selectedDate, alpha = score >= 4 ? 0.22 : score === 3 ? 0.15 : score === 2 ? 0.10 : score === 1 ? 0.06 : 0; return <button key={k} className={`history-calendar-day${active ? " active" : ""}${score > 0 ? " has-data" : ""}`} style={!active && alpha > 0 ? { backgroundColor: `rgba(59, 130, 246, ${alpha})` } : undefined} onClick={() => p.setSelectedDate(k)}>{i + 1}</button>; })}</div></div>; }
function taskStatusText(t: CompletedTask) { return t.status === "interrupted" ? "中断" : t.status === "overtime" || t.overtimeSeconds > 0 ? "超时完成" : "完成"; }
function TaskMusingsThread(p: { musings?: TaskMusing[] }) { return <div className="task-musings-thread">{p.musings?.length ? p.musings.map(m => <div key={m.id} className="task-musing-bubble"><p>{m.text}</p><span>{time(m.createdAt)} ✓✓</span></div>) : <p className="today-detail-empty">这次没有记录碎碎念。</p>}</div>; }
function TaskDetailDialog(p: { task: CompletedTask; cats: Map<string, TaskCategory>; close: () => void }) { const t = p.task, status = taskStatusText(t); return <div className="dialog-backdrop"><section className="today-detail-dialog"><div className="today-detail-head"><div><strong>{t.title}</strong><span>{p.cats.get(t.categoryId)?.name ?? "未分类"} · {status}</span></div><button onClick={p.close} aria-label="关闭">×</button></div><div className="today-detail-grid"><span>预计时长</span><b>{t.estimateMinutes} 分钟</b><span>实际用时</span><b>{mins(t.actualSeconds)}</b><span>超时时长</span><b>{mins(t.overtimeSeconds)}</b><span>开始时间</span><b>{t.startedAt ? time(t.startedAt) : "未记录"}</b><span>完成时间</span><b>{t.completedAt ? time(t.completedAt) : "未记录"}</b>{t.status === "interrupted" && <><span>剩余预估</span><b>{t.remainingEstimateMinutes ?? t.estimateMinutes} 分钟</b></>}</div><div className="today-detail-notes"><strong>记录与碎碎念</strong>{(t.note || t.reflection) && <div className="task-detail-note-card">{t.note && <p><span>备注</span>{t.note}</p>}{t.reflection && <p><span>{t.status === "interrupted" ? "中断说明" : "完成备注"}</span>{t.reflection}</p>}</div>}<TaskMusingsThread musings={t.musings} /></div></section></div>; }
function List(p: { completed: CompletedTask[]; cats: Map<string, TaskCategory>; variant?: "timeline" | "history" }) {
  const [selected, setSelected] = useState<CompletedTask | null>(null);
  if (!p.completed.length) return <p className={p.variant === "timeline" ? "today-empty" : "empty"}>还没有完成记录。</p>;
  if (p.variant === "history") return <><div className="history-task-list"><div className="history-task-header"><span>任务</span><span>类别</span><span>时长</span><span>状态</span></div>{p.completed.map(t => { const cat = p.cats.get(t.categoryId), badge = t.status === "interrupted" ? "warning" : t.overtimeSeconds > 0 ? "overtime" : "success", label = t.status === "interrupted" ? "中断" : t.overtimeSeconds > 0 ? "超时" : "已完成"; return <article key={`${t.id}-${t.completedAt}`} className="history-task-item" onClick={() => setSelected(t)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(t); } }}><div className="history-task-name"><i style={{ background: cat?.color ?? "#64748b" }} />{t.title}</div><div className="history-task-cat">{cat?.name ?? "未分类"}</div><div className="history-task-time">{mins(t.actualSeconds)}</div><div><span className={`history-task-badge ${badge}`}>{label}</span></div></article>; })}</div>{selected && <TaskDetailDialog task={selected} cats={p.cats} close={() => setSelected(null)} />}</>;
  if (p.variant === "timeline") return <><div className="today-timeline">{p.completed.map(t => { const interrupted = t.status === "interrupted", cat = p.cats.get(t.categoryId), timePoint = t.completedAt ?? t.startedAt, status = interrupted ? "中断" : t.overtimeSeconds > 0 ? "超时" : "完成"; return <article key={`${t.id}-${t.completedAt}`} className={`today-timeline-item ${interrupted ? "interrupted" : ""}`} onClick={() => setSelected(t)}><time>{time(timePoint)}</time><i /><div className="today-timeline-summary"><div><strong>{t.title}</strong><span>{cat?.name ?? "未分类"} · 实际 {mins(t.actualSeconds)}{interrupted ? ` · 剩余预估 ${t.remainingEstimateMinutes ?? t.estimateMinutes} 分钟` : t.overtimeSeconds > 0 ? ` · 超时 ${mins(t.overtimeSeconds)}` : ""}</span></div><b>{status}</b></div></article>; })}</div>{selected && <TaskDetailDialog task={selected} cats={p.cats} close={() => setSelected(null)} />}</>;
  return <div className="completed-list">{p.completed.map(t => <article key={`${t.id}-${t.completedAt}`} className="completed-item"><div><strong>{t.title}</strong><span>{p.cats.get(t.categoryId)?.name ?? "未分类"} · {time(t.completedAt)} · 实际 {mins(t.actualSeconds)}{t.status === "interrupted" ? ` · 剩余预估 ${t.remainingEstimateMinutes ?? t.estimateMinutes} 分钟` : ""}</span>{(t.musings?.length || t.reflection) && <div className="task-notes">{t.musings?.map(m => <p key={m.id}>碎碎念 {time(m.createdAt)}：{m.text}</p>)}{t.reflection && <p>{t.status === "interrupted" ? "中断说明" : "完成备注"}：{t.reflection}</p>}</div>}</div><b className={t.status === "interrupted" ? "warn" : t.overtimeSeconds > 0 ? "bad" : "good"}>{t.status === "interrupted" ? "中断" : t.overtimeSeconds > 0 ? `超时 ${mins(t.overtimeSeconds)}` : "准时"}</b></article>)}</div>;
}
const corgiFrames = {
  sleep: [corgiSleep1, corgiSleep2, corgiSleep3, corgiSleep4],
  play: [corgiPlay1, corgiPlay2, corgiPlay3, corgiPlay4],
  eat: [corgiEat1, corgiEat2, corgiEat3, corgiEat4]
};
function modeFor(r?: DogReward | null, idle?: "sleep" | "toy"): "sleep" | "play" | "eat" { if (r?.animation === "eat" || r?.animation === "sniff" || r?.animation === "care") return "eat"; if (r) return "play"; return idle === "sleep" ? "sleep" : "play"; }
function PixelCorgi(p: { reward?: DogReward | null; idle?: "sleep" | "toy" }) { const m = modeFor(p.reward, p.idle); const [frame, setFrame] = useState(0); useEffect(() => { setFrame(0); const timer = window.setInterval(() => setFrame(v => (v + 1) % corgiFrames[m].length), m === "eat" ? 220 : m === "play" ? 260 : 420); return () => window.clearInterval(timer); }, [m]); return <div className={`pixel-corgi pixel-corgi-${m} ${p.reward ? `pixel-reward-${p.reward.animation}` : ""}`}><img className="pixel-corgi-frame" src={corgiFrames[m][frame]} alt="" draggable={false} />{p.reward && <div className={`dog-treat dog-item-${p.reward.categoryId}`}><i /><span>{p.reward.item}</span></div>}</div>; }
function TaskEditDialog(p: { target: EditingTaskTarget; form: EditingTaskForm; setForm: (form: EditingTaskForm) => void; categories: TaskCategory[]; error: string; cancel: () => void; confirm: () => void }) {
  const setField = (field: keyof EditingTaskForm, value: string) => p.setForm({ ...p.form, [field]: value });
  const sourceText = p.target.source === "fixed" ? "固定任务模板" : p.target.source === "running" ? "运行中任务" : "待办任务";
  return <div className="dialog-backdrop" onClick={p.cancel}><section className="task-edit-dialog" onClick={e => e.stopPropagation()}><div className="today-detail-head"><div><strong>编辑任务</strong><span>{sourceText}</span></div><button onClick={p.cancel} aria-label="关闭">×</button></div><div className="task-edit-form"><label className="task-edit-field"><span className="task-edit-label">任务名称</span><input className="task-edit-input" value={p.form.title} onChange={e => setField("title", e.target.value)} placeholder="任务名称" autoFocus /></label><label className="task-edit-field"><span className="task-edit-label">类型 / 分类</span><select className="task-edit-input" value={p.form.categoryId} onChange={e => setField("categoryId", e.target.value)}>{p.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="task-edit-field"><span className="task-edit-label">预计用时</span><div className="manual-complete-duration-input"><input type="number" min={1} step={1} value={p.form.estimateMinutes} onChange={e => setField("estimateMinutes", e.target.value)} /><span className="manual-complete-duration-unit">分钟</span></div></label>{p.target.source !== "fixed" && <label className="task-edit-field"><span className="task-edit-label">备注</span><textarea className="task-edit-textarea" value={p.form.note} onChange={e => setField("note", e.target.value)} placeholder="备注，可不填" /></label>}{p.error && <p className="task-edit-error">{p.error}</p>}</div><div className="task-edit-actions"><button onClick={p.cancel}>取消</button><button className="primary" onClick={p.confirm}><Check size={17} />保存修改</button></div></section></div>;
}
function ManualCompletionDialog(p: { target: Task; actualMinutes: string; setActualMinutes: (v: string) => void; note: string; setNote: (v: string) => void; error: string; cancel: () => void; confirm: () => void }) { return <div className="dialog-backdrop"><section className="completion-dialog manual-completion-dialog"><div className="today-detail-head"><div><strong>补记完成</strong><span>{p.target.title}</span></div><button onClick={p.cancel} aria-label="关闭">×</button></div><div className="manual-completion-summary"><span>预计时长</span><b>{p.target.estimateMinutes} 分钟</b></div><label className="manual-complete-field"><span className="manual-complete-label">实际用时</span><div className="manual-complete-duration-input"><input type="number" min={1} step={1} value={p.actualMinutes} onChange={e => p.setActualMinutes(e.target.value)} autoFocus /><span className="manual-complete-duration-unit">分钟</span></div></label>{p.error && <p className="error manual-completion-error">{p.error}</p>}<textarea value={p.note} onChange={e => p.setNote(e.target.value)} placeholder="完成备注，可不填" /><div className="dialog-actions"><button onClick={p.cancel}>取消</button><button className="primary" onClick={p.confirm}><Check size={17} />确认完成</button></div></section></div>; }
function Completion(p: { note: string; setNote: (v: string) => void; suggestions: string[]; cancel: () => void; confirm: () => void }) { return <div className="dialog-backdrop"><section className="completion-dialog"><div className="section-label">完成备注</div><textarea value={p.note} onChange={e => p.setNote(e.target.value)} placeholder="这项任务完成得怎么样？" autoFocus /><div className="note-chip-list">{p.suggestions.map(c => <button key={c} onClick={() => p.setNote(c)}>{c}</button>)}</div><div className="dialog-actions"><button onClick={p.cancel}>继续编辑</button><button className="primary" onClick={p.confirm}><Check size={17} />确认完成</button></div></section></div>; }
function InterruptDialog(p: { note: string; setNote: (v: string) => void; suggestions: string[]; cancel: () => void; confirm: () => void }) { return <div className="dialog-backdrop"><section className="completion-dialog"><div className="section-label">中断理由</div><textarea value={p.note} onChange={e => p.setNote(e.target.value)} placeholder="为什么需要中断这项任务？" autoFocus /><div className="note-chip-list">{p.suggestions.map(c => <button key={c} onClick={() => p.setNote(c)}>{c}</button>)}</div><div className="dialog-actions"><button onClick={p.cancel}>继续计时</button><button className="primary" onClick={p.confirm}>确认中断</button></div></section></div>; }
function DogPanel(p: { dog: DogProfile; reward: DogReward | null; updateDog: (d: DogProfile) => void; categories: TaskCategory[]; settings: AppSettings; saveSettings: (s: AppSettings) => void }) { const [name, setName] = useState(p.dog.name), [gender, setGender] = useState(p.dog.gender); useEffect(() => { setName(p.dog.name); setGender(p.dog.gender); }, [p.dog.name, p.dog.gender]); const age = Math.max(1, Math.floor((Date.now() - new Date(p.dog.birthday).getTime()) / 86400000)); const skill = ["坐下", "握手", "转圈", "等待", "叼球"][p.dog.skillPoints % 5]; const setPref = (id: string, k: DogRewardKind) => p.saveSettings({ ...p.settings, dogRewardPreferences: { ...(p.settings.dogRewardPreferences ?? {}), [id]: k } }); return <section className={`dog-panel ${p.dog.enabled ? "" : "dog-disabled"}`}><div className="dog-header"><div><div className="section-label">柯基伙伴</div><strong>{p.dog.name}</strong><span>{p.dog.gender} · {age < 30 ? `${age} 天` : `${Math.floor(age / 30)} 个月`}</span></div><button onClick={() => p.updateDog({ ...p.dog, enabled: !p.dog.enabled })}>{p.dog.enabled ? "关闭小狗" : "开启小狗"}</button></div><div className="dog-companion-actions"><button className="primary" onClick={() => void window.floatodo.showDogWindow()}>放到桌面上</button><span>专注工作时睡觉，休闲或空闲时玩球，完成任务时触发你设置的奖励。</span></div><PixelCorgi reward={p.reward} /><div className="dog-speech">{p.dog.enabled ? p.reward ? `${p.reward.message}${p.dog.name}${p.reward.action}。` : "我在右下角陪你做事。" : "小狗模式已关闭。"}</div><div className="dog-stats"><DogMeter label="饱腹" value={p.dog.fullness} /><DogMeter label="快乐" value={p.dog.happiness} /><DogMeter label="亲密" value={p.dog.bond} /><DogMeter label="社交" value={p.dog.social} /><DogMeter label="护理" value={p.dog.care} /><div className="dog-skill"><span>技能</span><b>{skill} · Lv.{Math.floor(p.dog.skillPoints / 5) + 1}</b></div></div><div className="dog-settings"><input value={name} onChange={e => setName(e.target.value)} placeholder="小狗名字" /><select value={gender} onChange={e => setGender(e.target.value)}><option value="未设定">未设定</option><option value="妹妹">妹妹</option><option value="弟弟">弟弟</option></select><button onClick={() => p.updateDog({ ...p.dog, name: name.trim() || "Todo", gender: gender.trim() || "未设定" })}>保存资料</button></div><div className="dog-reward-settings"><div className="section-label">完成奖励规则</div>{p.categories.map(c => <label key={c.id}><span><i style={{ background: c.color }} />{c.name}</span><select value={rewardKind(p.settings.dogRewardPreferences, c.id)} onChange={e => setPref(c.id, e.target.value as DogRewardKind)}>{Object.entries(rewardOptions).map(([k, r]) => <option key={k} value={k}>{r.item}</option>)}</select></label>)}</div></section>; }
function DogMeter(p: { label: string; value: number }) { return <div className="dog-meter"><span>{p.label}</span><div><i style={{ width: `${p.value}%` }} /></div><b>{p.value}</b></div>; }
function DogCompanionWindow() { const [reward, setReward] = useState<DogReward | null>(null), [idle, setIdle] = useState<"sleep" | "toy">("toy"), [pinned, setPinned] = useState(true); useEffect(() => { void window.floatodo.isDogAlwaysOnTop?.().then(setPinned).catch(e => console.error("[Floatodo dog] failed to read pin state", e)); const a = window.floatodo.onDogReward(x => { setReward(x as DogReward); window.setTimeout(() => setReward(null), 5200); }); const b = window.floatodo.onDogState(x => { const i = (x as { idle?: "sleep" | "toy" }).idle; if (i === "sleep" || i === "toy") setIdle(i); }); return () => { a(); b(); }; }, []); const pin = async () => { try { const current = await (window.floatodo.isDogAlwaysOnTop?.() ?? Promise.resolve(pinned)); setPinned(await window.floatodo.setDogAlwaysOnTop(!current)); } catch (error) { console.error("[Floatodo dog] failed to toggle pin", error); } }; return <main className="dog-window"><div className="dog-window-toolbar"><button onClick={pin}>{pinned ? "置顶" : "普通"}</button></div><div className="dog-stage"><PixelCorgi reward={reward} idle={idle} /></div></main>; }
function TuckStripWindow() { const [state, setState] = useState<TuckTimerState>({ title: "Floatodo", overtime: false, idleTime: "00:00", taskTitleHidden: false }), [now, setNow] = useState(Date.now()); const edge = new URLSearchParams(window.location.search).get("edge") ?? "right"; useEffect(() => window.floatodo.onTuckState(x => { const s = x as Partial<TuckTimerState>; setState({ title: s.title ?? "Floatodo", overtime: Boolean(s.overtime), startedAt: s.startedAt, estimateSeconds: s.estimateSeconds, pausedSeconds: s.pausedSeconds, pausedAt: s.pausedAt, idleTime: s.idleTime ?? "00:00", taskTitleHidden: Boolean(s.taskTitleHidden) }); setNow(Date.now()); }), []); useEffect(() => { if (!state.startedAt || state.pausedAt) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [state.startedAt, state.pausedAt]); const elapsed = state.startedAt ? Math.max(0, Math.floor(((state.pausedAt ? new Date(state.pausedAt).getTime() : now) - new Date(state.startedAt).getTime()) / 1000) - (state.pausedSeconds ?? 0)) : 0, remaining = (state.estimateSeconds ?? 0) - elapsed, overtime = Boolean(state.startedAt && remaining < 0), display = state.startedAt ? fmt(overtime ? elapsed - (state.estimateSeconds ?? 0) : remaining) : state.idleTime ?? "00:00"; const open = () => void window.floatodo.untuckWindow(); return <main className={`tuck-strip-window tuck-strip-${edge}`} onMouseEnter={open} onMouseMove={open} onMouseDown={open}><section className={`tucked-timer ${state.taskTitleHidden ? "privacy-mode-active" : ""}`}>{!state.taskTitleHidden && <span>{state.title}</span>}<strong className={overtime ? "overtime" : ""}>{display}</strong><small>移入展开</small></section></main>; }
function SettingsDialog(p: { settings: AppSettings; saveSettings: (s: AppSettings) => void; close: () => void }) { return <div className="dialog-backdrop" onClick={p.close}><section className="settings-dialog" onClick={e => e.stopPropagation()}><div className="today-detail-head"><div><strong>设置</strong><span>配置 AI 复盘与本地数据入口。</span></div><button onClick={p.close} aria-label="关闭">×</button></div><SettingsPanel settings={p.settings} saveSettings={p.saveSettings} /></section></div>; }
function SettingsPanel(p: { settings: AppSettings; saveSettings: (s: AppSettings) => void }) { const [key, setKey] = useState(p.settings.deepseekApiKey), [model, setModel] = useState(p.settings.deepseekModel); useEffect(() => { setKey(p.settings.deepseekApiKey); setModel(p.settings.deepseekModel); }, [p.settings]); return <div className="settings-box"><div className="section-label"><Settings size={17} />DeepSeek 设置</div><input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="DeepSeek API Key" /><div className="form-row"><input value={model} onChange={e => setModel(e.target.value)} placeholder="模型，例如 deepseek-chat" /><button onClick={() => p.saveSettings({ ...p.settings, deepseekApiKey: key, deepseekModel: model || "deepseek-chat" })}>保存</button></div><button className="plain" onClick={() => void window.floatodo.openDataFolder()}>打开本地数据目录</button></div>; }

const params = new URLSearchParams(window.location.search);
createRoot(document.getElementById("root")!).render(params.get("dogWindow") === "1" ? <DogCompanionWindow /> : params.get("tuckWindow") === "1" ? <TuckStripWindow /> : <App />);
