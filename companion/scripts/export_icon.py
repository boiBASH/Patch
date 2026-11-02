"""Export Patch's extension icon from the same sprite cell used by the UI."""
from pathlib import Path
import sys
import tkinter as tk

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "native"))
from sprites import load_frames

root = tk.Tk()
root.withdraw()
frames = load_frames(ROOT / "assets" / "patch-sprites.png", size=512)
frames["alert"][0].write(str(ROOT / "assets" / "patch.png"), format="png")
root.destroy()
print("Patch icon exported from the alert animation.")
