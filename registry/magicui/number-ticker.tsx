"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

export interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  locale?: string
  loop?: boolean
  peakHoldDuration?: number
  bottomHoldDuration?: number
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  locale = "id-ID",
  loop = false,
  peakHoldDuration = 2000,
  bottomHoldDuration = 800,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: !loop, margin: "0px" })

  useEffect(() => {
    if (!isInView) return

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (prefersReducedMotion) {
      motionValue.set(direction === "down" ? startValue : value)
      return
    }

    let isMounted = true
    let timer: ReturnType<typeof setTimeout> | null = null

    if (!loop) {
      timer = setTimeout(() => {
        if (isMounted) {
          motionValue.set(direction === "down" ? startValue : value)
        }
      }, delay * 1000)

      return () => {
        isMounted = false
        if (timer !== null) clearTimeout(timer)
      }
    }

    // Ping-pong loop: smoothly spring to target, hold, spring back, hold, repeat
    let movingToTarget = direction !== "down"
    const upInterval = 1500 + peakHoldDuration
    const downInterval = 1400 + bottomHoldDuration

    const scheduleNext = () => {
      if (!isMounted) return
      movingToTarget = !movingToTarget
      motionValue.set(movingToTarget ? value : startValue)
      const nextDelay = movingToTarget ? upInterval : downInterval
      timer = setTimeout(scheduleNext, nextDelay)
    }

    // Initial trigger
    timer = setTimeout(() => {
      if (!isMounted) return
      motionValue.set(movingToTarget ? value : startValue)
      const nextDelay = movingToTarget ? upInterval : downInterval
      timer = setTimeout(scheduleNext, nextDelay)
    }, delay * 1000)

    return () => {
      isMounted = false
      if (timer !== null) clearTimeout(timer)
    }
  }, [
    motionValue,
    isInView,
    delay,
    value,
    direction,
    startValue,
    loop,
    peakHoldDuration,
    bottomHoldDuration,
  ])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = Intl.NumberFormat(locale, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(Number(latest.toFixed(decimalPlaces)))
        }
      }),
    [springValue, decimalPlaces, locale]
  )

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className
      )}
      {...props}
    >
      {Intl.NumberFormat(locale, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      }).format(startValue)}
    </span>
  )
}
