import Foundation
import PushKit

final class GlobeLinkVoIPPush {
    static let shared = GlobeLinkVoIPPush()
    private var registry: PKPushRegistry?

    func start(delegate: PKPushRegistryDelegate) {
        guard registry == nil else { return }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = delegate
        registry.desiredPushTypes = [.voIP]
        self.registry = registry
    }
}
