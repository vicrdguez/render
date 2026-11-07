// Observes window creation only. Never requests permissions or drives user input.
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let pid = Int(CommandLine.arguments.dropFirst().first ?? "") ?? -1
let deadline = Date().addingTimeInterval(8)
var windows: [[String: Any]] = []
repeat {
    let entries = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    windows = entries.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid }
    if !windows.isEmpty { break }
    Thread.sleep(forTimeInterval: 0.1)
} while Date() < deadline
let evidence: [String: Any] = [
    "pid": pid,
    "accessibility_trusted": AXIsProcessTrusted(),
    "screen_capture_allowed": CGPreflightScreenCaptureAccess(),
    "windows": windows,
    "scope": "window creation only; no input, screenshot, accessibility or IME acceptance"
]
let bytes = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(bytes)
exit(windows.isEmpty ? 1 : 0)
