// SPDX-License-Identifier: Apache-2.0

// The role rule, with no Vue and no host imports, so it can be run as a test.
//
// `audit_reader` is the one identity this deployment gives read grants only, so it is the one role
// that turns write controls off. Everybody else — including the administrator and an account with no
// roles at all — keeps the page as it was; this rule does not invent a second, narrower console.
//
// 角色规则，不依赖 Vue、也不依赖宿主 import，故可以被当成测试直接跑。
//
// `audit_reader` 是本部署唯一只给读授权的身份，故它也是唯一关掉写控件的角色。其余（含管理员与
// 完全没有角色的账号）看到的页面与此前一样；这条规则不会发明第二个更窄的控制台。

export const AUDIT_READER_ROLE = 'audit_reader'

/**
 * 芋道的超级管理员角色码。宿主自己判「是不是管理员」用的就是它（`YudaoAdministrator` 看的是角色里有没有
 * 超管），控制台这一侧照同一条口径认，不另发明一张名单。
 *
 * Yudao's super-administrator role code. The host itself answers "is this caller an administrator" with it
 * (`YudaoAdministrator` asks whether the roles hold the super administrator), and the console reads the same
 * rule rather than inventing a second list.
 */
export const HOST_ADMIN_ROLE = 'super_admin'

/**
 * True unless the caller carries `audit_reader`.
 *
 * 除非调用方带 `audit_reader`，否则为 true。
 */
export function canWriteWithRoles(roles) {
  return !(roles ?? []).includes(AUDIT_READER_ROLE)
}

/**
 * 宿主是否认这个调用方为管理员：角色清单里有没有芋道的 `super_admin`。服务端仍是权威 —— 前端判据只决定
 * 「要不要发起一次只有管理员答得动的读」，判错了服务端会拒，页面按拒绝收起那张卡。
 *
 * Whether the host counts this caller as an administrator: the role list holds Yudao's `super_admin`. The
 * server remains the authority — the client predicate only decides whether to make a read that only an
 * administrator can make; a wrong verdict is refused by the server, and the page puts the card away.
 */
export function isHostAdministrator(roles) {
  return (roles ?? []).includes(HOST_ADMIN_ROLE)
}
