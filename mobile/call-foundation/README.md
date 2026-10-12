# Incoming-call foundation (not shipped in the step 3 test builds)

These are the original Android Firebase and iOS PushKit/CallKit sketches from
steps 1–2, kept for the next integration phase. They were previously stored in
`android/` and `ios/` and erased in CI by `rm -rf` followed by `cap add`.

The complete native projects are now tracked in those directories. CI syncs and
builds them instead of regenerating them. These sketches are outside their
source trees, so neither build claims to provide background incoming calls.

Before enabling them: configure Firebase/APNs, securely associate device tokens
with authenticated users, implement incoming-call notifications/CallKit policies,
and connect answer/end actions to the WebRTC session. Android must use the
permitted incoming-call notification flow, not directly launch a background
activity. Keep Capacitor's AppDelegate and SceneDelegate URL forwarding when
integrating iOS code.
