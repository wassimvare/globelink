import Foundation
import CallKit
import AVFoundation

final class GlobeLinkCallProvider: NSObject, CXProviderDelegate {
    static let shared = GlobeLinkCallProvider()

    private let provider: CXProvider

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "GlobeLink")
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: .main)
    }

    func reportIncoming(callId: String, callerName: String, video: Bool, completion: @escaping () -> Void) {
        let uuid = UUID(uuidString: callId) ?? UUID()
        let update = CXCallUpdate()
        update.localizedCallerName = callerName
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.hasVideo = video

        provider.reportNewIncomingCall(with: uuid, update: update) { _ in
            completion()
        }
    }

    func providerDidReset(_ provider: CXProvider) {}

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        NotificationCenter.default.post(name: .globeLinkAnsweredCall, object: action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        NotificationCenter.default.post(name: .globeLinkEndedCall, object: action.callUUID)
        action.fulfill()
    }
}

extension Notification.Name {
    static let globeLinkAnsweredCall = Notification.Name("GlobeLinkAnsweredCall")
    static let globeLinkEndedCall = Notification.Name("GlobeLinkEndedCall")
}
