from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

CELL_W = 96
CELL_H = 104
COLUMNS = 12
ROWS = 6
ACTIVE_COLUMNS = (8, 6, 6, 12, 10, 8)
ANCHOR_X = 48
ANCHOR_TOP = 8
ALPHA_THRESHOLD = 16
SPILL_ROWS = 12

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "NIVO_CHARACTER_ATLAS_v2.png"
OUTPUT = ROOT / "NIVO_CHARACTER_ATLAS_v3_aligned.png"
REPORT = ROOT / "NIVO_CHARACTER_ATLAS_v3_alignment.json"


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    return mask.getbbox()


def nontransparent_pixel_count(image: Image.Image) -> int:
    return sum(image.getchannel("A").histogram()[1:])


def copy_shifted(source: Image.Image, target: Image.Image, dx: int, dy: int) -> None:
    source_pixels = source.load()
    target_pixels = target.load()

    for sy in range(source.height):
        ty = sy + dy
        if not 0 <= ty < target.height:
            continue

        for sx in range(source.width):
            tx = sx + dx
            if not 0 <= tx < target.width:
                continue

            pixel = source_pixels[sx, sy]
            if pixel[3] > 0:
                target_pixels[tx, ty] = pixel


def extract_loop_frame(atlas: Image.Image, row: int, col: int) -> Image.Image:
    x0 = col * CELL_W
    y0 = row * CELL_H
    cell = atlas.crop((x0, y0, x0 + CELL_W, y0 + CELL_H))

    if row == 0:
        return cell

    extended = Image.new("RGBA", (CELL_W, CELL_H + SPILL_ROWS), (0, 0, 0, 0))

    # Rows 1 and 2 contain their real frame from roughly y=18 onward. Any
    # pixels at their top belong to the preceding row and must not be copied.
    clean_cell = cell.copy()
    clean_cell.paste((0, 0, 0, 0), (0, 0, CELL_W, SPILL_ROWS))
    extended.paste(clean_cell, (0, 0))

    # The bottom of BLINK/TALK was composited into the first pixels of the next
    # atlas row. Recover that strip before moving the complete frame upward.
    next_y = (row + 1) * CELL_H
    spill = atlas.crop((x0, next_y, x0 + CELL_W, next_y + SPILL_ROWS))
    extended.paste(spill, (0, CELL_H))

    return extended


def normalize() -> list[dict[str, object]]:
    atlas = Image.open(SOURCE).convert("RGBA")
    if atlas.size != (CELL_W * COLUMNS, CELL_H * ROWS):
        raise ValueError(f"Unexpected atlas size: {atlas.size}")

    output = atlas.copy()
    report: list[dict[str, object]] = []

    # Remove TALK overflow from the top of the expressions row. These pixels
    # are recovered into row 2 above and are not part of any expression frame.
    for col in range(ACTIVE_COLUMNS[2]):
        output.paste(
            (0, 0, 0, 0),
            (col * CELL_W, 3 * CELL_H, (col + 1) * CELL_W, 3 * CELL_H + SPILL_ROWS),
        )

    for row, count in ((0, ACTIVE_COLUMNS[0]), (1, ACTIVE_COLUMNS[1]), (2, ACTIVE_COLUMNS[2])):
        for col in range(count):
            frame = extract_loop_frame(atlas, row, col)
            bbox = alpha_bbox(frame)
            if bbox is None:
                continue

            x0, y0, x1, y1 = bbox
            center_x = (x0 + x1) / 2
            dx = round(ANCHOR_X - center_x)
            dy = ANCHOR_TOP - y0

            normalized = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
            copy_shifted(frame, normalized, dx, dy)
            source_pixel_count = nontransparent_pixel_count(frame)
            normalized_pixel_count = nontransparent_pixel_count(normalized)

            if normalized_pixel_count != source_pixel_count:
                raise ValueError(
                    f"Frame {row}:{col} lost pixels during alignment: "
                    f"{source_pixel_count} -> {normalized_pixel_count}"
                )

            output.paste(normalized, (col * CELL_W, row * CELL_H))

            normalized_bbox = alpha_bbox(normalized)
            report.append(
                {
                    "row": row,
                    "col": col,
                    "source_bbox": [x0, y0, x1, y1],
                    "offset": [dx, dy],
                    "normalized_bbox": list(normalized_bbox) if normalized_bbox else None,
                    "nontransparent_pixels": normalized_pixel_count,
                }
            )

    output.save(OUTPUT, optimize=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    changes = normalize()
    print(f"Wrote {OUTPUT.name} with {len(changes)} aligned loop frames")
    print(f"Wrote {REPORT.name}")
