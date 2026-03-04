import Cocoa
import PDFKit
import UniformTypeIdentifiers
import UserNotifications

final class FocusTask {
    let id: String
    var title: String
    var startDate: Date
    var endDate: Date
    var isCompleted: Bool
    var isLockedBlock: Bool
    var notificationSent: Bool
    var notionPageID: String?

    init(
        id: String = UUID().uuidString,
        title: String,
        startDate: Date,
        endDate: Date,
        isCompleted: Bool = false,
        isLockedBlock: Bool = false,
        notificationSent: Bool = false,
        notionPageID: String? = nil
    ) {
        self.id = id
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.isCompleted = isCompleted
        self.isLockedBlock = isLockedBlock
        self.notificationSent = notificationSent
        self.notionPageID = notionPageID
    }

    var duration: TimeInterval {
        max(15 * 60, endDate.timeIntervalSince(startDate))
    }
}

final class NotionClient {
    private let token = ProcessInfo.processInfo.environment["NOTION_TOKEN"]

    func markTaskDone(_ task: FocusTask) async {
        guard let token, let notionPageID = task.notionPageID else { return }
        guard let url = URL(string: "https://api.notion.com/v1/pages/\(notionPageID)") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("2022-06-28", forHTTPHeaderField: "Notion-Version")

        let payload: [String: Any] = [
            "properties": [
                "Status": [
                    "status": ["name": "Done"]
                ]
            ]
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        _ = try? await URLSession.shared.data(for: request)
    }
}

@main
class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private enum NotificationAction {
        static let categoryID = "TASK_FINISHED"
        static let done = "DONE_ACTION"
        static let doTonight = "DO_TONIGHT_ACTION"
    }

    private var statusItem: NSStatusItem!
    private var tasks: [FocusTask] = []
    private var pollTimer: Timer?
    private let notionClient = NotionClient()

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureNotifications()
        setupMenuBar()
        startTaskPolling()
    }

    private func configureNotifications() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        let doneAction = UNNotificationAction(
            identifier: NotificationAction.done,
            title: "Done",
            options: [.authenticationRequired]
        )
        let tonightAction = UNNotificationAction(
            identifier: NotificationAction.doTonight,
            title: "Do tonight",
            options: [.authenticationRequired]
        )

        let category = UNNotificationCategory(
            identifier: NotificationAction.categoryID,
            actions: [doneAction, tonightAction],
            intentIdentifiers: [],
            options: []
        )

        center.setNotificationCategories([category])
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "📅"
        rebuildMenu()
    }

    private func rebuildMenu() {
        let menu = NSMenu()

        menu.addItem(NSMenuItem(title: "Import Notion Calendar File…", action: #selector(importCalendar), keyEquivalent: "i"))
        menu.addItem(NSMenuItem(title: "Add Locked Block…", action: #selector(addLockedBlock), keyEquivalent: "l"))
        menu.addItem(NSMenuItem(title: "Clear Completed Tasks", action: #selector(clearCompletedTasks), keyEquivalent: "c"))
        menu.addItem(NSMenuItem.separator())

        if tasks.isEmpty {
            let item = NSMenuItem(title: "No tasks imported", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else {
            for task in tasks.sorted(by: { $0.startDate < $1.startDate }) {
                let item = NSMenuItem(title: "", action: nil, keyEquivalent: "")
                item.attributedTitle = attributedTitle(for: task)
                item.isEnabled = false
                menu.addItem(item)
            }
        }

        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    private func attributedTitle(for task: FocusTask) -> NSAttributedString {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        let timeLabel = "\(formatter.string(from: task.startDate)) - \(formatter.string(from: task.endDate))"
        let prefix = task.isLockedBlock ? "🔒 " : ""
        let text = "\(prefix)\(timeLabel)  \(task.title)"

        let attrs: [NSAttributedString.Key: Any]
        if task.isCompleted {
            attrs = [
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .foregroundColor: NSColor.secondaryLabelColor
            ]
        } else {
            attrs = [.foregroundColor: NSColor.labelColor]
        }

        return NSAttributedString(string: text, attributes: attrs)
    }

    @objc private func importCalendar() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = supportedImportTypes()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let url = panel.url else { return }

        let importedTasks = parseTasks(from: url)
        guard !importedTasks.isEmpty else {
            showImportFailedAlert(for: url)
            return
        }

        tasks.removeAll(where: { !$0.isLockedBlock })
        tasks.append(contentsOf: importedTasks)
        rebuildMenu()
    }

    private func supportedImportTypes() -> [UTType] {
        let candidates: [UTType?] = [
            UTType(filenameExtension: "ics"),
            .commaSeparatedText,
            .pdf,
            .html,
            .markdown,
            .plainText
        ]
        return candidates.compactMap { $0 }
    }

    private func showImportFailedAlert(for url: URL) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Could not import tasks"
        alert.informativeText = "No task blocks were found in \(url.lastPathComponent). Supported formats: .ics, .csv, .pdf, .html, .md"
        alert.runModal()
    }

    @objc private func addLockedBlock() {
        let alert = NSAlert()
        alert.messageText = "Add Locked Block"
        alert.informativeText = "Title,start hour,end hour (24h). Example: Sleep,23,7"

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        input.placeholderString = "Sleep,23,7"
        alert.accessoryView = input
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")

        guard alert.runModal() == .alertFirstButtonReturn else { return }

        let parts = input.stringValue.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
        guard parts.count == 3,
              let startHour = Int(parts[1]),
              let endHour = Int(parts[2]),
              (0...23).contains(startHour),
              (0...23).contains(endHour) else { return }

        let now = Date()
        let calendar = Calendar.current

        guard var start = calendar.date(bySettingHour: startHour, minute: 0, second: 0, of: now) else { return }
        guard var end = calendar.date(bySettingHour: endHour, minute: 0, second: 0, of: now) else { return }

        if end <= start {
            end = calendar.date(byAdding: .day, value: 1, to: end) ?? end
        }
        if start < now {
            start = calendar.date(byAdding: .day, value: 1, to: start) ?? start
            end = calendar.date(byAdding: .day, value: 1, to: end) ?? end
        }

        tasks.append(FocusTask(title: parts[0], startDate: start, endDate: end, isLockedBlock: true))
        rebuildMenu()
    }

    @objc private func clearCompletedTasks() {
        tasks.removeAll(where: { $0.isCompleted && !$0.isLockedBlock })
        rebuildMenu()
    }

    private func parseICS(_ rawICS: String) -> [FocusTask] {
        let unfolded = rawICS
            .replacingOccurrences(of: "\r\n ", with: "")
            .replacingOccurrences(of: "\n ", with: "")

        let blocks = unfolded.components(separatedBy: "BEGIN:VEVENT")
        var imported: [FocusTask] = []

        for block in blocks where block.contains("END:VEVENT") {
            let lines = block.components(separatedBy: .newlines)
            var summary = "Task"
            var uid = UUID().uuidString
            var start: Date?
            var end: Date?

            for line in lines {
                if line.hasPrefix("SUMMARY:") {
                    summary = String(line.dropFirst("SUMMARY:".count))
                } else if line.hasPrefix("UID:") {
                    uid = String(line.dropFirst("UID:".count))
                } else if line.hasPrefix("DTSTART") {
                    start = parseICSDate(line)
                } else if line.hasPrefix("DTEND") {
                    end = parseICSDate(line)
                }
            }

            if let start, let end, end > start {
                let notionPageID = uid.replacingOccurrences(of: "-", with: "")
                imported.append(FocusTask(title: summary, startDate: start, endDate: end, notionPageID: notionPageID))
            }
        }

        return imported
    }

    private func parseTasks(from fileURL: URL) -> [FocusTask] {
        let ext = fileURL.pathExtension.lowercased()
        switch ext {
        case "ics":
            guard let raw = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return parseICS(raw)
        case "csv":
            guard let raw = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return parseCSV(raw)
        case "md", "markdown":
            guard let raw = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return parseScheduleText(raw)
        case "html", "htm":
            guard let raw = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return parseScheduleText(stripHTML(raw))
        case "pdf":
            guard let document = PDFDocument(url: fileURL) else { return [] }
            var fullText = ""
            for index in 0..<document.pageCount {
                fullText += document.page(at: index)?.string ?? ""
                fullText += "\n"
            }
            return parseScheduleText(fullText)
        default:
            guard let raw = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
            return parseScheduleText(raw)
        }
    }

    private func parseCSV(_ rawCSV: String) -> [FocusTask] {
        let lines = rawCSV
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !lines.isEmpty else { return [] }

        let header = splitCSVLine(lines[0]).map { $0.lowercased() }
        let titleIndex = header.firstIndex(where: { ["title", "task", "summary", "name"].contains($0) }) ?? 0
        let startIndex = header.firstIndex(where: { ["start", "startdate", "start time"].contains($0) }) ?? 1
        let endIndex = header.firstIndex(where: { ["end", "enddate", "end time"].contains($0) }) ?? 2
        let uidIndex = header.firstIndex(where: { ["uid", "id", "pageid", "notionid"].contains($0) })

        return lines.dropFirst().compactMap { line in
            let columns = splitCSVLine(line)
            guard columns.indices.contains(titleIndex),
                  columns.indices.contains(startIndex),
                  columns.indices.contains(endIndex),
                  let start = parseFlexibleDate(columns[startIndex]),
                  let end = parseFlexibleDate(columns[endIndex]),
                  end > start else { return nil }

            let uid = uidIndex.flatMap { columns.indices.contains($0) ? columns[$0] : nil }
            return FocusTask(
                title: columns[titleIndex].isEmpty ? "Task" : columns[titleIndex],
                startDate: start,
                endDate: end,
                notionPageID: uid?.replacingOccurrences(of: "-", with: "")
            )
        }
    }

    private func splitCSVLine(_ line: String) -> [String] {
        var fields: [String] = []
        var current = ""
        var inQuotes = false

        for char in line {
            if char == "\"" {
                inQuotes.toggle()
                continue
            }
            if char == "," && !inQuotes {
                fields.append(current.trimmingCharacters(in: .whitespacesAndNewlines))
                current = ""
            } else {
                current.append(char)
            }
        }

        fields.append(current.trimmingCharacters(in: .whitespacesAndNewlines))
        return fields
    }

    private func stripHTML(_ html: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "<[^>]+>", options: []) else { return html }
        let fullRange = NSRange(location: 0, length: (html as NSString).length)
        let withoutTags = regex.stringByReplacingMatches(in: html, options: [], range: fullRange, withTemplate: " ")
        return withoutTags
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    private func parseScheduleText(_ raw: String) -> [FocusTask] {
        // Expected line examples (markdown/html/pdf text):
        // Task title | 2026-02-01 09:00 | 2026-02-01 10:00 | optionalUID
        // - [ ] Task title | 2026-02-01T09:00 | 2026-02-01T10:00
        let lines = raw
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return lines.compactMap { line in
            let normalized = line
                .replacingOccurrences(of: "- [ ]", with: "")
                .replacingOccurrences(of: "* [ ]", with: "")
                .trimmingCharacters(in: .whitespaces)

            let parts = normalized.split(separator: "|").map { String($0).trimmingCharacters(in: .whitespaces) }
            guard parts.count >= 3,
                  let start = parseFlexibleDate(parts[1]),
                  let end = parseFlexibleDate(parts[2]),
                  end > start else { return nil }

            let uid = parts.count >= 4 ? parts[3] : nil
            return FocusTask(
                title: parts[0].isEmpty ? "Task" : parts[0],
                startDate: start,
                endDate: end,
                notionPageID: uid?.replacingOccurrences(of: "-", with: "")
            )
        }
    }

    private func parseFlexibleDate(_ value: String) -> Date? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let formats = [
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm",
            "yyyy-MM-dd'T'HH:mm:ss",
            "MM/dd/yyyy HH:mm",
            "MM/dd/yyyy h:mm a"
        ]

        for format in formats {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = format
            if let date = formatter.date(from: trimmed) {
                return date
            }
        }

        let iso = ISO8601DateFormatter()
        return iso.date(from: trimmed)
    }

    private func parseICSDate(_ line: String) -> Date? {
        guard let value = line.split(separator: ":", maxSplits: 1).last else { return nil }
        let stringValue = String(value)

        let utc = DateFormatter()
        utc.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        utc.timeZone = TimeZone(secondsFromGMT: 0)

        let local = DateFormatter()
        local.dateFormat = "yyyyMMdd'T'HHmmss"

        let day = DateFormatter()
        day.dateFormat = "yyyyMMdd"

        return utc.date(from: stringValue) ?? local.date(from: stringValue) ?? day.date(from: stringValue)
    }

    private func startTaskPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.evaluateTaskState()
        }
        evaluateTaskState()
    }

    private func evaluateTaskState() {
        let now = Date()
        for task in tasks where !task.isCompleted && !task.isLockedBlock {
            if now >= task.endDate && !task.notificationSent {
                task.notificationSent = true
                sendTaskFinishedNotification(for: task)
            }
        }
        rebuildMenu()
    }

    private func sendTaskFinishedNotification(for task: FocusTask) {
        let content = UNMutableNotificationContent()
        content.title = "Task time finished"
        content.body = task.title
        content.categoryIdentifier = NotificationAction.categoryID
        content.userInfo = ["taskID": task.id]

        let request = UNNotificationRequest(identifier: task.id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        defer {
            rebuildMenu()
            completionHandler()
        }

        guard let taskID = response.notification.request.content.userInfo["taskID"] as? String,
              let task = tasks.first(where: { $0.id == taskID }) else { return }

        switch response.actionIdentifier {
        case NotificationAction.done:
            task.isCompleted = true
            Task {
                await notionClient.markTaskDone(task)
            }
        case NotificationAction.doTonight:
            moveTaskToNextFreeTonightSlot(task)
            task.notificationSent = false
        default:
            break
        }
    }

    private func moveTaskToNextFreeTonightSlot(_ task: FocusTask) {
        let calendar = Calendar.current
        let now = Date()
        let tonightStart = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: now) ?? now
        let tonightEnd = calendar.date(bySettingHour: 23, minute: 59, second: 0, of: now) ?? now

        var candidateStart = max(now, tonightStart)
        let duration = task.duration

        while candidateStart.addingTimeInterval(duration) <= tonightEnd {
            let candidateEnd = candidateStart.addingTimeInterval(duration)
            let overlaps = tasks
                .filter { $0.id != task.id && !$0.isCompleted }
                .contains { existing in
                    candidateStart < existing.endDate && candidateEnd > existing.startDate
                }

            if !overlaps {
                task.startDate = candidateStart
                task.endDate = candidateEnd
                return
            }

            candidateStart = calendar.date(byAdding: .minute, value: 15, to: candidateStart) ?? candidateStart.addingTimeInterval(15 * 60)
        }
    }

    @objc private func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}
