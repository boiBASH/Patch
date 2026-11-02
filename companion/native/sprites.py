"""Patch's sprite-sheet loader and presentation state. No model or file access."""
import math
import struct
import sys
import tkinter as tk
import zlib

STATES = ("sniff", "alert", "code", "wag", "sleep")
FRAME_SECONDS = {"sniff": 0.22, "alert": 0.45, "code": 0.18, "wag": 0.16, "sleep": 0.65}


def adapt_to_colorkey(frame):
    """Adapt Tk's own PNG output for Windows' binary transparent-color window.

    Fractional alpha blends with magenta before the OS applies the color key,
    leaving a pink fringe. Quantize only the in-memory display copy; preserve
    the original artwork's alpha and colors on disk.
    """
    encoded = frame.tk.call(str(frame), "data", "-format", "png")
    position, compressed, header = 8, [], None
    while position < len(encoded):
        length = struct.unpack_from(">I", encoded, position)[0]
        kind = encoded[position + 4:position + 8]
        data = encoded[position + 8:position + 8 + length]
        if kind == b"IHDR":
            header = data
        elif kind == b"IDAT":
            compressed.append(data)
        position += length + 12
    width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", header)
    if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise ValueError("Unsupported Tk display-image format")
    raw = zlib.decompress(b"".join(compressed))
    stride = width * 4
    previous = bytearray(stride)
    output = bytearray()
    for row in range(height):
        start = row * (stride + 1)
        filter_type = raw[start]
        pixels = bytearray(raw[start + 1:start + 1 + stride])
        if filter_type not in range(5):
            raise ValueError("Unsupported PNG row filter")
        for index in range(stride) if filter_type else ():
            left = pixels[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            else:
                estimate = left + above - upper_left
                predictor = min((left, above, upper_left), key=lambda value: abs(estimate - value))
            pixels[index] = (pixels[index] + predictor) & 255
        previous = pixels[:]
        pixels[3::4] = bytes(255 if alpha >= 128 else 0 for alpha in pixels[3::4])
        output.extend(b"\0" + pixels)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    display_png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(output)) + chunk(b"IEND", b"")
    return tk.PhotoImage(data=display_png, format="png")


def animation_for(state, idle_seconds=0):
    if state.get("snoozed"):
        return "sleep"
    investigation = state.get("investigation") or {}
    if investigation.get("busy"):
        return "code" if investigation.get("stage") in ("reason", "act") else "sniff"
    if state.get("explaining"):
        return "code"
    if state.get("showInvestigation") and investigation:
        return "wag" if investigation.get("gate") == "PASS" else "alert"
    if state.get("finding") or state.get("count", 0):
        return "alert"
    return "sleep" if idle_seconds >= 15 else "sniff"


def load_frames(filename, size=144):
    sheet = tk.PhotoImage(file=str(filename))
    # Crop at proportional cell boundaries, so the supplied image's resolution
    # does not change animation layout. Keep the original transparent pixels.
    width, height = sheet.width(), sheet.height()
    if width < 256 or height < 320:
        raise ValueError("Patch's five-row, four-column sprite sheet is too small.")
    factor = max(1, math.ceil(max(width / 4, height / 5) / size))
    frames = {}
    for row, name in enumerate(STATES):
        frames[name] = []
        for column in range(4):
            x1, x2 = round(column * width / 4), round((column + 1) * width / 4)
            y1, y2 = round(row * height / 5), round((row + 1) * height / 5)
            frame = tk.PhotoImage()
            frame.tk.call(frame, "copy", sheet, "-from", x1, y1, x2, y2, "-subsample", factor, factor)
            if sys.platform == "win32":
                frame = adapt_to_colorkey(frame)
            frames[name].append(frame)
    return frames
