'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'
import type { TrendBucket } from '@/lib/dashboard-trends'

const ReactApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-60 w-full items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-[#24cbc5] border-t-transparent" />
    </div>
  ),
})

export function formatRupiahCompact(value: number): string {
  if (!value || value <= 0) return 'Rp0'
  if (value >= 1_000_000_000) {
    const v = value / 1_000_000_000
    return `Rp${v % 1 === 0 ? v : v.toFixed(1).replace('.', ',')}M`
  }
  if (value >= 1_000_000) {
    const v = value / 1_000_000
    return `Rp${v % 1 === 0 ? v : v.toFixed(1).replace('.', ',')}jt`
  }
  if (value >= 1_000) {
    const v = value / 1_000
    return `Rp${v % 1 === 0 ? v : v.toFixed(1).replace('.', ',')}rb`
  }
  return `Rp${value.toLocaleString('id-ID')}`
}

export interface RevenueApexChartProps {
  buckets: TrendBucket[]
  height?: number
  animate?: boolean
}

export default function RevenueApexChart({ buckets, height = 240, animate = true }: RevenueApexChartProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const series = useMemo(
    () => [
      {
        name: 'Omzet',
        data: buckets.map(b => b.amount),
      },
    ],
    [buckets]
  )

  const columnWidth = useMemo(() => {
    const len = buckets.length
    if (len <= 7) return '36%'
    if (len <= 14) return '48%'
    if (len <= 24) return '58%'
    return '68%'
  }, [buckets.length])

  const chartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: 'bar',
        height,
        toolbar: { show: false },
        background: 'transparent',
        parentHeightOffset: 0,
        animations: {
          enabled: animate,
          easing: 'easeinout',
          speed: 800,
          animateGradually: {
            enabled: animate,
            delay: 70,
          },
          dynamicAnimation: {
            enabled: animate,
            speed: 500,
          },
        },
      },
      colors: ['#24CBC5'], // Turquoise/Cyan at top
      fill: {
        type: 'gradient',
        gradient: {
          type: 'vertical',
          shade: 'dark',
          shadeIntensity: 0.4,
          gradientToColors: ['#1835D9'], // Royal Blue at bottom
          inverseColors: false,
          opacityFrom: 1,
          opacityTo: 0.95,
          stops: [0, 100],
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          borderRadiusApplication: 'end',
          columnWidth,
          dataLabels: {
            position: 'top',
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        show: false,
      },
      grid: {
        borderColor: '#454D5B40',
        strokeDashArray: 4,
        yaxis: {
          lines: { show: true },
        },
        xaxis: {
          lines: { show: false },
        },
        padding: {
          top: 0,
          right: 12,
          bottom: 0,
          left: 10,
        },
      },
      xaxis: {
        categories: buckets.map(b => b.shortLabel || b.label),
        labels: {
          style: {
            colors: '#C5CBD5',
            fontSize: '11px',
            fontFamily: 'inherit',
          },
          rotate: buckets.length > 15 ? -45 : 0,
          rotateAlways: false,
          hideOverlappingLabels: true,
        },
        axisBorder: {
          show: true,
          color: '#454D5B80',
        },
        axisTicks: {
          show: false,
        },
        tooltip: {
          enabled: false,
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: '#A4A7AC',
            fontSize: '11px',
            fontFamily: 'inherit',
          },
          formatter: (val: number) => formatRupiahCompact(val),
        },
        min: 0,
      },
      states: {
        normal: {
          filter: { type: 'none' },
        },
        hover: {
          filter: {
            type: 'lighten',
            value: 0.15,
          },
        },
        active: {
          allowMultipleDataPointsSelection: false,
          filter: {
            type: 'darken',
            value: 0.1,
          },
        },
      },
      tooltip: {
        theme: 'dark',
        custom: function ({ dataPointIndex }) {
          const b = buckets[dataPointIndex]
          if (!b) return ''
          const formattedAmount = 'Rp' + Number(b.amount).toLocaleString('id-ID')
          return `
            <div style="background: #1C222E; border: 1px solid #454D5B; border-radius: 10px; padding: 10px 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-family: inherit;">
              <div style="font-size: 11px; font-weight: 500; color: #C5CBD5; margin-bottom: 4px;">${b.fullLabel}</div>
              <div style="font-size: 14px; font-weight: 700; color: #24CBC5; letter-spacing: -0.01em;">${formattedAmount}</div>
              <div style="font-size: 10px; color: #A4A7AC; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #24CBC5;"></span>
                <span>${b.count} transaksi selesai</span>
              </div>
            </div>
          `
        },
      },
    }),
    [buckets, columnWidth, height, animate]
  )

  if (!mounted) {
    return (
      <div className="flex h-60 w-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-[#24cbc5] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden">
      <ReactApexChart options={chartOptions} series={series} type="bar" height={height} />
    </div>
  )
}

