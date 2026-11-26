import AppKit
import WebKit

@MainActor
final class TrackerLauncher: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow?
    private var server: TrackerServer?
    private var startup: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.title = "Tracker"
        window.minSize = NSSize(width: 640, height: 480)
        window.isReleasedWhenClosed = false
        window.center()
        self.window = window
        showMessage("Opening Tracker…", spinning: true)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        startup = Task {
            do {
                let server = TrackerServer(config: try LauncherConfig())
                self.server = server
                try await server.start()
                try Task.checkCancellation()
                let view = WKWebView()
                view.navigationDelegate = self
                window.contentView = view
                view.load(URLRequest(url: server.config.origin))
            } catch is CancellationError {
                return
            } catch {
                server?.stop()
                showMessage(error.localizedDescription)
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        startup?.cancel()
        server?.stop()
    }

    private func configureMenu() {
        let bar = NSMenu()
        let trackerItem = NSMenuItem()
        let trackerMenu = NSMenu(title: "Tracker")
        trackerMenu.addItem(withTitle: "Quit Tracker", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        trackerItem.submenu = trackerMenu
        bar.addItem(trackerItem)
        NSApp.mainMenu = bar
    }

    private func showMessage(_ message: String, spinning: Bool = false) {
        let label = NSTextField(wrappingLabelWithString: message)
        label.font = .systemFont(ofSize: 16)
        label.alignment = .center
        let content = NSStackView(views: [label])
        content.orientation = .vertical
        content.alignment = .centerX
        content.spacing = 14
        if spinning {
            let progress = NSProgressIndicator()
            progress.style = .spinning
            progress.startAnimation(nil)
            content.insertArrangedSubview(progress, at: 0)
        }

        let container = NSView()
        container.addSubview(content)
        content.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            content.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            content.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            content.widthAnchor.constraint(lessThanOrEqualTo: container.widthAnchor, multiplier: 0.8),
        ])
        window?.contentView = container
    }

    func webView(
        _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let origin = server?.config.origin,
              url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port
        else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        showMessage("The tracker window couldn’t reach its local server. Reopen Tracker to try again.")
    }
}

@main
struct TrackerDesktop {
    @MainActor static func main() {
        let application = NSApplication.shared
        let launcher = TrackerLauncher()
        application.delegate = launcher
        application.setActivationPolicy(.regular)
        withExtendedLifetime(launcher) { application.run() }
    }
}
