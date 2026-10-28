// A picture of the window he is in, on the Mac (2026-10-28): the PC pet's Look (look_at_window, send_to_phone "screen").
// Prints one JSON line: {"ok":true,"data":<base64 JPEG>,"w":..,"h":..,"black":0..1} or {"ok":false,"error":".."}.
// macOS hands other apps' windows only to a program with Screen Recording allowed; without it this says so instead of
// sending a picture of the wallpaper. Nothing is saved to disk.
//
// Build: swiftc -O -o aang-look look.swift
import AppKit
import CoreGraphics

func say(_ o: [String: Any]) -> Never {
  let d = try! JSONSerialization.data(withJSONObject: o)
  FileHandle.standardOutput.write(d); FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(0)
}

if !CGPreflightScreenCaptureAccess() {
  say(["ok": false, "error": "Screen Recording is off for Aang on this Mac (System Settings, Privacy & Security, Screen Recording)"])
}
guard let front = NSWorkspace.shared.frontmostApplication else { say(["ok": false, "error": "no app is in front"]) }
let pid = front.processIdentifier
let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
// The front app's top normal window (layer 0), the one he is looking at.
guard let win = list.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }),
      let wid = win[kCGWindowNumber as String] as? CGWindowID else { say(["ok": false, "error": "\(front.localizedName ?? "the app in front") has no window open"]) }
guard let img = CGWindowListCreateImage(.null, .optionIncludingWindow, wid, [.boundsIgnoreFraming, .nominalResolution]) else {
  say(["ok": false, "error": "macOS gave no picture of that window"])
}
// At most 1600 px wide, like the PC's.
let scale = min(1.0, 1600.0 / Double(img.width))
let w = Int(Double(img.width) * scale), h = Int(Double(img.height) * scale)
guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
  say(["ok": false, "error": "the picture could not be drawn"])
}
ctx.interpolationQuality = .high
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
// How much of it is black (protected video comes back as a black box), checked on every 7th pixel.
var dark = 0, seen = 0
if let p = ctx.data?.bindMemory(to: UInt8.self, capacity: w * h * 4) {
  var i = 0
  while i < w * h { let o = i * 4; if Int(p[o]) + Int(p[o + 1]) + Int(p[o + 2]) < 24 { dark += 1 }; seen += 1; i += 7 }
}
guard let out = ctx.makeImage(), let jpg = NSBitmapImageRep(cgImage: out).representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else {
  say(["ok": false, "error": "the picture could not be made"])
}
say(["ok": true, "data": jpg.base64EncodedString(), "w": w, "h": h, "black": seen > 0 ? Double(dark) / Double(seen) : 0])
