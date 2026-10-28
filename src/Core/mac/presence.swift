// The Mac's eyes for Aang (2026-10-28, the Mac is Aang's home). On the PC the pet (src/Body) tells the brain which
// app is in front, how long since the last key or mouse, and whether a game holds the screen. On the Mac this small
// program does it, and prints one JSON line whenever something changes (and the idle time every few seconds):
//
//   {"front":"Claude","bundle":"com.anthropic.claudefordesktop","idle":3,"mic":false,"cam":false,"full":false,"focus":null}
//
// No permission prompts: none of these readings needs one. Focus mode lives behind Full Disk Access, so without it
// "focus" is null (unknown), never a guess. Nothing is read from inside any app: names and on/off states only.
//
// Build: swiftc -O -o aang-presence presence.swift
import AppKit
import CoreAudio
import CoreMediaIO

setvbuf(stdout, nil, _IOLBF, 0)

struct State: Equatable {
  var front = "", bundle = ""
  var mic = false, cam = false, full = false
  var focus: Bool? = nil
}

func micInUse() -> Bool {
  var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr else { return false }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr else { return false }
  for id in ids {
    // Only devices that can record.
    var streams = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioDevicePropertyScopeInput, mElement: kAudioObjectPropertyElementMain)
    var ssize: UInt32 = 0
    if AudioObjectGetPropertyDataSize(id, &streams, 0, nil, &ssize) != noErr || ssize == 0 { continue }
    var running = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var on: UInt32 = 0
    var osize = UInt32(MemoryLayout<UInt32>.size)
    if AudioObjectGetPropertyData(id, &running, 0, nil, &osize, &on) == noErr, on != 0 { return true }
  }
  return false
}

func camInUse() -> Bool {
  var addr = CMIOObjectPropertyAddress(mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices), mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal), mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
  var size: UInt32 = 0
  guard CMIOObjectGetPropertyDataSize(CMIOObjectID(kCMIOObjectSystemObject), &addr, 0, nil, &size) == noErr else { return false }
  var ids = [CMIODeviceID](repeating: 0, count: Int(size) / MemoryLayout<CMIODeviceID>.size)
  var used: UInt32 = 0
  guard CMIOObjectGetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &addr, 0, nil, size, &used, &ids) == noErr else { return false }
  for id in ids {
    var running = CMIOObjectPropertyAddress(mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere), mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeWildcard), mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementWildcard))
    var on: UInt32 = 0
    var got: UInt32 = 0
    if CMIOObjectGetPropertyData(id, &running, 0, nil, UInt32(MemoryLayout<UInt32>.size), &got, &on) == noErr, on != 0 { return true }
  }
  return false
}

/** The front app has a window covering a whole screen (a full-screen video, a game, the Shadow stream). */
func frontIsFullScreen(pid: pid_t) -> Bool {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
  let screens = NSScreen.screens.map { $0.frame.size }
  for w in list {
    guard (w[kCGWindowOwnerPID as String] as? pid_t) == pid, (w[kCGWindowLayer as String] as? Int) == 0,
          let b = w[kCGWindowBounds as String] as? [String: CGFloat], let width = b["Width"], let height = b["Height"] else { continue }
    if screens.contains(where: { abs($0.width - width) < 1 && abs($0.height - height) < 1 }) { return true }
  }
  return false
}

/** Focus / Do Not Disturb: on, off, or nil when macOS will not let this be read (Full Disk Access). */
func focusOn() -> Bool? {
  let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/DoNotDisturb/DB/Assertions.json")
  guard let data = try? Data(contentsOf: url), let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let store = j["data"] as? [[String: Any]] else { return nil }
  return store.contains { (($0["storeAssertionRecords"] as? [Any])?.isEmpty == false) }
}

func idleSeconds() -> Double {
  CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
}

var last = State()
var lastIdleSent = -1.0

func read() -> State {
  var s = State()
  let app = NSWorkspace.shared.frontmostApplication
  s.front = app?.localizedName ?? ""
  s.bundle = app?.bundleIdentifier ?? ""
  s.mic = micInUse()
  s.cam = camInUse()
  s.full = app.map { frontIsFullScreen(pid: $0.processIdentifier) } ?? false
  s.focus = focusOn()
  return s
}

func emit(_ s: State, idle: Double) {
  let o: [String: Any] = ["front": s.front, "bundle": s.bundle, "idle": Int(idle), "mic": s.mic, "cam": s.cam, "full": s.full, "focus": s.focus as Any? ?? NSNull()]
  if let d = try? JSONSerialization.data(withJSONObject: o), let line = String(data: d, encoding: .utf8) { print(line) }
}

func tick(force: Bool = false) {
  let s = read()
  let idle = idleSeconds()
  // A change goes out at once; otherwise the idle time every 5 s, or when input comes back after a quiet spell.
  if force || s != last || idle < lastIdleSent || idle - lastIdleSent >= 5 {
    emit(s, idle: idle)
    last = s
    lastIdleSent = idle
  }
}

// The front app changing is pushed by macOS; everything else is checked every 2 s.
NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in tick() }
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in tick() }
// The brain closes our stdin when it stops: go with it.
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
tick(force: true)
RunLoop.main.run()
