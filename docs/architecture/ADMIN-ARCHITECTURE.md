# Admin Architecture

The Admin system is built on top of the unified **User** model with role-based access control (RBAC). Admins are users with special privileges granted via the `adminRole` field on the User record.

---

## 1. Core Principles

1. **Unified User Model**: Admins are users. An admin account must be an existing User or created via invite.
2. **Role Hierarchy**: Admin roles form a hierarchy from Super Admin → Admin → Campaign DM → Read-only.
3. **DM Auto-Access**: All full DMs automatically have admin access to campaign-level operations.
4. **Campaign-Scoped Operations**: DMs see and manage only their own campaigns (with super admin overrides).
5. **Permission Inheritance**: DMs in campaigns can perform campaign-level ops; super admins can perform system-wide ops.
6. **Auditability**: All admin actions are logged with user ID, timestamp, action type, and affected resource.

---

## 2. Admin Roles

| Role            | Privileges                                                                                                                                                                                                                        | Use Case                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Super Admin** | Full system access: create/update/delete users, manage admins, view all campaigns, manage system settings, access all telemetry, perform destructive operations                                                                   | System owner, platform operators   |
| **Admin**       | Moderate users, manage campaigns, view telemetry, manage system settings. **No destructive ops**: cannot delete users/campaigns permanently, cannot reset audit logs, cannot export entire platform                               | Operations team, moderation team   |
| **Campaign DM** | **Auto-granted to all DMs**. Campaign-level ops only: backup/export/import their campaigns, view campaign telemetry, manage campaign members (invite/remove), moderate within campaign. System-wide view is read-only restricted. | Content creators, table leaders    |
| **Read-only**   | View all data (campaigns, users, telemetry, logs) but cannot modify anything. Cannot delete or edit users.                                                                                                                        | Auditors, viewers, compliance team |

---

## 3. Admin Permissions Matrix

### 3.1 User Management

| Action                  | Super Admin | Admin | Campaign DM | Read-only |
| ----------------------- | ----------- | ----- | ----------- | --------- |
| View user list          | ✔           | ✔     | ✖ (members) | ✔         |
| View user details       | ✔           | ✔     | ✖ (members) | ✔         |
| Suspend/deactivate user | ✔           | ✔     | ✖           | ✖         |
| Force user logout       | ✔           | ✔     | ✖           | ✖         |
| Grant admin role        | ✔           | ✖     | ✖           | ✖         |
| Create new user         | ✔           | ✖     | ✖           | ✖         |
| Delete user permanently | ✔           | ✖     | ✖           | ✖         |
| View user audit trail   | ✔           | ✔     | ✔ (own)     | ✔         |

### 3.2 Campaign Management

| Action                      | Super Admin | Admin | Campaign DM | Read-only |
| --------------------------- | ----------- | ----- | ----------- | --------- |
| Create new campaign         | ✔           | ✔     | ✖           | ✖         |
| View all campaigns          | ✔           | ✔     | ✖           | ✔         |
| View own campaigns          | ✔           | ✔     | ✔           | ✔         |
| Edit campaign details       | ✔           | ✔     | ✔ (own)     | ✖         |
| Manage campaign members     | ✔           | ✔     | ✔ (own)     | ✖         |
| Backup campaign             | ✔           | ✔     | ✔ (own)     | ✖         |
| Export campaign             | ✔           | ✔     | ✔ (own)     | ✖         |
| Import campaign             | ✔           | ✔     | ✔ (own)     | ✖         |
| Delete campaign permanently | ✔           | ✖     | ✖           | ✖         |
| Archive campaign            | ✔           | ✔     | ✔ (own)     | ✖         |
| Generate invite codes       | ✔           | ✔     | ✔ (own)     | ✖         |

### 3.3 Session Management

| Action                          | Super Admin | Admin | Campaign DM | Read-only |
| ------------------------------- | ----------- | ----- | ----------- | --------- |
| View all sessions               | ✔           | ✔     | ✖           | ✔         |
| View campaign sessions          | ✔           | ✔     | ✔ (own)     | ✔         |
| Force-end session               | ✔           | ✔     | ✔ (own)     | ✖         |
| View session recording metadata | ✔           | ✔     | ✔ (own)     | ✔         |

### 3.4 Telemetry & Reporting

| Action                  | Super Admin | Admin | Campaign DM | Read-only |
| ----------------------- | ----------- | ----- | ----------- | --------- |
| View system dashboard   | ✔           | ✔     | ✖           | ✔         |
| View system health      | ✔           | ✔     | ✖           | ✔         |
| View system logs        | ✔           | ✔     | ✖           | ✔         |
| View campaign analytics | ✔           | ✔     | ✔ (own)     | ✔         |
| View user activity logs | ✔           | ✔     | ✔ (own)     | ✔         |
| Export telemetry        | ✔           | ✔     | ✔ (own)     | ✔ (view)  |

### 3.5 System Administration

| Action                        | Super Admin | Admin | Campaign DM | Read-only |
| ----------------------------- | ----------- | ----- | ----------- | --------- |
| Manage system settings        | ✔           | ✔     | ✖           | ✖         |
| Manage API keys               | ✔           | ✔     | ✖           | ✖         |
| Manage feature flags          | ✔           | ✔     | ✖           | ✖         |
| View audit logs (system-wide) | ✔           | ✔     | ✖           | ✖         |
| Purge audit logs              | ✔           | ✖     | ✖           | ✖         |
| Manage external integrations  | ✔           | ✔     | ✖           | ✖         |
| Manage admin roles            | ✔           | ✖     | ✖           | ✖         |
| Database backups              | ✔           | ✖     | ✖           | ✖         |
| System-wide export            | ✔           | ✖     | ✖           | ✖         |

---

## 4. Admin Account Setup

### 4.1 Initial Setup (First Admin)

When the system has no admins:

1. **Setup endpoint** (`GET /api/admin/setup-status`) returns `setupRequired: true`
2. **Setup wizard** (`POST /api/admin/setup`) creates the first admin:
   - Accepts email, username, password
   - Creates a User record with `adminRole: SUPER_ADMIN`
   - Prevents subsequent calls (blocks after first admin)
   - Issues a JWT admin token

### 4.2 Adding New Admins

#### **Method 1: From existing User (most common)**

1. Super Admin navigates to User → Admin Operations
2. Clicks "Grant Admin Role"
3. Selects the desired admin role (Super Admin, Admin, Campaign DM, Read-only)
4. User is promoted; receives notification
5. Next login: user sees admin console access

#### **Method 2: Invite Link (preferred for external hires)**

1. Super Admin generates an admin invite link with role pre-selected
2. Link is shared with the invitee (email, Slack, etc.)
3. Invitee clicks link:
   - If no account: sign up flow creates User + assigns admin role
   - If existing account: redirects to login, then grants role
4. Invitee gains admin console access

#### **Method 3: Direct User Creation + Promotion**

1. Super Admin creates a new User record (email + username)
2. Sends temporary password or password reset link to invitee
3. Invitee sets password and creates account
4. Super Admin promotes the User to desired admin role

---

## 5. Campaign DM Auto-Access

**All users with `role: DM` in a Campaign automatically receive `adminRole: CAMPAIGN_DM`.**

- No explicit promotion needed
- Full-account DM automatically sees the admin console after their first DM session
- Access is scoped to their own campaigns only
- Can manage campaign-level operations (backup, export, member management, telemetry)
- Cannot access system-wide operations
- Can be promoted to Admin or Super Admin by a Super Admin
- **Guest DM rule**: guest DMs can see the admin launch entry in the main frontend, but cannot obtain an admin token until they upgrade to a full account.

---

## 6. Admin Authentication

### 6.1 Admin Token

Admin tokens are JWT tokens with the following claims:

```json
{
  "userId": "uuid",
  "username": "string",
  "adminRole": "SUPER_ADMIN | ADMIN | CAMPAIGN_DM | READ_ONLY",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "vtt-chat-admin"
}
```

### 6.2 Token Validation

All admin endpoints require:

1. Valid admin JWT token in `Authorization: Bearer <token>` header
2. Token must not be expired
3. Token's `adminRole` must have permission for the requested operation
4. For campaign-scoped ops: token's `userId` must own the campaign or be Super Admin

### 6.3 Token Lifecycle

- **Issued at**: login, setup, or role promotion
- **Lifetime**: configurable (default 7 days for sessions, 24 hours for admin ops)
- **Renewal**: automatic silent renewal before expiry (frontend handles)
- **Revocation**: immediate on user suspension or role downgrade

### 6.4 Cross-App Auth Handoff (Frontend <-> Admin)

The user-facing frontend app and the admin console are linked authentication surfaces for the same identity.

- A full-account user with admin rights should move from frontend -> admin without re-entering credentials.
- An authenticated admin should move from admin -> frontend without re-entering credentials.
- Handoff uses short-lived one-time exchange tokens, never long-lived query-string JWTs.

Frontend -> Admin launch flow:

1. User is already authenticated in the frontend app.
2. Frontend calls a backend handoff endpoint and receives a one-time handoff token.
3. Frontend opens `/admin/launch?handoff=<token>`.
4. Admin app exchanges the handoff token for an admin JWT and starts an authenticated admin session.

Admin -> Frontend launch flow:

1. User is already authenticated in admin.
2. Admin app calls a backend handoff endpoint and receives a one-time handoff token.
3. Admin opens `/app/launch?handoff=<token>` (or equivalent frontend entry).
4. Frontend exchanges the handoff token for a user JWT and resumes an authenticated user session.

Guest DM gating:

- If the user is a guest DM, the frontend may show the admin-launch button for discoverability.
- Clicking launch must fail closed with `GUEST_UPGRADE_REQUIRED` and an Upgrade Account CTA.
- No admin token is issued for guest accounts.

---

## 7. Admin Console Access

### 7.1 Route Protection

Admin SPA routes are gated:

- `/admin` - requires valid admin token
- `/admin/launch` - accepts one-time handoff token exchange, then requires valid admin token
- `/admin/setup` - only if `setupRequired: true`
- `/admin/login` - only if not authenticated
- `/admin/dashboard` - requires `adminRole` in [SUPER_ADMIN, ADMIN, CAMPAIGN_DM, READ_ONLY]
- `/admin/users` - requires `adminRole` in [SUPER_ADMIN, ADMIN]
- `/admin/campaigns` - requires `adminRole` in [SUPER_ADMIN, ADMIN, CAMPAIGN_DM]
- `/admin/logs` - requires `adminRole` in [SUPER_ADMIN, ADMIN]
- `/admin/settings` - requires `adminRole` in [SUPER_ADMIN, ADMIN]

### 7.2 UI Visibility

Admin console shows different pages based on role:

| Page                | Super Admin | Admin | Campaign DM | Read-only |
| ------------------- | ----------- | ----- | ----------- | --------- |
| Dashboard           | ✔           | ✔     | ✔           | ✔         |
| User Management     | ✔           | ✔     | ✖           | ✔ (view)  |
| Campaign Management | ✔           | ✔     | ✔           | ✔ (view)  |
| System Health       | ✔           | ✔     | ✖           | ✔         |
| Logs & Activity     | ✔           | ✔     | ✖           | ✔         |
| Settings            | ✔           | ✔     | ✖           | ✖         |

### 7.3 Frontend Launch Button Behavior

`Open Admin` button state in the main frontend:

- Full-account + admin rights: enabled, launches admin via handoff token exchange.
- Full-account + no admin rights: hidden (or disabled with no-access tooltip, product choice).
- Guest DM: visible but disabled/blocked with upgrade-required messaging.
- Guest non-DM: hidden.

---

## 8. Audit Logging

Every admin action is logged:

- **Action**: what was done (e.g., "USER_SUSPENDED", "CAMPAIGN_EXPORTED")
- **Actor**: admin user ID and username
- **Target**: resource ID (user ID, campaign ID, session ID)
- **Changes**: old value → new value (if applicable)
- **Timestamp**: when it happened
- **IP/User-Agent**: where the action came from
- **Status**: success | failure with error code

Audit logs are:

- Queryable by Super Admin and Admin only
- Filtered by Campaign DM to their campaigns only
- Viewable by Read-only (view-only, cannot export or delete)
- Immutable after creation (no edits or deletes except purge by Super Admin)
- Persisted in database, replicated to audit sink (S3, syslog, etc.)

---

## 9. Security Considerations

1. **Password**: Admin passwords follow the same 12+ char, mixed case, number, special char rules
2. **2FA**: (future) Super Admin access should require 2FA
3. **Session**: Admin sessions are shorter-lived than regular sessions (24h vs 7d)
4. **Token**: Admin tokens are not stored in localStorage by default (sessionStorage only, explicit remember-me)
5. **IP Whitelisting**: (future) Super Admin can restrict admin access by IP
6. **Rate Limiting**: Admin login attempts are rate-limited (5 attempts/15 min)
7. **Alerts**: Suspicious admin activity triggers alerts (new IP, bulk action, etc.)

---

## 10. Future Enhancements

- **Delegated Admin Roles**: Super Admin can delegate admin approval authority to Admins
- **Time-based Access**: Admins can have temporary elevated permissions (e.g., 1 week to do migration)
- **Approval Workflows**: Destructive actions (user delete, campaign delete) require 2-of-3 super admin approval
- **Admin API Keys**: Super Admin can create API keys with scoped permissions
- **LDAP/SAML**: Enterprise integration for admin identity
- **Audit Trail Encryption**: Audit logs are encrypted at rest
