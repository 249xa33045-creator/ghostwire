/**
 * Simple in-memory debug log for on-screen display
 * Lets us see console.log output directly on the phone without adb
 */

type LogListener = (logs: string[]) => void

class DebugLogService {
  private logs: string[] = []
  private listeners: LogListener[] = []
  private maxLogs = 50

  log(message: string) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const entry = `${timestamp}  ${message}`
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
    this.listeners.forEach(l => l([...this.logs]))
    console.log(message) // also keep normal console logging
  }

  subscribe(listener: LogListener) {
    this.listeners.push(listener)
    listener([...this.logs])
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  clear() {
    this.logs = []
    this.listeners.forEach(l => l([]))
  }

  getLogs() {
    return [...this.logs]
  }
}

export const debugLog = new DebugLogService()
