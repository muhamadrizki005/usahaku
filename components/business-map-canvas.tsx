'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import type { MapPoint } from '@/lib/business-map'

export default function BusinessMapCanvas({ point, onPick, focusVersion = 0 }: { point: MapPoint | null; onPick: (point: MapPoint) => void; focusVersion?: number }) {
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null), callback = useRef(onPick)
  const [tileError, setTileError] = useState(false), [loading, setLoading] = useState(true), [ready, setReady] = useState(false), tiles = useRef<L.TileLayer | null>(null)
  callback.current = onPick
  const focused = useRef(focusVersion)
  useEffect(() => {
    if (!element.current) return
    const instance = L.map(element.current, { center: point ? [point.latitude, point.longitude] : [-2.5, 118], zoom: point ? 16 : 4, minZoom: 4, maxZoom: 20, scrollWheelZoom: false })
    map.current = instance
    const layer = L.tileLayer('/api/map-tiles/{z}/{x}/{y}', { maxZoom: 20, noWrap: true, attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> contributors' }).addTo(instance)
    tiles.current = layer
    layer.on('loading', () => setLoading(true))
    layer.on('load', () => setLoading(false))
    layer.on('tileerror', () => setTileError(true))
    instance.on('click', (event: L.LeafletMouseEvent) => callback.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false })); resize.observe(element.current)
    setReady(true)
    return () => { resize.disconnect(); instance.remove(); map.current = null; marker.current = null; tiles.current = null }
  }, [])
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (!point) { marker.current?.remove(); marker.current = null; return }
    const latlng: L.LatLngExpression = [point.latitude, point.longitude]
    if (!marker.current) {
      marker.current = L.marker(latlng, { draggable: true, autoPan: true, alt: 'Titik lokasi usaha', title: 'Titik lokasi usaha; geser untuk memindahkan', icon: L.icon({ iconUrl: typeof markerIcon === 'string' ? markerIcon : markerIcon.src, shadowUrl: typeof markerShadow === 'string' ? markerShadow : markerShadow.src, iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] }) }).addTo(instance)
      marker.current.on('dragend', () => { const selected = marker.current!.getLatLng(); callback.current({ latitude: selected.lat, longitude: selected.lng }) })
    } else marker.current.setLatLng(latlng)
    if (focusVersion !== focused.current) { instance.setView(latlng, Math.max(instance.getZoom(), 16), { animate: false }); focused.current = focusVersion }
  }, [point, ready, focusVersion])
  return <div className="space-y-2">
    <div ref={element} aria-label="Peta lokasi usaha" className="relative z-0 h-[min(42dvh,340px)] min-h-48 w-full rounded-lg" />
    {loading && <p role="status" className="text-xs text-[#c5cbd5]">Memuat gambar peta…</p>}
    {tileError && <p role="alert" className="text-xs text-[#ffb4ae]">Sebagian peta belum termuat. <button type="button" className="underline" onClick={() => { setTileError(false); tiles.current?.redraw() }}>Muat ulang peta</button></p>}
  </div>
}
