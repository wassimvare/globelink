package app.globelink.mobile

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class GlobeLinkFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        GlobeLinkNativeTokenStore.save(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (message.data["type"] != "call") return

        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("callId", message.data["callId"])
            putExtra("conversationId", message.data["conversationId"])
            putExtra("callerName", message.data["callerName"] ?: "GlobeLink")
            putExtra("kind", message.data["kind"] ?: "audio")
        }
        startActivity(intent)
    }
}
