import AppKit
import Foundation

struct LauncherConfig {
    let workspace: URL
    let node: URL
    let port: Int

    var origin: URL { URL(string: "http://127.0.0.1:\(port)")! }

    init(bundle: Bundle = .main) throws {
        guard let path = bundle.object(forInfoDictionaryKey: "TrackerWorkspace") as? String,
              let runtime = bundle.object(forInfoDictionaryKey: "TrackerNode") as? String,
              let port = bundle.object(forInfoDictionaryKey: "TrackerPort") as? Int,
              (1024...65535).contains(port) else { throw LauncherError.configuration }
        workspace = URL(fileURLWithPath: path, isDirectory: true).resolvingSymlinksInPath()
        node = URL(fileURLWithPath: runtime)
        self.port = port
    }
}

enum LauncherError: LocalizedError {
    case configuration, missingBuild, portInUse(Int), serverExited, notReady

    var errorDescription: String? {
        switch self {
        case .configuration: return "The launcher could not find its tracker configuration."
        case .missingBuild: return "Build the tracker in its project folder with npm run build, then reopen Tracker."
        case .portInUse(let port): return "Port \(port) is in use by a different service. Free the port, then reopen Tracker."
        case .serverExited: return "The tracker server could not start. Check the project build and try again."
        case .notReady: return "The tracker server did not respond in time. Reopen Tracker to try again."
        }
    }
}

private final class NoHTTPRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

@MainActor
final class TrackerServer {
    private struct Listener: Equatable {
        var pid: Int32
        var address: String
    }

    let config: LauncherConfig
    private var ownedProcess: Process?
    private let http: URLSession

    init(config: LauncherConfig) {
        self.config = config
        let settings = URLSessionConfiguration.ephemeral
        settings.httpShouldSetCookies = false
        settings.connectionProxyDictionary = [:]
        settings.timeoutIntervalForRequest = 2
        http = URLSession(configuration: settings, delegate: NoHTTPRedirect(), delegateQueue: nil)
    }

    func start() async throws {
        let listeners = try listening()
        let expectedPID: Int32
        if listeners.isEmpty {
            expectedPID = try startServerProcess()
        } else {
            guard listeners.count == 1, let listener = listeners.first,
                  listener.address == "127.0.0.1:\(config.port)", try belongsToTracker(listener.pid)
            else { throw LauncherError.portInUse(config.port) }
            expectedPID = listener.pid
        }

        let deadline = ContinuousClock.now.advanced(by: .seconds(20))
        while ContinuousClock.now < deadline {
            try Task.checkCancellation()
            if ownedProcess?.isRunning == false { throw LauncherError.serverExited }
            let expected = [Listener(pid: expectedPID, address: "127.0.0.1:\(config.port)")]
            if try listening() == expected, await answersHTTP(), try listening() == expected { return }
            try await Task.sleep(for: .milliseconds(250))
        }
        throw LauncherError.notReady
    }

    func stop() {
        if let process = ownedProcess, process.isRunning { process.terminate() }
        ownedProcess = nil
    }

    private func startServerProcess() throws -> Int32 {
        let files = FileManager.default
        let cli = config.workspace.appendingPathComponent("node_modules/next/dist/bin/next")
        let marker = config.workspace.appendingPathComponent(".next/BUILD_ID")
        guard files.isExecutableFile(atPath: config.node.path), files.fileExists(atPath: cli.path),
              files.fileExists(atPath: marker.path) else { throw LauncherError.missingBuild }
        let process = Process()
        process.executableURL = config.node
        process.arguments = [cli.path, "start", "--hostname", "127.0.0.1", "--port", String(config.port)]
        process.currentDirectoryURL = config.workspace
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            throw LauncherError.serverExited
        }
        ownedProcess = process
        return process.processIdentifier
    }

    private func answersHTTP() async -> Bool {
        var request = URLRequest(url: config.origin)
        request.httpMethod = "HEAD"
        do {
            let (_, response) = try await http.data(for: request)
            return response is HTTPURLResponse
        } catch {
            return false
        }
    }

    private func listening() throws -> [Listener] {
        let output = try run("/usr/sbin/lsof", [
            "-nP", "-iTCP:\(config.port)", "-sTCP:LISTEN", "-Fpn",
        ])
        var pid: Int32?
        var found: [Listener] = []
        for line in output.split(separator: "\n") {
            if line.first == "p" { pid = Int32(line.dropFirst()) }
            if line.first == "n", let pid {
                found.append(Listener(pid: pid, address: String(line.dropFirst())))
            }
        }
        return found
    }

    private func belongsToTracker(_ pid: Int32) throws -> Bool {
        let command = try run("/bin/ps", ["-p", String(pid), "-o", "command="])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard command.hasPrefix("next-server (v"), command.hasSuffix(")") else { return false }
        let cwd = try run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
        guard let path = cwd.split(separator: "\n").first(where: { $0.first == "n" }) else { return false }
        return URL(fileURLWithPath: String(path.dropFirst()), isDirectory: true)
            .resolvingSymlinksInPath().path == config.workspace.path
    }

    private func run(_ executable: String, _ arguments: [String]) throws -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        try process.run()
        let output = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return String(decoding: output, as: UTF8.self)
    }
}
