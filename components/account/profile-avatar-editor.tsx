'use client'

import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
import {
  Camera,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Check,
  Loader2,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { updateAccountAvatar } from '@/app/actions'

interface ProfileAvatarEditorProps {
  currentAvatarUrl?: string | null
  userName: string
  onAvatarChange?: (url: string | null) => void
  size?: 'md' | 'lg' | 'hero'
  editable?: boolean
}

const CROP_SIZE = 240 // Visual crop diameter in pixels
const OUTPUT_SIZE = 256 // Exported image size (256x256)
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ProfileAvatarEditor({
  currentAvatarUrl = null,
  userName,
  onAvatarChange,
  size = 'hero',
  editable = true,
}: ProfileAvatarEditorProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAvatarUrl(currentAvatarUrl)
  }, [currentAvatarUrl])

  // Get user initials for fallback
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase() || 'U'

  // Dimensions based on prop size
  const avatarSizeClass =
    size === 'hero'
      ? 'size-28 sm:size-32 text-2xl sm:text-3xl'
      : size === 'lg'
      ? 'size-20 text-xl'
      : 'size-12 text-sm'

  // Reset crop states
  const resetCrop = useCallback(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Validate and handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMsg(null)
    setSuccessMsg(null)

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Format file tidak didukung. Harap gunakan format JPG, PNG, atau WebP.')
      e.target.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg('Ukuran file terlalu besar. Maksimal 5MB.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageSrc(reader.result)
        resetCrop()
        setIsModalOpen(true)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Handle image load inside the crop modal to get dimensions
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    resetCrop()
  }

  // Compute scale and bounds
  const getRenderMetrics = useCallback(() => {
    if (!naturalSize.width || !naturalSize.height) {
      return { baseScale: 1, displayWidth: CROP_SIZE, displayHeight: CROP_SIZE, maxOffsetX: 0, maxOffsetY: 0 }
    }
    const baseScale = Math.max(CROP_SIZE / naturalSize.width, CROP_SIZE / naturalSize.height)
    const displayWidth = naturalSize.width * baseScale * zoom
    const displayHeight = naturalSize.height * baseScale * zoom
    const maxOffsetX = Math.max(0, (displayWidth - CROP_SIZE) / 2)
    const maxOffsetY = Math.max(0, (displayHeight - CROP_SIZE) / 2)
    return { baseScale, displayWidth, displayHeight, maxOffsetX, maxOffsetY }
  }, [naturalSize, zoom])

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const { maxOffsetX, maxOffsetY } = getRenderMetrics()
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    const clampedX = Math.min(Math.max(newX, -maxOffsetX), maxOffsetX)
    const clampedY = Math.min(Math.max(newY, -maxOffsetY), maxOffsetY)
    setPosition({ x: clampedX, y: clampedY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    setIsDragging(true)
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return
    const touch = e.touches[0]
    const { maxOffsetX, maxOffsetY } = getRenderMetrics()
    const newX = touch.clientX - dragStart.x
    const newY = touch.clientY - dragStart.y
    const clampedX = Math.min(Math.max(newX, -maxOffsetX), maxOffsetX)
    const clampedY = Math.min(Math.max(newY, -maxOffsetY), maxOffsetY)
    setPosition({ x: clampedX, y: clampedY })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Handle zoom slider change
  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.min(Math.max(newZoom, 1), 3)
    setZoom(clampedZoom)

    // Re-clamp position at new zoom
    if (naturalSize.width && naturalSize.height) {
      const baseScale = Math.max(CROP_SIZE / naturalSize.width, CROP_SIZE / naturalSize.height)
      const displayWidth = naturalSize.width * baseScale * clampedZoom
      const displayHeight = naturalSize.height * baseScale * clampedZoom
      const maxOffsetX = Math.max(0, (displayWidth - CROP_SIZE) / 2)
      const maxOffsetY = Math.max(0, (displayHeight - CROP_SIZE) / 2)

      setPosition((prev) => ({
        x: Math.min(Math.max(prev.x, -maxOffsetX), maxOffsetX),
        y: Math.min(Math.max(prev.y, -maxOffsetY), maxOffsetY),
      }))
    }
  }

  // Crop and save image via canvas
  const handleSaveCrop = () => {
    if (!imageRef.current || !naturalSize.width || !naturalSize.height) return

    const { displayWidth, displayHeight } = getRenderMetrics()
    const imgLeft = (CROP_SIZE - displayWidth) / 2 + position.x
    const imgTop = (CROP_SIZE - displayHeight) / 2 + position.y
    const ratio = OUTPUT_SIZE / CROP_SIZE

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      setErrorMsg('Gagal memproses gambar pada peramban.')
      return
    }

    // Circular clip
    ctx.save()
    ctx.beginPath()
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()

    // Draw scaled and translated image
    ctx.drawImage(
      imageRef.current,
      imgLeft * ratio,
      imgTop * ratio,
      displayWidth * ratio,
      displayHeight * ratio
    )
    ctx.restore()

    // Export as WebP / JPEG data URL
    let dataUrl = ''
    try {
      dataUrl = canvas.toDataURL('image/webp', 0.88)
    } catch {
      dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    }

    startTransition(async () => {
      const result = await updateAccountAvatar(dataUrl)
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        setAvatarUrl(dataUrl)
        onAvatarChange?.(dataUrl)
        setSuccessMsg('Foto profil berhasil diperbarui!')
        setIsModalOpen(false)
        setImageSrc(null)
      }
    })
  }

  // Delete current avatar
  const handleDeleteAvatar = () => {
    startTransition(async () => {
      const result = await updateAccountAvatar(null)
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        setAvatarUrl(null)
        onAvatarChange?.(null)
        setSuccessMsg('Foto profil berhasil dihapus.')
        setShowDeleteConfirm(false)
      }
    })
  }

  return (
    <div className="flex flex-col items-center sm:items-start gap-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Unggah foto profil"
      />

      {/* Profile Avatar Container */}
      <div className="relative group">
        <div
          className={`relative ${avatarSizeClass} rounded-full overflow-hidden border-2 border-white/20 bg-[#1835d9] shadow-xl flex items-center justify-center transition-transform`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="size-full object-cover"
            />
          ) : (
            <span className="font-semibold text-white tracking-wider select-none">
              {initials}
            </span>
          )}
        </div>

        {/* Camera trigger badge */}
        {editable && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 p-2 sm:p-2.5 rounded-full bg-[#24cbc5] text-[#1c222e] hover:bg-[#1bb8b2] transition-colors shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#24cbc5] focus:ring-offset-2 focus:ring-offset-[#1c222e]"
            aria-label="Ganti foto profil"
            title="Ganti foto profil"
          >
            <Camera className="size-4 sm:size-5 stroke-[2.2]" />
          </button>
        )}
      </div>

      {/* Action buttons below avatar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#303640] hover:bg-[#3a424e] text-white transition border border-white/10 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#24cbc5]"
          >
            <Camera className="size-3.5 text-[#24cbc5]" />
            Ganti Foto
          </button>

          {avatarUrl && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent hover:bg-red-500/15 text-red-300 hover:text-red-200 transition border border-red-500/20 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400"
            >
              <Trash2 className="size-3.5" />
              Hapus Foto
            </button>
          )}
        </div>
      )}

      {/* Feedback alerts */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 max-w-md w-full animate-in fade-in"
        >
          <AlertCircle className="size-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-red-400 hover:text-red-200"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="flex items-center gap-2 p-3 text-xs rounded-xl bg-[#173d3c] border border-[#24cbc5]/30 text-[#7de3dc] max-w-md w-full animate-in fade-in"
        >
          <Check className="size-4 shrink-0 text-[#24cbc5]" />
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="ml-auto text-[#7de3dc] hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#273242] p-6 shadow-2xl text-white">
            <h3 className="text-base font-semibold mb-2">Hapus Foto Profil?</h3>
            <p className="text-xs text-[#c5cbd5] mb-5 leading-relaxed">
              Foto profil Anda akan dihapus dan digantikan dengan inisial nama Anda. Tindakan ini dapat dibatalkan dengan mengunggah foto baru kapan saja.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#c5cbd5] hover:bg-white/10 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteAvatar}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition flex items-center gap-2 cursor-pointer"
              >
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Crop Modal */}
      {isModalOpen && imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-[#454d5b] bg-[#273242] p-6 shadow-2xl text-white my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Sesuaikan Foto Profil
                </h3>
                <p className="text-xs text-[#c5cbd5] mt-0.5">
                  Geser posisi foto dan gunakan zoom untuk crop lingkaran.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false)
                  setImageSrc(null)
                }}
                className="p-1 rounded-lg text-[#c5cbd5] hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Circular Crop Mask Viewport */}
            <div className="flex flex-col items-center">
              <div
                ref={containerRef}
                className="relative size-[240px] rounded-full overflow-hidden border-2 border-[#24cbc5] bg-black/60 shadow-inner select-none cursor-grab active:cursor-grabbing touch-none ring-8 ring-black/30"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Rendered Image with transformation */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none transition-transform"
                  style={{
                    width: `${getRenderMetrics().displayWidth}px`,
                    height: `${getRenderMetrics().displayHeight}px`,
                    left: `${(CROP_SIZE - getRenderMetrics().displayWidth) / 2 + position.x}px`,
                    top: `${(CROP_SIZE - getRenderMetrics().displayHeight) / 2 + position.y}px`,
                  }}
                />

                {/* Subtle circular grid guides */}
                <div className="absolute inset-0 pointer-events-none rounded-full border border-white/20">
                  <div className="absolute inset-x-0 top-1/3 border-b border-white/10" />
                  <div className="absolute inset-x-0 top-2/3 border-b border-white/10" />
                  <div className="absolute inset-y-0 left-1/3 border-r border-white/10" />
                  <div className="absolute inset-y-0 left-2/3 border-r border-white/10" />
                </div>
              </div>

              <p className="text-[11px] text-[#a4a7ac] mt-3 flex items-center gap-1.5">
                <span>Klik & geser gambar untuk mengatur posisi crop.</span>
              </p>
            </div>

            {/* Zoom Slider and Controls */}
            <div className="mt-5 space-y-2 bg-[#1c222e]/60 rounded-xl p-3 border border-white/5">
              <div className="flex items-center justify-between text-xs text-[#c5cbd5]">
                <span className="flex items-center gap-1.5">
                  <ZoomIn className="size-3.5 text-[#24cbc5]" />
                  Perbesar / Perkecil
                </span>
                <span className="text-[11px] font-mono text-[#a4a7ac]">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom - 0.15)}
                  disabled={zoom <= 1}
                  className="p-1 rounded text-[#c5cbd5] hover:text-white disabled:opacity-40 disabled:hover:text-[#c5cbd5] cursor-pointer"
                  title="Perkecil"
                >
                  <ZoomOut className="size-4" />
                </button>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  className="w-full accent-[#24cbc5] cursor-pointer h-1.5 bg-[#454d5b] rounded-lg"
                  aria-label="Zoom foto"
                />

                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom + 0.15)}
                  disabled={zoom >= 3}
                  className="p-1 rounded text-[#c5cbd5] hover:text-white disabled:opacity-40 disabled:hover:text-[#c5cbd5] cursor-pointer"
                  title="Perbesar"
                >
                  <ZoomIn className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={resetCrop}
                  className="p-1 rounded text-[#c5cbd5] hover:text-[#24cbc5] cursor-pointer"
                  title="Reset posisi & zoom"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false)
                  setImageSrc(null)
                }}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#c5cbd5] hover:bg-white/10 transition cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSaveCrop}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#1835d9] hover:bg-[#132c9e] text-white transition flex items-center gap-2 shadow-lg shadow-[#1835d9]/30 cursor-pointer disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    Simpan Perubahan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
