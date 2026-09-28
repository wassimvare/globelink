package app.globelink.mobile

import android.content.Context

object GlobeLinkNativeTokenStore {
    fun save(context: Context, token: String) {
        context.getSharedPreferences("globelink_native_push", Context.MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .apply()
    }
}
