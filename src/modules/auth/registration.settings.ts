// Purpose: Read-only accessors for self-registration settings, so services, routes and tests
//   share one switch (tests replace these functions to exercise both modes in one process).
// Caller: auth.service (register), auth.controller (register message), otp.route (mode guard).
// Dependencies: config/env (REGISTRATION_VERIFICATION, REGISTRATION_DEFAULT_ROLE).
// Main Functions: registrationSettings (mode, defaultRoleSlug), RegistrationMode.
// Side Effects: None.
import { env } from '../../config/env'

export type RegistrationMode = 'link' | 'otp'

export const registrationSettings = {
  mode(): RegistrationMode {
    return env.REGISTRATION_VERIFICATION
  },
  defaultRoleSlug(): string | undefined {
    return env.REGISTRATION_DEFAULT_ROLE
  },
}
