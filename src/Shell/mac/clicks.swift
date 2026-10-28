// Clicks away from Aang, on the Mac (2026-10-28). On the PC the pet's mouse hook says when he clicked somewhere that is not
// Aang's (outside.click), and the bubble lets go. Here macOS tells this program about every mouse press in OTHER apps
// (a global monitor sees nothing inside Aang's own windows, which is exactly "away"), with no permission needed: it is
// keys, not the mouse, that need Accessibility. One line per press: "down <x> <y>" in screen points, top-left origin.
//
// Build: swiftc -O -o aang-clicks clicks.swift
import AppKit

setvbuf(stdout, nil, _IOLBF, 0)
let height = NSScreen.screens.first?.frame.height ?? 0
NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { _ in
  let p = NSEvent.mouseLocation
  print("down \(Int(p.x)) \(Int(height - p.y))")
}
// The app closes our stdin when it stops: go with it.
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
NSApplication.shared.setActivationPolicy(.prohibited)
NSApplication.shared.run()
