import {
  MARK_ENDPOINT,
  MARK_GROUP_TRANSFORM,
  MARK_INK,
  MARK_MIRROR_TRANSFORM,
  MARK_SIDE_PATH,
  MARK_STEM_PATH,
  MARK_VIEWBOX,
} from '@/lib/brand-mark-geometry';
import { cn } from '@/lib/utils';

/**
 * The transparent OpenSignet mark, rendered from the approved vector geometry so it stays crisp at
 * every pixel density. Height sets the size; the width follows the mark's own proportions.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARK_VIEWBOX}
      className={cn('block h-[22px] w-auto flex-none sm:h-6', className)}
      aria-hidden="true"
      focusable="false"
    >
      <g fill={MARK_INK}>
        <g transform={MARK_GROUP_TRANSFORM}>
          <path d={MARK_SIDE_PATH} />
          <path d={MARK_SIDE_PATH} transform={MARK_MIRROR_TRANSFORM} />
          <path d={MARK_STEM_PATH} />
        </g>
        <circle cx={MARK_ENDPOINT.cx} cy={MARK_ENDPOINT.cy} r={MARK_ENDPOINT.r} />
      </g>
    </svg>
  );
}
