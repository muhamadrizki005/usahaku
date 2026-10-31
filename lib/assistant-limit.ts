export class AssistantLimit {
  private entries = new Map<string, { times: number[]; busy: boolean }>()
  acquire(business: string, user: string, now = Date.now()) {
    for (const [key, value] of this.entries) {
      value.times = value.times.filter(t => now - t < 3600000)
      if (!value.busy && !value.times.length) this.entries.delete(key)
    }
    const userKey = `${business}:${user}`, businessKey = business
    const u = this.entries.get(userKey) || { times: [], busy: false }, b = this.entries.get(businessKey) || { times: [], busy: false }
    if (u.busy || u.times.filter(t => now - t < 60000).length >= 6 || b.times.length >= 60 || this.entries.size >= 10000) return null
    u.busy = true; u.times.push(now); b.times.push(now)
    this.entries.set(userKey, u); this.entries.set(businessKey, b)
    return () => { u.busy = false }
  }
}
