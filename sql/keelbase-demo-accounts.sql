-- SPDX-License-Identifier: Apache-2.0
--
-- 演示账号：把主仓登录页上写的那两个账号带进本宿主的库 —— `alex`（普通用户）与 `admin`（超级管理员）。
--
-- **为什么需要它。** 主仓的演示口令是 `Alex@2026$Demo` 与 `Admin@2026$KeelBase`，而本宿主原先只有
-- 上游默认的 `admin / admin123`。两套环境的口令不一致，测试环境就无法「用主仓的账号登进来」。
--
-- **`admin` 只在仍是上游默认口令时才改写。** 条件里带着默认哈希，运维一旦换过口令，这条 UPDATE 就
-- 一行也不动 —— 种子不该把别人的口令改回去。
--
-- **`alex` 只插不覆盖**，角色用上游的 `common`（普通角色），与主仓「alex 是普通用户」一致。
--
-- **口令是 bcrypt(4)**，与宿主登录用的 `passwordEncoder` 同参数；哈希由同一个生成器算出。
-- 真实部署应改掉这两个口令 —— 它们是公开写在主仓文档与登录页上的。
--
-- 只插、幂等：用户按 `username + tenant` 匹配，关系按「用户 + 角色」对匹配。
--
-- ---
--
-- Demo accounts: the two the main repo's sign-in page names — `alex` (an ordinary user) and `admin`
-- (super administrator).
--
-- **Why it exists.** The main repo ships `Alex@2026$Demo` and `Admin@2026$KeelBase`, while this host
-- carried upstream's default `admin / admin123`. With the two deployment families disagreeing on the
-- password, a test environment could not be entered with the main repo's accounts.
--
-- **`admin` is rewritten only while it still holds upstream's default.** The condition carries the
-- default hash, so once an operator changes that password this UPDATE touches nothing — a seed must not
-- put someone's password back.
--
-- **`alex` is insert-only**, and takes upstream's `common` role, matching "alex is an ordinary user".
--
-- **The hashes are bcrypt(4)**, the same parameters as the host's `passwordEncoder`, produced by the
-- same generator. A real deployment should change both passwords: they are published in the main repo's
-- documentation and on its sign-in page.
--
-- Inserts only, idempotent: the user matches on `username + tenant`, the relationship on the
-- user-and-role pair. Ids are explicit because `system_users.id` has no database default — the
-- application assigns snowflake ids, and the neighbouring seeds (`9001`/`9002`) follow the same rule.

UPDATE system_users
   SET password = '$2a$04$JYSak0bHskc5uLm2LEDXoeXpGczBqVoPgaCkwwkZ6pv4RjtUtYRzK',
       updater = 'keelbase',
       update_time = now()
 WHERE id = 1
   AND deleted = 0
   AND password = '$2a$04$.vd8nPeLwxt6hnSzmAoAyul8BOLX7Cib6QhcxRe30rfvrIPQHH1OG';

-- The approval the six answers quote has to name a person, and in the demo the one who approves another
-- person's write is the administrator. `keelbase-brand-names.sql` sets that account's display name to the
-- deployment's brand, so the top bar shows a product name and the decision cell reads it back as
-- `KeelBase (account #1)` — a cell that names nobody. A demo deployment uses a person's name instead.
-- Both old values are matched, so a fresh install (upstream's name) and an existing one (the brand) stay
-- idempotent. A deployment that does not run this file keeps the brand name.
--
-- 六问里「谁确认」那一格抄的批准人必须是个人；演示里批准别人的那次写的就是管理员。`keelbase-brand-names.sql`
-- 把这个账号的显示名换成了本部署的品牌名，于是顶栏显示的是产品名、那一格读回来是「KeelBase（账号 #1）」——
-- 等于没答出是谁。演示库改用一个人名。两个旧值都匹配，故新装（上游名）与已有库（品牌名）都幂等；不跑本文件的
-- 部署保留品牌名。
UPDATE system_users
   SET nickname = '周敏',
       updater = 'keelbase',
       update_time = now()
 WHERE username = 'admin'
   AND tenant_id = 1
   AND deleted = 0
   AND nickname IN ('芋道源码', 'KeelBase');

INSERT INTO system_users (id, username, password, nickname, remark, dept_id, post_ids, email, mobile, sex,
                          avatar, status, login_ip, login_date, creator, create_time, updater, update_time,
                          deleted, tenant_id)
SELECT 9003, 'alex', '$2a$04$R7dKuhiJqXkSC71xxpS4zOZZC3gajG8FGt51GLL2VVUvuiHZ.I1VS', 'Alex',
       '演示账号（与主仓一致）', 100, '[]', '', '', 0, '', 0, '', NULL,
       'keelbase', now(), 'keelbase', now(), 0, 1
WHERE NOT EXISTS (SELECT 1 FROM system_users WHERE username = 'alex' AND tenant_id = 1 AND deleted = 0);

INSERT INTO system_user_role (id, user_id, role_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 20903, u.id, r.id, 'keelbase', now(), 'keelbase', now(), 0, 1
  FROM system_users u, system_role r
 WHERE u.username = 'alex' AND u.tenant_id = 1 AND u.deleted = 0
   AND r.code = 'common' AND r.tenant_id = 1 AND r.deleted = 0
   AND NOT EXISTS (SELECT 1 FROM system_user_role ur
                    WHERE ur.user_id = u.id AND ur.role_id = r.id AND ur.deleted = 0);

-- The second approver a walk has to name is a second person, so it is a second account. The N5 checklist
-- used to create `auditapprover` by hand before each session (§3.2) with the placeholder `Audit Approver`;
-- a demo deployment now seeds it, already carrying a person's name. It shares `admin`'s password hash and
-- holds `super_admin`, so the decision row it writes is the one the six answers read back — and the cell
-- names a person rather than a fixture label.
--
-- 走查要「具名第二批准人」——那是第二个人，所以是第二个账号。N5 预跑单原先每场手工建 `auditapprover`
-- （§3.2），昵称是占位符 `Audit Approver`；演示部署现在直接种下，已带人名。它与 `admin` 共用口令哈希、同持
-- `super_admin`，故它写下的那行裁决正是六问读回来的那一行 —— 那一格写的是人，不是夹具标签。
INSERT INTO system_users (id, username, password, nickname, remark, dept_id, post_ids, email, mobile, sex,
                          avatar, status, login_ip, login_date, creator, create_time, updater, update_time,
                          deleted, tenant_id)
SELECT 9901, 'auditapprover', password, '李静', '演示用第二批准人（N5 夹具）',
       dept_id, post_ids, email, mobile, sex, avatar, status, login_ip, login_date,
       'keelbase', now(), 'keelbase', now(), 0, tenant_id
  FROM system_users
 WHERE id = 1 AND deleted = 0
   AND NOT EXISTS (SELECT 1 FROM system_users
                    WHERE username = 'auditapprover' AND tenant_id = 1 AND deleted = 0);

INSERT INTO system_user_role (id, user_id, role_id, creator, create_time, updater, update_time, deleted, tenant_id)
SELECT 99901, u.id, r.id, 'keelbase', now(), 'keelbase', now(), 0, 1
  FROM system_users u, system_role r
 WHERE u.username = 'auditapprover' AND u.tenant_id = 1 AND u.deleted = 0
   AND r.code = 'super_admin' AND r.tenant_id = 1 AND r.deleted = 0
   AND NOT EXISTS (SELECT 1 FROM system_user_role ur
                    WHERE ur.user_id = u.id AND ur.role_id = r.id AND ur.deleted = 0);

-- An account the checklist created by hand already exists on some deployments under the placeholder name.
-- Renaming it keeps those deployments on the same footing as a fresh seed.
-- 有些部署上，预跑单手工建的这个账号已带着占位名存在。把它改过来，让这些部署与新种子站在同一条线上。
UPDATE system_users
   SET nickname = '李静',
       updater = 'keelbase',
       update_time = now()
 WHERE username = 'auditapprover'
   AND tenant_id = 1
   AND deleted = 0
   AND nickname = 'Audit Approver';
