import { Actions, Attachments, Bubble, FileCard, Sender, XProvider } from '@ant-design/x'
import type { UploadFile, UploadProps } from 'antd'
import { Alert, Card, Space, Typography, Tag } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import './App.css'

type Role = 'user' | 'assistant'

type Attachment = {
  id: string
  url: string
  name: string
  type: string
  size: number
}

type Message = {
  id: string
  role: Role
  content: string
  attachments?: Attachment[]
  status?: 'streaming' | 'done' | 'error'
}

type SendOptions = {
  text: string
  attachments: Attachment[]
}

const initialWelcome: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好，我是你的 AI 助手。使用 Ant Design X 组件的聊天体验，支持流式输出、文件上传和语音输入。',
  status: 'done',
}

function useChat() {
  const [messages, setMessages] = useState<Message[]>([initialWelcome])
  const [isStreaming, setIsStreaming] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const appendAssistantContent = useCallback((assistantId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg,
      ),
    )
  }, [])

  const markAssistantStatus = useCallback((assistantId: string, status: Message['status']) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === assistantId ? { ...msg, status } : msg)),
    )
  }, [])

  const streamFromApi = useCallback(
    async (context: Message[], assistantId: string) => {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: context }),
      })

      if (!response.ok) {
        throw new Error(`接口返回错误 ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('响应不包含可读流')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk === '[DONE]') break
        appendAssistantContent(assistantId, chunk)
      }

      markAssistantStatus(assistantId, 'done')
    },
    [appendAssistantContent, markAssistantStatus],
  )

  const mockStream = useCallback(
    async (assistantId: string) => {
      const mockParagraphs = [
        '这是一个示例回答，用于演示 Ant Design X 气泡的流式渲染效果。',
        '你可以通过下方 Attachments 组件上传文件，或在 Sender 中使用语音输入按钮。',
        '接入真实接口时，将 /api/chat/stream 指向后端并返回 SSE 或 ReadableStream。',
      ]

      for (const paragraph of mockParagraphs) {
        await new Promise((resolve) => setTimeout(resolve, 520))
        appendAssistantContent(assistantId, `${paragraph}\n\n`)
      }

      markAssistantStatus(assistantId, 'done')
    },
    [appendAssistantContent, markAssistantStatus],
  )

  const sendMessage = useCallback(
    async ({ text, attachments }: SendOptions) => {
      if (!text.trim() && attachments.length === 0) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        attachments,
        status: 'done',
      }

      const assistantId = crypto.randomUUID()
      let context: Message[] = []

      setLastError(null)
      setIsStreaming(true)
      setMessages((prev) => {
        context = [...prev, userMessage]
        return [...context, { id: assistantId, role: 'assistant', content: '', status: 'streaming' }]
      })

      try {
        await streamFromApi(context, assistantId)
      } catch (err) {
        console.warn('流式接口不可用，使用 mock 数据', err)
        setLastError(err instanceof Error ? err.message : '发送失败')
        await mockStream(assistantId)
      } finally {
        setIsStreaming(false)
      }
    },
    [mockStream, streamFromApi],
  )

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const attachments = lastUser.attachments ?? []
    return sendMessage({ text: lastUser.content, attachments })
  }, [messages, sendMessage])

  const resetChat = useCallback(() => {
    setMessages([initialWelcome])
    setLastError(null)
    setIsStreaming(false)
  }, [])

  return { messages, isStreaming, lastError, sendMessage, retryLast, resetChat }
}

function App() {
  const { messages, isStreaming, lastError, sendMessage, retryLast, resetChat } = useChat()
  const [inputValue, setInputValue] = useState('')
  const [fileList, setFileList] = useState<UploadFile[]>([])

  const customRequest = useCallback<UploadProps['customRequest']>((options) => {
    const { file, onSuccess, onError, onProgress } = options
    const origin = file as File
    const url = URL.createObjectURL(origin)
    setTimeout(() => {
      onProgress?.({ percent: 100 })
      onSuccess?.({ url }, origin)
    }, 400)

    return {
      abort() {
        onError?.(new Error('上传已取消'))
      },
    }
  }, [])

  const onAttachmentChange: UploadProps['onChange'] = (info) => {
    const next = info.fileList.map((file) => {
      const origin = file.originFileObj as File | undefined
      const objectUrl = origin ? URL.createObjectURL(origin) : undefined
      return { ...file, url: file.url || file.thumbUrl || objectUrl }
    })
    setFileList(next)
  }

  const attachmentsForSend = useMemo<Attachment[]>(() => {
    return fileList.map((file) => {
      const origin = file.originFileObj as File | undefined
      return {
        id: file.uid,
        url: file.url || file.thumbUrl || (origin ? URL.createObjectURL(origin) : ''),
        name: file.name,
        type: origin?.type || file.type || '',
        size: origin?.size ?? file.size ?? 0,
      }
    })
  }, [fileList])

  const handleSubmit = async (value?: string) => {
    const text = (value ?? inputValue).trim()
    if (!text && attachmentsForSend.length === 0) return
    await sendMessage({ text, attachments: attachmentsForSend })
    setInputValue('')
    setFileList([])
  }

  const bubbleItems = useMemo(() => {
    return messages.map((msg) => {
      const hasAttachments = (msg.attachments?.length ?? 0) > 0
      return {
        key: msg.id,
        role: msg.role === 'user' ? 'user' : 'ai',
        content: msg.content || ' ',
        typing: msg.status === 'streaming',
        streaming: msg.status === 'streaming',
        footer: hasAttachments ? (
          <FileCard.List
            size="small"
            items={
              msg.attachments?.map((att) => ({
                key: att.id,
                name: att.name,
                byte: att.size,
                src: att.url,
                type: att.type,
                icon: 'default',
                description: att.url,
              })) ?? []
            }
            removable={false}
          />
        ) : null,
      }
    })
  }, [messages])

  const actionItems = useMemo(
    () => [
      {
        key: 'retry',
        label: '重试',
        onItemClick: () => retryLast(),
      },
      {
        key: 'clear',
        label: '清空对话',
        danger: true,
        onItemClick: () => resetChat(),
      },
    ],
    [resetChat, retryLast],
  )

  return (
    <XProvider>
      <div className="chat-page">
        <Card className="chat-card" bordered={false}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div className="chat-header">
              <div>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  Ant Design X AI Chat
                </Typography.Title>
                <Typography.Text type="secondary">
                  基于 Ant Design X 的气泡、Sender、Attachments 组合，具备流式输出与语音输入。
                </Typography.Text>
              </div>
              <Tag color="cyan">Demo</Tag>
            </div>

            {lastError && (
              <Alert
                showIcon
                type="error"
                message="发送失败，已回退到 mock 数据"
                description={lastError}
                action={
                  <a onClick={retryLast} role="button">
                    重试
                  </a>
                }
              />
            )}

            <Bubble.List items={bubbleItems} autoScroll className="bubble-list" />

            <div className="composer">
              <Attachments
                customRequest={customRequest}
                items={fileList}
                onChange={onAttachmentChange}
                maxCount={5}
                accept="image/*,.pdf,.txt,.doc,.ppt,.xlsx"
                placeholder={{
                  icon: '📎',
                  title: '上传或拖拽文件',
                  description: '支持多文件、即时预览',
                }}
              />
              <div className="composer-actions">
                <Actions items={actionItems} />
              </div>
              <Sender
                value={inputValue}
                onChange={(val) => setInputValue(val ?? '')}
                onSubmit={(val) => handleSubmit(val ?? '')}
                loading={isStreaming}
                disabled={isStreaming}
                submitType="enter"
                allowSpeech
                placeholder="输入消息，Enter 发送（可语音输入）"
              />
            </div>
          </Space>
        </Card>
      </div>
    </XProvider>
  )
}

export default App
