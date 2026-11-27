/**
 * Browser polyfill for Node-style `ws` (EventEmitter API: on/off/emit).
 * Wired in vite.config.ts: resolve.alias.ws → this file.
 * Нужен, чтобы alor-api subscriptions работали в браузере.
 */
class UpWS extends WebSocket {
  ws

  constructor(...args) {
    super(...args)

    this.ws = this
  }
  setMaxListeners = (_val) => {}
  on = (type, handler) => {
    switch (type) {
      case 'error':
        return this.addEventListener('error', handler)
      case 'open':
        return this.addEventListener('open', handler)
      case 'message':
        return this.addEventListener('message', (event) => {
          handler(event.data)
        })
      case 'close':
        return this.addEventListener('close', handler)
    }
  }
  off = (type, handler) => {
    switch (type) {
      case 'error':
        return this.removeEventListener('error', handler)
      case 'open':
        return this.removeEventListener('open', handler)
      case 'message':
        return this.removeEventListener('message', handler)
      case 'close':
        return this.removeEventListener('close', handler)
    }
  }

  emit = (type, _handler) => {
    switch (type) {
      case 'open':
        this.ws = new UpWS(this.url)
    }
  }

  listeners = (_val) => []
}

export { UpWS as WebSocket }
