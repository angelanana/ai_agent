# AI 聊天界面 Demo 技术方案

目标：在现有 Next.js/React 代码基础上，快速做出可运行的 AI 聊天界面 Demo，具备流式消息渲染、文件上传预览、语音输入。

## 技术栈
- 前端：Next.js (App Router) + React + TypeScript + Tailwind 或现有样式体系。
- 传输：HTTP SSE（或 WebSocket，如果已有支持）用于流式消息返回。
- 语音：Web Speech API（浏览器内建）或接入第三方/自建 ASR。
- 上传：`fetch` multipart 上传；前端使用 `URL.createObjectURL`/`FileReader` 生成预览。

## 组件拆分
- `ChatContainer`: 管理消息列表、输入区、状态（录音中/上传中/streaming）。
- `MessageList`/`MessageItem`: 展示用户与助手消息，支持代码块、光标动画、思维链折叠。
- `Composer`: 文本输入、发送按钮、录音按钮、文件上传入口，支持 Cmd/Ctrl+Enter 发送。
- `UploadsPreview`: 展示图片缩略图或通用文件卡片，可移除单个文件。
- `VoiceRecorder`: 封装 Web Speech API start/stop，回调将转写文本写入 Composer。
- `useChat` hook：封装消息状态、发送、流式处理、错误处理与重试。

## 流式消息渲染（SSE 示例）
1. `useChat.sendMessage` 调用 `/api/chat/stream`（`fetch` + `ReadableStream` 或 `EventSource`）。
2. 逐块 `reader.read()` 将文本 append 到当前 assistant 消息的 `content`，触发渲染。
3. 识别 `[DONE]` 或流结束后，设 `isStreaming=false`；错误时提示并允许重试。
4. 回退：浏览器不支持流或网络中断时，降级为普通 POST 取整段响应。

## 文件上传与预览
1. 选择文件后即刻在前端生成预览：图片用 `URL.createObjectURL`，其它显示文件名/类型/大小。
2. 维护 `pendingUploads`，可移除单个文件；`isUploading` 控制按钮禁用。
3. 上传接口：`POST /api/upload` (multipart) 返回 `{ id, url, name, type, size }`。
4. 发送消息时将 `attachments`（上传结果）附加到 user message，后端用作上下文或引用。
5. 前端限制类型/大小，大文件给出提示并阻止上传。

## 语音输入
1. `VoiceRecorder` 使用 `SpeechRecognition`（需处理 `webkitSpeechRecognition` 前缀）。
2. start/stop 控制录音；实时转写回调填入 Composer 草稿。
3. UI：录音中按钮高亮/闪烁，提供取消；录音中禁用发送/上传以避免冲突。
4. 不支持时隐藏入口或提示使用文本输入。

## 后端接口约定（最小版）
- `POST /api/chat/stream`: `body { messages, attachments }`，返回 SSE/流式文本；使用 `[DONE]` 结束。
- `POST /api/upload`: multipart，返回文件元数据 `{ id, url, name, type, size }`。
- （可选）`GET /api/upload/:id`: 获取文件或元数据。

## 状态与错误处理
- 关键状态：`isStreaming`, `isUploading`, `isRecording` 控制按钮禁用与加载态。
- 错误提示：toast/snackbar；消息气泡提供重试/撤销。
- 输入框：发送后清空但保留草稿状态（可用 `useState` + draft 缓存）。

## UI 交互要点
- 消息气泡：左右对齐；助手流式时显示光标动画；代码块支持高亮与复制按钮。
- 思维链：在助手消息中按分段渲染，可折叠/展开查看推理。
- 上传预览条：图片缩略图；通用文件卡片显示类型/大小，带删除按钮。
- 语音录制：显著状态提示，随时停止或取消。
- 移动端：键盘弹起时 Composer 不遮挡列表，触摸区域足够大。

## 推荐落地顺序
1) 基础消息列表 + Composer（纯文本发送）  
2) 接 `/api/chat/stream` 做流式渲染（ReadableStream/SSE）  
3) 文件选择预览 + `/api/upload` 上传联通  
4) 语音输入（Web Speech API）  
5) 打磨：loading、重试、代码高亮、思维链折叠

## 测试清单
- 流式中断/超时/重连是否正常结束或降级。
- 多文件并发上传、失败回滚（移除失败附件）。
- 语音输入的开始/停止/取消幂等性，重复点击无异常。
- 移动端触摸操作，键盘弹出时布局不抖动。
