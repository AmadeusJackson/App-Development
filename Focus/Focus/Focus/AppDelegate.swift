//
//  AppDelegate.swift
//  Focus
//
//  Created by Amadeus Jackson on 1/26/26.
//

import Cocoa
import UserNotifications

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    // MARK: - Menu Bar & State
    var statusItem: NSStatusItem!
    var focusTimer: Timer?

    var breakEndDate: Date?
    var focusActive: Bool = true // Focus ON by default
    let breakDuration: TimeInterval = 10 * 60 // 10 minutes
    let dayStartHour = 7
    let dayEndHour = 20
    let nightStartHour = 20
    let nightEndHour = 22

    // MARK: - App Lifecycle
    func applicationDidFinishLaunching(_ notification: Notification) {
        requestNotificationPermission()
        setupMenuBar()
        startFocusLoop()
    }

    // MARK: - Menu Bar Setup
    func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.title = "🧠"
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Start 10-Minute Break", action: #selector(startBreak), keyEquivalent: "b"))
        menu.addItem(NSMenuItem(title: "Toggle Focus ON/OFF", action: #selector(toggleFocus), keyEquivalent: "f"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit Balanced Focus", action: #selector(quitApp), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    // MARK: - Focus Loop
    func startFocusLoop() {
        focusTimer = Timer.scheduledTimer(timeInterval: 3, target: self, selector: #selector(checkFocusRules), userInfo: nil, repeats: true)
    }

    @objc func checkFocusRules() {
        if isWeekend() {
            // Weekends: skip enforcement
            updateStatusIcon(mode: "weekend")
            return
        }

        if isBreakActive() {
            updateStatusIcon(mode: "break")
            return
        }

        if isNight() {
            updateStatusIcon(mode: "night")
            closeYouTubeTabs()
            return
        }

        // Weekday focus enforcement
        if focusActive {
            updateStatusIcon(mode: "focus")
            closeYouTubeTabs()
        }
    }

    // MARK: - Break Handling
    @objc func startBreak() {
        breakEndDate = Date().addingTimeInterval(breakDuration)
        sendNotification(title: "YouTube Break Started", body: "You have 10 minutes. Enjoy it!")
    }

    func isBreakActive() -> Bool {
        guard let end = breakEndDate else { return false }
        if Date() >= end {
            breakEndDate = nil
            sendNotification(title: "Break Over", body: "Back to focus mode.")
            return false
        }
        return true
    }

    // MARK: - Focus Toggle
    @objc func toggleFocus() {
        focusActive.toggle()
        let status = focusActive ? "ON" : "OFF"
        sendNotification(title: "Focus Mode \(status)", body: "You have manually toggled focus mode.")
    }

    // MARK: - Day/Night/Weekend Checks
    func isNight() -> Bool {
        let hour = Calendar.current.component(.hour, from: Date())
        return hour >= nightStartHour && hour < nightEndHour
    }

    func isWeekend() -> Bool {
        let weekday = Calendar.current.component(.weekday, from: Date())
        // Sunday = 1, Saturday = 7
        return weekday == 1 || weekday == 7
    }

    // MARK: - Chrome YouTube Detection
    func closeYouTubeTabs() {
        let script = """
        tell application "Google Chrome"
            repeat with w in windows
                set tabCount to count of tabs of w
                repeat with i from tabCount to 1 by -1
                    set t to tab i of w
                    set tabURL to URL of t
                    if tabURL contains "youtube.com" or tabURL contains "youtu.be" or tabURL contains "m.youtube.com" then
                        close t
                    end if
                end repeat
            end repeat
        end tell
        """
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(nil)
        }
    }

    // MARK: - Notifications
    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { _, _ in }
    }

    func sendNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Status Icon Updates
    func updateStatusIcon(mode: String) {
        guard let button = statusItem.button else { return }
        switch mode {
        case "focus":
            button.title = "🧠"
        case "break":
            button.title = "🔵"
        case "night":
            button.title = "🌙"
        case "weekend":
            button.title = "⚪"
        default:
            button.title = "🧠"
        }
    }

    // MARK: - Quit
    @objc func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}
