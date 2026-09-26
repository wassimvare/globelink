import UIKit
import Capacitor
import CallKit
import PushKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, PKPushRegistryDelegate {
    var window: UIWindow?
    private let callProvider = GlobeLinkCallProvider.shared

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GlobeLinkVoIPPush.shared.start(delegate: self)
        return true
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(
            name: .globeLinkVoIPToken,
            object: nil,
            userInfo: ["token": token]
        )
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let data = payload.dictionaryPayload
        let callId = (data["callId"] as? String) ?? UUID().uuidString
        let caller = (data["callerName"] as? String) ?? "GlobeLink"
        let video = (data["kind"] as? String) == "video"
        callProvider.reportIncoming(callId: callId, callerName: caller, video: video, completion: completion)
    }
}

extension Notification.Name {
    static let globeLinkVoIPToken = Notification.Name("GlobeLinkVoIPToken")
}
