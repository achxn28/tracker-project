import AppKit
import WebKit

@MainActor
final class TrackerLauncher: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow?
    private var glass: NSVisualEffectView?
    private var content: NSView?
    private var server: TrackerServer?
    private var startup: Task<Void, Never>?
    private var refreshOnReturn = false
    private let browserAuth = ["/api/google/connect", "/api/gmail/connect"]
    private let browserExports = ["/export/opportunities", "/export/activities"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        let visibleFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1366, height: 850)
        let width = min(1040, visibleFrame.width * 0.80)
        let height = min(680, visibleFrame.height * 0.78)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        window.title = "Tracker"
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.minSize = NSSize(width: min(640, width), height: min(480, height))
        window.isReleasedWhenClosed = false
        window.center()
        self.window = window
        let glass = NSVisualEffectView()
        glass.material = .sidebar
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 22
        glass.layer?.cornerCurve = .continuous
        glass.layer?.masksToBounds = true
        window.contentView = glass
        self.glass = glass
        showMessage("Opening Tracker…", spinning: true)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        startup = Task {
            do {
                let server = TrackerServer(config: try LauncherConfig())
                self.server = server
                try await server.start()
                try Task.checkCancellation()
                let configuration = WKWebViewConfiguration()
                configuration.applicationNameForUserAgent = "TrackerDesktop/1"
                // On macOS WebKit normally paints a solid canvas behind the page.
                // Disable that fill when supported so the native glass stays visible.
                if configuration.responds(to: NSSelectorFromString("_setDrawsBackground:")) {
                    configuration.setValue(false, forKey: "drawsBackground")
                }
                let view = WKWebView(frame: .zero, configuration: configuration)
                view.underPageBackgroundColor = .clear
                view.navigationDelegate = self
                install(view)
                view.load(URLRequest(url: server.config.origin))
            } catch is CancellationError {
                return
            } catch {
                server?.stop()
                showMessage(error.localizedDescription)
            }
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        if refreshOnReturn, let view = content as? WKWebView {
            refreshOnReturn = false
            view.reload()
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
        install(container)
    }

    private func install(_ view: NSView) {
        guard let glass, let window else { return }
        content?.removeFromSuperview()
        glass.addSubview(view)
        view.translatesAutoresizingMaskIntoConstraints = false
        let top = (window.contentLayoutGuide as? NSLayoutGuide)?.topAnchor ?? glass.topAnchor
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: top),
            view.leadingAnchor.constraint(equalTo: glass.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: glass.trailingAnchor),
            view.bottomAnchor.constraint(equalTo: glass.bottomAnchor),
        ])
        content = view
    }

    func webView(
        _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let origin = server?.config.origin else {
            decisionHandler(.cancel)
            return
        }
        let isTracker = url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
        if !isTracker {
            if navigationAction.navigationType == .linkActivated,
               let scheme = url.scheme?.lowercased(), ["https", "http", "mailto"].contains(scheme) {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
            return
        }
        if browserAuth.contains(url.path) {
            // The system browser must receive both OAuth state and callback.
            refreshOnReturn = NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        if browserExports.contains(url.path) {
            NSWorkspace.shared.open(url)
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
