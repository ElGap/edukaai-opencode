import type { Plugin } from "./types"
import { appendFile, readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { join, basename } from "path"

interface EdukaAIConfig {
  serverUrl: string
  datasetId?: number
  datasetName?: string
}

interface EdukaAICaptureState {
  enabled: boolean
  datasetId?: number
  datasetName?: string
  lastVerified?: string
}

const DEFAULT_SERVER_URL = "http://localhost:3030"
const CONFIG_FILE = "edukaai-capture-config.json"

let logFile: string

function log(level: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString()
  let entry = `[${timestamp}] [${level}] ${message}`
  if (data !== undefined) {
    entry += `\n${JSON.stringify(data, null, 2)}`
  }
  entry += "\n"
  appendFile(logFile, entry).catch(() => {})
}

function loadEnvConfig(directory: string): { serverUrl: string } {
  try {
    const envPath = join(directory, ".env")
    if (existsSync(envPath)) {
      const content = require("fs").readFileSync(envPath, "utf-8")
      const urlMatch = content.match(/EDUKAAI_URL\s*=\s*(.+)/)
      if (urlMatch) {
        return { serverUrl: urlMatch[1].trim() }
      }
    }
  } catch (error) {
    // Ignore
  }
  return { serverUrl: DEFAULT_SERVER_URL }
}

function getConfig(directory: string): EdukaAIConfig {
  const envConfig = loadEnvConfig(directory)
  return {
    serverUrl: envConfig.serverUrl,
  }
}

async function loadState(directory: string): Promise<EdukaAICaptureState> {
  try {
    const configPath = join(directory, ".opencode", CONFIG_FILE)
    if (existsSync(configPath)) {
      const content = await readFile(configPath, "utf-8")
      return JSON.parse(content)
    }
  } catch (error) {
    log("ERROR", "Failed to load state", { error: String(error) })
  }
  return { enabled: false }
}

async function saveState(directory: string, state: EdukaAICaptureState): Promise<void> {
  try {
    const configPath = join(directory, ".opencode", CONFIG_FILE)
    await writeFile(configPath, JSON.stringify(state, null, 2), "utf-8")
  } catch (error) {
    log("ERROR", "Failed to save state", { error: String(error) })
  }
}

async function verifyEndpoint(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true })
    })
    
    if (response.ok || response.status === 400) {
      return { ok: true }
    }
    
    return { ok: false, error: `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

interface MessageData {
  role: "user" | "assistant"
  parts: Map<number, string>
  content: string
}

export const EdukaAICapture: Plugin = async ({ directory, client }) => {
  logFile = join(directory, ".opencode", "edukaai-capture.log")
  
  log("INFO", "Plugin initialized", { directory, serverUrl: getConfig(directory).serverUrl })
  
  const config = getConfig(directory)
  const messageData = new Map<string, MessageData>()
  const loggedMessages = new Set<string>()
  let sessionId = `opencode_${Date.now()}`
  let sessionStartTime = new Date().toISOString()
  let captureState = await loadState(directory)

  const updateMessageContent = (msgId: string) => {
    const data = messageData.get(msgId)
    if (!data) return
    
    const sortedParts = Array.from(data.parts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, content]) => content)
    
    data.content = sortedParts.join("\n").trim()
  }

  const capturePair = async (userId: string, assistantId: string): Promise<boolean> => {
    try {
      const userData = messageData.get(userId)
      const assistantData = messageData.get(assistantId)

      if (!userData?.content || !assistantData?.content) {
        log("WARN", "Missing content", { 
          userId, 
          assistantId,
          hasUser: !!userData?.content,
          hasAssistant: !!assistantData?.content
        })
        return false
      }

      if (!captureState.enabled) {
        log("DEBUG", "Capture disabled, skipping")
        return false
      }

      const now = new Date()

      const payload: any = {
        source: "opencode",
        apiVersion: "1.0",
        session: {
          id: sessionId,
          name: `Session ${sessionId.slice(0, 8)}`,
          startedAt: sessionStartTime
        },
        records: [
          {
            instruction: userData.content,
            output: assistantData.content,
            messageId: assistantId,
            timestamp: now.toISOString(),
            context: {
              environment: {
                os: process.platform,
                workingDirectory: directory,
                projectName: basename(directory)
              }
            }
          }
        ],
        options: {
          autoApprove: false,
          skipDuplicates: true,
          enrichMetadata: true
        }
      }

      if (captureState.datasetId) {
        payload.options.datasetId = captureState.datasetId
      }

      log("INFO", "Sending capture", { 
        url: `${config.serverUrl}/api/capture`,
        datasetId: captureState.datasetId,
        instructionLength: userData.content.length,
        outputLength: assistantData.content.length
      })

      const response = await fetch(`${config.serverUrl}/api/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        log("ERROR", "Capture failed", { status: response.status, error: errorText })
        return false
      }

      log("INFO", "Captured successfully", { userId, assistantId })
      return true
    } catch (error) {
      log("ERROR", "Capture error", { error: String(error) })
      return false
    }
  }

  const processSessionEnd = async () => {
    if (!captureState.enabled) return

    for (const msgId of messageData.keys()) {
      updateMessageContent(msgId)
    }
    
    const sortedMessages = Array.from(messageData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
    
    const userIds = sortedMessages
      .filter(([_, data]) => data.role === "user")
      .map(([id]) => id)
    
    const assistantIds = sortedMessages
      .filter(([_, data]) => data.role === "assistant")
      .map(([id]) => id)

    log("INFO", "Processing session end", { 
      userCount: userIds.length, 
      assistantCount: assistantIds.length,
      allMessages: sortedMessages.map(([id, data]) => ({ id: id.slice(0, 8), role: data.role, hasContent: !!data.content, contentLength: data.content.length }))
    })

    for (const userId of userIds) {
      if (loggedMessages.has(userId)) continue
      
      const userData = messageData.get(userId)
      if (!userData?.content) continue

      for (const assistantId of assistantIds) {
        if (loggedMessages.has(assistantId)) continue
        
        const assistantData = messageData.get(assistantId)
        if (!assistantData?.content) continue

        loggedMessages.add(userId)
        loggedMessages.add(assistantId)
        await capturePair(userId, assistantId)
        break
      }
    }
  }

  // Check for command files to activate/deactivate
  let processingCommandFiles = false
  let lastCommandCheck = 0
  
  const checkCommandFiles = async () => {
    // Prevent checking too frequently (max once per second)
    const now = Date.now()
    if (now - lastCommandCheck < 1000) return
    lastCommandCheck = now
    
    if (processingCommandFiles) return
    processingCommandFiles = true
    
    try {
      const activateFile = join(directory, ".opencode", "edukaai-activate")
      const deactivateFile = join(directory, ".opencode", "edukaai-deactivate")
      
      // Check if both exist - prioritize activate
      const hasActivate = existsSync(activateFile)
      const hasDeactivate = existsSync(deactivateFile)
      
      if (hasActivate && hasDeactivate) {
        log("WARN", "Both activate and deactivate files exist, processing activate first")
      }
      
      if (hasActivate) {
        try {
          const content = await readFile(activateFile, "utf-8")
          const dataset = content.trim()
          
          log("INFO", "Processing activate command", { dataset: dataset || "default" })
          
          let datasetId: number | undefined
          let datasetName: string | undefined
          
          // Only parse if dataset is provided, otherwise leave both undefined
          if (dataset) {
            if (/^\d+$/.test(dataset)) {
              datasetId = parseInt(dataset, 10)
            } else {
              datasetName = dataset
            }
          }
          
          captureState = {
            enabled: true,
            datasetId,
            datasetName,
            lastVerified: new Date().toISOString()
          }
          
          await saveState(directory, captureState)
          log("INFO", "Activated via file", { dataset: dataset || "default", enabled: true })
          
          // Delete the command file safely
          if (existsSync(activateFile)) {
            const fs = require("fs")
            fs.unlinkSync(activateFile)
            log("DEBUG", "Deleted activate file")
          }
          
          // If deactivate also exists, delete it to prevent immediate deactivation
          if (existsSync(deactivateFile)) {
            const fs = require("fs")
            fs.unlinkSync(deactivateFile)
            log("DEBUG", "Deleted deactivate file (was also present)")
          }
          
          return // Exit after processing activate
        } catch (error) {
          log("ERROR", "Failed to process activate file", { error: String(error) })
        }
      }
      
      // Only process deactivate if activate wasn't processed
      if (hasDeactivate && !hasActivate) {
        try {
          captureState = { enabled: false }
          await saveState(directory, captureState)
          log("INFO", "Deactivated via file")
          
          // Delete safely
          if (existsSync(deactivateFile)) {
            const fs = require("fs")
            fs.unlinkSync(deactivateFile)
            log("DEBUG", "Deleted deactivate file")
          }
        } catch (error) {
          log("ERROR", "Failed to process deactivate file", { error: String(error) })
        }
      }
    } finally {
      processingCommandFiles = false
    }
  }

  return {
    event: async ({ event }) => {
      try {
        // Log ALL events for investigation
        log("DEBUG", "Event received", { 
          type: event.type,
          hasProperties: !!event.properties,
          propertyKeys: event.properties ? Object.keys(event.properties) : []
        })

        // Check for command files on each event
        await checkCommandFiles()

        if (!captureState.enabled) return

        if (event.type === "message.updated") {
          const message = event.properties.info
          log("DEBUG", "Message updated", { messageId: message.id, role: message.role })
          
          if (!messageData.has(message.id)) {
            messageData.set(message.id, {
              role: message.role,
              parts: new Map(),
              content: ""
            })
          }
        }

        if (event.type === "message.part.updated") {
          const part = event.properties.part as any
          
          // Log ALL part properties for investigation
          log("DEBUG", "Part details", { 
            messageId: part.messageID, 
            type: part.type,
            role: part.role,
            index: part.index,
            textLength: part.text?.length || 0,
            textPreview: part.text?.substring(0, 100),
            isSynthetic: part.synthetic,
            isIgnored: part.ignored,
            allKeys: Object.keys(part)
          })
          
          // Capture ALL text content regardless of synthetic/ignored flags
          // The assistant's formatted response after tool use might be marked synthetic
          if (part.type === "text" && part.text) {
            const content = part.text.trim()
            if (content) {
              if (!messageData.has(part.messageID)) {
                const role = part.role || "assistant"
                messageData.set(part.messageID, {
                  role: role,
                  parts: new Map(),
                  content: ""
                })
              }
              
              const data = messageData.get(part.messageID)!
              data.parts.set(part.index || 0, content)
              updateMessageContent(part.messageID)
              
              log("DEBUG", "Content captured", { 
                messageId: part.messageID, 
                role: data.role,
                contentLength: data.content.length 
              })
            }
          }
        }

        // Also log other message-related events
        if (event.type === "message.completed" || event.type === "message.created") {
          log("DEBUG", "Message lifecycle event", { 
            type: event.type,
            properties: Object.keys(event.properties || {})
          })
        }

        if (event.type === "session.created") {
          sessionId = `opencode_${Date.now()}`
          sessionStartTime = new Date().toISOString()
        }

        if (event.type === "session.idle") {
          // Log detailed message data before processing
          const allMessages = Array.from(messageData.entries()).map(([id, data]) => ({
            id: id.slice(0, 15),
            role: data.role,
            contentLength: data.content.length,
            hasContent: data.content.length > 0
          }))
          
          log("INFO", "Session idle - message summary", { 
            enabled: captureState.enabled, 
            totalMessages: messageData.size,
            allMessages
          })
          
          if (captureState.enabled) {
            await processSessionEnd()
          }
          
          messageData.clear()
          loggedMessages.clear()
        }
      } catch (error) {
        log("ERROR", "Event handler error", { event: event.type, error: String(error) })
      }
    },
  }
}
