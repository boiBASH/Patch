"""Encode an edited, silent recording from actual window-scoped capture frames.

Requires Pillow and the project-local imageio-ffmpeg wheel under data/video-tools.
No screen capture, UI automation, generated app states or network access occurs here.
"""
from pathlib import Path
import json
import subprocess
import textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / 'data' / 'submission-video'
manifest = json.loads((VIDEO / 'recording-manifest.json').read_text(encoding='utf-8'))
captures = json.loads((VIDEO / 'capture.json').read_text(encoding='utf-8'))
encoder = next((ROOT / 'data/video-tools/imageio_ffmpeg/binaries').glob('ffmpeg*.exe'))
rendered = VIDEO / 'rendered'
rendered.mkdir(exist_ok=True)
font_dir = Path('C:/Windows/Fonts')
title_font = ImageFont.truetype(str(font_dir / 'segoeuib.ttf'), 31)
body_font = ImageFont.truetype(str(font_dir / 'segoeui.ttf'), 27)
small_font = ImageFont.truetype(str(font_dir / 'segoeui.ttf'), 20)
concat = []
index = 0
elapsed = 0
chapters = []
for segment in manifest['segments']:
    frames = [item for item in captures if item['label'] in segment['clips']]
    if not frames:
        raise RuntimeError('Missing real recording frames: ' + str(segment['clips']))
    duration = segment['seconds'] / len(frames)
    chapters.append({'start': elapsed, 'end': elapsed + segment['seconds'], 'title': segment['title']})
    for item in frames:
        canvas = Image.new('RGB', (1920, 1080), '#0b0b15')
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, 0, 1920, 5), fill='#a58af5')
        draw.text((40, 24), segment['title'], font=title_font, fill='#f5f1ff')
        draw.text((1495, 30), 'PATCH / RELEASE DETECTIVE', font=small_font, fill='#b9a0ef')
        shot = Image.open(VIDEO / 'frames' / item['file']).convert('RGB')
        shot.thumbnail((1856, 874), Image.Resampling.LANCZOS)
        # Upscale consistently when a source capture is smaller than the viewport.
        scale = min(1856 / shot.width, 874 / shot.height)
        shot = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.Resampling.LANCZOS)
        left = (1920 - shot.width) // 2
        canvas.paste(shot, (left, 86))
        draw.rectangle((left-1, 85, left+shot.width, 86+shot.height), outline='#39304f', width=2)
        lines = textwrap.wrap(segment['caption'], width=112)
        for n, line in enumerate(lines[:2]):
            draw.text((40, 973 + n * 33), line, font=body_font, fill='#e2d9f5')
        draw.text((40, 1050), 'ISOLATED COPY  |  SYNTHETIC RECORDS  |  HUMAN REVIEW REQUIRED', font=small_font, fill='#a89ab9')
        draw.text((1450, 1050), 'Edited recording - waits shortened', font=small_font, fill='#a89ab9')
        target = rendered / f'{index:04d}.png'
        canvas.save(target)
        concat += [f"file '{target.as_posix()}'", f'duration {duration:.6f}']
        index += 1
    elapsed += segment['seconds']
concat.append(f"file '{target.as_posix()}'")
(VIDEO / 'frames.ffconcat').write_text('ffconcat version 1.0\n' + '\n'.join(concat) + '\n', encoding='utf-8')
output = VIDEO / manifest.get('outputFile', 'Patch-Release-Detective-demo.mp4')
command = [str(encoder), '-y', '-hide_banner', '-loglevel', 'error', '-safe', '0', '-f', 'concat', '-i', str(VIDEO / 'frames.ffconcat'),
           '-an', '-r', '24', '-t', str(elapsed), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)]
subprocess.run(command, check=True)
(VIDEO / 'chapters.json').write_text(json.dumps(chapters, indent=2), encoding='utf-8')
print(json.dumps({'video': str(output), 'duration_seconds': elapsed, 'dimensions': [1920, 1080], 'captured_frames': index, 'audio': 'none - user narration script supplied'}))
