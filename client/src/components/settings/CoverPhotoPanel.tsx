/**
 * CoverPhotoPanel
 *
 * Owner-facing upload control for the public booking page cover photo.
 * Lives in Restaurant Settings (info section). The photo renders as the
 * full-bleed background of the booking page's left card — the audit's
 * "biggest emotional-connection miss" fix.
 *
 * Upload path: file input → client-side canvas downscale (max 1600 px wide,
 * JPEG q0.82) → base64 → POST /api/restaurant-photo. Downscaling client-side
 * keeps the payload ~200-600 KB — well under Vercel's 4.5 MB body limit even
 * for a 12 MP phone photo, and the booking page never needs more than ~700 px.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import type { RestaurantSettings } from '../../hooks/useRestaurantSettings';

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

/** Downscale an image File to a JPEG data-URL capped at MAX_EDGE_PX wide. */
async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

interface Props {
  coverImageUrl: string | null | undefined;
}

export default function CoverPhotoPanel({ coverImageUrl }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  const patchCache = (url: string | null) => {
    qc.setQueryData<RestaurantSettings>(['restaurant-settings'], (old) =>
      old ? { ...old, cover_image_url: url } : old,
    );
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.coverPhotoInvalidType', 'Escolha uma imagem (JPEG, PNG ou WebP).'));
      return;
    }
    setBusy('upload');
    try {
      const dataUrl = await downscaleToDataUrl(file);
      const res = await authFetch('/api/restaurant-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      patchCache(body.cover_image_url);
      toast.success(t('settings.coverPhotoSaved', 'Foto salva! Ela já aparece na sua página de reservas.'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.coverPhotoFailed', 'Falha no upload.'));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setBusy('remove');
    try {
      const res = await authFetch('/api/restaurant-photo', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `Remove failed (${res.status})`);
      }
      patchCache(null);
      toast.success(t('settings.coverPhotoRemoved', 'Foto removida.'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.coverPhotoFailed', 'Falha ao remover.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Preview — mirrors the booking page card's aspect (340×220) at half
          scale so the owner sees roughly what diners will see. */}
      <div className="w-[170px] h-[110px] rounded-xl overflow-hidden border border-glass-border-dark bg-gradient-to-br from-burgundy via-burgundy/80 to-stone-700 flex-shrink-0 relative">
        {coverImageUrl ? (
          <img src={coverImageUrl} alt={t('settings.coverPhotoPreviewAlt', 'Foto de capa atual')} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ThiingsIcon name="upload" pxSize={24} className="text-white/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-deep-charcoal font-medium mb-1">
          {t('settings.coverPhotoTitle', 'Foto de capa da página de reservas')}
        </p>
        <p className="text-xs text-muted-stone leading-relaxed mb-3">
          {t('settings.coverPhotoHint', 'Aparece no topo da sua página pública de reservas. Use uma foto do salão ou do prato mais bonito — JPEG/PNG/WebP, será redimensionada automaticamente.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {busy === 'upload'
              ? t('settings.coverPhotoUploading', 'Enviando…')
              : coverImageUrl
                ? t('settings.coverPhotoReplace', 'Trocar foto')
                : t('settings.coverPhotoUpload', 'Enviar foto')}
          </button>
          {coverImageUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy !== null}
              className="px-4 py-2 border border-glass-border-input bg-white/60 hover:bg-white/85 text-deep-charcoal text-sm font-medium rounded-xl transition-colors disabled:opacity-40"
            >
              {busy === 'remove' ? t('settings.coverPhotoRemoving', 'Removendo…') : t('settings.coverPhotoRemove', 'Remover')}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>
    </div>
  );
}
