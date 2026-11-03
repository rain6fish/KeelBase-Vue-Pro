-- SPDX-License-Identifier: Apache-2.0
--
-- Which modules *this* deployment runs, and therefore which menus it shows.
--
-- The upstream seed ships the menus for every module it could carry. This host runs a subset — the
-- ones its jar actually has — so the rest have to go: a menu whose module is not compiled in answers
-- 「模块已禁用」, and a sidebar full of those reads as a broken deployment rather than as a small one.
--
-- This is a property of the deployment, not of the line, which is why it lives here and not in
-- `sql/`: another host that runs more modules should not inherit this list. The `status <> 1` guard
-- makes it idempotent, and it is written as "disable everything whose top-level path is not in the
-- list this deployment keeps" so that adding a module means editing one list.
--
-- 本**部署**跑哪些模块，因而显示哪些菜单。
--
-- 上游种子把它能带的模块的菜单**全**给了。这台机器只跑其中一部分——它的 jar 里真正有的那些——所以其余
-- 的必须收掉：模块没编译进来的菜单会答「模块已禁用」，而一整个侧栏都是这种东西，读起来是**部署坏了**，
-- 不是**部署小**。
--
-- 这是**部署**的属性、不是这条线的属性，所以它住在这里而不在 `sql/`：另一台跑更多模块的机器不该继承
-- 这份清单。`status <> 1` 的守卫让它幂等；写法是「把顶级路径不在本部署保留清单里的一律禁用」，于是**加
-- 一个模块＝改一处清单**。

-- 保留：首页没有 path（它是根），加上本部署运行的模块根（`/system` · `/infra` · `/crm` · `/oa` · `/ai1`）、
-- 治理菜单区的那个顶级路径（`/keelbase-governance`），以及助手抽屉那条隐藏父级（`/ai-assistant`）。
--
-- ⚠ **治理区必须在清单里**：它是「本部署展示什么」的一部分，而不属于任何一个 yudao 模块 —— 它的页面由
-- `keelbase-ui/host-overlay/` 铺进产物、菜单行由 `sql/keelbase-*-menu.sql` 落库（自 `YD-41` 起，那些行
-- **随 `bootstrap-db.sh` 的 `ADDITIONS` 一起落**）。漏掉它，后果是**日后跑一次引导就把整个治理菜单区
-- 静默收掉** —— 那次引导不会报任何错，`status <> 1` 的守卫只是把它当成了「本部署不跑的模块」。
--
-- ⚠ `/ai1` 同理，而且更容易漏：它是 **AI 助手管理台**（`yudao-module-ai1-springai`）的根，一个**本部署
-- 确实跑**的模块，但它的菜单行**不来自上游种子**、而来自 `sql/keelbase-assistant-menus.sql`（自 `YD-41`
-- 起已在 `ADDITIONS` 里）。漏掉它，一次引导就会把整个 AI 助手管理台收掉。
--
-- ⚠ `/ai-assistant` 是第三条，也最容易漏（`YD-41` 实测发现）：它是**助手抽屉**那条**隐藏**父级
-- （`sql/keelbase-assistant-role-grants.sql` 建的 `20010`，`visible = 0`），本身不进侧栏，但**它下面挂着
-- 那条按钮权限** `ai1:session:my`（`20019`）。yudao 在 `MenuServiceImpl.filterDisableMenus` 里**沿父链**判
-- 停用（`AuthController.getPermissionInfo` 用它滤出前端的权限集）⇒ 父级一被停用，那条权限就被带出清单、
-- 前端看不到它 ⇒ 普通用户**用不了助手抽屉**。`assistant-role-grants.sql` 的头部正写着「父级必须启用着」。
--
-- Kept: 首页 has no path (it is the root), plus the module roots this deployment runs
-- (`/system` · `/infra` · `/crm` · `/oa` · `/ai1`), the top-level path the governance menu area sits under
-- (`/keelbase-governance`), and the assistant drawer's hidden parent (`/ai-assistant`).
--
-- ⚠ The governance area **has** to be on this list: it is part of *what this deployment shows*, and it
-- belongs to no yudao module — its pages are laid into the artefact from `keelbase-ui/host-overlay/`,
-- and its menu rows come from `sql/keelbase-*-menu.sql` (since `YD-41` those rows are applied with the
-- `ADDITIONS` list in `bootstrap-db.sh`). Leaving it out means a later bootstrap **silently switches the
-- whole governance area off** — that bootstrap reports nothing wrong, because the `status <> 1` guard
-- simply reads it as a module this deployment does not run.
--
-- ⚠ `/ai1` is the same hazard, and easier to miss: it is the root of the **assistant console**
-- (`yudao-module-ai1-springai`), a module this deployment *does* run, but its menu rows come from
-- `sql/keelbase-assistant-menus.sql` rather than from upstream's seed (in `ADDITIONS` since `YD-41`).
-- Leaving it out means one bootstrap takes the whole assistant console away.
--
-- ⚠ `/ai-assistant` is the third, and the easiest to miss (measured while doing `YD-41`): it is the
-- **assistant drawer's** **hidden** parent (`20010`, built by `sql/keelbase-assistant-role-grants.sql`,
-- `visible = 0`), which never enters the sidebar — but the **button permission** `ai1:session:my`
-- (`20019`) hangs under it. yudao walks the parent chain in `MenuServiceImpl.filterDisableMenus` (used by
-- `AuthController.getPermissionInfo` to build the frontend's permission set), so a disabled parent takes
-- that permission out of the set and the frontend cannot see it — ordinary callers **lose the assistant
-- drawer**. `assistant-role-grants.sql`'s header says exactly this: the parent has to stay enabled.
with recursive off as (
    select id
      from system_menu
     where deleted = 0
       and parent_id = 0
       and coalesce(path, '') not in ('', '/system', '/infra', '/crm', '/oa', '/keelbase-governance', '/ai1', '/ai-assistant')
    union all
    select m.id
      from system_menu m
      join off o on m.parent_id = o.id
     where m.deleted = 0
)
update system_menu
   set status = 1
 where id in (select id from off)
   and status <> 1;
