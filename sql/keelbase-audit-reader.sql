-- SPDX-License-Identifier: Apache-2.0
--
-- 只读审计读者（B11）：一个角色，与它在治理读面上的菜单授予。
--
-- 这个角色**只**能读治理记录：审计链（`/audit/verify` · `/audit/logs`）、操作审计
-- （`/audit/operations/logs`）、工具清单（`/ai/tools`）、治理策略的读侧（`/ai/governance/policy`）、
-- 副作用台账（`/ai/tool-effects`）与确认记录（`/ai/confirmations`）。它拿不到任何写、审批或执行权限，
-- 也没有普通用户的 `Customer` / `FollowUp` 所有权规则——按构造就是读者，不是应用用户。
--
-- **接口那半由宿主自己的规则源供给**（`YudaoAuditReaderRules`）：它按 `system_user_role` →
-- `system_role.code = 'audit_reader'` 认人，只返回六条 `read`。本文件不给任何菜单挂权限串，也不把
-- 该角色发给 `common`：角色是**独立身份**，不该混进普通用户。
--
-- 为什么授予这几页：它们是四个读面的宿主入口。审计链与操作审计是「审计」；审计链上的链校验是「证据」；
-- 写入台账是「副作用」；行动中心是「确认」（该页读**调用方本人**的待决项，另有一张「等待第二人批准」卡
-- 读全局确认队列，但**只有管理员**发那次请求 —— 审计读者看不到那张卡，也不会收到 403 提示）。工具清单与
-- 策略中心与 Java 侧审计读者的读面同形，一并授予；策略的写入口在运行时是 `update`，不在本角色的规则里，
-- 故保存会 403。
--
-- **不授予**：对抗证明（它会驱动运行时、产生执行）、决策轨迹（调用方自己的会话，是应用用户面），
-- 以及所有系统管理 / 用户 / 配置菜单。
--
-- **治理边界（`20029`）是后补的一页**（2026-10-20，用户裁）：`YD-40` 要求审计面**显式显示「哪条路
-- 未纳入治理」**，不留「默认没写＝已覆盖」；那一页正是这份证据 —— 它是**构建事实**、不是四个读面之一
-- （所以它此前列在「不授予」里），而裁定的落点是「审计读者要能核对覆盖声明」。不授予它，任何
-- 「覆盖声明」都无从被审计读者核对。
--
-- 只插、幂等：角色按 `code + tenant` 匹配，授予按「角色 + 菜单」对匹配。父目录 `20001` 与各页
-- `20002` / `20003` / `20004` / `20006` / `20008` / `20009` 由 `keelbase-governance-menus.sql` 落下、
-- `20029` 由 `keelbase-boundary-menu.sql` 落下，故本文件必须排在它们之后。
--
-- Read-only audit reader (B11): one role, and its grants on the governance read faces.
--
-- The role can **only** read the governance record: the audit chain (`/audit/verify` · `/audit/logs`),
-- the operations audit (`/audit/operations/logs`), the tool inventory (`/ai/tools`), the read side of the
-- governance policy (`/ai/governance/policy`), the side-effect ledger (`/ai/tool-effects`) and the
-- confirmation records (`/ai/confirmations`). It holds no write, approval or execution permission, and
-- none of the ordinary user's `Customer` / `FollowUp` ownership rules — it is a reader by construction,
-- not a user of the application.
--
-- **The API half is supplied by the host's own rule source** (`YudaoAuditReaderRules`): it identifies
-- the caller through `system_user_role` → `system_role.code = 'audit_reader'` and returns the six `read`
-- rules only. This file attaches no permission string to any menu and does not hand the role to
-- `common`: the role is a **separate identity**, not a wider ordinary user.
--
-- Why these pages: they are the host entries to the four read faces. The audit chain and the operations
-- audit are "audit"; the chain verification on the audit page is "evidence"; the write ledger is "side
-- effects"; the action centre is "confirmations" (it reads the caller's **own** pending items, and carries a
-- "waiting for a second person" card over the global confirmation queue — but **only an administrator** makes
-- that read, so an audit reader sees no such card and no 403 toast). The tool inventory and the policy centre
-- are granted because they are the same read faces the Java-side audit reader holds; the policy's write entry
-- is `update`, which this role's rules do not contain, so saving answers 403.
--
-- **Not granted**: the security showcase (it drives the runtime and produces executions), the
-- conversation trace (the caller's own conversations, an application-user face), and every system /
-- user / configuration menu.
--
-- **The governance boundary (`20029`) was added later** (2026-10-20, the user's ruling): `YD-40` requires
-- the audit surface to **say which path is not governed**, with no "unwritten means covered". That page is
-- the evidence — it is **build facts**, not one of the four read faces (which is why it sat in "Not
-- granted" until now), and the ruling's landing point is that the audit reader has to be able to check a
-- coverage statement. Without the grant, no coverage statement can be checked at all.
--
-- Inserts only, idempotent: the role matches on `code + tenant`, the grants on the role-and-menu pair.
-- The parent directory `20001` and the pages `20002` / `20003` / `20004` / `20006` / `20008` / `20009`
-- are laid by `keelbase-governance-menus.sql`, and `20029` by `keelbase-boundary-menu.sql`, so this file
-- must run after them.

-- 1) 角色本身。数据范围取 5（仅本人）——本角色没有任何业务模块菜单，真正的读面由运行时规则源授予；
--    若将来误挂一个业务页，这个范围只会收窄，不会放宽。
-- 1) The role itself. Data scope 5 (own rows) — the role has no business-module menu, and the actual read
--    faces come from the runtime rule source; if a business page is ever attached by mistake, this scope
--    narrows rather than widens.
INSERT INTO system_role (id, name, code, sort, data_scope, data_scope_dept_ids, status, type, remark,
                         creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20040, '审计读者', 'audit_reader', 90, 5, '', 0, 2,
       '只读审计读者：可读治理记录，无写、审批、执行与运营面',
       'keelbase', now(), 'keelbase', now(), 0, 1
WHERE NOT EXISTS (SELECT 1 FROM system_role WHERE code = 'audit_reader' AND tenant_id = 1 AND deleted = 0);

-- 2) 目录先授予，子页才有地方可挂（宿主按「被授予的集合」建树）。
-- 2) The directory is granted first, so the children have somewhere to hang (the host builds the tree
--    out of the granted set).
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20041, r.id, 20001, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20001 AND rm.deleted = 0);

-- 3) 审计链 —— `/audit/verify` 与 `/audit/logs`（审计 + 链校验证据）。
-- 3) The audit chain — `/audit/verify` and `/audit/logs` (audit plus the chain's evidence).
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20042, r.id, 20002, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20002 AND rm.deleted = 0);

-- 4) 操作审计 —— `/audit/operations/logs`。
-- 4) The operations audit — `/audit/operations/logs`.
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20043, r.id, 20008, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20008 AND rm.deleted = 0);

-- 5) AI 写入台账 —— `/ai/tool-effects`（副作用）。
-- 5) The AI write ledger — `/ai/tool-effects` (side effects).
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20044, r.id, 20004, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20004 AND rm.deleted = 0);

-- 6) AI 行动中心 —— 确认（本页读调用方本人的待决项）与副作用。
-- 6) The AI action centre — confirmations (the page reads the caller's own pending items) and effects.
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20045, r.id, 20003, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20003 AND rm.deleted = 0);

-- 7) 工具清单 —— `/ai/tools`。
-- 7) The tool inventory — `/ai/tools`.
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20046, r.id, 20006, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20006 AND rm.deleted = 0);

-- 8) 策略中心 —— 只授予读面；写入口要 `update`，本角色没有。
-- 8) The policy centre — read side only; the write entry needs `update`, which this role does not hold.
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20047, r.id, 20009, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20009 AND rm.deleted = 0);

-- 9) 治理边界（`20029`）—— 构建事实页；`YD-40`：审计面要能显示「哪条路未纳入治理」。
--    这是一页**读**：它只呈现构建期产出的边界数据，不驱动任何执行。
-- 9) The governance boundary (`20029`) — the build-facts page; by `YD-40` the audit surface has to be able
--    to show which path is not governed. It is a **read**: it renders build-time boundary data and drives
--    no execution.
INSERT INTO system_role_menu (id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20048, r.id, 20029, 'keelbase', now(), 'keelbase', now(), 0, 1
FROM system_role r
WHERE r.code = 'audit_reader' AND r.tenant_id = 1 AND r.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM system_role_menu rm
                  WHERE rm.role_id = r.id AND rm.menu_id = 20029 AND rm.deleted = 0);
