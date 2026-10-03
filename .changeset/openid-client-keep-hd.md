---
"@yielded/auth-openid-client": patch
---

Keep Google's `hd` (hosted domain) claim on the verified OIDC profile, so an application that admits one Workspace can check `profile.providerData.hd` from the signed ID token.
