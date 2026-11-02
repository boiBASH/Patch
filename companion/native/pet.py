"""Release Detective native Windows companion. No browser and no third-party packages."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
import tkinter as tk
import urllib.request
from sprites import animation_for, load_frames, FRAME_SECONDS

BG = "#ff00ff"
PANEL = "#211e33"
WIDTH, HEIGHT = 400, 500
USER32 = ctypes.windll.user32 if sys.platform == "win32" else None
KERNEL32 = ctypes.windll.kernel32 if sys.platform == "win32" else None
if USER32:
    USER32.GetForegroundWindow.restype = wintypes.HWND
    USER32.GetParent.argtypes = [wintypes.HWND]
    USER32.GetParent.restype = wintypes.HWND
    USER32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    USER32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    KERNEL32.OpenProcess.restype = wintypes.HANDLE
    KERNEL32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    KERNEL32.CloseHandle.argtypes = [wintypes.HANDLE]


def editor_rect():
    if not USER32:
        return None
    hwnd = USER32.GetForegroundWindow()
    pid = wintypes.DWORD()
    USER32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    handle = KERNEL32.OpenProcess(0x1000, False, pid.value)
    if not handle:
        return None
    try:
        name = ctypes.create_unicode_buffer(32768)
        length = wintypes.DWORD(len(name))
        if not KERNEL32.QueryFullProcessImageNameW(handle, 0, name, ctypes.byref(length)):
            return None
        if Path(name.value).name.lower() not in ("code.exe", "code - insiders.exe"):
            return None
        rect = wintypes.RECT()
        if not USER32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return None
        return rect.left, rect.top, rect.right, rect.bottom
    finally:
        KERNEL32.CloseHandle(handle)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Pet:
    def __init__(self, root, port=None, token=None, self_test=False):
        self.root, self.port, self.token = root, port, token
        self.self_test = self_test
        self.stop = threading.Event()
        self.messages = queue.Queue()
        self.actions = queue.Queue()
        self.state = {}
        self.animation = "sniff"
        self.animation_started = time.monotonic()
        self.last_activity = time.monotonic()
        self.drag_origin = None
        self.offset = [18, 38]
        self.last_rect = None
        self.open_until = time.monotonic() + 12
        self.last_alert = 0
        self.last_finding = ""
        self.last_investigation = ""
        self.last_explanation = ""
        self.visible = False
        self.failed_polls = 0
        root.title("Patch — Release Detective")
        root.geometry(f"{WIDTH}x{HEIGHT}+50+50")
        root.configure(bg=BG)
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        if sys.platform == "win32":
            root.attributes("-transparentcolor", BG)
            root.wm_attributes("-toolwindow", True)
        root.withdraw()

        self.bubble = tk.Frame(root, bg=PANEL, highlightbackground="#7860aa", highlightthickness=1, padx=14, pady=12)
        tk.Label(self.bubble, text="PATCH  /  RELEASE DETECTIVE", fg="#b99ce9", bg=PANEL, font=("Segoe UI", 8, "bold"), anchor="w").pack(fill="x", pady=(0, 7))
        self.heading = tk.Label(self.bubble, text="Woof! I'm Patch.", fg="#e5d6ff", bg=PANEL, font=("Segoe UI", 10, "bold"), anchor="w", justify="left", wraplength=330)
        self.heading.pack(fill="x")
        self.subtitle = tk.Label(self.bubble, text="LOCAL CHECKS", fg="#9f95ba", bg=PANEL, font=("Segoe UI", 8), anchor="w")
        self.subtitle.pack(fill="x", pady=(3, 7))
        self.copy = tk.Label(self.bubble, text="Open a source file and I'll sniff out common security risks with you.", fg="#d6d3e0", bg=PANEL, font=("Segoe UI", 9), wraplength=330, justify="left", anchor="w")
        self.copy.pack(fill="x")
        row = tk.Frame(self.bubble, bg=PANEL)
        row.pack(fill="x", pady=(10, 0))
        self.buttons = {}
        for text, command in [("Show line", "jump"), ("Explain", "explain"), ("Next", "next"), ("Snooze", "snooze")]:
            button = tk.Button(row, text=text, command=lambda action=command: self.send(action), bg="#39304f", fg="#e1d7f5", activebackground="#5b467b", activeforeground="white", relief="flat", borderwidth=0, padx=7, pady=4, font=("Segoe UI", 8), takefocus=False)
            button.pack(side="left", padx=(0, 5))
            self.buttons[command] = button
        actions = tk.Frame(self.bubble, bg=PANEL)
        actions.pack(fill="x", pady=(7, 0))
        for text, command in [("Investigate sandbox", "investigate"), ("Review fix", "review"), ("Tips", "tips")]:
            button = tk.Button(actions, text=text, command=lambda action=command: self.send("cancel" if action == "investigate" and (self.state.get("investigation") or {}).get("busy") else action), bg="#514071", fg="white", activebackground="#705494", relief="flat", borderwidth=0, padx=7, pady=4, font=("Segoe UI", 8), takefocus=False)
            button.pack(side="left", padx=(0, 5))
            self.buttons[command] = button
        self.footer = tk.Label(self.bubble, text="Explain sends a generic question only. No source code.", fg="#9f95ba", bg=PANEL, font=("Segoe UI", 7), wraplength=300, justify="left")
        self.footer.pack(anchor="w", pady=(8, 0))
        self.frames = load_frames(Path(__file__).resolve().parents[1] / "assets" / "patch-sprites.png")
        self.image = self.frames[self.animation][0]
        self.sprite = tk.Label(root, image=self.image, bg=BG, borderwidth=0, cursor="hand2", width=150, height=146)
        self.sprite.place(x=240, y=327)
        self.badge = tk.Label(root, text="PATCH · LOCAL", fg="#d4c7ef", bg=PANEL, font=("Segoe UI", 8, "bold"), padx=8, pady=3)
        self.badge.place(x=315, y=477, anchor="n")
        self.sprite.bind("<ButtonPress-1>", self.drag_start)
        self.sprite.bind("<B1-Motion>", self.drag_move)
        self.sprite.bind("<ButtonRelease-1>", self.drag_end)
        self.sprite.bind("<Enter>", lambda _: self.show_tip())
        self.sprite.bind("<Button-3>", self.context_menu)
        self.menu = tk.Menu(root, tearoff=False)
        self.menu.add_command(label="Ask Patch for a tip", command=self.show_tip)
        self.menu.add_command(label="Investigate sandbox with AI", command=lambda: self.send("investigate"))
        self.menu.add_command(label="Run sandbox offline playbook", command=lambda: self.send("demo"))
        self.menu.add_command(label="Open investigation evidence", command=lambda: self.send("evidence"))
        self.menu.add_command(label="Snooze tips for 15 minutes", command=lambda: self.send("snooze"))
        self.menu.add_separator()
        self.menu.add_command(label="Hide Patch", command=self.close)
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.bind("<Escape>", lambda _: self.send("snooze"))
        root.update_idletasks()
        if USER32:
            # A mouse click on the pet must not steal the developer's keyboard focus.
            get_style = USER32.GetWindowLongPtrW
            set_style = USER32.SetWindowLongPtrW
            get_style.argtypes = [wintypes.HWND, ctypes.c_int]
            get_style.restype = ctypes.c_ssize_t
            set_style.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
            hwnd = USER32.GetParent(root.winfo_id()) or root.winfo_id()
            set_style(hwnd, -20, get_style(hwnd, -20) | 0x08000000 | 0x00000080)
        if not self_test:
            threading.Thread(target=self.network_loop, daemon=True).start()
            root.after(100, self.tick)

    def show_tip(self):
        self.last_activity = time.monotonic()
        self.open_until = time.monotonic() + 25
        if self.state.get("snoozed"):
            self.send("wake")

    def send(self, action):
        self.actions.put(action)
        self.open_until = time.monotonic() + (60 if action in ("explain", "investigate", "demo") else 25)
        if action == "snooze":
            self.open_until = 0

    def network_loop(self):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        while not self.stop.is_set():
            try:
                while not self.actions.empty():
                    action = self.actions.get_nowait()
                    request = urllib.request.Request(f"http://127.0.0.1:{self.port}/action", data=json.dumps({"action": action}).encode(), headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}, method="POST")
                    with opener.open(request, timeout=3) as response:
                        response.read(1024)
                request = urllib.request.Request(f"http://127.0.0.1:{self.port}/state", headers={"Authorization": f"Bearer {self.token}"})
                with opener.open(request, timeout=3) as response:
                    data = response.read(65537)
                    if len(data) > 65536:
                        raise ValueError("State too large")
                    self.messages.put(json.loads(data))
            except Exception:
                self.messages.put(None)
            self.stop.wait(0.7)

    def update_state(self, value):
        if value.get("revision") != self.state.get("revision"):
            self.last_activity = time.monotonic()
        self.state = value
        self.animate()
        investigation = value.get("investigation") or {}
        self.buttons["investigate"].configure(text="Cancel investigation" if investigation.get("busy") else "Investigate copy" if value.get("projectAvailable") else "Investigate sandbox", state="disabled" if value.get("explaining") else "normal")
        self.buttons["review"].configure(state="normal" if investigation.get("reviewReady") else "disabled")
        run_identity = f"{investigation.get('id')}:{investigation.get('stage')}:{investigation.get('busy')}"
        if value.get("showInvestigation") and run_identity != self.last_investigation:
            self.open_until = time.monotonic() + 60
        self.last_investigation = run_identity
        if value.get("explanation") and value.get("explanation") != self.last_explanation:
            self.open_until = time.monotonic() + 45
        self.last_explanation = value.get("explanation", "")
        if value.get("showInvestigation") and investigation:
            busy = investigation.get("busy")
            stage = investigation.get("stage", "starting")
            activity = {"queued": "getting ready", "context": "gathering clues", "detect": "sniffing for risks", "reason": "thinking through a fix", "act": "preparing a fix", "verify": "checking the candidate"}.get(stage, "investigating")
            title = f"Patch is {activity}" if busy else "Tail wags! Ready for your review" if investigation.get("gate") == "PASS" else "Paws here — investigation on hold"
            self.heading.configure(text=title)
            self.subtitle.configure(text=investigation.get("provider", "Sandbox"))
            result = ""
            if investigation.get("total") is not None:
                result = f"Before: {investigation.get('baselineFailures')} failed checks. After: {investigation.get('passed')}/{investigation.get('total')} passed.\n"
            text = result + investigation.get("message", "Preparing the sandbox.")
            self.copy.configure(text=text[:360] + ("…" if len(text) > 360 else ""))
            self.badge.configure(text="PATCH · WORKING" if busy else "PATCH · REVIEW" if investigation.get("gate") == "PASS" else "PATCH · HOLD", fg="#f4c18a")
            for name in ("jump", "explain", "next"):
                self.buttons[name].configure(state="disabled" if busy else "normal" if value.get("finding") else "disabled")
            self.footer.configure(text=investigation.get("scope") or "Synthetic API only · no deployment. Review fix opens the patch and report.")
            return
        finding = value.get("finding")
        identity = f"{value.get('file')}:{finding.get('id')}" if finding else ""
        if identity != self.last_finding and identity and time.monotonic() - self.last_alert > 45 and not value.get("snoozed"):
            self.open_until = time.monotonic() + 14
            self.last_alert = time.monotonic()
        self.last_finding = identity
        title = finding.get("title") if finding else "A little tip from Patch"
        self.heading.configure(text=title)
        detail = f"{value.get('file', '')} · line {finding['line'] + 1} · needs review" if finding else "Local heuristics · not a release approval"
        self.subtitle.configure(text=detail[:90])
        text = "Paws on the keyboard. Thinking this through…" if value.get("explaining") else value.get("explanation") or value.get("message") or (("Woof! " if finding else "") + value.get("tip", ""))
        self.copy.configure(text=text[:360] + ("…" if len(text) > 360 else ""))
        self.badge.configure(text="PATCH · ZZZ" if value.get("snoozed") else f"PATCH · {value['count']} TO REVIEW" if value.get("count") else "PATCH · LOCAL", fg="#f4c18a" if value.get("count") else "#d4c7ef")
        for name in ("jump", "explain", "next"):
            self.buttons[name].configure(state="normal" if finding and not value.get("explaining") and not investigation.get("busy") else "disabled")
        self.footer.configure(text="AI advice · no source code sent" if value.get("explanation") else "Explain sends a generic question only. No source code.")

    def animate(self):
        now = time.monotonic()
        animation = animation_for(self.state, now - self.last_activity)
        if animation != self.animation:
            self.animation = animation
            self.animation_started = now
        frame = int((now - self.animation_started) / FRAME_SECONDS[animation]) % 4
        self.image = self.frames[animation][frame]
        self.sprite.configure(image=self.image)

    def tick(self):
        while not self.messages.empty():
            value = self.messages.get_nowait()
            if value is None:
                self.failed_polls += 1
            else:
                self.failed_polls = 0
                self.update_state(value)
        if self.failed_polls >= 4:
            self.close()
            return
        rect = editor_rect()
        if rect and self.state.get("focused"):
            self.last_rect = rect
            left, top, right, bottom = rect
            x = max(left, right - WIDTH - self.offset[0])
            y = max(top, bottom - HEIGHT - self.offset[1])
            if not self.drag_origin:
                self.root.geometry(f"{WIDTH}x{HEIGHT}+{max(0, x)}+{max(0, y)}")
            if not self.visible:
                self.root.deiconify()
                self.visible = True
        elif self.visible and not self.drag_origin:
            self.root.withdraw()
            self.visible = False
        self.animate()
        if self.open_until > time.monotonic() and not self.state.get("snoozed"):
            self.bubble.place(x=10, y=0, width=380)
        else:
            self.bubble.place_forget()
        self.root.after(90, self.tick)

    def drag_start(self, event):
        self.drag_origin = (event.x_root, event.y_root, self.root.winfo_x(), self.root.winfo_y())

    def drag_move(self, event):
        if self.drag_origin:
            x, y, origin_x, origin_y = self.drag_origin
            self.root.geometry(f"+{max(0, origin_x + event.x_root - x)}+{max(0, origin_y + event.y_root - y)}")

    def drag_end(self, event):
        if not self.drag_origin:
            return
        moved = abs(event.x_root - self.drag_origin[0]) + abs(event.y_root - self.drag_origin[1])
        if self.last_rect:
            self.offset = [max(0, self.last_rect[2] - self.root.winfo_x() - WIDTH), max(0, self.last_rect[3] - self.root.winfo_y() - HEIGHT)]
        self.drag_origin = None
        if moved < 5:
            self.show_tip()

    def context_menu(self, event):
        self.menu.tk_popup(event.x_root, event.y_root)

    def close(self):
        self.stop.set()
        self.root.destroy()


def main():
    if "--self-test" in sys.argv:
        root = tk.Tk()
        pet = Pet(root, self_test=True)
        pet.update_state({"file": "example.js", "count": 1, "finding": {"id": "auth:2", "title": "Review route authentication", "line": 2}, "tip": "Check authentication before returning sensitive data."})
        assert "authentication" in pet.heading.cget("text")
        assert pet.badge.cget("text") == "PATCH · 1 TO REVIEW"
        assert pet.animation == "alert"
        assert pet.image.width() > 40 and pet.image.height() > 40
        assert all(len(frames) == 4 for frames in pet.frames.values())
        assert len(pet.frames) == 5
        for frames in pet.frames.values():
            for frame in frames:
                assert frame.transparency_get(0, 0), "Sprite cells must retain transparent corners"
                visible = sum(not frame.transparency_get(x, y) for x in range(0, frame.width(), 8) for y in range(0, frame.height(), 8))
                assert visible > 35, "Rendering must retain the dog, not just a few edge pixels"
        pet.update_state({"count": 0, "snoozed": True, "tip": "Paused"})
        assert pet.badge.cget("text") == "PATCH · ZZZ"
        assert pet.animation == "sleep"
        pet.update_state({"showInvestigation": True, "investigation": {"id": "test", "busy": True, "stage": "reason", "provider": "Test provider", "message": "Reading synthetic evidence."}})
        assert pet.badge.cget("text") == "PATCH · WORKING"
        assert pet.animation == "code"
        assert pet.buttons["investigate"].cget("text") == "Cancel investigation"
        pet.update_state({"showInvestigation": True, "investigation": {"id": "test", "busy": False, "stage": "report", "gate": "PASS", "reviewReady": True, "passed": 36, "total": 36, "baselineFailures": 32, "message": "Review the candidate."}})
        assert "36/36" in pet.copy.cget("text")
        assert pet.buttons["review"].cget("state") == "normal"
        assert pet.animation == "wag"
        pet.update_state({"showInvestigation": True, "investigation": {"gate": "HOLD", "busy": False}})
        assert pet.animation == "alert", "A blocked investigation must never celebrate"
        pet.update_state({"explaining": True})
        assert pet.animation == "code"
        pet.update_state({"investigation": {"busy": True, "stage": "verify"}})
        assert pet.animation == "sniff", "Keep animating active checks when the user switches to tips"
        pet.update_state({"count": 0})
        pet.last_activity -= 16
        pet.animate()
        assert pet.animation == "sleep"
        pet.show_tip()
        pet.animate()
        assert pet.animation == "sniff"
        # Distinct frames are actually displayed, not just stored in a sheet.
        for animation, frames in pet.frames.items():
            assert len({frame.tk.call(str(frame), "data", "-format", "png") for frame in frames}) >= 2, animation
        root.destroy()
        print(json.dumps({"native_widgets": "PASS", "sprite": "PASS", "state_updates": "PASS", "patch_animation_states": 5, "frames": 20}))
        return
    port = int(os.environ.pop("RD_PET_PORT", "0"))
    token = os.environ.pop("RD_PET_TOKEN", "")
    if not 1024 <= port <= 65535 or len(token) != 64:
        raise SystemExit("Launch the companion through the Release Detective VS Code extension.")
    root = tk.Tk()
    Pet(root, port, token)
    root.mainloop()


if __name__ == "__main__":
    main()
