import AppContent from './AppContent';
import { appendCacheSignature } from '../lib/media';
import { getTemplateLayout } from '../lib/templates';
import type { ScreenTemplate, ScreenTemplateZone } from '../types';
import type { PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  template: ScreenTemplate;
  zones: ScreenTemplateZone[];
  mode?: 'preview' | 'player';
  editable?: boolean;
  onCanvasZoneChange?: (zone: ScreenTemplateZone, patch: Partial<ScreenTemplateZone>) => void;
};

export default function TemplateRenderer({ template, zones, mode = 'preview', editable = false, onCanvasZoneChange }: Props) {
  const layout = getTemplateLayout(template.layout_type);
  const zoneByKey = new Map(zones.map((zone) => [zone.zone_key, zone]));

  function startCanvasInteraction(
    event: ReactPointerEvent<HTMLElement>,
    zone: ScreenTemplateZone,
    action: 'move' | 'resize',
  ) {
    const commitCanvasZoneChange = onCanvasZoneChange;
    if (!commitCanvasZoneChange) return;
    event.preventDefault();
    event.stopPropagation();

    const parent = event.currentTarget.closest('[data-canvas-root="true"]') as HTMLElement | null;
    const rect = parent?.getBoundingClientRect();
    if (!rect) return;
    const canvasRect = rect;

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = Number(zone.x ?? 0);
    const startY = Number(zone.y ?? 0);
    const startWidth = Number(zone.width ?? 50);
    const startHeight = Number(zone.height ?? 50);

    function finish(pointerEvent: PointerEvent) {
      const deltaX = ((pointerEvent.clientX - startClientX) / canvasRect.width) * 100;
      const deltaY = ((pointerEvent.clientY - startClientY) / canvasRect.height) * 100;

      if (action === 'move') {
        commitCanvasZoneChange?.(zone, {
          x: clamp(startX + deltaX, 0, 100 - startWidth),
          y: clamp(startY + deltaY, 0, 100 - startHeight),
        });
      } else {
        commitCanvasZoneChange?.(zone, {
          width: clamp(startWidth + deltaX, 5, 100 - startX),
          height: clamp(startHeight + deltaY, 5, 100 - startY),
        });
      }

      window.removeEventListener('pointerup', finish);
    }

    window.addEventListener('pointerup', finish, { once: true });
  }

  if (template.layout_type === 'canvas') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black" data-canvas-root="true">
        {zones.length === 0 && mode === 'preview' && (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-slate-500">
            Add a canvas zone
          </div>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className="absolute overflow-hidden border border-white/10"
            style={{
              left: `${zone.x ?? 0}%`,
              top: `${zone.y ?? 0}%`,
              width: `${zone.width ?? 50}%`,
              height: `${zone.height ?? 50}%`,
              zIndex: zone.z_index ?? 1,
              borderRadius: `${zone.border_radius ?? 0}px`,
              backgroundColor: zone.background_color ?? '#020617',
            }}
          >
            {zone.media ? (
              <TemplateMedia zone={zone} mode={mode} />
            ) : mode === 'preview' ? (
              <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-slate-500">
                {zone.zone_key}
              </div>
            ) : null}
            {editable && mode === 'preview' && (
              <>
                <button
                  onPointerDown={(event) => startCanvasInteraction(event, zone, 'move')}
                  className="absolute inset-0 cursor-move border border-cyan-300/70 bg-cyan-300/5"
                  type="button"
                  title="Drag zone"
                >
                  <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-xs text-white">
                    {zone.zone_key}
                  </span>
                </button>
                <button
                  onPointerDown={(event) => startCanvasInteraction(event, zone, 'resize')}
                  className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded border border-white/70 bg-cyan-300"
                  type="button"
                  title="Resize zone"
                />
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid h-full w-full gap-2 bg-black p-2"
      style={{
        gridTemplateColumns: layout.columns,
        gridTemplateRows: layout.rows,
        gridTemplateAreas: layout.areas,
      }}
    >
      {layout.zones.map((definition) => {
        const zone = zoneByKey.get(definition.key);

        return (
          <div
            key={definition.key}
            className="relative min-h-0 min-w-0 overflow-hidden rounded-md border border-white/10"
            style={{
              gridArea: definition.area,
              backgroundColor: zone?.background_color ?? '#020617',
            }}
          >
            {zone?.media ? (
              <TemplateMedia zone={zone} mode={mode} />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-slate-500">
                {definition.label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function TemplateMedia({ zone, mode }: { zone: ScreenTemplateZone; mode: 'preview' | 'player' }) {
  const media = zone.media;
  if (!media) return null;

  const fitClass = zone.fit_mode === 'cover' ? 'object-cover' : 'object-contain';

  if (media.media_type === 'url') {
    return <AppContent url={media.file_url} title={media.file_name} mode={mode} loopPlayback={mode === 'player'} />;
  }

  if (media.media_type === 'video') {
    return (
      <video
        className={`h-full w-full bg-black ${fitClass}`}
        src={appendCacheSignature(media.file_url, media.created_at ?? media.id)}
        autoPlay={mode === 'player'}
        controls={mode === 'preview'}
        loop
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      className={`h-full w-full bg-black ${fitClass}`}
      src={appendCacheSignature(media.file_url, media.created_at ?? media.id)}
      alt={media.file_name}
    />
  );
}
