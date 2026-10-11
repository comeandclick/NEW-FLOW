// Flow Studio — fenêtre native du logiciel. Elle démarre l'assistant (runner.sh), puis affiche l'interface locale du pont (ui.json).
import Cocoa
import WebKit

private let loadingHTML = """
<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:15px -apple-system,system-ui;color:#6b6b78;background:#f4f4f7">
<div style="text-align:center"><div style="font-size:26px;font-weight:700;color:#15151a;margin-bottom:6px">Flow Studio</div>Préparation…</div></body></html>
"""

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var helper: Process?
    var loaded = ""
    var layoutStamp = 0.0
    let bridgeDir = (ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()) + "/.flow-bridge"

    func applicationDidFinishLaunching(_ n: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Flow Studio"
        window.contentView = web
        window.minSize = NSSize(width: 760, height: 560)
        window.center()
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString(loadingHTML, baseURL: nil)
        startHelper()
        Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in self?.tick() }
    }

    func startHelper() {
        guard let res = Bundle.main.resourcePath else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [res + "/runner.sh"]
        var env = ProcessInfo.processInfo.environment
        env["FLOW_APP_HOST"] = "1"
        p.environment = env
        p.standardOutput = nil
        p.standardError = nil
        do { try p.run(); helper = p } catch { NSLog("runner: \(error)") }
    }

    func readJSON(_ name: String) -> [String: Any]? {
        guard let d = FileManager.default.contents(atPath: bridgeDir + "/" + name) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }

    func tick() {
        if let ui = readJSON("ui.json"), let url = ui["url"] as? String, let pid = ui["pid"] as? Int, kill(pid_t(pid), 0) == 0, url != loaded, let u = URL(string: url) {
            loaded = url
            web.load(URLRequest(url: u))
        }
        if let l = readJSON("layout.json"), let t = l["t"] as? Double, t != layoutStamp {
            layoutStamp = t
            if let x = l["x"] as? Double, let y = l["y"] as? Double, let w = l["w"] as? Double, let h = l["h"] as? Double, let screen = NSScreen.screens.first {
                let H = screen.frame.height
                window.setFrame(NSRect(x: x, y: H - y - h, width: w, height: h), display: true, animate: true)
            }
        }
    }

    // Les liens vers des sites (Flow, Vercel…) s'ouvrent dans le navigateur ; la page locale et les aperçus restent dans la fenêtre.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.allow); return }
        let main = action.targetFrame?.isMainFrame ?? true
        if !main || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { decisionHandler(.allow); return }
        if let h = url.host, h == "127.0.0.1" || h == "localhost" { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated { NSWorkspace.shared.open(url); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Annuler")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection; p.canChooseDirectories = false
        completionHandler(p.runModal() == .OK ? p.urls : nil)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loaded = "" }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loaded = "" } // la page est rechargée au prochain tour

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func applicationWillTerminate(_ n: Notification) { helper?.terminate() }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "À propos de Flow Studio", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Masquer Flow Studio", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quitter Flow Studio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Édition"); editItem.submenu = edit
        edit.addItem(withTitle: "Annuler", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Rétablir", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Couper", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copier", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Coller", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Tout sélectionner", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "Affichage"); viewItem.submenu = view
        view.addItem(withTitle: "Recharger", action: #selector(WKWebView.reload(_:)), keyEquivalent: "r")
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
