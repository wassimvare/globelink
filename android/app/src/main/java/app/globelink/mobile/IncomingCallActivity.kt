package app.globelink.mobile

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager

class IncomingCallActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // The Capacitor UI can replace this temporary native screen once the
        // answer/end bridge is connected to GlobeLink's existing WebRTC session.
        title = intent.getStringExtra("callerName") ?: "GlobeLink"
    }
}
