export type FloatingPoint = { x: number; y: number }
export type FloatingViewport = { x: number; y: number; width: number; height: number }
export const launcherSize = 56
const margin = 16, gap = 16
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value))

export function clampAssistantLauncher(point: FloatingPoint, viewport: FloatingViewport): FloatingPoint {
  return { x: clamp(point.x, viewport.x + margin, viewport.x + viewport.width - margin - launcherSize), y: clamp(point.y, viewport.y + margin, viewport.y + viewport.height - margin - launcherSize) }
}

export function assistantFloatingLayout(viewport: FloatingViewport, position: FloatingPoint | null) {
  const launcher = clampAssistantLauncher(position || { x: viewport.x + viewport.width - margin - launcherSize, y: viewport.y + viewport.height - margin - launcherSize }, viewport)
  const width = Math.max(1, Math.min(440, viewport.width - margin * 2))
  const desiredHeight = Math.max(1, Math.min(680, viewport.height - margin * 2))
  const left = viewport.x + margin, top = viewport.y + margin, right = viewport.x + viewport.width - margin, bottom = viewport.y + viewport.height - margin
  const above = Math.max(0, launcher.y - gap - top), below = Math.max(0, bottom - launcher.y - launcherSize - gap)
  let height = desiredHeight, x = launcher.x + launcherSize - width, y = launcher.y - gap - height
  if (Math.max(above, below) >= Math.min(280, desiredHeight)) {
    const useAbove = above >= below
    height = Math.min(desiredHeight, useAbove ? above : below)
    y = useAbove ? launcher.y - gap - height : launcher.y + launcherSize + gap
  } else if (launcher.x - gap - width >= left || launcher.x + launcherSize + gap + width <= right) {
    x = launcher.x - gap - width >= left ? launcher.x - gap - width : launcher.x + launcherSize + gap
    y = launcher.y + launcherSize / 2 - height / 2
  } else {
    height = Math.min(desiredHeight, Math.max(180, above, below))
    y = above >= below ? launcher.y - gap - height : launcher.y + launcherSize + gap
  }
  return { launcher, panel: { x: clamp(x, left, right - width), y: clamp(y, top, bottom - height), width, height } }
}
