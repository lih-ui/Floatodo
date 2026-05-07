# Floatodo

Floatodo 是一个悬浮在 Windows 桌面的任务计时器。它把待办任务、预估耗时、专注计时、完成回顾、历史记录、DeepSeek 今日复盘，以及一个会陪你工作的柯基桌宠放在同一个本地桌面应用里。

## 当前版本

V0.1 已包含：

- 桌面悬浮计时窗口和完整展开工作台
- 单任务计时，同一时间只允许一个任务进行中
- 预估倒计时，超时后自动转为正计时
- 暂停、继续、完成任务
- 任务进行中碎碎念，像聊天一样多次记录想法
- 完成任务后填写完成备注
- 今日工作回顾、分类时间图表、历史任务回顾和日历热力图
- DeepSeek API Key 本地配置和今日复盘生成
- 内置任务类型，也支持自定义类型
- 固定任务，例如休息 5 分钟，也支持自定义固定任务
- 柯基伙伴系统：完成任务可以获得狗粮、冻干、零食、玩具、散步、护理或技能训练
- 独立桌面小狗悬浮窗，可拖动、可置顶
- 小狗动画使用独立透明 PNG 帧，包含睡觉、玩球、吃饭三组状态

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

如果 Electron 下载较慢，可以先设置国内镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm.cmd install
```

## 常用命令

```powershell
npm.cmd run typecheck
npm.cmd run build
```

## 数据保存

所有任务、设置、小狗资料和 DeepSeek API Key 都保存在本机 Electron 应用数据目录中。应用内可以通过“打开本地数据目录”查看数据文件。

## DeepSeek

在应用的历史/设置区域填写：

- DeepSeek API Key
- 模型名，默认 `deepseek-chat`

API Key 只保存在本地数据文件中，不应该提交到 GitHub。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- lucide-react

## 开源计划

下一步可以继续补充：

- Windows 安装包构建，例如 `electron-builder`
- 数据导出
- 更多小狗动作和成长系统
- 更完整的主题设置
- 自动启动选项

## License

MIT
